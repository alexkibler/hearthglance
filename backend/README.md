# Hearthglance Backend

Python services that connect Hearthglance to Home Assistant. The initial source snapshot preserves the existing web API and the Kobo renderer as separate processes.

- `web/` contains the API and the HTTP integration tests. The existing server expects Sidekick's built `static/` tree beside `app.py`.
- `kobo/` contains the Pillow renderer and LAN service. It serves PNG pages and offline packs to the B/W plugin.

The root `Dockerfile` builds the main backend image with the dashboard app included (see `deploy/README.md` for mounts and environment). The target deployment serves the dashboard, for phones and wall screens, from that image, with the Kobo renderer kept as a LAN-only companion during migration. Config and credentials are mounted at runtime. Keep session state, snapshot caches and photo storage outside the source tree. The source snapshot does not switch or replace the running deployment.

## Recipe import API

Send an authenticated `POST <app base>/api/recipes/import` with the existing
Hearthglance session cookie, `X-HG-CSRF` header from `api/session`, and
`{"url":"https://recipe.example/soup"}`. Send `"preview":true` to get an editable
`recipe` without a write. A save returns `recipe_id`, `title`, and `created`
(HTTP 201 for a new entry and 200 for an existing source URL).

The backend uses recipe-scrapers to parse HTML downloaded from public HTTP(S)
addresses. It checks the destination of each redirect and uses the checked
addresses for the actual connections. It writes through the signed-in user's
configured Home Assistant recipe library.
