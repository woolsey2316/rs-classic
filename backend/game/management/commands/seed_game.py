from django.core.management.base import BaseCommand

from game.items import ITEMS
from game.models import Item


class Command(BaseCommand):
    help = "Seed item definitions."

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
