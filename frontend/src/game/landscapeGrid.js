/**
 * Helpers for the exported RSC landscape region (`lumbridge-3d.json`).
 *
 * Tiles are addressed as {x, z} in region-local space: x runs west→east and
 * z runs north→south, matching the vertex grid the 3D terrain is built from.
 */

const OVERLAY_INFO = {
  0: { name: "Grass", examine: "Soft grass covers the ground." },
  1: { name: "Road", examine: "A well-trodden road." },
  2: { name: "Water", examine: "Clear water. Too deep to walk through." },
  3: { name: "Wooden floor", examine: "Bare floorboards." },
  4: { name: "Bridge", examine: "A bridge crossing the water." },
  5: { name: "Stone floor", examine: "Cold flagstones." },
  6: { name: "Tiled floor", examine: "Dark red tiles." },
  7: { name: "Swamp", examine: "Murky swamp water." },
  8: { name: "Hole", examine: "A gaping hole in the ground." },
  9: { name: "Mountain", examine: "Steep rock. There's no way up here." },
  10: { name: "Void", examine: "There's nothing there." },
  11: { name: "Lava", examine: "Molten rock. Best not to touch it." },
  12: { name: "Bridge", examine: "A bridge crossing the water." },
  13: { name: "Blue floor", examine: "A patterned blue floor." },
  14: { name: "Pentagram", examine: "Strange markings on the floor." },
  15: { name: "Purple floor", examine: "A richly coloured floor." },
  16: { name: "Black floor", examine: "The floor is scorched black." },
  17: { name: "Stone floor", examine: "Pale, well-swept stone." },
  18: { name: "Platform", examine: "A raised platform." },
  19: { name: "Void", examine: "There's nothing there." },
  20: { name: "Platform", examine: "A raised platform." },
  21: { name: "Log", examine: "A fallen log used as a crossing." },
  23: { name: "Sand", examine: "Fine, dry sand." },
  24: { name: "Mud", examine: "Churned up mud." },
  25: { name: "Shallow water", examine: "Shallow water laps at the shore." },
};

const edgeKey = (ax, az, bx, bz) =>
  ax < bx || (ax === bx && az < bz)
    ? `${ax},${az}:${bx},${bz}`
    : `${bx},${bz}:${ax},${az}`;

/**
 * Build a walkability grid from the exported region: per-tile blocking from
 * the overlay definitions, plus the wall segments that block movement between
 * two otherwise walkable tiles.
 */
export function buildNavGrid(data) {
  const { width, depth } = data;
  const blockedTiles = new Uint8Array(width * depth);
  const blockedEdges = new Set();

  for (let i = 0; i < blockedTiles.length; i += 1) {
    blockedTiles[i] = data.blocked[i] ? 1 : 0;
  }

  for (const [x1, z1, x2, z2] of data.walls) {
    if (x1 === x2) {
      // Vertical wall: separates the tiles either side of the x1 grid line.
      const east = { x: x1, z: z1 };
      const west = { x: x1 - 1, z: z1 };
      blockedEdges.add(edgeKey(west.x, west.z, east.x, east.z));
    } else if (z1 === z2) {
      // Horizontal wall: separates the tiles either side of the z1 grid line.
      const south = { x: x1, z: z1 };
      const north = { x: x1, z: z1 - 1 };
      blockedEdges.add(edgeKey(north.x, north.z, south.x, south.z));
    } else {
      // Diagonal walls fill their whole tile.
      const x = Math.min(x1, x2);
      const z = Math.min(z1, z2);
      if (x >= 0 && z >= 0 && x < width && z < depth) {
        blockedTiles[z * width + x] = 1;
      }
    }
  }

  return { width, depth, blockedTiles, blockedEdges };
}

export function isWalkable(nav, x, z) {
  if (!nav) return false;
  if (x < 0 || z < 0 || x >= nav.width || z >= nav.depth) return false;
  return !nav.blockedTiles[z * nav.width + x];
}

function wallBetween(nav, a, b) {
  return nav.blockedEdges.has(edgeKey(a.x, a.z, b.x, b.z));
}

function canStep(nav, from, to) {
  if (!isWalkable(nav, to.x, to.z)) return false;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) + Math.abs(dz) === 1) {
    return !wallBetween(nav, from, to);
  }
  if (Math.abs(dx) !== 1 || Math.abs(dz) !== 1) return false;

  const eastWest = { x: from.x + dx, z: from.z };
  const northSouth = { x: from.x, z: from.z + dz };
  // Don't clip a blocked tile or a wall sitting on either edge of the corner.
  if (!isWalkable(nav, eastWest.x, eastWest.z) || !isWalkable(nav, northSouth.x, northSouth.z)) {
    return false;
  }
  if (wallBetween(nav, from, eastWest) || wallBetween(nav, from, northSouth)) return false;
  if (wallBetween(nav, eastWest, to) || wallBetween(nav, northSouth, to)) return false;
  return true;
}

