# Hearthglance Backend

Python services that connect Hearthglance to Home Assistant. The initial source snapshot preserves the existing web API and the Kobo renderer as separate processes.

- `web/` contains the API and the HTTP integration tests. The existing server expects Sidekick's built `static/` tree beside `app.py`.
- `kobo/` contains the Pillow renderer and LAN service. It serves PNG pages and offline packs to the B/W plugin.

The target deployment serves Sidekick and Wall from the main backend image, with the Kobo renderer kept as a LAN-only companion during migration. Config and credentials are mounted at runtime. Keep session state, snapshot caches and photo storage outside the source tree. The source snapshot does not switch or replace the running deployment.
