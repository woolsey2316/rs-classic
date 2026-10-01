/**
 * Assemble every RSC NPC from the entity sprites.
 *
 * Usage: node scripts/dump-npc-sprites.mjs
 *
 * Writes public/sprites/rsc/npc/<id>/<angle>.png. Angle 0 is facing the camera,
 * then around the character, with the last frames the combat swing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@2003scape/rsc-config";
import { EntitySprites } from "@2003scape/rsc-sprites";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "cache", "rsc");
const OUT = path.join(ROOT, "public", "sprites", "rsc", "npc");

function canvasToPng(canvas) {
  if (!canvas) return null;
  if (typeof canvas.toBuffer === "function") return canvas.toBuffer("image/png");
  const url = canvas.toDataURL("image/png");
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

function readCache(file) {
  const filePath = path.join(CACHE, file);
  if (!fs.existsSync(filePath)) throw new Error(`Missing cache file ${filePath}`);
  return fs.readFileSync(filePath);
}

async function main() {
  const config = new Config();
  await config.init();
  config.loadArchive(readCache("config85.jag"));

  const entity = new EntitySprites(config);
  await entity.init();
  entity.loadArchive(readCache("entity24.jag"));
  entity.loadArchive(readCache("entity24.mem"));

  fs.mkdirSync(OUT, { recursive: true });
  const quiet = console.log;
  console.log = () => {};

  const index = [];
  let written = 0;
  let failed = 0;
  for (let id = 0; id < config.npcs.length; id += 1) {
    const npc = config.npcs[id];
    try {
      const frames = entity.getSpritesByNPCID(id);
      const dir = path.join(OUT, String(id));
      fs.mkdirSync(dir, { recursive: true });
      frames.forEach((canvas, angle) => {
        const png = canvasToPng(canvas);
        if (!png) return;
        fs.writeFileSync(path.join(dir, `${angle}.png`), png);
        written += 1;
      });
      index.push({
        id,
        name: npc.name,
        description: npc.description,
        frames: frames.length,
      });
    } catch (error) {
      failed += 1;
      index.push({ id, name: npc.name, error: error.message });
    }
    if (id % 100 === 0) quiet(`npc ${id}/${config.npcs.length}`);
  }

  console.log = quiet;
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
  const ok = index.filter((entry) => !entry.error).length;
  console.log(`Wrote ${written} frames for ${ok} NPCs (${failed} missing animations)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
