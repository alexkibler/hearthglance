# Native recipe library

Hearthglance Recipes is an optional local Home Assistant integration. It stores structured recipe records and photos independently of to-do lists. The card still supports existing `recipes: todo.recipes` configurations without the integration.

## Install

1. Download `hearthglance-recipes-v<VERSION>.zip` from the same release as the card.
2. Extract its `custom_components/hearthglance_recipes` folder into `/config/custom_components/`.
3. Restart Home Assistant, then add **Hearthglance Recipes** under Settings → Devices & services → Add integration.
4. Set the card's recipe source to the library sensor:

```yaml
recipes: sensor.hearthglance_recipes
```

The sensor contains the recipe count and import timestamp. If HA assigns a different entity ID, use the one shown on the integration's device. The existing HACS frontend repository continues to update the card; install this optional backend from its release ZIP when updating it. It is not installed automatically by a HACS frontend download.

## One-time Mela import

Copy a Mela `.melarecipes` export into `/config/imports/`, then run this action in Developer tools → Actions as an administrator:

```yaml
action: hearthglance_recipes.import_mela
data:
  path: /config/imports/Recipes.melarecipes
```

The action returns added, skipped and total counts. Importing is additive: matching original Mela IDs are skipped, preserving edits made in HA. Identical archives can be imported again without duplicates. There is no account connection, scheduled import, network fetching of source links, or live synchronization.

The importer preserves titles, overview text, ingredients, instructions, yield, prep/cook/total times, categories, favorite/want-to-cook flags, notes, nutrition, original Mela IDs and dates, unknown source metadata, and original photo bytes. Mela IDs may be UUIDs or source URLs; deterministic local IDs keep both safe for storage and meal links. Photos get JPEG previews and small thumbnails, including HEIC photos. Nothing is uploaded to a recipe service.

## Using recipes

Search by title, ingredients or category; filter by category or favorites. Recipe details show all available fields and photos. Add and edit recipes in Hearthglance. Editing preserves imported photos and original metadata. Concurrent edits are checked by revision to prevent silently overwriting another display's save. **Plan this meal** creates a normal HA calendar event linked to the recipe's stable local ID.

## Storage and permissions

- `/config/.storage/hearthglance_recipes.library`: versioned records managed by HA's storage helper.
- `/config/.storage/hearthglance_recipes_images/`: original image bytes plus JPEG photos and thumbnails.
- Recipe text and photos are not entity attributes and do not flood Recorder history.
- Back up the complete HA config folder, including `.storage`, to preserve the library and photos. The Mela archive remains a separate source backup.
- WebSocket access checks the library entity's read/control permissions. Images use authenticated routes and expiring URLs tied to the current HA session; they are not served from public `/local/` paths. Importing local files requires administrator access and is restricted to `/config/imports/`.

Removing the integration leaves its data files available for recovery. The old recipe to-do list is not modified automatically. If moving an existing list with recipe-linked meals, migrate its UIDs explicitly before switching sources.

## Development checks

Run the fictional importer fixtures with `python -m unittest discover -s tests -p test_recipe_import.py` in an environment with Pillow and `pillow-heif==1.8.1`. `test_recipe_backend.py` additionally exercises real HA Store persistence, repeat imports, revisions, count-only entities and permissions inside a Home Assistant Python environment. No personal exports belong in the repository or release archives.
# Planning meals

In **Plan a meal**, type a recipe name or ingredient to see matching recipes.
Choose a suggestion with a click or Arrow Up/Down and Enter to link its recipe
ID. You can also enter any meal name and save it as free text. A matching name
does not implicitly link a recipe, and changing a linked name clears its link.

When nothing matches, **Create Recipe for …** opens the full recipe editor with
that name. Cancel returns to the unchanged meal draft. Save creates the recipe
and returns to the draft with its ID linked; the meal is added only when you
press **Add to meal plan**. The meal's calendar, dates, slot, repeat setting and
notes survive both paths. Simply typing a meal name never creates a recipe.
