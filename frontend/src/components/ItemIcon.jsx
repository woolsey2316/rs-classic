import { spriteUrl } from "../game/itemSprites";

export default function ItemIcon({ item, className = "" }) {
  if (!item) return null;
  const src = spriteUrl(item);
  if (src) {
    return (
      <img
        src={src}
        alt={item.name}
        className={`item-icon ${className}`.trim()}
        draggable={false}
      />
    );
  }
  return <span className="item-swatch" style={{ background: item.color }} />;
}
