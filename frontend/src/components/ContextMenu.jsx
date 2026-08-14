import { useEffect, useRef } from "react";

/**
 * Classic-style right-click menu.
 * `items`: [{ id, label, disabled?, danger? }]
 */
export default function ContextMenu({ x, y, title, items, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  if (!items?.length) return null;

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="context-menu-title">{title}</div>}
      <ul className="context-menu-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="menuitem"
              className={`context-menu-item ${item.danger ? "danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                onSelect?.(item.id);
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
