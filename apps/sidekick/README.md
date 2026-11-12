# Hearthglance Sidekick

The Hearthglance dashboard app, used both as the iPhone PWA and on the wall screens (its wide layout). It's the existing standalone JavaScript/Web Components app, including its offline store, install manifest and service worker; keep its install URL and manifest identity. The Family Photos slideshow (`slideshow-overlay.js`, playback in `ui/slideshow.js`, idle start in `ui/idle.js`) plays over any page and returns to it on a tap.

Build with Node 22 using `npm ci` and `npm run build`. Run `npm test` after the build. Package the built `static/` tree as the artifact consumed by the backend. The planned photo upload and album UI build on this app.
