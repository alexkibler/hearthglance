# Data format

Hearthglance uses Home Assistant's authenticated frontend connection. Calendar and to-do subscriptions provide live updates; weather uses daily forecast subscriptions. The only timer updates the display clock and detects a local day change every 30 seconds. The optional native recipe library uses a companion integration and an authenticated WebSocket subscription; all other features work without it.

## Chores

A profile's Local To-do item uses normal `summary`, `uid`, `status`, and `due` fields. Its description stores:

```json
{"hearthglance":{"repeat":"daily","completed_on":"2026-10-20"}}
```

Repeat values are `none`, `daily`, `weekdays`, or `weekly`. Completion toggles stamp a device-local date (or null when reopened). The optional blueprint reads the repeat value and due date. Do not share a profile list with the recipe entity or another profile.

## Meals

Use a separate Local Calendar configured with `kind: meals`. An event's summary is the meal name; its description stores:

```json
{"hearthglance":{"slot":"Dinner","notes":"Serve with salad","recipe":"native-todo-uid-or-null"}}
```

Slots are `Breakfast`, `Lunch`, `Dinner`, and `Snack`. The optional recipe UID links to an item in the configured recipe list. Meal metadata is not a recipe synchronization protocol.

## Recipes

For `recipes: sensor.hearthglance_recipes`, the [native integration](recipes.md) owns versioned structured records in HA storage and separate private image assets. Its record schema retains Mela field names: `title`, `text`, `ingredients`, `instructions`, `yield`, `prepTime`, `cookTime`, `totalTime`, `notes`, `nutrition`, `link`, `categories`, `favorite`, `wantToCook`, and the original Apple-epoch `date`. Added fields include stable local `id`, `mela_id`, `created_at`, `updated_at`, `revision`, `images` and preserved original `mela` metadata (excluding base64 images). Meal events link to the stable local ID. The count sensor exposes no recipe bodies or images.

For legacy `recipes: todo.recipes`, recipe titles are Local To-do item summaries. The description stores:

```json
{"ingredients":"Pasta\nTomatoes","instructions":"Cook and serve.","source":"https://example.org/recipe"}
```

## Calendar semantics

All-day start/end values use ISO dates and an exclusive end. The form presents the last included date and converts it on save. Timed events use ISO timestamps. Local date arithmetic preserves calendar dates across daylight saving changes.

Calendar CRUD controls honor entity supported-feature flags. Recurring series edits/deletion are delegated to HA's calendar UI. To-do saves use native `todo.add_item`, `todo.update_item`, and `todo.remove_item` services.

## Portability

Back up HA normally; it owns the calendar and list data. Exporting card YAML does not export entities or content. Migration is explicit: the optional recipe integration supports one-time Mela imports; other private prototypes are not migrated automatically. Existing calendar events and plain to-do items can be displayed, but repeat/meal metadata must use the documented format.
