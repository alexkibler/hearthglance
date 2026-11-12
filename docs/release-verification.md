# Photo release verification

Release gate for the first standalone slice (#9): upload on an iPhone, store on the external drive, play in the dashboard slideshow on the wall screens, then remove. Record results in #9 using the tables below. Don't post photos, private hostnames, paths or tokens; use measurements and pass/fail only.

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

Use the staging URL for every row. Leave production untouched until all rows pass. **Person** rows need someone at the physical screen. **Operator** rows are done by the agent or whoever runs the host, so the person only taps and looks.

| # | Who | Device | Steps | Pass when |
|---|---|---|---|---|
| D1 | Person | iPhone Pro | Safari → `<staging>/hearthglance/` → **Sign in with Home Assistant** → Share → **Add to Home Screen** → open the new icon | The installed app opens full-screen and shows the household home |
| D2 | Person | iPhone Pro | Home → **Photos** → **Add photos** → select one HEIC, one JPEG and one PNG (screenshot) | Each shows progress, then appears in the grid upright |
| D2a | Operator | — | Read `api/photos` on staging and note each new photo's `source` | Records whether iOS sent the original HEIC (`HEIF`) or a JPEG |
| D3 | Person | iPhone Pro | Turn on Airplane Mode mid-upload, turn it off, then tap **Retry** | The failed item shows **Retry**; after retrying there's exactly one copy |
| D4 | Person | iPhone Pro | Tap a photo → use **‹** / **›** to step through → **Remove** → **Remove** to confirm | It leaves the grid. The bottom controls clear the home indicator and the image clears the Dynamic Island |
| D5 | Person | iPhone Pro | Airplane Mode → reopen the installed app | Saved household data still browses offline; Photos says to connect |
| D6–D10 | Person | iPhone Pro Max | Repeat D1–D5 | Same, with no layout clipping at the larger width |
| W1 | Person | Pi (Chromium, 1080p) | Open `<staging>/hearthglance/?debug=1` → sign in once → the family dashboard appears → tap **Slideshow** in the left menu → tap the screen | Photos play; the overlay reads `1920×1080` (or the verified output) and `stream open`; the tap returns to the same dashboard page |
| W2 | Person | Pi | While it plays, add a photo from an iPhone (can be combined with D2) | The new photo joins the rotation with no reload |
| W3 | Person | Pi | Remove the photo currently on screen from an iPhone (can be combined with D4) | It leaves within a second or two |
| W4 | Operator | Pi | Restart the staging container while the Pi plays; the person just watches | The last slide stays up, "Reconnecting…" shows briefly, and playback resumes |
| W6 | Person | Pi | Settings → **Slideshow** → **Start slideshow after: 1 minute**, close Settings, leave any dashboard page untouched for a minute, then tap | The slideshow starts by itself over that page, and the tap returns to it. Set it back to 5 minutes (the default) afterwards |
| W5 | Operator | Pi | Memory sampling, see §3 | Growth levels off |
| F1 | Person | Fire (Cromite) | Open `<staging>/hearthglance/?debug=1` and read out (or photograph) the overlay | CSS px and devicePixelRatio recorded in #9 |
| F2 | Person | Fire | Tap **Slideshow** in the left menu with a finger, then tap the slideshow to return | Both respond on the first tap; the dashboard and slides fit the recorded viewport |
| F3 | Operator + Person | Fire | W2–W4 on the Fire | Same as on the Pi |
| L1 | Person | 2880×1620 display | Open the dashboard at that output and play the slideshow | The dashboard and slides fill the screen without scaling artefacts (layout only, not the memory benchmark) |
| H1 | Person | HA dashboard | Open a dashboard with a webpage card pointing at the staging app, and follow a normal link to it | The iframe shows the signed-in app, and the link opens it with the same account |
| K1 | Person | Kobo | Normal use while staging runs | Unchanged. The Kobo keeps the live endpoint throughout. |

## 3. Pi memory benchmark (operator)

Over SSH to the Pi at the verified 1080p output, with only the dashboard open. If SSH isn't available, the person can run the same command in a terminal on the Pi.

```sh
# Total Chromium resident memory (MB)
ps -C chromium,chromium-browser -o rss= | awk '{s+=$1} END {print int(s/1024)}'
```

Sample once before starting the slideshow, then 10 minutes and 2 hours into the slideshow at `?interval=12`. Post all three numbers in #9. Growth should level off, since the slideshow only ever keeps two decoded slides.

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
