# Hearthglance Wall Display

Dedicated frontend for the Pi Chromium kiosk and the Fire HD 8 running Cromite. This repository records the initial interface contract. The existing desktop web layout remains in Sidekick until the independent Wall frontend is implemented.

The backend will serve the initial HTML and HTML fragments from templates in this directory. Wall will ship CSS and a small JavaScript module. It will use native EventSource for change notifications and normal HTTP requests for fragments and actions. The first slice is a manually launched slideshow sourced from the same photo catalog as Sidekick.

Package templates and static assets for the backend image. Wall runs in each kiosk browser. Device provisioning lives separately from this web interface.

`static/index.html` is a server-rendered template. The backend fills in the signed-in state, the Play button and the photo count. `wall.js` adds the clock, an `EventSource` on `events`, and the slideshow. `slideshow.js` is the playback logic: two image layers, with one visible and one preloading the next photo, so only two images are ever decoded. A removed photo leaves playback immediately and new photos join the rotation. If the connection drops, the last slide stays up.

Run the logic tests with `node --test apps/wall/tests/*.test.mjs`. The files are copied into the backend image as `/app/wall`.
