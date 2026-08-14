from django.core.management.base import BaseCommand

from game.items import GROUND_SPAWNS, ITEMS
from game.models import GroundItem, Item


class Command(BaseCommand):
    help = "Seed item definitions and scatter KayKit weapons on the meadow."

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for data in ITEMS:
            _, was_created = Item.objects.update_or_create(
                key=data["key"],
                defaults={
                    "name": data["name"],
                    "description": data.get("description", ""),
                    "stackable": data.get("stackable", False),
                    "equip_slot": data.get("equip_slot"),
                    "color": data.get("color", "#c4a574"),
                    "sprite": data.get("sprite", ""),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(
            self.style.SUCCESS(f"Seeded items: {created} created, {updated} updated.")
        )

        placed = 0
        for key, x, y, qty in GROUND_SPAWNS:
            item = Item.objects.filter(key=key).first()
            if not item:
                continue
            if GroundItem.objects.filter(item=item).exists():
                continue
            GroundItem.objects.create(item=item, x=x, y=y, quantity=qty)
            placed += 1
        if placed:
            self.stdout.write(self.style.SUCCESS(f"Placed {placed} ground items."))
