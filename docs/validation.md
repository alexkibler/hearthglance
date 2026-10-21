# Release package validation

The 0.1.0 package was checked on 2026-10-20.

- Node's built-in test runner: 21 tests passed, covering local date/DST behavior, exclusive event ends, multi-day month lanes, overlapping timelines, phone swipe intent, period navigation, metadata handling, configuration validation, optional features, subscription lifecycle cleanup, and bundle packaging.
- The actual bundled resource was loaded in a browser using the fictional HA fixture. Wall layout checked at 1920 × 1080; phone layout at 390 × 844 and 320 × 740. Calendar-only configuration checked in both layouts.
- Event creation and chore completion updated the fixture through the same native HA method interfaces used by the production card. This fixture verification does not replace testing on a fresh HA/HACS installation.
- The recurring-chore YAML was accepted by Home Assistant 2026.10.1's `AUTOMATION_BLUEPRINT_SCHEMA` and `Blueprint` validator in memory. It was not installed or enabled during this package check.
- Generic YAML examples and workflow files parsed successfully. The archive uses an explicit file allowlist and excludes dependencies, local configuration, credentials, and backups. All screenshots are fictional.

The [initial GitHub validation run](https://github.com/alexkibler/hearthglance/actions/runs/39505174166) passed both Linux build/tests and the official HACS validator without ignored checks.

Still required: clean HACS installation/download/resource registration, update flow, blueprint import, and real touchscreen/device performance testing. Public repository: https://github.com/alexkibler/hearthglance. HACS catalog inclusion remains a separate submission.

## 0.2.0 solar generation

Checked on 2026-10-21: 26 automated tests passed, including actual-versus-forecast sources, unit conversion, zero/unavailable/offline handling, optional configuration, and live value updates without rebuilding the page. Fictional browser previews were checked at 1920 × 1080, 1280 × 800, 390 × 844, and 320 × 740. Public screenshots contain fictional data only.

## 0.2.1 compact solar header

Checked on 2026-10-21: all 26 tests pass with separate actual/today-forecast/tomorrow-forecast readings. The compact heading layout was previewed at 1280 × 800 and phone widths of 390 and 320 pixels. Generic previews were updated.

## 0.2.2 weather and solar

Checked on 2026-10-21: all 27 tests pass, including date matching across year boundaries, actual/forecast pairing, zero and offline values, and omitting future solar data outside the available sensors. The combined weather strip was checked at 1280 × 800 and phone widths of 390 and 320 pixels. Public screenshots contain fictional values only.

## 0.3.0 daily solar forecasts

Checked on 2026-10-21: all 29 tests pass, including six distinct daily forecasts across DST, existing two-day configuration compatibility, unavailable values, and nested forecast sensor updates. Fictional browser previews were checked at 1280 × 800 and 390 × 844. The phone strip contains all six daily values and scrolls horizontally. Visible solar labels were removed; accessible and hover descriptions remain.

## 0.3.1 Home Assistant navigation

Checked on 2026-10-21: all 29 existing tests pass. The Home Assistant icon and Overview link were checked in wall and phone layouts. Phone Calendar navigation still returns home through its back arrow. The bundled resource includes the icon license notices.

## 0.3.2 theme contrast

Checked on 2026-10-21: all 29 existing tests pass and the release bundle builds. The bundled fictional wall preview was checked in dark appearance; the Home Assistant icon uses the same light green accent as the navigation. Removed the conflicting dark brand foreground override.

## 0.4.0 native recipes

Checked on 2026-10-21: 34 JavaScript tests, six fictional importer tests and four backend tests in Home Assistant 2026.10.2 passed. The importer preserves complete source records, handles UUID and URL IDs and generates JPEG/HEIC previews. Real HA Store persistence, duplicate imports, revision conflicts, count-only entity attributes, permissions, image access and path restrictions were checked. Native gallery search, recipe details and meal planning were previewed in wall and phone layouts. A private live import was compared to its source metadata and photos; authenticated image routes returned JPEGs while unsigned access returned 401. Private export data is excluded from source and release archives.
