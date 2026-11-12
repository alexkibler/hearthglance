# Photo release verification

Release gate for the first standalone slice (#9): upload in Sidekick, store on the external drive, show on Wall, then remove. Record results in #9 using the tables below. Don't post photos, private hostnames, paths or tokens; use measurements and pass/fail only.

## 1. Staging target for devices

The iPhones, Pi and Fire need an HTTPS staging origin of their own. Same-origin staging under the production host isn't safe: the Sidekick service worker deletes other `hearthglance-shell-*` caches when it activates, and offline storage is per-origin, so it would damage the installed production app.

Staging is isolated from production as follows:

| | Production | Staging |
|---|---|---|
| Origin | existing app URL | its own HTTPS hostname (for example `hearthglance-staging.<your domain>`) |
| Container | live `web` service | `hearthglance-staging` compose project, image pinned to the release candidate |
| Sessions | live `/state` | staging `HG_DATA_DIR` |
| Photo catalog and media | none yet | staging `HG_MEDIA_DIR` on the external drive |
| PWA install | existing Home Screen icon | a second icon, installed from the staging origin |
| Home Assistant | same HA, same OAuth path | same HA. Sign-in registers the staging origin as a separate OAuth client. |

Set-up (see [rollout.md](rollout.md#staging-with-home-assistant) for the commands):

1. Add a proxy host for the staging hostname that forwards to `host.docker.internal:8136`, with a certificate and the proxy settings in `deploy/README.md` (`proxy_request_buffering off`, plus no buffering for `wall/events`).
2. In the private `deploy/staging.env`, point `HA_URL` and `HA_PUBLIC_URL` at Home Assistant and set `HG_PUBLIC_URL=https://<staging host>/hearthglance/`. Point `HG_CONFIG_DIR` at a private copy of the household `config.json`, and set `HG_FRAME_ANCESTORS` only if HA is served from another origin.
3. Start: `docker compose -p hearthglance-staging --env-file deploy/staging.env -f deploy/compose.staging.yaml up -d`.

## 2. Device checklist

Use the staging URL for every row. Leave production untouched until all rows pass.

| # | Device | Steps | Pass when |
|---|---|---|---|
| D1 | iPhone Pro | Safari → staging URL → **Sign in with Home Assistant** → Share → **Add to Home Screen** → open the new icon | The installed app opens full-screen and shows the household home |
| D2 | iPhone Pro | Home → **Photos** → **Add photos** → select one HEIC, one JPEG and one PNG (screenshot) | Each shows progress, then appears in the grid upright. Open `<staging>/hearthglance/api/photos` in Safari and note each photo's `source` (`HEIF` or `JPEG`) to record whether iOS sent the original HEIC |
| D3 | iPhone Pro | Turn on Airplane Mode mid-upload, then **Retry** after reconnecting | The failed item shows **Retry**; after retrying there's exactly one copy |
| D4 | iPhone Pro | Open a photo → swipe through → **Remove** → confirm | It leaves the grid. The preview controls clear the Dynamic Island and home indicator |
| D5 | iPhone Pro | Airplane Mode → reopen the installed app | Saved household data still browses offline; Photos says to connect |
| D6–D10 | iPhone Pro Max | Repeat D1–D5 | Same, with no layout clipping at the larger width |
| W1 | Pi (Chromium, 1080p) | Open `<staging>/hearthglance/wall/?debug=1` → sign in once → **Play slideshow** | The overlay shows `1920×1080` (or the verified output) and the stream is `open` |
| W2 | Pi | Upload from an iPhone while it plays | The new photo joins the rotation with no reload |
| W3 | Pi | Remove the photo currently on screen from an iPhone | It leaves within a second or two |
| W4 | Pi | Restart the staging container while it plays | The last slide stays up, the overlay shows the stream reconnecting, and playback resumes |
| W5 | Pi | Memory: see §3 | Growth within the limit agreed in #9 |
| F1 | Fire (Cromite) | Open the same URL with `?debug=1` and record the overlay values | CSS px and devicePixelRatio recorded in #9 |
| F2 | Fire | Tap **Play slideshow** with a finger, then tap to return | Both respond on the first tap and the layout fits the recorded viewport |
| F3 | Fire | W2–W4 | Same as on the Pi |
| L1 | 2880×1620 display | Open Wall at that output | The home view and slides fill the screen without scaling artefacts (layout only, not the memory benchmark) |
| H1 | HA dashboard | A webpage card pointing at the staging app, plus a normal link | The iframe shows the signed-in app, and the link opens it with the same account |
| K1 | Kobo | Normal use while staging runs | Unchanged. The Kobo keeps the live endpoint throughout. |

## 3. Pi memory benchmark

At the verified 1080p output, with nothing else open:

```sh
# Total Chromium resident memory (MB), before starting the slideshow
ps -C chromium,chromium-browser -o rss= | awk '{s+=$1} END {print int(s/1024)}'
```

Start the slideshow (`?interval=12`). Measure again after 10 minutes and after 2 hours. Record all three numbers. Growth should level off: Wall only ever keeps two decoded slides.

## 4. Host checks (already run on the Mac)

Run against the release-candidate image in the staging project with the media directory on the external drive. Results are posted in #9.

| # | Check | Result |
|---|---|---|
| S1 | Derivatives and staging on the external volume | 16 derivatives for 8 uploads on the external drive; staging empty afterwards |
| S2 | Internal SSD stable during uploads | Internal-disk free space changed by about 1 MB (SQLite catalog plus background churn). The container root is read-only, and `docker diff` shows only the CA certificate the runtime injects |
| S3 | Memory | Container peak 302 MB across 24 MP HEIC, 48 MP JPEG and PNG uploads, idle ~25 MB |
| S4 | Drive missing at startup | Compose refuses to start (`bind source path does not exist`) and creates no folder |
| S5 | Drive marker lost while running | `list` and `upload` return 503 "Photo storage is unavailable…"; health stays 200; nothing staged |
| S6 | Full storage, interrupted upload, repeated request, unauthorized request | Covered by `backend/web/tests/test_photos.py` (507, cleanup, idempotent replay, 401/403) |
| S7 | Migration rehearsal (synthetic state) | The new image on the existing `/app/config.json` and `/state` layout serves the shell and accepts an existing session, and leaves `sessions.json` unchanged |
| S8 | Rollback rehearsal | The current live image, started on the same state afterwards, accepts the same session; manifest `id`/`scope` are identical |
