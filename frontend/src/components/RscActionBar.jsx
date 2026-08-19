import { useMemo, useState } from "react";
import {
  BUTTON_WIDTH,
  hoverFrameForTab,
  INV1_HEIGHT,
  INV1_URL,
  INV1_WIDTH,
  INV2_HEIGHT,
  INV2_URL,
  INV2_WIDTH,
  RSC_ACTION_TABS,
} from "../game/rscActionBar";

export default function RscActionBar({ tab, onTabChange }) {
  const [hoverTab, setHoverTab] = useState(null);

  const hoverFrame = useMemo(() => {
    const active = hoverTab || tab;
    return active ? hoverFrameForTab(active) : null;
  }, [hoverTab, tab]);

  return (
    <div className="rsc-action-bar" style={{ width: INV2_WIDTH, height: INV2_HEIGHT }}>
      <img
        className="rsc-action-bar-base"
        src={INV1_URL}
        width={INV1_WIDTH}
        height={INV1_HEIGHT}
        alt=""
        draggable={false}
      />
      {hoverFrame != null && (
        <img
          className="rsc-action-bar-hover"
          src={INV2_URL(hoverFrame)}
          width={INV2_WIDTH}
          height={INV2_HEIGHT}
          alt=""
          draggable={false}
        />
      )}
      <div
        className="rsc-action-bar-hit"
        style={{ width: INV1_WIDTH, height: INV1_HEIGHT }}
        role="tablist"
        aria-label="Game panels"
      >
        {Object.entries(RSC_ACTION_TABS).map(([id, { buttonIndex }]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-label={id}
            title={id.charAt(0).toUpperCase() + id.slice(1)}
            className="rsc-action-bar-tab"
            style={{
              left: buttonIndex * BUTTON_WIDTH,
              width: BUTTON_WIDTH,
            }}
            onMouseEnter={() => setHoverTab(id)}
            onMouseLeave={() => setHoverTab(null)}
            onFocus={() => setHoverTab(id)}
            onBlur={() => setHoverTab(null)}
            onClick={() => onTabChange?.(tab === id ? null : id)}
          />
        ))}
      </div>
    </div>
  );
}
