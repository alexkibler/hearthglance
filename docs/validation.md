# Release package validation

The 0.1.0 package was checked on 2026-10-20.

- Node's built-in test runner: 21 tests passed, covering local date/DST behavior, exclusive event ends, multi-day month lanes, overlapping timelines, phone swipe intent, period navigation, metadata handling, configuration validation, optional features, subscription lifecycle cleanup, and bundle packaging.
- The actual bundled resource was loaded in a browser using the fictional HA fixture. Wall layout checked at 1920 × 1080; phone layout at 390 × 844 and 320 × 740. Calendar-only configuration checked in both layouts.
- Event creation and chore completion updated the fixture through the same native HA method interfaces used by the production card. This fixture verification does not replace testing on a fresh HA/HACS installation.
- The recurring-chore YAML was accepted by Home Assistant 2026.10.1's `AUTOMATION_BLUEPRINT_SCHEMA` and `Blueprint` validator in memory. It was not installed or enabled during this package check.
- Generic YAML examples and workflow files parsed successfully. The archive uses an explicit file allowlist and excludes dependencies, local configuration, credentials, and backups. All screenshots are fictional.

The [initial GitHub validation run](https://github.com/alexkibler/hearthglance/actions/runs/39505174166) passed both Linux build/tests and the official HACS validator without ignored checks.

Still required: clean HACS installation/download/resource registration, update flow, blueprint import, and real touchscreen/device performance testing. Public repository: https://github.com/alexkibler/hearthglance. HACS catalog inclusion remains a separate submission.
