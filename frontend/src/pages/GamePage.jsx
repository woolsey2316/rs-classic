import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dropItem, equipItem, fetchScenery, chopTree, fetchTreasureChestContents, fightRat, takeFromTreasureChest, toggleDoor, unequipItem } from "../api/client";
import ContextMenu from "../components/ContextMenu";
import EquipmentPanel from "../components/EquipmentPanel";
import InventoryPanel from "../components/InventoryPanel";
import Landscape3D from "../components/Landscape3D";
import RscActionBar from "../components/RscActionBar";
import SkillsPanel from "../components/SkillsPanel";
import TreasureChestPanel from "../components/TreasureChestPanel";
import {
  applySceneryBlocking,
  buildWorldNav,
  findLandscapePath,
  isAdjacentTile,
  isNearScenery,
  isWalkable,
  nearestWalkable,
  sectorsGameBounds,
  tileInfo,
  toGameCoords,
  fromGameCoords,
} from "../game/landscapeGrid";
import { examineItem } from "../game/worldInfo";
import { equippedItemIds } from "../game/playerSprite";
import { RAT_EXAMINE, RAT_HOME, RAT_RESPAWN_TICKS, spawnRats, stepRat, tileBeside } from "../game/rats";
import { TICK_MS, onTick } from "../game/tick";
import { useAuth } from "../hooks/useAuth";

const IDLE_STATUS = "Click the ground to walk. Right-click for options.";
const TREASURE_CHEST_KIND_ID = 900001;

function isTreasureChest(placement) {
  return Boolean(
    placement?.object?.is_treasure_chest ||
      placement?.kind?.rsc_id === TREASURE_CHEST_KIND_ID,
  );
}

