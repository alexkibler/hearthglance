"""Run inside a Home Assistant Python environment; uses isolated temporary storage."""
import asyncio
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from custom_components.hearthglance_recipes import library_for, RecipeImageView, import_path
from homeassistant.helpers.http import KEY_HASS
from aiohttp import web
from custom_components.hearthglance_recipes.store import RecipeLibrary
from custom_components.hearthglance_recipes.sensor import RecipeCount
from test_recipe_import import archive, recipe


class RecipeBackendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.tmp.name)
        self.library = RecipeLibrary(self.hass)
        await self.library.async_load()

    async def asyncTearDown(self):
        await self.hass.async_stop()
        self.tmp.cleanup()

    async def test_persistence_edits_conflict_and_delete(self):
        identity = await self.library.async_save({'title': 'Fictional dinner', 'notes': 'Keep'})
        with self.assertRaises(ValueError):
            await self.library.async_save({'title': 'Wrong'}, identity, 0)
        await self.library.async_save({'title': 'Edited'}, identity, 1)
        restored = RecipeLibrary(self.hass)
        await restored.async_load()
        self.assertEqual(restored.records[identity]['title'], 'Edited')
        self.assertEqual(restored.records[identity]['notes'], 'Keep')
        self.assertEqual(restored.records[identity]['revision'], 2)
        with self.assertRaises(ValueError):
            await restored.async_delete(identity, 1)
        await restored.async_delete(identity, 2)
        self.assertEqual(restored.records, {})

    async def test_import_is_idempotent_after_user_edits_and_restart(self):
        path = Path(self.tmp.name) / 'test.melarecipes'
        archive(path, [recipe()])
        self.assertEqual((await self.library.async_import(path))['added'], 1)
        identity = next(iter(self.library.records))
        await self.library.async_save({'title': 'My edit'}, identity, 1)
        restored = RecipeLibrary(self.hass)
        await restored.async_load()
        result = await restored.async_import(path)
        self.assertEqual(result, {'added': 0, 'skipped': 1, 'total': 1})
        self.assertEqual(restored.records[identity]['title'], 'My edit')
        self.assertEqual(restored.records[identity]['mela']['title'], 'Fictional soup')

    async def test_native_entity_has_count_without_full_recipes_and_access_is_checked(self):
        await self.library.async_save({'title': 'Private recipe', 'ingredients': 'Private ingredients'})
        entity = RecipeCount(self.library)
        self.assertEqual(entity.native_value, 1)
        self.assertNotIn('Private', str(entity.extra_state_attributes))
        self.hass.data['hearthglance_recipes'] = self.library
        user = SimpleNamespace(permissions=SimpleNamespace(check_entity=lambda *args: False))
        with self.assertRaises(Unauthorized):
            library_for(self.hass, SimpleNamespace(user=user), {'entity_id': self.library.entity_id})
        self.assertIsNone(self.library.image_path('../secret', 'photo'))
        self.assertIsNone(self.library.image_path('a'*64, 'original'))
        self.assertIsNone(self.library.image_path('a'*64, 'photo'))

    async def test_photo_route_uses_ha_app_key_and_checks_access_and_import_paths(self):
        self.hass.data['hearthglance_recipes'] = self.library
        class Request(dict):
            app = {KEY_HASS: self.hass}
        with self.assertRaises(web.HTTPUnauthorized):
            await RecipeImageView().get(Request(), 'a'*64, 'photo')
        user = SimpleNamespace(permissions=SimpleNamespace(check_entity=lambda *args: True))
        request = Request(hass_user=user)
        with self.assertRaises(web.HTTPNotFound):
            await RecipeImageView().get(request, 'a'*64, 'photo')
        root = Path(self.tmp.name) / 'imports'
        root.mkdir()
        self.assertEqual(import_path(root, root / 'Recipes.melarecipes'), root / 'Recipes.melarecipes')
        with self.assertRaises(ValueError):
            import_path(root, root / '../secret.melarecipes')


if __name__ == '__main__':
    unittest.main()
