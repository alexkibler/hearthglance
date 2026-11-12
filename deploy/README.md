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
| `/media` | writable | Photo staging, display images and thumbnails (from #6) |

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

### Compatibility with the pre-monorepo layout

The existing deployment mounts `config.json` at `/app/config.json` and state at `/state`. To run this image against that layout unchanged, set:

```yaml
environment:
  HG_CONFIG: /app/config.json
  HG_SESSIONS: /state/sessions.json
```

Existing sessions, the install URL, PWA scope and manifest identity are unchanged, so installed iPhone apps keep working.

## Home Assistant embed

When Home Assistant proxies the app on its own origin, the default `frame-ancestors 'self'` already allows the webpage card. Add `HG_FRAME_ANCESTORS` only when HA is served from a different HTTPS origin. Wildcards, paths and plain HTTP are rejected.

## Wall

Wall is served at `<base>/wall/`. That path stays outside the Sidekick service worker's shell and photo caches, so kiosks always load it from the network.

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
