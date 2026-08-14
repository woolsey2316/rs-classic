const SLOT_ORDER = [
  { key: "helmet", label: "Helmet" },
  { key: "arrows", label: "Arrows" },
  { key: "gloves", label: "Gloves" },
  { key: "body", label: "Body" },
  { key: "legs", label: "Legs" },
  { key: "boots", label: "Boots" },
  { key: "ring", label: "Ring" },
  { key: "weapon", label: "Weapon" },
  { key: "shield", label: "Shield" },
  { key: "amulet", label: "Amulet" },
  { key: "cape", label: "Cape" },
];

export default function EquipmentPanel({ equipment, onUnequip }) {
  const bySlot = Object.fromEntries((equipment || []).map((e) => [e.slot, e]));

  return (
    <section className="panel equipment-panel">
      <header className="panel-header">
        <h2>Equipment</h2>
        <span className="hint">Click to unequip</span>
      </header>
      <div className="equipment-layout">
        {SLOT_ORDER.map(({ key, label }) => {
          const slot = bySlot[key];
          const item = slot?.item;
          return (
            <button
              key={key}
              type="button"
              className={`equip-slot equip-${key} ${item ? "filled" : ""}`}
              title={item ? `${item.name} — click to unequip` : label}
              disabled={!item}
              onClick={() => item && onUnequip?.(key)}
            >
              <span className="equip-label">{label}</span>
              {item ? (
                <span className="equip-item">
                  <span className="item-swatch" style={{ background: item.color }} />
                  {item.name}
                  {slot.quantity > 1 ? ` x${slot.quantity}` : ""}
                </span>
              ) : (
                <span className="equip-empty">—</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
