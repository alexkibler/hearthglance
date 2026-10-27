# Changelog

## 0.5.1

- Apply HA dark mode to native card content and dialogs, fixing pale calendar
  events and date cells with unreadable text.
- Match the original Hearthglance dark green palette and include a
  **Hearthglance Dark** variant for an always-dark HA default.

## 0.5.0

- Add reusable Home, Calendar, Chores, Lists, Meals, Recipes, and Header cards
  for separate HA sidebar dashboards, with no in-card app navigation.
- Delegate cross-view links and selected-day deep links to HA's router.
- Adapt layouts to card width and limit each card's data subscriptions.
- Show connection status as an accessible dot and give the weather forecast the
  available header space.
- Add a shared light/dark Hearthglance theme, separate dashboard examples, and
  migration guide. Continue delivering one bundle through the same HACS resource.
- Preserve the legacy full-screen card and all existing data/form workflows.

## 0.4.0

- Optional native recipe library with a count entity, persistent structured records and private photos.
- One-time Mela import preserving all recipe fields, original IDs, dates, metadata and images, including HEIC previews.
- Searchable recipe gallery, category/favorite filters, complete details, editing and meal links on wall and phone layouts.
- Preserve existing Local To-do recipe configurations.

## 0.3.2

- Match the Home Assistant return icon to the theme accent on wall and phone layouts, fixing its contrast in dark mode.

## 0.3.1

- Replace the decorative leaf with a Home Assistant icon linking to HA’s Overview dashboard on wall and phone home screens.
- Document opening Hearthglance on a phone and keep phone section back navigation.

## 0.3.0

- Support daily forecast sensor lists for today and all five future weather days.
- Show only kWh values under the weather; keep explanatory labels on hover and for accessibility.
- Preserve existing today/tomorrow configurations and omit unavailable dates rather than repeating an estimate.

## 0.2.2

- Integrate solar energy into the weather forecast on wall and phone views.
- Today shows actual / forecast energy; tomorrow shows forecast only. Later days are left blank when no solar forecast exists.
- Remove the separate solar row and current-power readout.

## 0.2.1

- Compact solar readings alongside the home heading, with more space for the calendar.
- Add today’s forecast alongside current power, today’s actual energy, and tomorrow’s forecast.
- Move the compact phone readings above the feature shortcuts.

## 0.2.0

- Optional solar generation panel on wall and phone home screens.
- Live current power, today’s actual generation, and a clearly labeled tomorrow forecast.
- W/kW/MW and Wh/kWh/MWh conversion, unavailable/offline states, and updates without rebuilding the active page.

## 0.1.0

Initial shareable release package.

- Wall dashboard and dedicated phone navigation, calendar views, event sheets, and swipe navigation.
- Native calendars, chores, shared lists, meals, recipes, and weather.
- Configurable profiles and entities; optional feature sections.
- Recurring chore automation blueprint.
- Bundled HACS resource, generic examples, fictional demo, tests, and release workflows.

Compatibility baseline: Home Assistant 2026.10.0. Publication and HACS catalog inclusion are separate steps.
