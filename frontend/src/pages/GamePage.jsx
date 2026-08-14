import { useCallback, useEffect, useRef, useState } from "react";
import {
  dropItem,
  equipItem,
  fetchWorld,
  patchPosition,
  takeItem,
  unequipItem,
} from "../api/client";
import ContextMenu from "../components/ContextMenu";
import EquipmentPanel from "../components/EquipmentPanel";
import GameCanvas from "../components/GameCanvas";
import InventoryPanel from "../components/InventoryPanel";
import SkillsPanel from "../components/SkillsPanel";
import { findPath } from "../game/pathfinding";
import { examineItem, getTileInfo, isWalkableTile } from "../game/worldInfo";
import { useAuth } from "../hooks/useAuth";

const STEP_MS = 180;

export default function GamePage() {
  const { player, setPlayer, logout, refreshPlayer } = useAuth();
  const [world, setWorld] = useState(null);
  const [pos, setPos] = useState({ x: player?.x ?? 12, y: player?.y ?? 10 });
  const [facing, setFacing] = useState("down");
  const [destination, setDestination] = useState(null);
  const [status, setStatus] = useState("Click the ground to walk. Right-click for options.");
  const [tab, setTab] = useState("skills");
  const [menu, setMenu] = useState(null);
  const pathRef = useRef([]);
  const walkingRef = useRef(false);
  const posRef = useRef(pos);
  const afterWalkRef = useRef(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (player) {
      setPos({ x: player.x, y: player.y });
    }
  }, [player?.id]);

  useEffect(() => {
    let cancelled = false;
    fetchWorld()
      .then((data) => {
        if (!cancelled) setWorld(data);
      })
      .catch((err) => setStatus(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const walkLoop = useCallback(async () => {
    if (walkingRef.current) return;
    walkingRef.current = true;
    let arrived = true;
    try {
      while (pathRef.current.length) {
        const next = pathRef.current.shift();
        const current = posRef.current;
        if (next.x > current.x) setFacing("right");
        else if (next.x < current.x) setFacing("left");
        else if (next.y > current.y) setFacing("down");
        else if (next.y < current.y) setFacing("up");

        try {
          await patchPosition(next.x, next.y);
          setPos({ x: next.x, y: next.y });
          setPlayer((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev));
        } catch (err) {
          pathRef.current = [];
          arrived = false;
          setStatus(err.message);
          break;
        }
        await new Promise((r) => setTimeout(r, STEP_MS));
      }
    } finally {
      walkingRef.current = false;
      setDestination(null);
      const after = afterWalkRef.current;
      afterWalkRef.current = null;
      if (arrived && after) {
        after();
      } else if (!pathRef.current.length && !after) {
        setStatus("Click the ground to walk. Right-click for options.");
      }
    }
  }, [setPlayer]);

  function startWalk(tile, afterArrive) {
    if (!world) return false;
    afterWalkRef.current = afterArrive || null;
    if (posRef.current.x === tile.x && posRef.current.y === tile.y) {
      const after = afterWalkRef.current;
      afterWalkRef.current = null;
      if (after) {
        after();
      } else {
        setStatus("You're already here.");
      }
      return true;
    }
    const path = findPath(world, posRef.current, tile);
    if (!path.length) {
      afterWalkRef.current = null;
      setStatus("You can't reach that.");
      return false;
    }
    pathRef.current = path;
    setDestination(tile);
    setStatus(`Walking to (${tile.x}, ${tile.y})…`);
    walkLoop();
    return true;
  }

  function onTileClick(tile) {
    startWalk(tile);
  }

  function canWalkHere(tile, tileId) {
    if (!isWalkableTile(tileId)) return false;
    if (posRef.current.x === tile.x && posRef.current.y === tile.y) return true;
    return findPath(world, posRef.current, tile).length > 0;
  }

  function onTileContextMenu({ tile, clientX, clientY, tileId, groundItem }) {
    const info = getTileInfo(tileId);
    const items = [];

    if (groundItem) {
      items.push({ id: "take", label: "Take" });
    }
    if (canWalkHere(tile, tileId)) {
      items.push({ id: "walk", label: "Walk here" });
    }
    items.push({ id: "examine", label: "Examine" });
    items.push({ id: "cancel", label: "Cancel" });

    setMenu({
      x: clientX,
      y: clientY,
      title: groundItem?.item?.name || info.name,
      items,
      payload: { type: "world", tile, tileId, groundItem },
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
      const info = getTileInfo(payload.tileId);
      if (actionId === "take" && payload.groundItem) {
        startWalk(payload.tile, () => onTake(payload.groundItem));
      } else if (actionId === "walk") {
        startWalk(payload.tile);
      } else if (actionId === "examine") {
        if (payload.groundItem) {
          setStatus(examineItem(payload.groundItem.item, payload.groundItem.quantity));
        } else {
          setStatus(info.examine);
        }
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

  async function onTake(ground) {
    try {
      const data = await takeItem(ground.id);
      setPlayer(data.player);
      setWorld((prev) =>
        prev ? { ...prev, ground_items: data.ground_items } : prev,
      );
      setStatus(`You take the ${ground.item?.name || "item"}.`);
    } catch (err) {
      setStatus(err.message);
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
    <div className="game-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand">RS Classic</span>
          <span className="world-name">{world?.name || "Loading world…"}</span>
        </div>
        <div className="player-meta">
          <span>{player.display_name}</span>
          <span className="muted">@{player.username}</span>
          <a className="ghost-btn landscape-link" href="/landscape-3d">
            3D map
          </a>
          <button type="button" className="ghost-btn" onClick={() => refreshPlayer()}>
            Sync
          </button>
          <button type="button" className="ghost-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="game-layout">
        <main className="viewport">
          <div className="viewport-frame">
            {world ? (
              <GameCanvas
                world={world}
                playerPos={pos}
                facing={facing}
                destination={destination}
                onTileClick={onTileClick}
                onTileContextMenu={onTileContextMenu}
              />
            ) : (
              <div className="boot-screen inset">Charting the meadow…</div>
            )}
          </div>
          <p className="status-line">{status}</p>
        </main>

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
      </div>

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
    </div>
  );
}
