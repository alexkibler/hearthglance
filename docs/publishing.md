# Publishing Hearthglance

The standalone repository is [alexkibler/hearthglance](https://github.com/alexkibler/hearthglance). Never copy the surrounding home-server repository or private instance data into it.

## Validation and releases

1. Run `npm ci` and `npm run package`.
2. Commit source changes, documentation, and `dist/hearthglance-card.js`. HACS downloads the committed bundle; it does not build source files.
3. Push and let the Validate workflow finish. It runs unit tests, builds the resource, checks bundle freshness, packages the archive, and invokes the official HACS validation action with `category: plugin`.
4. Update `package.json`, refresh `package-lock.json` with `npm install --package-lock-only`, and update CHANGELOG for a new version.
5. Tag the tested commit `v<version>` and push the tag. The Release workflow verifies the tag/version match, rebuilds/tests, and creates a GitHub release with the JS resource, ZIP, and checksum.
6. Check download, resource registration, minimal configuration, upgrades, and blueprint import on a clean HA/HACS installation before announcing broad compatibility.

## HACS layout

`hacs.json` explicitly names `hearthglance-card.js`, since the repository name is `hearthglance`. HACS installs the bundle from `dist/` or a release. It has no relative module imports or runtime dependencies. The module resource URL is `/hacsfiles/hearthglance/hearthglance-card.js`.

Official references: [Dashboard plugin requirements](https://hacs.dev/docs/publish/plugin/), [repository and manifest requirements](https://hacs.dev/docs/publish/start/), [validation action](https://hacs.dev/docs/publish/action/).

Default catalog inclusion is optional and separate from custom-repository installation. Follow [HACS's submission requirements](https://hacs.dev/docs/publish/include/) after the public repository, release, and validation are ready. Do not describe passing validation as catalog approval.

A source ZIP is a convenient sharing artifact. HACS users install the public repository, not the ZIP as an add-on.
