# Hearthglance Wall Display

Dedicated frontend for the Pi Chromium kiosk and the Fire HD 8 running Cromite. This repository records the initial interface contract. The existing desktop web layout remains in Sidekick until the independent Wall frontend is implemented.

The backend will serve the initial HTML and HTML fragments from templates in this directory. Wall will ship CSS and a small JavaScript module. It will use native EventSource for change notifications and normal HTTP requests for fragments and actions. The first slice is a manually launched slideshow sourced from the same photo catalog as Sidekick.

Package templates and static assets for the backend image. Wall runs in each kiosk browser. Device provisioning lives separately from this web interface.
