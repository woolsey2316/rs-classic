from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .models import Item

_DATA = Path(__file__).resolve().parent / "data" / "item_equip.json"


@lru_cache(maxsize=1)
def _equip_by_id() -> dict[str, str]:
    if not _DATA.exists():
        return {}
    return json.loads(_DATA.read_text())


def sprite_item_id(sprite: str) -> str | None:
    if not sprite:
        return None
    stem = sprite.rsplit("/", 1)[-1]
    head = stem.split("-", 1)[0]
    if head.endswith(".png"):
        head = head[:-4]
    return head if head.isdigit() else None


def equip_slot_for_sprite(sprite: str) -> str | None:
    item_id = sprite_item_id(sprite)
    if item_id is None:
        return None
    return _equip_by_id().get(item_id)


def ensure_item_equip_slot(item: Item) -> None:
    if item.equip_slot:
        return
    slot = equip_slot_for_sprite(item.sprite)
    if not slot:
        return
    item.equip_slot = slot
    item.save(update_fields=["equip_slot"])
