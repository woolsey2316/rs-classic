"""Simple top-down overworld used by the client for point-and-click walking."""

from __future__ import annotations

from dataclasses import dataclass


# Tile codes:
# 0 grass (walkable)
# 1 path (walkable)
# 2 water (blocked)
# 3 tree (blocked)
# 4 rock (blocked)
# 5 building wall (blocked)
# 6 dirt (walkable)


@dataclass(frozen=True)
class WorldMap:
    width: int
    height: int
    tiles: list[list[int]]
    name: str = "Lumbridge Meadow"

    def is_in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def is_walkable(self, x: int, y: int) -> bool:
        if not self.is_in_bounds(x, y):
            return False
        return self.tiles[y][x] in (0, 1, 6)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "tiles": self.tiles,
            "spawn": {"x": 12, "y": 10},
            "legend": {
                "0": "grass",
                "1": "path",
                "2": "water",
                "3": "tree",
                "4": "rock",
                "5": "wall",
                "6": "dirt",
            },
        }


def _build_meadow() -> WorldMap:
    width, height = 28, 20
    tiles = [[0 for _ in range(width)] for _ in range(height)]

    # Horizontal dirt path through the meadow.
    for x in range(width):
        tiles[10][x] = 1
        if 8 <= x <= 20:
            tiles[9][x] = 1
            tiles[11][x] = 1

    # Vertical path crossing.
    for y in range(height):
        tiles[y][12] = 1

    # Pond.
    for y in range(3, 7):
        for x in range(3, 8):
            tiles[y][x] = 2

    # Tree grove.
    for x, y in [
        (18, 3),
        (19, 4),
        (20, 3),
        (21, 5),
        (22, 4),
        (17, 5),
        (23, 6),
        (19, 6),
        (2, 14),
        (3, 15),
        (4, 14),
        (5, 16),
        (24, 14),
        (25, 15),
        (22, 16),
    ]:
        tiles[y][x] = 3

    # Rocky outcrop.
    for x, y in [(15, 15), (16, 15), (16, 16), (17, 15), (8, 17), (9, 17)]:
        tiles[y][x] = 4

    # Small ruined wall.
    for x in range(20, 25):
        tiles[12][x] = 5
    tiles[13][20] = 5
    tiles[13][24] = 5
    tiles[14][20] = 5
    tiles[14][24] = 5

    # Dirt clearing near spawn.
    for y in range(8, 13):
        for x in range(10, 15):
            if tiles[y][x] == 0:
                tiles[y][x] = 6

    return WorldMap(width=width, height=height, tiles=tiles)


WORLD = _build_meadow()
