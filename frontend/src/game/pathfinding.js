/** Breadth-first search pathfinding on the overworld grid (8-directional). */

export function findPath(world, start, goal) {
  if (!world) return [];
  const { width, height, tiles } = world;
  const walkable = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return [0, 1, 6].includes(tiles[y][x]);
  };

  if (!walkable(goal.x, goal.y)) return [];
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x, y) => `${x},${y}`;
  const queue = [{ x: start.x, y: start.y }];
  const cameFrom = new Map();
  cameFrom.set(key(start.x, start.y), null);

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
    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let cur = current;
      while (cur) {
        path.push(cur);
        const prev = cameFrom.get(key(cur.x, cur.y));
        cur = prev;
      }
      path.reverse();
      return path.slice(1);
    }

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const k = key(nx, ny);
      if (cameFrom.has(k) || !walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!walkable(current.x + dx, current.y) || !walkable(current.x, current.y + dy)) {
          continue;
        }
      }
      cameFrom.set(k, current);
      queue.push({ x: nx, y: ny });
    }
  }

  return [];
}
