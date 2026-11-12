# Hearthglance standalone design

Hearthglance is a self-hosted household app. Sidekick manages the household from an iPhone. Wall Display makes the same data readable across a room. B/W brings the agenda and essential controls to KOReader. The existing Home Assistant card remains available during migration.

The first release is a complete photo workflow. Select a few pictures in Sidekick, see them on Wall Display, and remove one from the slideshow. The later roadmap includes a better wall calendar, a Today board for routines, rewards, and grocery sections. Dinners stays dinner-only.

## Source and runtimes

| Piece | Source | Technology | Runtime |
|---|---|---|---|
| Backend | `backend/web/` | Python, SQLite for new app data, filesystem for media, existing HA HTTP and WebSocket adapter as a starting point | Docker on the host |
| Sidekick | `apps/sidekick/` | Existing JavaScript, HTML, CSS, Web Components, esbuild, manifest and service worker | Installed iPhone PWA |
| Wall Display | `apps/wall/` | Server-rendered HTML and CSS, small vanilla JavaScript module, native EventSource | Chromium on the Pi and Cromite on the Fire |
| B/W | `apps/bw/`, `backend/kobo/` | KOReader Lua plugin and Python/Pillow renderer | Lua on Kobo, renderer in a LAN-only companion container |
| Legacy HA card | Existing root source, HACS package and recipe integration | Existing Web Components and HA Python integration | Home Assistant during migration |

The imported web app serves a responsive phone and desktop UI from one entry point. Sidekick inherits the existing URL, PWA identity, sign-in flow and offline behavior during the first release. Wall is a new entry point served by the same backend, under the existing web app base path to share its session cookie. Keep Wall routes outside the service worker's cached shell routes. B/W keeps its existing protocol, offline packs, clock, completion actions and power behavior.

The monorepo builds a backend image with the Sidekick bundle and Wall templates and assets. Node is a build dependency. A second image can run the existing Kobo renderer during migration. The legacy HA card keeps its own build and release workflow. Pin the deployment to a tested image version for rollback.

## Data ownership and Home Assistant

Assign one owner per collection. Hearthglance owns uploaded photos and albums. For household collections, a Hearthglance-owned calendar or list uses local storage. An HA-backed calendar or list reads from its configured HA source and writes back only where the integration and account permit. Source identifiers stay stable across app upgrades. Changes outside Hearthglance should appear on the wall when HA supplies a relevant subscription event. For sources without reliable change notifications, use bounded reconciliation on the backend.

The household that commissioned the work requires its existing HA calendars, chores, lists, dinners and recipes. Preserve those sources, permissions and edit workflows throughout migration. Maintain the existing OAuth path during the first release. Other households must eventually be able to start the backend, create a local account, and use Hearthglance-owned data with HA entirely absent. Use mature password hashing and session libraries for local sign-in and keep any HA credentials server-side. Deliver native collections incrementally. Shared providers and local authentication can follow the photo slice unless a dependency requires them sooner.

Support the HA embed through the ordinary webpage card on the same HTTPS origin as the app. Verify the authenticated iframe and a normal link into the app. Keep HA framing narrowly scoped to the configured origin. The HA card, browser sign-in and B/W each have different compatibility constraints and should be verified separately.

## Photo release

