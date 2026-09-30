from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Player

# One server cycle. A little under 600ms so a client locked to the same
# rhythm is not rejected for timer jitter.
TICK_INTERVAL = timedelta(milliseconds=600)
TICK_GRACE = timedelta(milliseconds=500)

TICK_WAIT = "Please wait for the next game tick."


def reserve_tick(player: Player) -> bool:
    """Allow one server-verified action per game tick for this player."""
    now = timezone.now()
    with transaction.atomic():
        locked = Player.objects.select_for_update().get(pk=player.pk)
        if locked.last_action_at and now - locked.last_action_at < TICK_GRACE:
            return False
        locked.last_action_at = now
        locked.save(update_fields=["last_action_at"])
    player.last_action_at = now
    return True
