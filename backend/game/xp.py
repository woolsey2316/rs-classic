"""RuneScape Classic experience curve utilities.

XP required to reach a given level:
  XP(level) = floor(Σ floor(n + 300 × 2^(n/7)) / 4) for n = 1 .. level-1

Level 99 requires 13,034,431 experience.
"""

from __future__ import annotations

MAX_LEVEL = 99
XP_CAP = 536_870_911  # RSC integer limit (2^31 - 1 - 14)


def xp_for_level(level: int) -> int:
    """Total XP required to be at `level` (level 1 = 0)."""
    if level <= 1:
        return 0
    if level > MAX_LEVEL:
        level = MAX_LEVEL
    total = 0
    for n in range(1, level):
        total += int(n + 300 * (2 ** (n / 7.0)))
    return total // 4


# Precompute lookup tables once at import time.
XP_TABLE: list[int] = [xp_for_level(level) for level in range(0, MAX_LEVEL + 1)]
# Index by level: XP_TABLE[1] == 0, XP_TABLE[99] == 13034431


def level_from_xp(xp: int) -> int:
    """Return skill level for a given XP amount (clamped 1–99)."""
    if xp <= 0:
        return 1
    xp = min(xp, XP_CAP)
    level = 1
    for candidate in range(2, MAX_LEVEL + 1):
        if XP_TABLE[candidate] <= xp:
            level = candidate
        else:
            break
    return level


def xp_to_next_level(xp: int) -> int | None:
    """XP still needed to reach the next level, or None at 99."""
    level = level_from_xp(xp)
    if level >= MAX_LEVEL:
        return None
    return XP_TABLE[level + 1] - xp


# Verify known RSC values at import in DEBUG-friendly assert form.
assert XP_TABLE[2] == 83
assert XP_TABLE[99] == 13_034_431