/** Breadth-first search over the landscape grid, 8-directional like RSC. */
export function findLandscapePath(nav, start, goal) {
  if (!nav || !start || !goal) return [];
  if (!isWalkable(nav, goal.x, goal.z)) return [];
  if (start.x === goal.x && start.z === goal.z) return [];

  const key = (x, z) => z * nav.width + x;
  const cameFrom = new Map([[key(start.x, start.z), null]]);
  const queue = [{ x: start.x, z: start.z }];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  while (queue.length) {
    const current = queue.shift();
    if (current.x === goal.x && current.z === goal.z) {
      const path = [];
      let cursor = current;
      while (cursor) {
        path.push(cursor);
        cursor = cameFrom.get(key(cursor.x, cursor.z));
      }
      return path.reverse().slice(1);
    }

    for (const [dx, dz] of dirs) {
      const next = { x: current.x + dx, z: current.z + dz };
      const k = key(next.x, next.z);
      if (next.x < 0 || next.z < 0 || next.x >= nav.width || next.z >= nav.depth) {
        continue;
      }
      if (cameFrom.has(k) || !canStep(nav, current, next)) continue;
      cameFrom.set(k, current);
      queue.push(next);
    }
  }

  return [];
}

export function tileInfo(data, x, z) {
  const fallback = { name: "Ground", examine: "Just the ground." };
  if (!data) return fallback;
  const overlay = data.overlays[z * data.width + x] ?? 0;
  return OVERLAY_INFO[overlay] || fallback;
}

/** Convert region-local tile coordinates back to RSC's own world coordinates. */
export function toGameCoords(data, x, z) {
  const bounds = data?.sectorBounds;
  if (!bounds) return { x, y: z };
  // Sector columns run east→west, and each sector's tile array is reversed on
  // the x axis when parsed, so undo both before rebuilding game coordinates.
  const column = Math.floor(x / 48);
  const sectorX = bounds.maxX - column;
  const exportX = x - column * 48;
  return {
    x: (47 - exportX) + (sectorX - 48) * 48,
    y: z + (bounds.minY - 36) * 48 - 48 + (bounds.plane || 0) * 944,
  };
}

/** Map RSC world coordinates onto the loaded region, or null if off-map. */
export function fromGameCoords(data, gameX, gameY) {
  const bounds = data?.sectorBounds;
  if (!bounds) return null;
  const sectorX = Math.floor(gameX / 48) + 48;
  const tileX = ((gameX % 48) + 48) % 48;
  const localX = (bounds.maxX - sectorX) * 48 + (47 - tileX);

  const yOnPlane = gameY - (bounds.plane || 0) * 944;
  const sectorY = Math.floor(yOnPlane / 48) + 37;
  const tileZ = ((yOnPlane % 48) + 48) % 48;
  const localZ = (sectorY - bounds.minY) * 48 + tileZ;

  if (
    localX < 0 ||
    localZ < 0 ||
    localX >= data.width ||
    localZ >= data.depth
  ) {
    return null;
  }
  return { x: localX, z: localZ };
}

/** Inclusive RSC world-coordinate bbox covered by the loaded region. */
export function regionGameBounds(data) {
  const bounds = data?.sectorBounds;
  if (!bounds) {
    return { minX: 0, maxX: (data?.width || 1) - 1, minY: 0, maxY: (data?.depth || 1) - 1 };
  }
  const minX = (bounds.minX - 48) * 48;
  const maxX = (bounds.maxX - 48) * 48 + 47;
  const minY = (bounds.minY - 36) * 48 - 48 + (bounds.plane || 0) * 944;
  const maxY = minY + (data.depth || 1) - 1;
  return { minX, maxX, minY, maxY };
}

export function sceneryOccupies(kind, direction) {
  let width = Math.max(1, kind?.width || 1);
  let height = Math.max(1, kind?.height || 1);
  if ((direction || 0) % 2 === 1) {
    [width, height] = [height, width];
  }
  return { width, height };
}

export function sceneryBlocksTile(kind) {
  return kind?.type === "blocked" || kind?.type === "closed-door";
}

/** Copy a nav grid and mark tiles occupied by blocking scenery. */
export function applySceneryBlocking(nav, land, scenery) {
  if (!nav || !land || !scenery?.objects?.length) return nav;
  const blockedTiles = nav.blockedTiles.slice();
  const next = { ...nav, blockedTiles };
  const kinds = new Map((scenery.kinds || []).map((kind) => [kind.rsc_id, kind]));

  for (const object of scenery.objects) {
    const kind = kinds.get(object.kind);
    if (!sceneryBlocksTile(kind)) continue;
    const origin = fromGameCoords(land, object.x, object.y);
    if (!origin) continue;
    const { width, height } = sceneryOccupies(kind, object.direction);
    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < height; dz += 1) {
        const x = origin.x + dx;
        const z = origin.z + dz;
        if (x >= 0 && z >= 0 && x < nav.width && z < nav.depth) {
          blockedTiles[z * nav.width + x] = 1;
        }
      }
    }
  }
  return next;
}

/** Nearest walkable tile to `origin`, searched in rings (used for spawning). */
export function nearestWalkable(nav, origin, maxRadius = 12) {
  if (isWalkable(nav, origin.x, origin.z)) return { ...origin };
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const candidate = { x: origin.x + dx, z: origin.z + dz };
        if (isWalkable(nav, candidate.x, candidate.z)) return candidate;
      }
    }
  }
  return null;
}
