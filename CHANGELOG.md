# Changelog

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
