# Deployment

The backend image serves Sidekick, Wall and the API from one process. Build it from the repository root:

```sh
docker build -t hearthglance:dev .
```

Pin deployments to a tested image tag or digest so rollback is a one-line change.

## Runtime mounts

| Mount | Mode | Contents |
|---|---|---|
| `/config` | read-only | `config.json`: nonsecret household settings and HA mappings |
| `/data` | writable | Sessions now, SQLite and migration metadata later |
| `/media` | writable | Photo staging, display images and thumbnails |

The container runs as uid/gid `10001` by default. Set `user:` to match the host owner of `/data` and `/media` instead when needed. Provision both directories before startup. Compose binds use `create_host_path: false`, so a missing drive fails at startup and never falls back to an empty folder on the internal disk.

Startup exits with a one-line error when `config.json` is missing or unreadable, when the `/data` directory is missing or not writable, or when a required URL is unset.

## Environment

| Variable | Default in image | Purpose |
|---|---|---|
| `HA_URL` | required | Home Assistant URL reachable from the container |
| `HA_PUBLIC_URL` | required | Home Assistant URL the browser uses for OAuth |
| `HG_PUBLIC_URL` | required | Public app URL including the base path, e.g. `https://example.test/hearthglance/` |
| `HG_CONFIG` | `/config/config.json` | Household config file |
| `HG_SESSIONS` | `/data/sessions.json` | Session store; its directory is the data directory |
| `HG_FRAME_ANCESTORS` | empty | Extra `https://` origins allowed to frame the app. Same origin is always allowed. |
| `HG_MEDIA` | `/media` | Photo media root. Unset it to disable photos. |
| `HG_PHOTO_DECODERS` | `1` | Concurrent photo decode workers |
| `HG_WALL_IDLE_MINUTES` | `0` | Minutes of inactivity before Wall starts the slideshow; `0` is off |

### Compatibility with the pre-monorepo layout

The existing deployment mounts `config.json` at `/app/config.json` and state at `/state`. To run this image against that layout unchanged, set:

```yaml
environment:
  HG_CONFIG: /app/config.json
  HG_SESSIONS: /state/sessions.json
```

Existing sessions, the install URL, PWA scope and manifest identity are unchanged, so installed iPhone apps keep working.

## Photo media

Provision the media directory once, on the external drive, before starting the container:

```sh
mkdir -p "$HG_MEDIA_DIR"
printf 'hearthglance-media v1\n' > "$HG_MEDIA_DIR/.hearthglance-media"
```

The backend checks for `.hearthglance-media` on every photo read and write and never creates it. When the drive is missing or the marker is gone, photo requests return `503`, and calendars, lists and the rest of the app keep working. Staging, derivatives and the marker all live on the same filesystem, so publishing is an atomic rename.

The SQLite catalog (`/data/photos.sqlite3`) and the media files are on different mounts. Back them up together. Startup and a 10-minute background pass delete unreferenced photo folders and abandoned staging files, but never a folder with a catalog row.

### Memory

Each photo is decoded in a short-lived worker process with a 1 GB address-space cap, so the server process stays near 25 MB. Measured container peaks with one decoder, at default settings:

| Input | Container peak |
|---|---|
| 48 MP JPEG | ~145 MB (JPEG decodes at reduced scale) |
| 24 MP HEIC (iPhone Pro default) | ~300 MB |
| 48 MP HEIC | ~530 MB |

Give the container at least `768m` with `HG_PHOTO_DECODERS=1`, and add about 550 MB per extra decoder. The pre-monorepo deployment's `128m` limit is too small for photos.

### Reverse proxy

Upload bodies must reach the backend's staging area on the external drive, not a proxy spool on the internal disk. For the app location, use:

```nginx
client_max_body_size 50m;
proxy_request_buffering off;
```

### Wall event stream

`<base>/wall/events` is a Server-Sent Events stream. The backend sends `X-Accel-Buffering: no` and a keep-alive comment every 25 seconds. It also recycles each stream after 15 minutes, and the browser reconnects and fetches the current album. For a dedicated proxy location, use:

```nginx
location /hearthglance/wall/events {
    proxy_pass http://127.0.0.1:8135;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 120s;
}
```

Each open stream holds one server thread, and at most 8 are accepted at a time. That's enough for the Pi, the Fire and a few browser tabs.

## Home Assistant embed

When Home Assistant proxies the app on its own origin, the default `frame-ancestors 'self'` already allows the webpage card. Add `HG_FRAME_ANCESTORS` only when HA is served from a different HTTPS origin. Wildcards, paths and plain HTTP are rejected.

## Wall

Wall is served at `<base>/wall/`. That path stays outside the Sidekick service worker's shell and photo caches, so kiosks always load it from the network. Sign in on each kiosk once at `<base>/wall/`; the sign-in link returns to Wall. Append `?interval=<seconds>` (3–300, default 12) to change the slide interval for one kiosk.

Idle slideshow is off by default. Set `HG_WALL_IDLE_MINUTES` (1–240) to start the slideshow after that many quiet minutes on every kiosk, or override a single kiosk with `?idle=<minutes>` (`?idle=0` turns it off there). Any tap returns to the previous view and restarts the countdown.

## Local staging

`compose.staging.yaml` runs a separate project with fixture config. Put private paths in a git-ignored env file in this folder (`*.env`), for example `staging.env`:

```sh
HG_IMAGE=hearthglance:dev
HG_UID=501
HG_GID=20
HG_DATA_DIR=/path/to/staging/data
HG_MEDIA_DIR=/path/to/external/drive/hearthglance-staging/media
```

```sh
docker compose -p hearthglance-staging --env-file deploy/staging.env -f deploy/compose.staging.yaml up -d
```

Staging never changes the live deployment. Bring a production cutover back for review with tested rollback and data-preservation steps.
