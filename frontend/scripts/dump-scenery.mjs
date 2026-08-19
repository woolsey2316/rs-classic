/**
 * Export RSC scenery definitions and world locations for Django seeding.
 *
 * Usage: node scripts/dump-scenery.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@2003scape/rsc-config";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "cache", "rsc");
const LOCS = path.join(ROOT, "src", "landscape", "object-locs.json");
const OUT_DIR = path.resolve(ROOT, "../backend/game/data");

async function main() {
  const config = new Config();
  await config.init();
  config.loadArchive(fs.readFileSync(path.join(CACHE, "config85.jag")));

  const kinds = config.objects.map((object, id) => ({
    id,
    name: object.name,
    description: object.description || "",
    commands: object.commands || [],
    model: object.model?.name || "",
    width: object.width || 1,
    height: object.height || 1,
    type: object.type || "unblocked",
    item_height: object.itemHeight || 0,
  }));

  const locs = JSON.parse(fs.readFileSync(LOCS, "utf8")).map((loc) => ({
    kind: loc.id,
    x: loc.position[0],
    y: loc.position[1],
    direction: loc.direction ?? 0,
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "scenery_kinds.json"), JSON.stringify(kinds));
  fs.writeFileSync(path.join(OUT_DIR, "scenery_locs.json"), JSON.stringify(locs));
  console.log(`Wrote ${kinds.length} kinds and ${locs.length} locations to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
