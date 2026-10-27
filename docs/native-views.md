# Separate Home Assistant dashboards

Hearthglance 0.5 adds seven reusable cards in the existing HACS bundle:

| Card type | Content |
| --- | --- |
| `custom:hearthglance-home-card` | Family overview, calendar, and summaries |
| `custom:hearthglance-calendar-card` | Calendar with day/week/month/schedule controls |
| `custom:hearthglance-chores-card` | Per-person chores and routines |
| `custom:hearthglance-lists-card` | Shared lists |
| `custom:hearthglance-meals-card` | Meal planner |
| `custom:hearthglance-recipes-card` | Recipe library and editing forms |
| `custom:hearthglance-header-card` | Clock, weather, and solar forecast |

These cards participate in HA's document layout. They do not cover the viewport,
draw an application sidebar, or select other pages internally. Create one HA
dashboard per page, each with a single view. HA's sidebar, URLs, and browser
history provide navigation; Hearthglance supplies no page tabs or navigation rail.
Calendar period controls, recipe forms, and choosing a shared list remain within their cards.
Layouts respond to card width, including a narrow card in a desktop dashboard.

Use the [separate dashboard examples](../examples/dashboards/), which each have
one Sections view. Add Home, Calendar, Chores, Lists, Meals, and Recipes as
separate dashboards in HA settings and show them in the HA sidebar. Each card
is independently editable
and can be combined with built-in HA cards. Only pass the relevant entities to
each card; a weather header needs no people or calendars. The complete family
configuration is also accepted and each card subscribes only to relevant data.

## Optional links between dashboards

Home summaries can link to your calendar, chore, or meal dashboards. Supply local
HA dashboard paths with the `routes` mapping. Keys are `home`, `calendar`, `tasks` (chores),
`list` (shared lists), `meals`, and `recipes`:

```yaml
routes:
  calendar: /family-calendar/main
  tasks: /family-chores/main
  list: /family-lists/main
  meals: /family-meals/main
  recipes: /family-recipes/main
```

These actions notify HA's router and update the URL. A selected calendar day is
carried in the `hg_date` and `hg_view` query parameters. Omitted routes hide the
corresponding cross-dashboard links. Links only open the configured HA dashboard.
The cards never invent a destination or replace
their own content with a different page.

## Shared theme

Copy `themes/hearthglance.yaml` into `/config/themes/`, enable the usual
`frontend: themes: !include_dir_merge_named themes` configuration if needed,
and run `frontend.reload_themes`. Select **Hearthglance** in the HA profile or
apply it to individual views. It supplies light and dark modes for native HA
surfaces and Hearthglance cards; the native cards follow the HA theme rather
than a separate in-card appearance toggle.

Select **Hearthglance Dark** for the original dark green appearance regardless
of the display's system preference. Set it as both backend default themes with
`frontend.set_theme` (`name` and `name_dark`) to use it across HA. Profiles with
an explicit theme selection must also select it in their profile.

The theme is a separate file because a HACS Dashboard repository installs the
JavaScript resource, not HA theme configuration. It is included in the release
ZIP and as a release asset. Updating the card through HACS does not overwrite
your theme or dashboard configuration. Additional HA theme variables may change
between HA releases; this theme does not patch HA's internal DOM or settings pages.

## Upgrading an existing installation

1. Back up the dashboard configuration and update Hearthglance through HACS.
2. Install the optional theme separately.
3. Create separate single-view HA dashboards using the new card types and your existing entities.
4. Add `routes` for any cross-view links and use the same explicit `storage_key`
   across cards to share that display's family/calendar filter preferences.
5. Verify data and forms before replacing the previous dashboard.

The old `custom:hearthglance-card` remains compatible with its full-screen layout.
Upgrading HACS alone does not alter an existing dashboard. There is no calendar,
to-do, recipe, photo, or automation migration: the cards continue to use the same
HA integrations and stored content. The Recipes integration does not need to be
reinstalled for this frontend-only update.

For a fictional standalone visual check, serve the repository and open
`examples/native-demo.html`. Adding `?width=390` tests narrow-card behavior in a
wide browser; `?page=recipes` selects a specific card. The fictional demo’s host
navigation is a test harness; the real installation uses only HA’s sidebar. Demo changes stay
in memory.
