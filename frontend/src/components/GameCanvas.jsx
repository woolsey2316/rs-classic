import { useEffect, useRef, useState } from "react";
import { useItemSprites } from "../game/itemSprites";

const TILE = 32;

const COLORS = {
  0: "#3f6b3a", // grass
  1: "#8a7a55", // path
  2: "#2f5f8a", // water
  3: "#2a4a28", // tree base shade
  4: "#6e6a63", // rock
  5: "#5a4636", // wall
  6: "#6d5a3c", // dirt
};

function drawTree(ctx, px, py) {
  ctx.fillStyle = "#4a3422";
  ctx.fillRect(px + 13, py + 18, 6, 12);
  ctx.fillStyle = "#1f5c28";
  ctx.beginPath();
  ctx.moveTo(px + 16, py + 4);
  ctx.lineTo(px + 28, py + 22);
  ctx.lineTo(px + 4, py + 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2f7a38";
  ctx.beginPath();
  ctx.arc(px + 16, py + 14, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx, px, py) {
  ctx.fillStyle = "#8a8680";
  ctx.beginPath();
  ctx.moveTo(px + 6, py + 22);
  ctx.lineTo(px + 10, py + 10);
  ctx.lineTo(px + 22, py + 8);
  ctx.lineTo(px + 28, py + 20);
  ctx.lineTo(px + 18, py + 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#a8a49c";
  ctx.fillRect(px + 12, py + 12, 8, 5);
}

function drawPlayer(ctx, px, py, facing) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 28, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3b6ea5";
  ctx.fillRect(px + 10, py + 12, 12, 12);

  ctx.fillStyle = "#e0b089";
  ctx.beginPath();
  ctx.arc(px + 16, py + 9, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(px + 10, py + 24, 4, 6);
  ctx.fillRect(px + 18, py + 24, 4, 6);

  ctx.fillStyle = "#f4e6c3";
  if (facing === "right") ctx.fillRect(px + 20, py + 8, 3, 2);
  if (facing === "left") ctx.fillRect(px + 9, py + 8, 3, 2);
  if (facing === "down") ctx.fillRect(px + 15, py + 11, 2, 3);
  if (facing === "up") ctx.fillRect(px + 15, py + 4, 2, 3);
}

function drawGroundItem(ctx, ground, img, px, py) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 26, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (img) {
    ctx.drawImage(img, px + 2, py + 2, 28, 28);
    return;
  }

  ctx.fillStyle = ground.item?.color || "#c4a574";
  ctx.beginPath();
  ctx.arc(px + 16, py + 18, 5, 0, Math.PI * 2);
  ctx.fill();
}

export default function GameCanvas({
  world,
  playerPos,
  facing,
  onTileClick,
  onTileContextMenu,
  destination,
}) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const groundItems = world?.ground_items || [];
  const sprites = useItemSprites(groundItems.map((g) => g.item));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    const width = world.width * TILE;
    const height = world.height * TILE;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y][x];
        const px = x * TILE;
        const py = y * TILE;
        ctx.fillStyle = COLORS[tile] ?? "#333";
        ctx.fillRect(px, py, TILE, TILE);

        if (tile === 0 && (x + y) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.03)";
          ctx.fillRect(px, py, TILE, TILE);
        }

        if (tile === 2) {
          ctx.fillStyle = "rgba(180,220,255,0.15)";
          ctx.fillRect(px + 4, py + 8, 10, 3);
        }
        if (tile === 3) drawTree(ctx, px, py);
        if (tile === 4) drawRock(ctx, px, py);
        if (tile === 5) {
          ctx.fillStyle = "#3d2e22";
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        }
      }
    }

    for (const ground of groundItems) {
      const px = ground.x * TILE;
      const py = ground.y * TILE;
      drawGroundItem(ctx, ground, sprites[ground.item?.sprite], px, py);
    }

    if (destination) {
      ctx.strokeStyle = "rgba(244, 214, 120, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        destination.x * TILE + 4,
        destination.y * TILE + 4,
        TILE - 8,
        TILE - 8,
      );
    }

    if (hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(hover.x * TILE + 1, hover.y * TILE + 1, TILE - 2, TILE - 2);
    }

    drawPlayer(ctx, playerPos.x * TILE, playerPos.y * TILE, facing);

    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= world.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE, 0);
      ctx.lineTo(x * TILE, height);
      ctx.stroke();
    }
    for (let y = 0; y <= world.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE);
      ctx.lineTo(width, y * TILE);
      ctx.stroke();
    }
  }, [world, playerPos, facing, destination, hover, groundItems, sprites]);

  function tileFromEvent(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / TILE);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / TILE);
    return { x, y };
  }

  function inBounds(tile) {
    return (
      world &&
      tile.x >= 0 &&
      tile.y >= 0 &&
      tile.x < world.width &&
      tile.y < world.height
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      onClick={(e) => {
        const tile = tileFromEvent(e);
        if (!inBounds(tile)) return;
        onTileClick?.(tile);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const tile = tileFromEvent(e);
        if (!inBounds(tile)) return;
        onTileContextMenu?.({
          tile,
          clientX: e.clientX,
          clientY: e.clientY,
          tileId: world.tiles[tile.y][tile.x],
          groundItem: groundItems.find((g) => g.x === tile.x && g.y === tile.y) || null,
        });
      }}
      onMouseMove={(e) => {
        const tile = tileFromEvent(e);
        if (!inBounds(tile)) {
          setHover(null);
          return;
        }
        setHover((prev) =>
          prev && prev.x === tile.x && prev.y === tile.y ? prev : tile,
        );
      }}
      onMouseLeave={() => setHover(null)}
    />
  );
}
