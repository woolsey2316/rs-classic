from __future__ import annotations

from django.db import transaction

from .models import Scenery, SceneryKind


def _command(commands, name: str) -> bool:
    target = name.lower()
    return any(str(command).strip().lower() == target for command in commands or [])


def _swapped_model(model_name: str, opening: bool) -> str | None:
    model = (model_name or "").lower()
    if opening and "closed" in model:
        return model.replace("closed", "open")
    if not opening and "open" in model:
        return model.replace("open", "closed")
    return None


def _partner_kind(kind: SceneryKind, opening: bool) -> SceneryKind | None:
    target = _swapped_model(kind.model_name, opening)
    if not target:
        return None
    neighbour_id = kind.rsc_id + (1 if opening else -1)
    neighbour = SceneryKind.objects.filter(rsc_id=neighbour_id).first()
    if neighbour and neighbour.model_name.lower() == target:
        return neighbour
    return (
        SceneryKind.objects.filter(model_name__iexact=target)
        .exclude(pk=kind.pk)
        .order_by("rsc_id")
        .first()
    )


def _footprint(scenery: Scenery) -> list[tuple[int, int]]:
    """Game tiles the object covers.

    Region-local +x is mirrored back to decreasing game x, and +z is +game y,
    matching the 3D landscape grid.
    """
    width = max(1, scenery.kind.width or 1)
    height = max(1, scenery.kind.height or 1)
    if (scenery.direction or 0) % 2 == 1:
        width, height = height, width
    return [
        (scenery.x - dx, scenery.y + dz)
        for dx in range(width)
        for dz in range(height)
    ]


def _is_near(px: int, py: int, tiles: list[tuple[int, int]]) -> bool:
    return any(max(abs(px - tx), abs(py - ty)) <= 1 for tx, ty in tiles)


@transaction.atomic
def toggle_door(scenery_id: int, player_x: int, player_y: int, opening: bool) -> dict:
    try:
        scenery = Scenery.objects.select_for_update().select_related("kind").get(pk=scenery_id)
    except Scenery.DoesNotExist:
        return {"ok": False, "message": "There is nothing there."}

    kind = scenery.kind
    expected = "open" if opening else "close"
    if not _command(kind.commands, expected):
        return {"ok": False, "message": "Nothing interesting happens."}

    if not _is_near(player_x, player_y, _footprint(scenery)):
        return {"ok": False, "message": "You need to walk closer."}

    partner = _partner_kind(kind, opening)
    if not partner:
        return {"ok": False, "message": "It won't budge."}

    scenery.kind = partner
    scenery.save(update_fields=["kind"])
    message = "You open the gate." if opening else "You close the gate."
    if "door" in (kind.model_name or "").lower() and "gate" not in (kind.name or "").lower():
        message = "You open the door." if opening else "You close the door."
    return {
        "ok": True,
        "message": message,
        "scenery_update": {"id": scenery.id, "kind": partner.rsc_id},
        "kind": partner,
    }
