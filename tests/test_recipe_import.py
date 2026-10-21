"""Fictional fixtures only. Run with Pillow and pillow-heif installed."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("recipe_model_test")
package.__path__ = [str(ROOT / "custom_components/hearthglance_recipes")]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location("recipe_model_test.model", Path(package.__path__[0]) / "model.py")
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def recipe(**changes):
    return {"id": str(uuid.uuid4()).upper(), "title": "Fictional soup", "ingredients": "1 tomato",
            "instructions": "Simmer.", "date": 0.0, "favorite": True, "wantToCook": False,
            "categories": ["Lunch"], "notes": "Family note", "nutrition": "Protein 5 g",
            "text": "An example", "yield": "2", "prepTime": "5min", "cookTime": "10min",
            "totalTime": "15min", "link": "https://example.org/soup", "images": [], **changes}


def archive(path, recipes):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for i, r in enumerate(recipes):
            z.writestr(f"../../ignored-path-{i}.melarecipe", json.dumps(r))


class MelaImportTests(unittest.TestCase):
    def test_schema_ids_dates_unknown_fields_and_same_title_recipes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "recipes.melarecipes"
            records = [recipe(extraField={"keep": True}), recipe()]
            archive(path, records)
            digest, parsed = model.read_mela(path, Path(tmp) / "images")
            self.assertEqual(len(digest), 64)
            self.assertEqual(len(parsed), 2)
            for original, imported in zip(records, parsed):
                self.assertEqual(imported["mela_id"], original["id"])
                self.assertEqual(imported["id"], model.mela_recipe_id(original["id"]))
                self.assertEqual(imported["mela"], {k: v for k, v in original.items() if k != "images"})
                for key in ("notes", "nutrition", "categories", "yield", "prepTime", "totalTime"):
                    self.assertEqual(imported[key], original[key])
                self.assertEqual(imported["created_at"], "2001-01-01T00:00:00+00:00")
            self.assertEqual(parsed[0]["mela"]["extraField"], {"keep": True})

    def test_png_and_heic_previews_retain_original_bytes(self):
        from PIL import Image
        from pillow_heif import register_heif_opener
        register_heif_opener()
        for fmt in ("PNG", "HEIF"):
            with self.subTest(fmt=fmt), tempfile.TemporaryDirectory() as tmp:
                image = io.BytesIO()
                Image.new("RGB", (64, 32), "green").save(image, fmt)
                encoded = base64.b64encode(image.getvalue()).decode()
                result = model.image_assets(encoded, Path(tmp))
                self.assertEqual((Path(tmp) / f"{result['id']}.original").read_bytes(), image.getvalue())
                for size in ("thumb", "photo"):
                    with Image.open(Path(tmp) / f"{result['id']}.{size}.jpg") as im:
                        self.assertEqual(im.format, "JPEG")
                        self.assertEqual(im.size, (64, 32))

    def test_reimport_preserves_edits_and_does_not_merge_same_titles(self):
        old = {"one": {"id": "one", "title": "Edited title"}}
        merged, result = model.merge_import(old, [{"id": "one", "title": "Old"}, {"id": "two", "title": "Old"}])
        self.assertEqual(merged["one"]["title"], "Edited title")
        self.assertEqual(result, {"added": 1, "skipped": 1, "total": 2})

    def test_invalid_ids_duplicate_ids_and_oversized_members_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "recipes.melarecipes"
            for records in ([recipe(id="")], [recipe(id=None)], [r := recipe(), r]):
                archive(path, records)
                with self.assertRaises(ValueError):
                    model.read_mela(path, Path(tmp) / "images")
            archive(path, [recipe()])
            with patch.object(model, "MAX_RECIPE_BYTES", 2), self.assertRaises(ValueError):
                model.read_mela(path, Path(tmp) / "images")

    def test_source_url_ids_are_stable_and_never_used_as_paths(self):
        value = 'example.org/recipe/?tracking=123'
        self.assertEqual(model.mela_recipe_id(value), model.mela_recipe_id(value))
        self.assertNotEqual(model.mela_recipe_id(value), model.mela_recipe_id(value + '4'))
        self.assertNotIn('/', model.mela_recipe_id('../../anything'))

    def test_edits_validate_and_keep_photos_import_metadata_and_dates(self):
        old = {"title": "Old", "images": [{"id": "a"}], "mela": {"id": "original"}, "date": 123}
        edited = model.validate_recipe({"title": "New", "categories": [" Lunch ", "Lunch"]}, old)
        for key in ("images", "mela", "date"):
            self.assertEqual(edited[key], old[key])
        self.assertEqual(edited["categories"], ["Lunch"])
        for invalid in ({"title": ""}, {"title": "Good", "favorite": "false"}, {"title": "Good", "categories": "Lunch"}):
            with self.assertRaises(ValueError):
                model.validate_recipe(invalid)


if __name__ == "__main__":
    unittest.main()
