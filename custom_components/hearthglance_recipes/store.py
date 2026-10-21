"""HA-managed recipe persistence; recipe text never enters Recorder states."""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
import uuid

from homeassistant.helpers.storage import Store
from homeassistant.components.http.auth import async_sign_path

from .const import DOMAIN, IMAGE_DIR, STORAGE_KEY
from .model import IMAGE_PATTERN, MAX_RECIPES, merge_import, now_iso, read_mela, validate_recipe


class RecipeLibrary:
    def __init__(self, hass):
        self.hass = hass
        self.storage = Store(hass, 1, STORAGE_KEY, private=True, atomic_writes=True)
        self.images = Path(hass.config.path(".storage", IMAGE_DIR))
        self.records = {}
        self.imports = []
        self.listeners = set()
        self.lock = asyncio.Lock()
        self.entity_id = "sensor.hearthglance_recipes"

    async def async_load(self):
        data = await self.storage.async_load()
        if data is not None:
            self.records = data["recipes"]
            self.imports = data.get("imports", [])

    def subscribe(self, listener):
        self.listeners.add(listener)
        return lambda: self.listeners.discard(listener)

    async def _commit(self, records, imports):
        await self.storage.async_save({"schema_version": 1, "recipes": records, "imports": imports})
        self.records, self.imports = records, imports
        for listener in tuple(self.listeners):
            listener()

    def snapshot(self, refresh_token_id):
        recipes = []
        for record in sorted(self.records.values(), key=lambda r: r["title"].casefold()):
            recipe = {k: deepcopy(v) for k, v in record.items() if k != "mela"}
            recipe["images"] = [{**image, **{
                variant: async_sign_path(self.hass, f"/api/{DOMAIN}/image/{image['id']}/{variant}",
                                         timedelta(days=2), refresh_token_id=refresh_token_id)
                for variant in ("photo", "thumb")}} for image in recipe.get("images", [])]
            recipes.append(recipe)
        return {"recipes": recipes, "total": len(recipes)}

    async def async_import(self, path):
        async with self.lock:
            digest, recipes = await self.hass.async_add_executor_job(read_mela, path, self.images)
            if any(i["sha256"] == digest for i in self.imports):
                return {"added": 0, "skipped": len(recipes), "total": len(self.records)}
            records, result = merge_import(self.records, recipes)
            imports = self.imports + [{"sha256": digest, "date": now_iso(), "count": len(recipes)}]
            await self._commit(records, imports)
            return result

    async def async_save(self, data, recipe_id=None, revision=None):
        async with self.lock:
            previous = self.records.get(recipe_id) if recipe_id else None
            if recipe_id and previous is None:
                raise ValueError("Recipe no longer exists")
            if previous and revision != previous["revision"]:
                raise ValueError("This recipe changed on another display. Reopen it before saving.")
            if not previous and len(self.records) >= MAX_RECIPES:
                raise ValueError("Recipe library is full")
            record = validate_recipe(data, previous)
            record.update(id=recipe_id or str(uuid.uuid4()), revision=(previous or {}).get("revision", 0) + 1,
                          updated_at=now_iso())
            record.setdefault("created_at", now_iso())
            record.setdefault("images", [])
            await self._commit({**self.records, record["id"]: record}, self.imports)
            return record["id"]

    async def async_delete(self, recipe_id, revision):
        async with self.lock:
            record = self.records.get(recipe_id)
            if not record or record["revision"] != revision:
                raise ValueError("This recipe changed or was removed. Reopen it first.")
            records = dict(self.records)
            del records[recipe_id]
            await self._commit(records, self.imports)

    def image_path(self, image_id, variant):
        if not IMAGE_PATTERN.fullmatch(image_id) or variant not in {"thumb", "photo"}:
            return None
        if not any(image["id"] == image_id for r in self.records.values() for image in r.get("images", [])):
            return None
        return self.images / f"{image_id}.{variant}.jpg"
