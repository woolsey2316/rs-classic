/**
 * Helpers for streamed RSC landscape sectors.
 *
 * Tiles are addressed as {x, z} in a fixed world space: x runs west→east and
 * z runs north→south. Sector columns decrease toward the east. Plane 0's z
 * equals the RSC game y of that tile.
 */

const SECTOR_SIZE = 48;
const WORLD_MAX_SECTOR_X = 64;
const WORLD_MIN_SECTOR_Y = 37;

export function sectorOrigin(sectorX, sectorY) {
  return {
    x: (WORLD_MAX_SECTOR_X - sectorX) * SECTOR_SIZE,
    z: (sectorY - WORLD_MIN_SECTOR_Y) * SECTOR_SIZE,
  };
}

export function sectorCoordsAt(x, z) {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const sectorX = WORLD_MAX_SECTOR_X - Math.floor(tx / SECTOR_SIZE);
  const sectorY = WORLD_MIN_SECTOR_Y + Math.floor(tz / SECTOR_SIZE);
  const origin = sectorOrigin(sectorX, sectorY);
  return {
    sectorX,
    sectorY,
    localX: tx - origin.x,
    localZ: tz - origin.z,
    originX: origin.x,
    originZ: origin.z,
  };
}

/** Sectors within `radius` of the sector containing this world tile. */
export function sectorsAround(x, z, radius) {
  const { sectorX, sectorY } = sectorCoordsAt(x, z);
  const nearby = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      nearby.push({ x: sectorX + dx, y: sectorY + dy });
    }
  }
  return nearby;
}

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
export function buildNavGrid(data, { wallKinds = null, openDoors = null } = {}) {
  const { width, depth } = data;
  const blockedTiles = new Uint8Array(width * depth);
  const blockedEdges = new Set();

  for (let i = 0; i < blockedTiles.length; i += 1) {
    blockedTiles[i] = data.blocked[i] ? 1 : 0;
  }

  (data.walls || []).forEach((wall, index) => {
    const [x1, z1, x2, z2, , wallId] = wall;
    const kind = wallKinds?.[wallId];
    if (openDoors?.has(index)) return;
    if (kind && kind.blocked === false) return;

    if (x1 === x2) {
      const east = { x: x1, z: z1 };
      const west = { x: x1 - 1, z: z1 };
      blockedEdges.add(edgeKey(west.x, west.z, east.x, east.z));
    } else if (z1 === z2) {
      const south = { x: x1, z: z1 };
      const north = { x: x1, z: z1 - 1 };
      blockedEdges.add(edgeKey(north.x, north.z, south.x, south.z));
    } else {
      const x = Math.min(x1, x2);
      const z = Math.min(z1, z2);
      if (x >= 0 && z >= 0 && x < width && z < depth) {
        blockedTiles[z * width + x] = 1;
      }
    }
  });

  return { width, depth, blockedTiles, blockedEdges };
}

const tileKey = (x, z) => `${x},${z}`;

/**
 * Walkability across the sectors currently loaded. Tile coordinates are world
 * tiles, so a window sliding in new sectors does not shift the player.
 */
export function buildWorldNav(sectors, { wallKinds = null, openDoors = null } = {}) {
  const present = new Set();
  const blocked = new Set();
  const blockedEdges = new Set();

  for (const sector of sectors || []) {
    const origin = sectorOrigin(sector.sectorX, sector.sectorY);
    const { width, depth } = sector;
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const wx = origin.x + x;
        const wz = origin.z + z;
        present.add(tileKey(wx, wz));
        if (sector.blocked[z * width + x]) blocked.add(tileKey(wx, wz));
      }
    }

    (sector.walls || []).forEach((wall, index) => {
      const doorId = `${sector.sectorX},${sector.sectorY},${sector.plane}:${index}`;
      if (openDoors?.has(doorId)) return;
      const [x1, z1, x2, z2, , wallId] = wall;
      const kind = wallKinds?.[wallId];
      if (kind && kind.blocked === false) return;
      const wx1 = origin.x + x1;
      const wz1 = origin.z + z1;
      const wx2 = origin.x + x2;
      const wz2 = origin.z + z2;

      if (wx1 === wx2) {
        blockedEdges.add(edgeKey(wx1 - 1, wz1, wx1, wz1));
      } else if (wz1 === wz2) {
        blockedEdges.add(edgeKey(wx1, wz1 - 1, wx1, wz1));
      } else {
        const tx = Math.min(wx1, wx2);
        const tz = Math.min(wz1, wz2);
        blocked.add(tileKey(tx, tz));
      }
    });
  }

  return { world: true, present, blocked, blockedEdges };
}

