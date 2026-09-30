from __future__ import annotations

from django.db import transaction

from .inventory_utils import add_item_to_inventory, can_add_item
from .item_equip import ensure_item_equip_slot
from .models import Item, Player, Scenery


def _is_adjacent(px: int, py: int, tx: int, ty: int) -> bool:
    return abs(px - tx) <= 1 and abs(py - ty) <= 1 and (px != tx or py != ty)


def _chest_item(item_key: str, name: str, sprite: str) -> Item:
    if sprite:
        existing = Item.objects.filter(sprite=sprite).order_by("id").first()
        if existing:
            ensure_item_equip_slot(existing)
            return existing
    item, _ = Item.objects.get_or_create(
        key=item_key,
        defaults={
            "name": (name or item_key)[:64],
            "sprite": (sprite or "")[:64],
            "description": "",
        },
    )
    ensure_item_equip_slot(item)
    return item


@transaction.atomic
def take_from_treasure_chest(
    player: Player,
    scenery_id: int,
    item_key: str,
    player_x: int,
    player_y: int,
    name: str = "",
    sprite: str = "",
) -> dict:
    try:
        chest = Scenery.objects.select_related("kind").get(pk=scenery_id, is_treasure_chest=True)
    except Scenery.DoesNotExist:
        return {"ok": False, "message": "That is not a treasure chest."}

    if not _is_adjacent(player_x, player_y, chest.x, chest.y):
        return {"ok": False, "message": "You need to walk closer to the chest."}

    item = _chest_item(item_key, name, sprite)

    if not can_add_item(player, item, 1):
        return {"ok": False, "message": "Your inventory is full."}

    add_item_to_inventory(player, item, 1)
    return {
        "ok": True,
        "message": f"You take the {item.name.lower()}.",
        "item_key": item.key,
    }
