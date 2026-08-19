from __future__ import annotations

import random

from django.db import transaction

from .inventory_utils import add_item_to_inventory, can_add_item, player_has_axe
from .models import Item, Player, Scenery, SceneryKind, SkillName

STUMP_RSC_ID = 4

# Normal trees in Lumbridge give regular logs and 25 XP in RSC.
LOG_BY_TREE_RSC_ID: dict[int, str] = {
    0: "logs",
    1: "logs",
}

XP_BY_LOG_KEY: dict[str, int] = {
    "logs": 25,
    "oak_logs": 37,
    "willow_logs": 67,
    "maple_logs": 100,
    "yew_logs": 175,
    "magic_logs": 250,
}

TREE_LEVEL_BY_RSC_ID: dict[int, int] = {
    0: 1,
    1: 1,
}


def _kind_has_chop(kind: SceneryKind) -> bool:
    return any(str(command).lower() == "chop" for command in (kind.commands or []))


def _is_adjacent(px: int, py: int, tx: int, ty: int) -> bool:
    return abs(px - tx) <= 1 and abs(py - ty) <= 1 and (px != tx or py != ty)


def _success_chance(woodcutting_level: int, tree_level: int) -> float:
    chance = 0.35 + (woodcutting_level - tree_level) * 0.03
    return min(0.95, max(0.15, chance))


def _log_key_for_tree(kind: SceneryKind) -> str:
    return LOG_BY_TREE_RSC_ID.get(kind.rsc_id, "logs")


@transaction.atomic
def attempt_chop(player: Player, scenery_id: int, player_x: int, player_y: int) -> dict:
    try:
        scenery = Scenery.objects.select_for_update().select_related("kind").get(pk=scenery_id)
    except Scenery.DoesNotExist:
        return {"ok": False, "message": "That tree is no longer there."}

    kind = scenery.kind
    if not _kind_has_chop(kind):
        return {"ok": False, "message": "You can't chop that."}

    if kind.rsc_id == STUMP_RSC_ID:
        return {"ok": False, "message": "There are no logs left on this tree stump."}

    if not _is_adjacent(player_x, player_y, scenery.x, scenery.y):
        return {"ok": False, "message": "You need to walk closer to the tree."}

    if not player_has_axe(player):
        return {"ok": False, "message": "You need an axe to chop this tree."}

    log_key = _log_key_for_tree(kind)
    try:
        log_item = Item.objects.get(key=log_key)
    except Item.DoesNotExist:
        return {"ok": False, "message": "That tree cannot be chopped right now."}

    if not can_add_item(player, log_item, 1):
        return {"ok": False, "message": "Your inventory is full."}

    skill = player.skills.get(name=SkillName.WOODCUTTING)
    tree_level = TREE_LEVEL_BY_RSC_ID.get(kind.rsc_id, 1)
    if random.random() >= _success_chance(skill.level, tree_level):
        return {"ok": False, "message": "You fail to cut the tree.", "success": False}

    add_item_to_inventory(player, log_item, 1)
    xp_gain = XP_BY_LOG_KEY.get(log_key, 25)
    skill.xp = min(skill.xp + xp_gain, 536_870_911)
    skill.save(update_fields=["xp"])

    stump_kind = SceneryKind.objects.filter(rsc_id=STUMP_RSC_ID).first()
    scenery_update = None
    if stump_kind:
        scenery.kind = stump_kind
        scenery.save(update_fields=["kind"])
        scenery_update = {"id": scenery.id, "kind": stump_kind.rsc_id}

    return {
        "ok": True,
        "success": True,
        "message": f"You get some {log_item.name.lower()}.",
        "scenery_update": scenery_update,
        "xp_gained": xp_gain,
    }
