from __future__ import annotations

from .models import EquipmentSlot, Item, Player


def _is_axe_item(item: Item | None) -> bool:
    if not item:
        return False
    return "axe" in item.key


def player_has_axe(player: Player) -> bool:
    weapon = (
        player.equipment.select_related("item")
        .filter(slot=EquipmentSlot.WEAPON, item__isnull=False)
        .first()
    )
    if weapon and _is_axe_item(weapon.item):
        return True

    return player.inventory_slots.filter(item__isnull=False).select_related("item").filter(
        item__key__icontains="axe"
    ).exists()


def can_add_item(player: Player, item: Item, quantity: int = 1) -> bool:
    if quantity < 1:
        return True

    remaining = quantity
    if item.stackable:
        stack = (
            player.inventory_slots.filter(item=item)
            .order_by("slot_index")
            .first()
        )
        if stack:
            remaining = 0

    if remaining == 0:
        return True

    empty_slots = player.inventory_slots.filter(item__isnull=True).count()
    return empty_slots >= remaining


def add_item_to_inventory(player: Player, item: Item, quantity: int = 1) -> None:
    if quantity < 1:
        return

    remaining = quantity
    if item.stackable:
        stack = (
            player.inventory_slots.filter(item=item)
            .order_by("slot_index")
            .first()
        )
        if stack:
            stack.quantity += remaining
            stack.save(update_fields=["quantity"])
            return

    while remaining > 0:
        slot = (
            player.inventory_slots.filter(item__isnull=True)
            .order_by("slot_index")
            .first()
        )
        if not slot:
            raise ValueError("Inventory is full.")
        slot.item = item
        slot.quantity = 1 if not item.stackable else remaining
        slot.save(update_fields=["item", "quantity"])
        remaining -= slot.quantity if item.stackable else 1