export function isWalkable(nav, x, z) {
  if (!nav) return false;
  if (nav.world) {
    const key = tileKey(x, z);
    return nav.present.has(key) && !nav.blocked.has(key);
  }
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

  const key = nav.world ? tileKey : (x, z) => z * nav.width + x;
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
      if (!nav.world && (next.x < 0 || next.z < 0 || next.x >= nav.width || next.z >= nav.depth)) {
        continue;
      }
      if (nav.world && !nav.present.has(k)) continue;
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
  if (data.sectors) {
    const { sectorX, sectorY, localX, localZ } = sectorCoordsAt(x, z);
    const sector = data.sectors.find(
      (entry) => entry.sectorX === sectorX && entry.sectorY === sectorY,
    );
    if (!sector) return fallback;
    const overlay = sector.overlays[localZ * sector.width + localX] ?? 0;
    return OVERLAY_INFO[overlay] || fallback;
  }
  const overlay = data.overlays[z * data.width + x] ?? 0;
  return OVERLAY_INFO[overlay] || fallback;
}

/** Convert world tile coordinates to RSC game coordinates. */
export function toGameCoords(data, x, z) {
  const { sectorX, localX, sectorY, localZ } = sectorCoordsAt(x, z);
  const plane = data?.sectorBounds?.plane || 0;
  return {
    x: (47 - localX) + (sectorX - 48) * 48,
    y: localZ + (sectorY - 36) * 48 - 48 + plane * 944,
  };
}

/** Map RSC world coordinates onto the fixed world tile grid. */
export function fromGameCoords(data, gameX, gameY) {
  const plane = data?.sectorBounds?.plane || 0;
  const yOnPlane = gameY - plane * 944;
  const sectorX = Math.floor(gameX / 48) + 48;
  const tileX = ((gameX % 48) + 48) % 48;
  const sectorY = Math.floor(yOnPlane / 48) + 37;
  const tileZ = ((yOnPlane % 48) + 48) % 48;
  const origin = sectorOrigin(sectorX, sectorY);
  return {
    x: origin.x + (47 - tileX),
    z: origin.z + tileZ,
  };
}

/** Inclusive RSC world-coordinate bbox covering the loaded sectors. */
export function sectorsGameBounds(sectors, plane = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const sector of sectors || []) {
    const origin = sectorOrigin(sector.sectorX, sector.sectorY);
    for (const corner of [
      [origin.x, origin.z],
      [origin.x + sector.width - 1, origin.z + sector.depth - 1],
    ]) {
      const game = toGameCoords({ sectorBounds: { plane } }, corner[0], corner[1]);
      minX = Math.min(minX, game.x);
      maxX = Math.max(maxX, game.x);
      minY = Math.min(minY, game.y);
      maxY = Math.max(maxY, game.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX, maxX, minY, maxY };
}

/** Inclusive RSC world-coordinate bbox covered by a single exported region. */
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
  const model = (kind?.model || "").toLowerCase();
  if (
    kind?.type === "open-door" ||
    model.includes("gateopen") ||
    model.includes("doorsopen") ||
    /dooropen/.test(model)
  ) {
    return false;
  }
  return kind?.type === "blocked" || kind?.type === "closed-door";
}

/** Local tiles a scenery object occupies, origin first. */
export function sceneryTiles(kind, origin, direction) {
  if (!origin) return [];
  const { width, height } = sceneryOccupies(kind, direction);
  const tiles = [];
  for (let dx = 0; dx < width; dx += 1) {
    for (let dz = 0; dz < height; dz += 1) {
      tiles.push({ x: origin.x + dx, z: origin.z + dz });
    }
  }
  return tiles;
}

/** True when `pos` is on or next to any tile the scenery occupies. */
export function isNearScenery(pos, kind, origin, direction) {
  if (!pos) return false;
  return sceneryTiles(kind, origin, direction).some(
    (tile) =>
      (pos.x === tile.x && pos.z === tile.z) || isAdjacentTile(pos, tile),
  );
}

/** Copy a nav grid and mark tiles occupied by blocking scenery. */
export function applySceneryBlocking(nav, land, scenery) {
  if (!nav || !land || !scenery?.objects?.length) return nav;
  if (nav.world) {
    const blocked = new Set(nav.blocked);
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
          if (nav.present.has(tileKey(x, z))) blocked.add(tileKey(x, z));
        }
      }
    }
    return { ...nav, blocked };
  }
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

/** True when `a` is on a neighbouring tile of `b` (including diagonals). */
export function isAdjacentTile(a, b) {
  if (!a || !b) return false;
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return dx <= 1 && dz <= 1 && (dx !== 0 || dz !== 0);
}
