/** Names and examine text for overworld tiles / scenery. */

export const TILE_INFO = {
  0: {
    name: "Grass",
    examine: "Soft grass covers the ground.",
  },
  1: {
    name: "Path",
    examine: "A well-trodden path.",
  },
  2: {
    name: "Water",
    examine: "Clear water. Too deep to walk through.",
  },
  3: {
    name: "Tree",
    examine: "A sturdy tree. Its bark looks rough.",
  },
  4: {
    name: "Rock",
    examine: "A pile of grey rocks.",
  },
  5: {
    name: "Wall",
    examine: "Crumbling stonework from some old ruin.",
  },
  6: {
    name: "Dirt",
    examine: "Bare earth, packed hard by travellers.",
  },
};

export function getTileInfo(tileId) {
  return (
    TILE_INFO[tileId] || {
      name: "Something",
      examine: "You're not sure what that is.",
    }
  );
}

export function isWalkableTile(tileId) {
  return tileId === 0 || tileId === 1 || tileId === 6;
}

export function examineItem(item, quantity = 1) {
  if (!item) return "There's nothing there.";
  if (item.description) return item.description;
  if (quantity > 1) return `${quantity} x ${item.name}.`;
  return `It's a ${item.name}.`;
}
