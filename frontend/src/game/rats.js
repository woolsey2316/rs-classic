import { findLandscapePath, isWalkable, nearestWalkable } from "./landscapeGrid";

export const RAT_HOME = { x: 124, y: 663 };
export const RAT_COUNT = 4;
export const RAT_WANDER_RADIUS = 4;
/** Most ticks a rat does nothing. */
export const RAT_IDLE_CHANCE = 0.72;

const STEP_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export const RAT_EXAMINE = "A small, filthy rat.";

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function withinHome(tile, home) {
  return Math.max(Math.abs(tile.x - home.x), Math.abs(tile.z - home.z)) <= RAT_WANDER_RADIUS;
}

export function spawnRats(nav, home) {
  const origin = nearestWalkable(nav, home, RAT_WANDER_RADIUS) || home;
  const rats = [];
  const used = new Set();
  for (let i = 0; i < RAT_COUNT; i += 1) {
    let tile = origin;
    for (const [dx, dz] of shuffle(STEP_DIRS.concat([[0, 0]]))) {
      const candidate = { x: origin.x + dx, z: origin.z + dz };
      const key = `${candidate.x},${candidate.z}`;
      if (used.has(key) || !isWalkable(nav, candidate.x, candidate.z)) continue;
      if (!withinHome(candidate, origin)) continue;
      tile = candidate;
      used.add(key);
      break;
    }
    used.add(`${tile.x},${tile.z}`);
    rats.push({
      id: i,
      x: tile.x,
      z: tile.z,
      facing: { x: 0, z: 1 },
      moving: false,
      step: 0,
    });
  }
  return rats;
}

export function stepRat(rat, nav, home) {
  if (!nav || Math.random() < RAT_IDLE_CHANCE) {
    return { ...rat, moving: false };
  }
  for (const [dx, dz] of shuffle(STEP_DIRS)) {
    const next = { x: rat.x + dx, z: rat.z + dz };
    if (!withinHome(next, home) || !isWalkable(nav, next.x, next.z)) continue;
    const path = findLandscapePath(nav, rat, next);
    if (path.length !== 1) continue;
    return {
      ...rat,
      x: next.x,
      z: next.z,
      facing: { x: dx, z: dz },
      moving: true,
      step: rat.step + 1,
    };
  }
  return { ...rat, moving: false };
}
