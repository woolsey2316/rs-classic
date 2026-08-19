from django.core.management.base import BaseCommand

from game.models import Scenery, SceneryKind

# Custom kind id — not used by RSC object-locs export.
TREASURE_CHEST_RSC_ID = 900_001

# Lumbridge castle courtyard spawn is local (71, 72) → game (120, 648).
# Place the chest on the neighbouring tile at local (70, 72) → game (121, 648).
TREASURE_CHEST_X = 121
TREASURE_CHEST_Y = 648


class Command(BaseCommand):
    help = "Place the dev treasure chest (all game items) near Lumbridge spawn."

    def handle(self, *args, **options):
        kind, _ = SceneryKind.objects.update_or_create(
            rsc_id=TREASURE_CHEST_RSC_ID,
            defaults={
                "name": "Treasure chest",
                "description": "A chest filled with every item in the game.",
                "commands": ["Search", "Examine"],
                "model_name": "ChestOpen",
                "width": 1,
                "height": 1,
                "block_type": "blocked",
                "item_height": 0,
            },
        )

        Scenery.objects.filter(is_treasure_chest=True).delete()
        chest = Scenery.objects.create(
            kind=kind,
            x=TREASURE_CHEST_X,
            y=TREASURE_CHEST_Y,
            direction=0,
            is_treasure_chest=True,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Treasure chest #{chest.id} at ({TREASURE_CHEST_X}, {TREASURE_CHEST_Y})."
            )
        )
