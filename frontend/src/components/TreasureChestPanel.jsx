import ItemIcon from "./ItemIcon";

export default function TreasureChestPanel({ chest, onTake, onClose }) {
  if (!chest) return null;

  return (
    <div className="treasure-chest-overlay" onClick={onClose}>
      <section
        className="panel treasure-chest-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <h2>{chest.name || "Treasure chest"}</h2>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="treasure-chest-hint">Click an item to take it into your inventory.</p>
        <div className="treasure-chest-grid">
          {chest.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="inv-slot filled treasure-chest-slot"
              title={item.name}
              onClick={() => onTake(item.key, item.name)}
            >
              <ItemIcon item={item} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