1. Add a Photos tile and a shared **Family Photos** album to Sidekick. Use the iPhone's multi-select photo picker, a thumbnail grid, full-screen preview, per-photo progress and retry, and removal. Keep upload and removal online. Exercise both the Pro and Pro Max layouts in the installed PWA.
2. Authenticate uploads and reads with the existing Hearthglance session and enforce household access. Stage each file on the media mount. Validate actual format, size and pixel count before processing. Verify HEIC, JPEG and PNG in the real iPhone flow. Normalize orientation and strip location and other unnecessary metadata from published derivatives. Bound decode concurrency and memory. Publish metadata and completed derivatives together, and handle interrupted uploads and retries without exposing partial photos or creating duplicates.
3. Save a display-sized image and a thumbnail per photo as the initial design default. Treat full-resolution archive retention as a separate product decision. Upload copies leave the iPhone library intact. This release uses the system picker and requires no Apple account connection or library sync on the host.
4. Add **Play slideshow** on Wall. Use one shared album, display-appropriate image dimensions and a bounded preload of the next slide. Keep only a small number of decoded images in memory. Update the current album after an upload or removal. Add the idle timer and tap-to-return after manual playback works.
5. Use native Server-Sent Events for small change notifications, followed by a fresh fragment or playlist request. Fetch current state on reconnect to catch events missed during an outage. Keep the last rendered view visible while disconnected. Confirm end-to-end delivery through the reverse proxy with response buffering disabled for the stream. Wall actions use ordinary authenticated HTTP.

Postpone video, guest uploads, richer album management, offline upload queues and native iOS work. If the PWA hits a concrete platform limitation, document it with a reproducible test on an iPhone before revisiting native distribution.

## Docker deployment shape

This example specifies the target layout. The current imported image and services still use their existing paths and require a migration before this example can serve traffic.

```yaml
services:
  hearthglance:
    image: ${HG_IMAGE:?set a tested backend image}
    restart: unless-stopped
    ports:
      - "127.0.0.1:8135:8080"
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    tmpfs:
      - /tmp:size=16m
    volumes:
      - type: bind
        source: ${HG_CONFIG_DIR:-./config}
        target: /config
        read_only: true
        bind:
          create_host_path: false
      - hearthglance_data:/data
      - type: bind
        source: ${HG_MEDIA_DIR:-./media}
        target: /media
        bind:
          create_host_path: false

volumes:
  hearthglance_data:
```

The backend runs as a non-root user. Provision writable ownership for `/data` and `/media` before startup. `/config` holds nonsecret household settings and HA mappings. `/data` holds SQLite, session state and migration metadata. `/media` holds upload staging, display photos and thumbnails. For the commissioning household, set `HG_MEDIA_DIR` to a directory on the external 14 TB drive. Verify a provisioned media marker and mount availability when reading or writing media. A missing drive should surface a clear photo error. Keep staging on the external filesystem all the way through the reverse proxy, including any request-body spool. Test that the internal SSD remains stable during uploads.

Mount credentials for enabled integrations as runtime secrets, scoped to each service. Keep private config, state, secrets and media out of Git, Docker build contexts and issue attachments. Store the Kobo renderer's config and device credentials in runtime mounts and keep its cached state separate. Keep the renderer on its existing LAN endpoint until the device protocol has a verified replacement. Document backups of the database and media together, plus a rollback procedure before any live cutover.

## Acceptance checks

- On both iPhones, open the installed Sidekick app and upload a small mixed-format selection. Check progress, retry after a failed upload, correct rotation and safe-area layout. Verify existing offline household browsing still works.
- On the Pi and Fire, see new photos without a page reload. Remove a currently displayed photo and verify it leaves playback. Check reconnect, 1080p and 2880×1620 layout, and physical touch on the Fire. Measure Chromium process memory on the Pi before and after an extended slideshow at the same output resolution.
- On the Mac, confirm files and upload staging land on the external volume. Disconnect the media mount in a test deployment and confirm photo writes fail cleanly. Test full storage, an interrupted upload, a repeated request, and a rejected unauthorized request.
- Verify the standalone URL and HA embed use the expected account and session. Smoke-test existing native HA dashboards and the Kobo without changing the live device endpoint.
- For the standalone milestone, run with HA absent and exercise account setup and local collection CRUD. Run a second fixture with HA enabled and verify a mapped collection keeps HA ownership and preserves existing permissions.

## References

- [Browser Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Compose service and bind-mount configuration](https://docs.docker.com/reference/compose-file/services/)
- [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
