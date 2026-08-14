from django.core.management.base import BaseCommand

from game.models import EquipmentSlot, GroundItem, Item


STARTER_ITEMS = [
    {
        "key": "bronze_helmet",
        "name": "Bronze Helmet",
        "description": "A battered bronze helmet.",
        "equip_slot": EquipmentSlot.HELMET,
        "color": "#b87333",
    },
    {
        "key": "leather_gloves",
        "name": "Leather Gloves",
        "description": "Soft leather gloves.",
        "equip_slot": EquipmentSlot.GLOVES,
        "color": "#8b5a2b",
    },
    {
        "key": "leather_boots",
        "name": "Leather Boots",
        "description": "Comfortable walking boots.",
        "equip_slot": EquipmentSlot.BOOTS,
        "color": "#6b4423",
    },
    {
        "key": "leather_body",
        "name": "Leather Body",
        "description": "A light leather cuirass.",
        "equip_slot": EquipmentSlot.BODY,
        "color": "#a0673b",
    },
    {
        "key": "leather_chaps",
        "name": "Leather Chaps",
        "description": "Leather leg armour.",
        "equip_slot": EquipmentSlot.LEGS,
        "color": "#8a5530",
    },
    {
        "key": "bronze_arrows",
        "name": "Bronze Arrows",
        "description": "Arrows tipped with bronze.",
        "equip_slot": EquipmentSlot.ARROWS,
        "stackable": True,
        "color": "#cd7f32",
    },
    {
        "key": "gold_ring",
        "name": "Gold Ring",
        "description": "A plain gold ring.",
        "equip_slot": EquipmentSlot.RING,
        "color": "#ffd700",
    },
    {
        "key": "bronze_dagger",
        "name": "Bronze Dagger",
        "description": "A small bronze dagger.",
        "equip_slot": EquipmentSlot.WEAPON,
        "color": "#c08a4a",
    },
    {
        "key": "coins",
        "name": "Coins",
        "description": "Lovely shiny coins.",
        "equip_slot": None,
        "stackable": True,
        "color": "#e6c35c",
    },
]


class Command(BaseCommand):
    help = "Seed item definitions used by the starter kit and shops."

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for data in STARTER_ITEMS:
            _, was_created = Item.objects.update_or_create(
                key=data["key"],
                defaults={
                    "name": data["name"],
                    "description": data.get("description", ""),
                    "stackable": data.get("stackable", False),
                    "equip_slot": data.get("equip_slot"),
                    "color": data.get("color", "#c4a574"),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(
            self.style.SUCCESS(f"Seeded items: {created} created, {updated} updated.")
        )

        dagger = Item.objects.filter(key="bronze_dagger").first()
        if dagger and not GroundItem.objects.filter(item=dagger).exists():
            GroundItem.objects.create(item=dagger, x=14, y=10, quantity=1)
            self.stdout.write(self.style.SUCCESS("Placed a Bronze Dagger on the path."))