export default function GamePage() {
  const { player, setPlayer, logout } = useAuth();
  const [land, setLand] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [scenery, setScenery] = useState(null);
  const [wallKinds, setWallKinds] = useState(null);
  const [openDoors, setOpenDoors] = useState([]);
  const [rats, setRats] = useState([]);
  const [hitsplats, setHitsplats] = useState([]);
  const [playerFighting, setPlayerFighting] = useState(false);
  const [pos, setPos] = useState(null);
  const [facing, setFacing] = useState({ x: 0, z: 1 });
  const [destination, setDestination] = useState(null);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [tab, setTab] = useState(null);
  const [menu, setMenu] = useState(null);
  const [itemOptions, setItemOptions] = useState(null);
  const [worldHover, setWorldHover] = useState(null);
  const [chest, setChest] = useState(null);
  const pathRef = useRef([]);
  const walkingRef = useRef(false);
  const posRef = useRef(null);
  const pendingActionRef = useRef(null);
  const openDoorSet = useMemo(() => new Set(openDoors), [openDoors]);

  const baseNav = useMemo(
    () => (sectors.length ? buildWorldNav(sectors, { wallKinds, openDoors: openDoorSet }) : null),
    [sectors, wallKinds, openDoorSet],
  );
  const nav = useMemo(
    () => applySceneryBlocking(baseNav, land, scenery),
    [baseNav, land, scenery],
  );

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const navRef = useRef(nav);
  navRef.current = nav;
  const landRef = useRef(land);
  landRef.current = land;
  const ratHomeRef = useRef(null);
  const ratsStateRef = useRef([]);
  const fightingRef = useRef(null);
  const fightBusyRef = useRef(false);
  const splatSeq = useRef(1);
  const attackSeq = useRef(0);
  const [attackClick, setAttackClick] = useState(null);

  useEffect(() => {
    ratsStateRef.current = rats;
  }, [rats]);

  const ratsStarted = useRef(false);

  const onLandscapeLoad = useCallback((catalog) => {
    setLand({
      ...catalog,
      sectorBounds: { plane: 0 },
    });
  }, []);

  const onSectors = useCallback((loaded) => {
    setSectors(loaded);
  }, []);

  const ratsReady = Boolean(land && nav);

  useEffect(() => {
    if (!ratsReady || ratsStarted.current) return undefined;
    const home = fromGameCoords(land, RAT_HOME.x, RAT_HOME.y);
    if (!home) return undefined;
    const spot = nearestWalkable(nav, home, 6) || home;
    ratsStarted.current = true;
    ratHomeRef.current = spot;
    setRats(spawnRats(nav, spot));
    const timer = setInterval(() => {
      const grid = navRef.current;
      const origin = ratHomeRef.current;
      if (!grid || !origin) return;
      setRats((prev) => {
        const next = prev.map((rat) => stepRat(rat, grid, origin));
        ratsStateRef.current = next;
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [ratsReady]);

  useEffect(() => {
    let cancelled = false;
    fetch("/landscape/defs.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((defs) => {
        if (!cancelled) setWallKinds(defs?.wallKinds || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!nav || !land || posRef.current) return;
    const spawn = nearestWalkable(nav, {
      x: land.spawn?.x ?? 0,
      z: land.spawn?.z ?? 0,
    });
    if (spawn) setPos(spawn);
  }, [nav, land]);

  useEffect(() => {
    if (!sectors.length) return undefined;
    const bounds = sectorsGameBounds(sectors);
    let cancelled = false;
    fetchScenery(bounds)
      .then((data) => {
        if (!cancelled) setScenery(data);
      })
      .catch((err) => {
        if (!cancelled) setStatus(err.message || "Couldn't load scenery.");
      });
    return () => {
      cancelled = true;
    };
  }, [sectors]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const walkLoop = useCallback(async () => {
    if (walkingRef.current) return;
    walkingRef.current = true;
    try {
      while (pathRef.current.length) {
        await onTick(() => {
          const next = pathRef.current.shift();
          if (!next) return;
          const current = posRef.current;
          if (current) {
            const dx = next.x - current.x;
            const dz = next.z - current.z;
            if (dx !== 0 || dz !== 0) setFacing({ x: dx, z: dz });
          }
          setPos(next);
          posRef.current = next;
        });
      }
    } finally {
      walkingRef.current = false;
      setDestination(null);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      if (pending) {
        await pending();
      } else if (!fightingRef.current) {
        setStatus(IDLE_STATUS);
      }
    }
  }, []);

  const startWalk = useCallback(
    (tile) => {
      if (fightingRef.current) {
        fightingRef.current = null;
        setPlayerFighting(false);
        setRats((prev) => {
          const next = prev.map((rat) => (rat.fighting ? { ...rat, fighting: false } : rat));
          ratsStateRef.current = next;
          return next;
        });
      }
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
      return true;
    },
    [land, nav, walkLoop],
  );

  const fightLoop = useCallback(async () => {
    if (fightBusyRef.current) return;
    fightBusyRef.current = true;
    try {
      while (fightingRef.current) {
        await onTick(async () => {
          const session = fightingRef.current;
          if (!session) return;
          const rat = ratsStateRef.current.find((entry) => entry.id === session.ratId);
          const here = posRef.current;
          if (!rat || rat.dead || !rat.hits || !isAdjacentTile(here, rat)) {
            fightingRef.current = null;
            setPlayerFighting(false);
            setRats((prev) => {
              const next = prev.map((entry) =>
                entry.fighting ? { ...entry, fighting: false } : entry,
              );
              ratsStateRef.current = next;
              return next;
            });
            if (rat && !rat.dead) setStatus("You retreat from the rat.");
            return;
          }
          const dx = rat.x - here.x;
          const dz = rat.z - here.z;
          if (dx !== 0 || dz !== 0) setFacing({ x: Math.sign(dx), z: Math.sign(dz) });
          try {
            const result = await fightRat(rat.hits);
            setPlayer(result.player);
            const born = performance.now();
            setHitsplats((prev) => {
              const fresh = prev.filter((splat) => born - splat.born < 1600);
              fresh.push({
                id: splatSeq.current,
                target: "rat",
                ratId: rat.id,
                damage: result.player_damage,
                born,
              });
              splatSeq.current += 1;
              if (!result.killed) {
                fresh.push({
                  id: splatSeq.current,
                  target: "player",
                  damage: result.rat_damage,
                  born,
                });
                splatSeq.current += 1;
              }
              return fresh;
            });
            setRats((prev) => {
              const next = prev.map((entry) =>
                entry.id === rat.id
                  ? {
                      ...entry,
                      hits: result.rat_hits,
                      fighting: !result.killed && !result.player_dead,
                      dead: result.killed,
                      respawnIn: result.killed ? RAT_RESPAWN_TICKS : 0,
                      moving: false,
                    }
                  : entry,
              );
              ratsStateRef.current = next;
              return next;
            });
            if (result.killed) {
              fightingRef.current = null;
              setPlayerFighting(false);
              const labels = { attack: "Attack", hits: "Hits", strength: "Strength", defense: "Defense" };
              const notes = Object.entries(result.xp || {})
                .filter(([, amount]) => amount)
                .map(([skill, amount]) => `+${amount} ${labels[skill] || skill}`);
              setStatus(
                notes.length ? `You defeat the rat. (${notes.join(", ")})` : "You defeat the rat.",
              );
            } else if (result.player_dead) {
              fightingRef.current = null;
              setPlayerFighting(false);
              const grid = navRef.current;
              const data = landRef.current;
              const spawn =
                grid && data
                  ? nearestWalkable(grid, {
                      x: data.spawn?.x ?? Math.floor(data.width / 2),
                      z: data.spawn?.z ?? Math.floor(data.depth / 2),
                    })
                  : null;
              if (spawn) {
                pathRef.current = [];
                posRef.current = spawn;
                setPos(spawn);
                setDestination(null);
              }
              setStatus("Oh dear, you are dead!");
            }
          } catch (err) {
            if (!String(err.message || "").includes("game tick")) {
              fightingRef.current = null;
              setPlayerFighting(false);
              setRats((prev) => {
                const next = prev.map((entry) =>
                  entry.fighting ? { ...entry, fighting: false } : entry,
                );
                ratsStateRef.current = next;
                return next;
              });
              setStatus(err.message || "You stop fighting.");
            }
          }
        });
      }
    } finally {
      fightBusyRef.current = false;
    }
  }, [setPlayer]);

  function startFight(ratId) {
    fightingRef.current = { ratId };
    setPlayerFighting(true);
    setStatus("You start fighting the rat.");
    setRats((prev) => {
      const next = prev.map((rat) => ({
        ...rat,
        fighting: rat.id === ratId && !rat.dead,
      }));
      ratsStateRef.current = next;
      return next;
    });
    const rat = ratsStateRef.current.find((entry) => entry.id === ratId);
    const here = posRef.current;
    if (rat && here) {
      const dx = rat.x - here.x;
      const dz = rat.z - here.z;
      if (dx !== 0 || dz !== 0) setFacing({ x: Math.sign(dx), z: Math.sign(dz) });
    }
    fightLoop();
  }

  function attackRat(rat) {
    if (!navRef.current || !rat || rat.dead) return;
    const live = ratsStateRef.current.find((entry) => entry.id === rat.id) || rat;
    if (!live || live.dead) return;
    attackSeq.current += 1;
    setAttackClick({ x: live.x, z: live.z, token: attackSeq.current });
    const engage = () => {
      const current = ratsStateRef.current.find((entry) => entry.id === rat.id) || live;
      if (!current || current.dead) return;
      if (!isAdjacentTile(posRef.current, current)) {
        const goal = tileBeside(navRef.current, posRef.current, current);
        if (!goal) {
          setStatus("You can't get close enough to the rat.");
          return;
        }
        pendingActionRef.current = engage;
        startWalk(goal);
        return;
      }
      startFight(current.id);
    };
    engage();
  }

  function onTileClick(tile) {
    closeMenu();
    setItemOptions(null);
    setTab(null);
    setChest(null);
    pendingActionRef.current = null;
    startWalk(tile);
  }

  function onTileContextMenu(hit) {
    if (!hit) {
      closeMenu();
      return;
    }
    const { tile, screen } = hit;
    const info = tileInfo({ sectors }, tile.x, tile.z);
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

  function walkToScenery(placement, onArrive) {
    if (!nav || !placement?.tile) return;
    const goal = nearestWalkable(nav, placement.tile);
    if (!goal) {
      setStatus("You can't reach that.");
      return;
    }
    if (
      posRef.current &&
      goal.x === posRef.current.x &&
      goal.z === posRef.current.z
    ) {
      if (onArrive) onArrive();
      return;
    }
    pendingActionRef.current = onArrive || null;
    if (!startWalk(goal)) pendingActionRef.current = null;
  }

  function doorSides(wall) {
    const [x1, z1, x2, z2] = wall;
    if (x1 === x2) {
      const z = Math.min(z1, z2);
      return [
        { x: x1 - 1, z },
        { x: x1, z },
      ];
    }
    if (z1 === z2) {
      return [
        { x: x1, z: z1 - 1 },
        { x: x1, z: z1 },
      ];
    }
    return [{ x: Math.min(x1, x2), z: Math.min(z1, z2) }];
  }

  function standingAtDoor(wall) {
    const pos = posRef.current;
    return Boolean(pos && doorSides(wall).some((tile) => tile.x === pos.x && tile.z === pos.z));
  }

  function walkToDoor(door, onArrive) {
    if (!nav) return;
    const sides = doorSides(door.wall)
      .map((tile) => nearestWalkable(nav, tile, 2))
      .filter(Boolean);
    if (!sides.length) {
      setStatus("You can't reach that door.");
      return;
    }
    const here = posRef.current;
    sides.sort((a, b) => {
      const da = here ? Math.abs(a.x - here.x) + Math.abs(a.z - here.z) : 0;
      const db = here ? Math.abs(b.x - here.x) + Math.abs(b.z - here.z) : 0;
      return da - db;
    });
    walkToScenery({ tile: sides[0] }, onArrive);
  }

  function toggleDoorway(door) {
    const open = () => {
      setOpenDoors((prev) =>
        prev.includes(door.index) ? prev.filter((id) => id !== door.index) : [...prev, door.index],
      );
      setStatus(openDoorSet.has(door.index) ? "You close the door." : "You open the door.");
    };
    if (standingAtDoor(door.wall)) {
      onTick(open);
      return;
    }
    walkToDoor(door, () => onTick(open));
  }

  const tryChop = useCallback(
    async (placement) => {
      if (!land || !placement?.object?.id || !posRef.current) return;
      const game = toGameCoords(land, posRef.current.x, posRef.current.z);
      setStatus("You swing your axe at the tree…");
      try {
        const result = await onTick(() =>
          chopTree(placement.object.id, game.x, game.y),
        );
        setPlayer(result.player);
        if (result.scenery_update) {
          setScenery((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              objects: prev.objects.map((obj) =>
                obj.id === result.scenery_update.id
                  ? { ...obj, kind: result.scenery_update.kind }
                  : obj,
              ),
            };
          });
        }
        const xpNote =
          result.xp_gained > 0 ? ` (+${result.xp_gained} woodcutting xp)` : "";
        setStatus(`${result.message}${xpNote}`);
      } catch (err) {
        setStatus(err.message);
      }
    },
    [land, setPlayer],
  );

  function chopScenery(placement) {
    if (!placement?.tile || !posRef.current) return;
    if (isAdjacentTile(posRef.current, placement.tile)) {
      tryChop(placement);
      return;
    }
    walkToScenery(placement, () => tryChop(placement));
  }

  const openTreasureChest = useCallback(
    async (placement) => {
      if (!placement?.object?.id) return;
      try {
        const data = await fetchTreasureChestContents(placement.object.id);
        const manifest = await fetch("/sprites/rsc/items/manifest.json").then((res) => {
          if (!res.ok) throw new Error("Couldn't load the item sprites.");
          return res.json();
        });
        const items = manifest.map((entry) => ({
          key: `rsc-${entry.id}`,
          name: entry.name,
          sprite: entry.file,
          description: entry.name,
        }));
        setChest({
          sceneryId: placement.object.id,
          name: data.name,
          items,
        });
        setTab(null);
        setStatus("You search the treasure chest.");
      } catch (err) {
        setStatus(err.message);
      }
    },
    [],
  );

  function searchTreasureChest(placement) {
    if (!placement?.tile || !posRef.current) return;
    if (isAdjacentTile(posRef.current, placement.tile)) {
      openTreasureChest(placement);
      return;
    }
    walkToScenery(placement, () => openTreasureChest(placement));
  }

  async function onTakeFromChest(item) {
    if (!chest?.sceneryId || !land || !posRef.current || !item) return;
    const game = toGameCoords(land, posRef.current.x, posRef.current.z);
    try {
      const result = await onTick(() =>
        takeFromTreasureChest(chest.sceneryId, item, game.x, game.y),
      );
      setPlayer(result.player);
      setStatus(result.message || `You take the ${item.name.toLowerCase()}.`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  function closeChest() {
    setChest(null);
    setStatus(IDLE_STATUS);
  }

  function applySceneryKind(update, kind) {
    setScenery((prev) => {
      if (!prev || !update) return prev;
      const kinds = prev.kinds.some((entry) => entry.rsc_id === kind?.rsc_id)
        ? prev.kinds
        : kind
          ? [...prev.kinds, kind]
          : prev.kinds;
      return {
        ...prev,
        kinds,
        objects: prev.objects.map((obj) =>
          obj.id === update.id ? { ...obj, kind: update.kind } : obj,
        ),
      };
    });
  }

  const tryToggleDoor = useCallback(
    async (placement, action) => {
      if (!land || !placement?.object?.id || !posRef.current) return;
      const game = toGameCoords(land, posRef.current.x, posRef.current.z);
      setStatus(action === "open" ? "You open the gate…" : "You close the gate…");
      try {
        const result = await onTick(() =>
          toggleDoor(placement.object.id, game.x, game.y, action),
        );
        applySceneryKind(result.scenery_update, result.kind);
        setStatus(result.message);
      } catch (err) {
        setStatus(err.message);
      }
    },
    [land],
  );

  function toggleDoorScenery(placement, action) {
    if (!placement?.tile || !posRef.current) return;
    if (
      isNearScenery(
        posRef.current,
        placement.kind,
        placement.tile,
        placement.object?.direction,
      )
    ) {
      tryToggleDoor(placement, action);
      return;
    }
    walkToScenery(placement, () => tryToggleDoor(placement, action));
  }

  function onSceneryClick(placement) {
    closeMenu();
    walkToScenery(placement);
  }

  function onRatClick(rat) {
    closeMenu();
    setItemOptions(null);
    if (!rat || rat.dead) return;
    attackRat(rat);
  }

  function onRatContextMenu(hit) {
    if (!hit?.rat) {
      closeMenu();
      return;
    }
    setMenu({
      x: hit.screen.x,
      y: hit.screen.y,
      title: "Rat",
      items: [
        { id: "attack", label: "Attack Rat" },
        { id: "examine", label: "Examine Rat" },
        { id: "cancel", label: "Cancel" },
      ],
      payload: { type: "rat", rat: hit.rat },
    });
  }

  function onDoorClick(door) {
    closeMenu();
    toggleDoorway(door);
  }

  function onDoorContextMenu(hit) {
    if (!hit?.door) {
      closeMenu();
      return;
    }
    const open = openDoorSet.has(hit.door.index);
    setMenu({
      x: hit.screen.x,
      y: hit.screen.y,
      title: hit.door.name || "Door",
      items: [
        { id: "toggle-door", label: open ? "Close Door" : "Open Door" },
        { id: "examine", label: "Examine" },
        { id: "cancel", label: "Cancel" },
      ],
      payload: { type: "door", door: hit.door },
    });
  }

  function onSceneryContextMenu(hit) {
    if (!hit?.placement) {
      closeMenu();
      return;
    }
    const { placement, screen } = hit;
    const { kind } = placement;
    const commands = (kind.commands || []).filter(Boolean);
    const items = [];
    if (nearestWalkable(nav, placement.tile)) {
      items.push({ id: "walk", label: "Walk here" });
    }
    for (const command of commands) {
      const id = command.toLowerCase() === "examine" ? "examine" : `cmd:${command}`;
      items.push({ id, label: `${command} ${kind.name}` });
    }
    if (!commands.some((command) => command.toLowerCase() === "examine")) {
      items.push({ id: "examine", label: `Examine ${kind.name}` });
    }
    items.push({ id: "cancel", label: "Cancel" });

    setMenu({
      x: screen.x,
      y: screen.y,
      title: kind.name,
      items,
      payload: { type: "scenery", placement },
    });
  }

  function inventoryActions(slot) {
    const item = slot.item;
    if (!item) return [];
    const actions = [];
    if (item.equip_slot) {
      actions.push({ id: "equip", label: `Equip ${item.name}` });
    }
    actions.push({ id: "drop", label: `Drop ${item.name}` });
    actions.push({ id: "examine", label: `Examine ${item.name}` });
    return actions;
  }

  function onInventoryHover(slot) {
    setItemOptions({
      slot,
      items: inventoryActions(slot),
    });
  }

  function onWorldHover(hit) {
    setWorldHover(hit);
  }

  const worldOptions = useMemo(() => {
    if (!worldHover) return null;
    if (worldHover.type === "rat" && !worldHover.rat?.dead) {
      return [{ id: "attack", label: "Attack Rat" }];
    }
    if (worldHover.type === "door") {
      const open = openDoorSet.has(worldHover.door.index);
      return [{ id: "door", label: open ? "Close Door" : "Open Door" }];
    }
    return null;
  }, [worldHover, openDoorSet]);

  async function onItemOption(actionId) {
    if (!itemOptions) return;
    const { slot } = itemOptions;
    setItemOptions(null);
    if (actionId === "equip") {
      await onEquip(slot.slot_index);
    } else if (actionId === "drop") {
      await onDrop(slot.slot_index, slot.item?.name);
    } else if (actionId === "examine") {
      setStatus(examineItem(slot.item, slot.quantity));
    }
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

    if (payload.type === "rat") {
      if (actionId === "attack") {
        attackRat(payload.rat);
      } else if (actionId === "examine") {
        setStatus(RAT_EXAMINE);
      }
      return;
    }

    if (payload.type === "door") {
      if (actionId === "toggle-door") toggleDoorway(payload.door);
      else if (actionId === "examine") setStatus(payload.door.description || "A wooden door.");
      return;
    }

    if (payload.type === "scenery") {
      if (actionId === "walk") {
        walkToScenery(payload.placement);
      } else if (actionId === "examine") {
        setStatus(payload.placement.kind.description || "Nothing interesting.");
      } else if (actionId.startsWith("cmd:")) {
        const command = actionId.slice(4);
        if (command === "Chop") {
          chopScenery(payload.placement);
        } else if (
          isTreasureChest(payload.placement) &&
          (command === "Search" || command.toLowerCase() === "open")
        ) {
          searchTreasureChest(payload.placement);
        } else if (command.toLowerCase() === "open" || command.toLowerCase() === "close") {
          toggleDoorScenery(payload.placement, command.toLowerCase());
        } else {
          setStatus("Nothing interesting happens.");
        }
      }
      return;
    }
  }

  async function onEquip(slotIndex) {
    try {
      const updated = await onTick(() => equipItem(slotIndex));
      setPlayer(updated);
      setStatus("Equipped.");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onDrop(slotIndex, itemName) {
    try {
      const updated = await onTick(() => dropItem(slotIndex));
      setPlayer(updated);
      setStatus(itemName ? `You drop the ${itemName}.` : "You drop the item.");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onUnequip(slot) {
    try {
      const updated = await onTick(() => unequipItem(slot));
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
        selectedTile={
          menu?.payload.type === "world"
            ? menu.payload.tile
            : menu?.payload.type === "scenery"
              ? menu.payload.placement.tile
              : null
        }
        scenery={scenery}
        openDoors={openDoorSet}
        equipmentIds={equippedItemIds(player.equipment)}
        rats={rats}
        hitsplats={hitsplats}
        playerFighting={playerFighting}
        onLoad={onLandscapeLoad}
        onSectors={onSectors}
        onTileClick={onTileClick}
        onTileContextMenu={onTileContextMenu}
        onSceneryClick={onSceneryClick}
        onSceneryContextMenu={onSceneryContextMenu}
        onDoorClick={onDoorClick}
        onDoorContextMenu={onDoorContextMenu}
        onRatClick={onRatClick}
        onRatContextMenu={onRatContextMenu}
        onHover={onWorldHover}
        attackClick={attackClick}
      />

      <div className="landscape-hud">
        <span className="landscape-region">{land?.name || "Loading region…"}</span>
        <span className="landscape-status">{status}</span>
        <button type="button" className="ghost-btn" onClick={logout}>
          Log out
        </button>
      </div>

      {(worldOptions || itemOptions) && (
        <div className={`rsc-item-options${worldOptions ? " rsc-item-options-label" : ""}`}>
          {(worldOptions || itemOptions.items).map((action) =>
            worldOptions ? (
              <span key={action.id}>{action.label}</span>
            ) : (
              <button key={action.id} type="button" onClick={() => onItemOption(action.id)}>
                {action.label}
              </button>
            ),
          )}
        </div>
      )}

      <aside className="rsc-sidebar">
        <div className="rsc-menu" onMouseLeave={() => setTab(null)}>
          <RscActionBar tab={tab} onTabChange={setTab} />

          {tab === "skills" && (
            <SkillsPanel skills={player.skills} totalLevel={player.total_level} />
          )}
          {tab === "inventory" && (
            <InventoryPanel
              inventory={player.inventory}
              onEquip={onEquip}
              onHover={onInventoryHover}
            />
          )}
          {tab === "equipment" && (
            <EquipmentPanel equipment={player.equipment} onUnequip={onUnequip} />
          )}
        </div>
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

      {chest && (
        <TreasureChestPanel
          chest={chest}
          onTake={onTakeFromChest}
          onClose={closeChest}
        />
      )}
    </main>
  );
}
