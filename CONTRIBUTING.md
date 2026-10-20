# Contributing

Use Node.js 22 or newer and Python 3 for the demo server and archive script.

1. Run `npm ci`.
2. Edit `src/`. Do not edit `dist/` by hand.
3. Run `npm run check` and check the fictional demo in wall and phone sizes.
4. Commit the rebuilt `dist/hearthglance-card.js` with your source changes. HACS installs that file directly.

Tests use Node's built-in runner. Cover behavior with meaningful date, configuration, lifecycle, or service tests. Do not add your real HA configuration, tokens, event data, backups, or screenshots. The demo fixture is intentionally fictional.

Describe the problem, resulting behavior, validation, and any compatibility changes in pull requests. Use GitHub issues for reproducible bugs; include HA/browser versions and a redacted minimal configuration. Never include authentication material.

The initial version is English-only and uses device-local dates, US time formatting, and Sunday-start weeks. Localization and broader device testing are welcome.
