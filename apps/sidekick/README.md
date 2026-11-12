# Hearthglance Sidekick

The iPhone PWA. The baseline is the existing standalone JavaScript/Web Components app, including its desktop layout, offline store, install manifest and service worker. Keep its existing install URL and manifest identity when adding a dedicated Wall Display route.

Build with Node 22 using `npm ci` and `npm run build`. Run `npm test` after the build. Package the built `static/` tree as the artifact consumed by the backend. The planned photo upload and album UI build on this app.
