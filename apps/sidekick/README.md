# Hearthglance Sidekick

The Hearthglance dashboard app, used both as the iPhone PWA and on the wall screens (its wide layout). It's the existing standalone JavaScript/Web Components app, including its offline store, install manifest and service worker; keep its install URL and manifest identity. The Family Photos slideshow (`slideshow-overlay.js`, playback in `ui/slideshow.js`, idle start in `ui/idle.js`) plays over any page and returns to it on a tap.

Build with Node 22 using `npm ci` and `npm run build`. Run `npm test` after the build. Package the built `static/` tree as the artifact consumed by the backend. The planned photo upload and album UI build on this app.

## Add recipes from the web

In **Recipes → Add recipe**, paste a **Source URL** and choose **Fill from URL**.
Review the populated fields and save. This uses the standalone app's existing
Hearthglance login and native recipe library.

For a browser bookmarklet or an iOS share-sheet shortcut, open
`<app base>/import-recipe?url=<percent-encoded recipe URL>`. The import page keeps
the URL across sign-in and opens an editable preview. Review or edit the
recipe, then choose **Save recipe**.

Set the bookmark's address to the following after changing the app base to your installation.

```javascript
javascript:void(location.href='https://hearthglance.example/hearthglance/import-recipe?url='+encodeURIComponent(location.href))
```

In iOS Shortcuts, enable **Show in Share Sheet** for **URLs** and **Safari
webpages**. Use **Get URLs from Input**, get the first item, and **URL Encode**
it. Append the encoded value to `<app base>/import-recipe?url=` with a **Text**
action and pass the result to **Open URLs**.

The importer takes ingredients, directions, and available recipe details from
the publisher's public page and keeps the original source link. It supports
structured data and some publisher-specific HTML. Pages that block the server
or omit usable recipe data produce an error and can still be entered manually.
