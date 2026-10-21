"""Mela-compatible recipe records and a bounded, offline archive reader."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
from pathlib import Path
import re
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

from .const import FIELDS

MAX_RECIPES = 5000
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_RECIPE_BYTES = 32 * 1024 * 1024
MAX_IMAGE_BYTES = 20 * 1024 * 1024
IMAGE_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def mela_recipe_id(value):
    """Mela IDs can be UUIDs or source URLs; keep the original, hash for local keys."""
    if not isinstance(value, str) or not value.strip() or len(value) > 4096:
        raise ValueError("Invalid Mela recipe ID")
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "mela:" + value))


def validate_recipe(data, previous=None):
    """Validate editable fields without discarding imported metadata or photos."""
    if not isinstance(data, dict):
        raise ValueError("Recipe must be an object")
    record = dict(previous or {})
    for key in FIELDS:
        value = data.get(key, record.get(key, ""))
        if not isinstance(value, str) or len(value) > 100000:
            raise ValueError(f"Invalid recipe field: {key}")
        record[key] = value
    record["title"] = record["title"].strip()
    if not record["title"] or len(record["title"]) > 500:
        raise ValueError("A recipe needs a title of at most 500 characters")
    categories = data.get("categories", record.get("categories", []))
    if not isinstance(categories, list) or len(categories) > 100 or any(not isinstance(c, str) or len(c) > 200 for c in categories):
        raise ValueError("Invalid recipe categories")
    record["categories"] = list(dict.fromkeys(c.strip() for c in categories if c.strip()))
    for key in ("favorite", "wantToCook"):
        value = data.get(key, record.get(key, False))
        if not isinstance(value, bool):
            raise ValueError(f"Invalid recipe flag: {key}")
        record[key] = value
    return record


def image_assets(encoded, image_dir):
    """Keep original bytes and make browser-friendly, metadata-free JPEG previews."""
    from PIL import Image, ImageOps
    from pillow_heif import register_heif_opener

    register_heif_opener()
    if not isinstance(encoded, str) or len(encoded) > MAX_IMAGE_BYTES * 4 // 3 + 8:
        raise ValueError("Recipe image is too large")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as err:
        raise ValueError("Recipe image is not valid base64") from err
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Recipe image is empty or too large")
    digest = hashlib.sha256(raw).hexdigest()
    image_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(raw)) as source:
        if source.format not in {"JPEG", "PNG", "WEBP", "HEIF", "AVIF"} or source.width * source.height > 40_000_000:
            raise ValueError("Unsupported or oversized recipe image")
        original_format = source.format
        image = ImageOps.exif_transpose(source).convert("RGB")
        for variant, size in (("photo", 1600), ("thumb", 360)):
            target = image_dir / f"{digest}.{variant}.jpg"
            if not target.exists():
                preview = image.copy()
                preview.thumbnail((size, size))
                preview.save(target, "JPEG", quality=85, optimize=True)
    original = image_dir / f"{digest}.original"
    if not original.exists():
        original.write_bytes(raw)
    return {"id": digest, "format": original_format}


def read_mela(path: Path, image_dir: Path):
    """Parse all recipes before committing; never extract archive paths."""
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("Mela archive exceeds 512 MB")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    archive_hash = digest.hexdigest()
    recipes = []
    ids = set()
    with zipfile.ZipFile(path) as archive:
        files = [f for f in archive.infolist() if not f.is_dir() and f.filename.endswith(".melarecipe")]
        if not files or len(files) > MAX_RECIPES or sum(f.file_size for f in archive.infolist()) > MAX_ARCHIVE_BYTES:
            raise ValueError("Invalid Mela archive size or recipe count")
        for file in files:
            if file.file_size > MAX_RECIPE_BYTES:
                raise ValueError("A recipe exceeds 32 MB")
            data = json.loads(archive.read(file))
            recipe = validate_recipe(data)
            recipe_id = mela_recipe_id(data.get("id"))
            if recipe_id in ids:
                raise ValueError("Duplicate Mela recipe ID in archive")
            ids.add(recipe_id)
            images = data.get("images", [])
            if not isinstance(images, list) or len(images) > 50:
                raise ValueError("Invalid recipe images")
            recipe["images"] = [image_assets(image, image_dir) for image in images]
            date = data.get("date")
            if date is not None and (not isinstance(date, (int, float)) or isinstance(date, bool) or not math.isfinite(date)):
                raise ValueError("Invalid Mela date")
            recipe.update(id=recipe_id, date=date, mela_id=data["id"],
                          mela={k: v for k, v in data.items() if k != "images"},
                          imported_at=now_iso(), updated_at=now_iso(), revision=1)
            if date is not None:
                recipe["created_at"] = (datetime(2001, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=date)).isoformat()
            recipes.append(recipe)
    return archive_hash, recipes


def merge_import(existing, incoming):
    """Stable Mela IDs make imports additive and preserve edits on re-import."""
    merged = dict(existing)
    added = 0
    for recipe in incoming:
        if recipe["id"] not in merged:
            merged[recipe["id"]] = recipe
            added += 1
    if len(merged) > MAX_RECIPES:
        raise ValueError("Recipe library exceeds 5000 recipes")
    return merged, {"added": added, "skipped": len(incoming) - added, "total": len(merged)}
