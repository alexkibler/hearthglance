# Rollout and rollback

How to move the household onto the standalone image without losing sessions, Home Assistant data or the installed apps, and how to go back. Do these in order and don't skip the backup. Commands use placeholders; keep real hostnames and paths in private, git-ignored files.

## Staging with Home Assistant

Run this before any cutover. It gives the iPhones, Pi and Fire a real HTTPS target that's isolated from production (see [release-verification.md](release-verification.md#1-staging-target-for-devices)).

1. Media: on the external drive, create the staging folder and its marker:
   ```sh
   mkdir -p "$HG_MEDIA_DIR"
   printf 'hearthglance-media v1\n' > "$HG_MEDIA_DIR/.hearthglance-media"
   ```
2. Config: copy the household `config.json` into a private folder and set `HG_CONFIG_DIR` to it. Change its `storage_key` so the staging app's offline data has its own name.
3. Environment (`deploy/staging.env`, git-ignored):
   ```sh
   HG_IMAGE=hearthglance:<release candidate tag or digest>
   HG_UID=<host uid>
   HG_GID=<host gid>
   HG_PORT=8136
   HG_CONFIG_DIR=<private copy of config>
   HG_DATA_DIR=<staging data folder>
   HG_MEDIA_DIR=<external drive>/hearthglance-staging/media
   HA_URL=<HA URL reachable from containers>
   HA_PUBLIC_URL=<HA URL the browser uses>
   HG_PUBLIC_URL=https://<staging host>/hearthglance/
   ```
4. Proxy: add a proxy host for `<staging host>` with a certificate, forwarding to `host.docker.internal:8136` (the container binds `127.0.0.1:8136` on the host), with this in its advanced config:
   ```nginx
   client_max_body_size 50m;
   proxy_request_buffering off;
   location /hearthglance/api/photos/events {
       proxy_pass http://host.docker.internal:8136;
       proxy_buffering off;
       proxy_read_timeout 120s;
   }
   ```
5. Start: `docker compose -p hearthglance-staging --env-file deploy/staging.env -f deploy/compose.staging.yaml up -d`, then work through the device checklist.

## Cutover (after #9 passes)

1. **Pin the rollback image.** Tag the image the live service runs now so it can't be rebuilt away:
   ```sh
   docker tag <live web image>:latest <live web image>:pre-standalone
   ```
2. **Back up together:** the live `config.json`, the live `state/` folder (`sessions.json`), the proxy host's current config, and once photos exist, `/data/photos.sqlite3` with the media folder.
3. **Provision production media** on the external drive with its own marker, as in staging step 1. Keep it separate from the staging folder.
4. **Switch the live service to the pinned release image without moving its files.** In the live compose file:
   - replace `build: .` with `image: hearthglance:<release tag or digest>`
   - keep the existing mounts (`./config.json:/app/config.json:ro`, `./state:/state`)
   - add the environment entries below
   - add the media bind mount with `create_host_path: false`
   - raise `mem_limit` from `128m` to `768m`

   ```yaml
   environment:
     HG_CONFIG: /app/config.json
     HG_SESSIONS: /state/sessions.json
     HG_MEDIA: /media
   ```

   The install URL, PWA scope and manifest identity are unchanged, so installed iPhone apps update in place through their normal "Reload to update" prompt. Existing sign-ins keep working because `sessions.json` is read as-is (rehearsed in #9, S7).
5. **Proxy for the live app path:** add `client_max_body_size 50m; proxy_request_buffering off;` to the existing `/hearthglance/` location so upload bodies stream straight to the external drive. Add a `location ^~ /hearthglance/api/photos/events` block with `proxy_buffering off`. The backend also sends `X-Accel-Buffering: no`.
6. **Smoke test:** `/health`, the installed app on one iPhone, an HA dashboard with the webpage card, the dashboard and slideshow on the Pi with `?debug=1`, and the Kobo, which stays on its existing endpoint.
7. **Kiosks:** the Pi and Fire keep opening `<app>/` (add `?idle=<minutes>` per screen if `HG_SLIDESHOW_IDLE_MINUTES` isn't set). Sign in once on each if prompted.

## Rollback

Any step above can be undone in this order:

1. In the live compose file, set the service back to the pinned image `<live web image>:pre-standalone` (or restore `build: .`). Remove the new environment entries and the media mount, and restore `mem_limit: 128m`.
2. `docker compose up -d web`. The previous image reads the same `config.json` and `state/sessions.json`, so sign-ins survive (rehearsed in #9, S8).
3. Restore the proxy host's saved advanced config.
4. Point the kiosks back at their previous dashboard.

Photos uploaded after the cutover stay on the external drive and in `photos.sqlite3`. The previous image ignores both, so nothing is lost if you roll forward again later.
