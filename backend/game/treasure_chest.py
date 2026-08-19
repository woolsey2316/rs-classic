from __future__ import annotations

from django.db import transaction

from .inventory_utils import add_item_to_inventory, can_add_item
from .models import Item, Player, Scenery


def _is_adjacent(px: int, py: int, tx: int, ty: int) -> bool:
    return abs(px - tx) <= 1 and abs(py - ty) <= 1 and (px != tx or py != ty)


@transaction.atomic
def take_from_treasure_chest(
    player: Player,
    scenery_id: int,
    item_key: str,
    player_x: int,
    player_y: int,
) -> dict:
    try:
        chest = Scenery.objects.select_related("kind").get(pk=scenery_id, is_treasure_chest=True)
    except Scenery.DoesNotExist:
        return {"ok": False, "message": "That is not a treasure chest."}

    if not _is_adjacent(player_x, player_y, chest.x, chest.y):
        return {"ok": False, "message": "You need to walk closer to the chest."}

    try:
        item = Item.objects.get(key=item_key)
    except Item.DoesNotExist:
        return {"ok": False, "message": "That item does not exist."}

    if not can_add_item(player, item, 1):
        return {"ok": False, "message": "Your inventory is full."}

    add_item_to_inventory(player, item, 1)
    return {
        "ok": True,
        "message": f"You take the {item.name.lower()}.",
        "item_key": item.key,
    }
