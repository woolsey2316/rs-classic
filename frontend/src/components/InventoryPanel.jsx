import ItemIcon from "./ItemIcon";

export default function InventoryPanel({ inventory, onEquip, onHover }) {
  const slots = Array.from({ length: 30 }, (_, i) => {
    return inventory?.find((s) => s.slot_index === i) || { slot_index: i, item: null, quantity: 0 };
  });

  return (
    <section className="panel inventory-panel">
      <header className="panel-header">
        <h2>Inventory</h2>
        <span className="hint">Hover an item for options</span>
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
              onMouseEnter={() => item && onHover?.(slot)}
              onFocus={() => item && onHover?.(slot)}
              onClick={() => canEquip && onEquip?.(slot.slot_index)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!item) return;
                onHover?.(slot);
              }}
            >
              {item ? (
                <>
                  <ItemIcon item={item} />
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

