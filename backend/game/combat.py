"""RuneScape Classic melee rolls.

Attack and defence each roll 0..value inclusive. A hit lands only when the
attack roll is strictly higher. Damage is then:

    floor((random(0..strengthValue) + 320) / 640)

where

    strengthValue = (floor(level * prayer) + bonus + style) * (weaponPower + 64)

Players add a bonus of 8. Monsters do not. With no prayer the multiplier is 1.
Accurate style is used: +3 attack, +0 strength, +0 defence.

Unarmed at 1 strength maxes at 1. A bronze dagger (power 4) at 1 strength also
maxes at 1. At 40 strength and weapon power 50 the max is 9. At 99 strength,
weapon power 75 and aggressive style (+3) the max is 24.

A rat's published strength of 2 never reaches 1. Strength 8 is used so the same
dice max out at 1, and that result is capped at 1.
"""

from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path

from django.utils import timezone

from .item_equip import sprite_item_id
from .models import Player, SkillName
from .xp import XP_CAP

_WIELDABLE = Path(__file__).resolve().parent / "data" / "wieldable.json"

# Accurate is the default melee style.
ACCURATE_ATTACK = 3
ACCURATE_STRENGTH = 0
ACCURATE_DEFENSE = 0

# Level-2 rat from the Classic bestiary, with strength raised so max hit is 1.
RAT_HITS = 2
RAT_ATTACK = 3
RAT_DEFENSE = 4
RAT_STRENGTH = 8
RAT_MAX_HIT = 1

# Awarded on the killing blow for a level-2 rat: 18 melee (accurate → Attack) and 6 Hits.
RAT_KILL_XP = {
    SkillName.ATTACK: 18,
    SkillName.HITS: 6,
}


@lru_cache(maxsize=1)
def _wieldable() -> dict:
    if not _WIELDABLE.exists():
        return {}
    return json.loads(_WIELDABLE.read_text())


def _roll(top: int) -> int:
    """Inclusive 0..top, matching Classic's random range."""
    if top <= 0:
        return 0
    return random.randint(0, top)


def _stat_value(level: int, style: int, bonus: int, *, player: bool) -> int:
    constant = 8 if player else 0
    return (level + constant + style) * (bonus + 64)


def roll_hit(attack_value: int, defense_value: int, strength_value: int, max_hit: int | None = None) -> int:
    if _roll(attack_value) <= _roll(defense_value):
        return 0
    damage = (_roll(strength_value) + 320) // 640
    if max_hit is not None:
        damage = min(damage, max_hit)
    return damage


def equipment_bonuses(player: Player) -> dict[str, int]:
    aim = power = armour = 0
    table = _wieldable()
    for piece in player.equipment.select_related("item").all():
        if not piece.item:
            continue
        item_id = sprite_item_id(piece.item.sprite)
        bonus = table.get(item_id or "")
        if not bonus:
            continue
        aim += int(bonus.get("aim") or 0)
        power += int(bonus.get("power") or 0)
        armour += int(bonus.get("armour") or 0)
    return {"aim": aim, "power": power, "armour": armour}


def current_level(player: Player, name: str) -> int:
    skill = player.skills.get(name=name)
    if skill.current_level is None:
        return skill.level
    return skill.current_level


def _hurt(player: Player, amount: int) -> int:
    skill = player.skills.get(name=SkillName.HITS)
    current = skill.level if skill.current_level is None else skill.current_level
    remaining = max(0, current - amount)
    skill.current_level = remaining
    skill.level_updated_at = timezone.now()
    skill.save(update_fields=["current_level", "level_updated_at"])
    return remaining


def _restore_hits(player: Player) -> None:
    skill = player.skills.get(name=SkillName.HITS)
    skill.current_level = skill.level
    skill.level_updated_at = timezone.now()
    skill.save(update_fields=["current_level", "level_updated_at"])


def _add_xp(player: Player, name: str, amount: int) -> None:
    skill = player.skills.get(name=name)
    skill.xp = min(skill.xp + amount, XP_CAP)
    skill.save(update_fields=["xp"])


def fight_rat(player: Player, rat_hits: int) -> dict:
    """Exchange one melee round with a rat that currently has `rat_hits` remaining."""
    if rat_hits <= 0:
        return {"ok": False, "message": "The rat is already dead."}
    if current_level(player, SkillName.HITS) <= 0:
        return {"ok": False, "message": "You are too tired to fight."}

    bonuses = equipment_bonuses(player)
    attack = current_level(player, SkillName.ATTACK)
    strength = current_level(player, SkillName.STRENGTH)
    defense = current_level(player, SkillName.DEFENSE)
    hits = current_level(player, SkillName.HITS)

    player_damage = roll_hit(
        _stat_value(attack, ACCURATE_ATTACK, bonuses["aim"], player=True),
        _stat_value(RAT_DEFENSE, 0, 0, player=False),
        _stat_value(strength, ACCURATE_STRENGTH, bonuses["power"], player=True),
    )
    player_damage = min(player_damage, rat_hits)
    remaining = rat_hits - player_damage
    killed = remaining <= 0

    rat_damage = 0
    if not killed:
        rat_damage = roll_hit(
            _stat_value(RAT_ATTACK, 0, 0, player=False),
            _stat_value(defense, ACCURATE_DEFENSE, bonuses["armour"], player=True),
            _stat_value(RAT_STRENGTH, 0, 0, player=False),
            max_hit=RAT_MAX_HIT,
        )
        rat_damage = min(rat_damage, hits)

    player_dead = False
    if rat_damage > 0:
        left = _hurt(player, rat_damage)
        if left <= 0:
            player_dead = True
            _restore_hits(player)

    xp = {}
    if killed:
        for name, amount in RAT_KILL_XP.items():
            _add_xp(player, name, amount)
            xp[name] = amount

    return {
        "ok": True,
        "player_damage": player_damage,
        "rat_damage": rat_damage,
        "rat_hits": remaining,
        "killed": killed,
        "player_dead": player_dead,
        "xp": xp,
    }
