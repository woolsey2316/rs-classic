export default function InventoryPanel({ inventory, onEquip, onContextMenu }) {
  const slots = Array.from({ length: 30 }, (_, i) => {
    return inventory?.find((s) => s.slot_index === i) || { slot_index: i, item: null, quantity: 0 };
  });

  return (
    <section className="panel inventory-panel">
      <header className="panel-header">
        <h2>Inventory</h2>
        <span className="hint">Right-click for options</span>
      </header>
      <div className="inventory-grid">
        {slots.map((slot) => {
          const item = slot.item;
          const canEquip = Boolean(item?.equip_slot);
          return (
            <button
              key={slot.slot_index}
              type="button"
              className={`inv-slot ${item ? "filled" : ""} ${canEquip ? "equippable" : ""}`}
              title={item ? item.name : "Empty"}
              disabled={!item}
              onClick={() => canEquip && onEquip?.(slot.slot_index)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!item) return;
                onContextMenu?.({
                  clientX: e.clientX,
                  clientY: e.clientY,
                  slot,
                });
              }}
            >
              {item ? (
                <>
                  <span className="item-swatch" style={{ background: item.color }} />
                  <span className="item-label">{item.name.split(" ").pop()}</span>
                  {slot.quantity > 1 && <span className="item-qty">{slot.quantity}</span>}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
