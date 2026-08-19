import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dropItem, equipItem, unequipItem } from "../api/client";
import ContextMenu from "../components/ContextMenu";
import EquipmentPanel from "../components/EquipmentPanel";
import InventoryPanel from "../components/InventoryPanel";
import Landscape3D from "../components/Landscape3D";
import SkillsPanel from "../components/SkillsPanel";
import {
  buildNavGrid,
  findLandscapePath,
  isWalkable,
  nearestWalkable,
  tileInfo,
  toGameCoords,
} from "../game/landscapeGrid";
import { examineItem } from "../game/worldInfo";
import { useAuth } from "../hooks/useAuth";

const STEP_MS = 180;
const IDLE_STATUS = "Click the ground to walk. Right-click for options.";

export default function GamePage() {
  const { player, setPlayer, logout } = useAuth();
  const [land, setLand] = useState(null);
  const [pos, setPos] = useState(null);
  const [facing, setFacing] = useState({ x: 0, z: 1 });
  const [destination, setDestination] = useState(null);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [tab, setTab] = useState("skills");
  const [menu, setMenu] = useState(null);
  const pathRef = useRef([]);
  const walkingRef = useRef(false);
  const posRef = useRef(null);

  const nav = useMemo(() => (land ? buildNavGrid(land) : null), [land]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const onLandscapeLoad = useCallback((data) => {
    setLand(data);
  }, []);

  useEffect(() => {
    if (!nav || !land || posRef.current) return;
    const spawn = nearestWalkable(nav, {
      x: land.spawn?.x ?? Math.floor(land.width / 2),
      z: land.spawn?.z ?? Math.floor(land.depth / 2),
    });
    if (spawn) setPos(spawn);
  }, [nav, land]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const walkLoop = useCallback(async () => {
    if (walkingRef.current) return;
    walkingRef.current = true;
    try {
      while (pathRef.current.length) {
        const next = pathRef.current.shift();
        const current = posRef.current;
        if (current) {
          const dx = next.x - current.x;
          const dz = next.z - current.z;
          if (dx !== 0 || dz !== 0) setFacing({ x: dx, z: dz });
        }
        setPos(next);
        posRef.current = next;
        await new Promise((resolve) => setTimeout(resolve, STEP_MS));
      }
    } finally {
      walkingRef.current = false;
      setDestination(null);
      setStatus(IDLE_STATUS);
    }
  }, []);

  const startWalk = useCallback(
    (tile) => {
      if (!nav || !posRef.current) return;
      if (posRef.current.x === tile.x && posRef.current.z === tile.z) {
        setStatus("You're already standing there.");
        return;
      }
      const path = findLandscapePath(nav, posRef.current, tile);
      if (!path.length) {
        setStatus("You can't reach that.");
        return;
      }
      pathRef.current = path;
      setDestination(tile);
      const game = toGameCoords(land, tile.x, tile.z);
      setStatus(`Walking to (${game.x}, ${game.y})…`);
      walkLoop();
    },
    [land, nav, walkLoop],
  );

  function onTileClick(tile) {
    closeMenu();
    startWalk(tile);
  }

  function onTileContextMenu(hit) {
    if (!hit) {
      closeMenu();
      return;
    }
    const { tile, screen } = hit;
    const info = tileInfo(land, tile.x, tile.z);
    const items = [];

    if (isWalkable(nav, tile.x, tile.z)) {
      items.push({ id: "walk", label: "Walk here" });
    }
    items.push({ id: "examine", label: "Examine" });
    items.push({ id: "cancel", label: "Cancel" });

    const game = toGameCoords(land, tile.x, tile.z);
    setMenu({
      x: screen.x,
      y: screen.y,
      title: `${info.name} (${game.x}, ${game.y})`,
      items,
      payload: { type: "world", tile, info },
    });
  }

  function onInventoryContextMenu({ clientX, clientY, slot }) {
    const item = slot.item;
    if (!item) return;

    const items = [];
    if (item.equip_slot) {
      items.push({ id: "equip", label: "Equip" });
    }
    items.push({ id: "drop", label: "Drop", danger: true });
    items.push({ id: "examine", label: "Examine" });
    items.push({ id: "cancel", label: "Cancel" });

    setMenu({
      x: clientX,
      y: clientY,
      title: item.name,
      items,
      payload: { type: "inventory", slot },
    });
  }

  async function onMenuSelect(actionId) {
    if (!menu) return;
    const { payload } = menu;
    closeMenu();

    if (actionId === "cancel") return;

    if (payload.type === "world") {
      if (actionId === "walk") {
        startWalk(payload.tile);
      } else if (actionId === "examine") {
        setStatus(payload.info.examine);
      }
      return;
    }

    if (payload.type === "inventory") {
      const { slot } = payload;
      if (actionId === "equip") {
        await onEquip(slot.slot_index);
      } else if (actionId === "drop") {
        await onDrop(slot.slot_index, slot.item?.name);
      } else if (actionId === "examine") {
        setStatus(examineItem(slot.item, slot.quantity));
      }
    }
  }

  async function onEquip(slotIndex) {
    try {
      const updated = await equipItem(slotIndex);
      setPlayer(updated);
      setStatus("Equipped.");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onDrop(slotIndex, itemName) {
    try {
      const updated = await dropItem(slotIndex);
      setPlayer(updated);
      setStatus(itemName ? `You drop the ${itemName}.` : "You drop the item.");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onUnequip(slot) {
    try {
      const updated = await unequipItem(slot);
      setPlayer(updated);
      setStatus("Unequipped.");
    } catch (err) {
      setStatus(err.message);
    }
  }

  if (!player) {
    return <div className="boot-screen">Loading character…</div>;
  }

  return (
    <main className="landscape-page">
      <Landscape3D
        playerPos={pos}
        playerFacing={facing}
        destination={destination}
        selectedTile={menu?.payload.type === "world" ? menu.payload.tile : null}
        onLoad={onLandscapeLoad}
        onTileClick={onTileClick}
        onTileContextMenu={onTileContextMenu}
      />

      <div className="landscape-hud">
        <span className="landscape-region">{land?.name || "Loading region…"}</span>
        <span className="landscape-status">{status}</span>
        <button type="button" className="ghost-btn" onClick={logout}>
          Log out
        </button>
      </div>

      <aside className="side-panels">
        <div className="panel-tabs">
          {[
            ["skills", "Skills"],
            ["inventory", "Inventory"],
            ["equipment", "Equipment"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "skills" && (
          <SkillsPanel skills={player.skills} totalLevel={player.total_level} />
        )}
        {tab === "inventory" && (
          <InventoryPanel
            inventory={player.inventory}
            onEquip={onEquip}
            onContextMenu={onInventoryContextMenu}
          />
        )}
        {tab === "equipment" && (
          <EquipmentPanel equipment={player.equipment} onUnequip={onUnequip} />
        )}
      </aside>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={menu.title}
          items={menu.items}
          onSelect={onMenuSelect}
          onClose={closeMenu}
        />
      )}
    </main>
  );
}
