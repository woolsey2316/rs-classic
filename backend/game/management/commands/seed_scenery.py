from django.core.management.base import BaseCommand

from game.models import Scenery, SceneryKind
from game.scenery_data import load_kinds, load_locs


class Command(BaseCommand):
    help = "Seed RSC scenery definitions and world object locations."

    def handle(self, *args, **options):
        kinds = load_kinds()
        kind_rows = [
            SceneryKind(
                rsc_id=entry["id"],
                name=entry["name"][:64],
                description=entry.get("description") or "",
                commands=entry.get("commands") or [],
                model_name=(entry.get("model") or "")[:64],
                width=max(1, entry.get("width") or 1),
                height=max(1, entry.get("height") or 1),
                block_type=entry.get("type") or "unblocked",
                item_height=entry.get("item_height") or 0,
            )
            for entry in kinds
        ]
        SceneryKind.objects.all().delete()
        SceneryKind.objects.bulk_create(kind_rows, batch_size=500)
        by_id = {kind.rsc_id: kind for kind in SceneryKind.objects.all()}
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(kind_rows)} scenery kinds."))

        locs = load_locs()
        placements = []
        skipped = 0
        for loc in locs:
            kind = by_id.get(loc["kind"])
            if not kind:
                skipped += 1
                continue
            placements.append(
                Scenery(
                    kind=kind,
                    x=loc["x"],
                    y=loc["y"],
                    direction=loc.get("direction") or 0,
                )
            )
        Scenery.objects.all().delete()
        Scenery.objects.bulk_create(placements, batch_size=2000)
        message = f"Seeded {len(placements)} scenery locations."
        if skipped:
            message += f" Skipped {skipped} unknown ids."
        self.stdout.write(self.style.SUCCESS(message))
