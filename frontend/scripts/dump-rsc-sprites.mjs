/**
 * Dump every sprite from RSC entity, media and texture archives to PNG.
 *
 * Usage: node scripts/dump-rsc-sprites.mjs
 *
 * Reads jag/mem files from frontend/cache/rsc/ and writes PNGs to
 * frontend/public/sprites/rsc/{entity,media,items,textures}/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@2003scape/rsc-config";
import { JagBuffer } from "../node_modules/@2003scape/rsc-sprites/node_modules/@2003scape/rsc-archiver/src/index.js";
import { EntitySprites, MediaSprites } from "@2003scape/rsc-sprites";
import SpriteArchive from "../node_modules/@2003scape/rsc-sprites/src/sprite-archive.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "cache", "rsc");
const OUT = path.join(ROOT, "public", "sprites", "rsc");

class TextureSprites extends SpriteArchive {
  constructor(textureDefs) {
    super();
    this.textureDefs = textureDefs;
  }

  loadArchive(buffer) {
    super.loadArchive(buffer);
    const indexData = new JagBuffer(this.archive.getEntry("index.dat"));
    for (const { name, subName } of this.textureDefs) {
      for (const entry of [name, subName]) {
        if (!entry || this.sprites.has(entry)) continue;
        try {
          const spriteData = new JagBuffer(this.archive.getEntry(`${entry}.dat`));
          this.sprites.set(entry, this.parseSprite(spriteData, indexData, 1));
        } catch {
          // Members/missing texture names are skipped.
        }
      }
    }
  }
}

function canvasToPng(canvas) {
  if (!canvas) return null;
  if (typeof canvas.toBuffer === "function") {
    return canvas.toBuffer("image/png");
  }
  if (typeof canvas.toDataURL === "function") {
    const url = canvas.toDataURL("image/png");
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  }
  throw new Error("Canvas has no PNG encoder");
}

function safeName(name) {
  return String(name || "unnamed")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_|_$/g, "") || "unnamed";
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePng(file, canvas) {
  const png = canvasToPng(canvas);
  if (!png) return false;
  mkdir(path.dirname(file));
  fs.writeFileSync(file, png);
  return true;
}

function dumpSpriteMap(dest, spriteMap) {
  let written = 0;
  for (const [name, value] of spriteMap.entries()) {
    const frames = Array.isArray(value) ? value : [value];
    const folder = path.join(dest, safeName(name));
    frames.forEach((canvas, index) => {
      if (!canvas) return;
      if (writePng(path.join(folder, `${index}.png`), canvas)) written += 1;
    });
  }
  return written;
}

function readCache(file) {
  const filePath = path.join(CACHE, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing cache file ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

async function dumpEntity(config) {
  const entity = new EntitySprites(config);
  await entity.init();
  entity.loadArchive(readCache("entity24.jag"));
  entity.loadArchive(readCache("entity24.mem"));
  const dest = path.join(OUT, "entity");
  mkdir(dest);
  const written = dumpSpriteMap(dest, entity.sprites);
  console.log(`entity: ${entity.sprites.size} animations, ${written} frames`);
  return written;
}

async function dumpMedia(config) {
  const media = new MediaSprites(config);
  await media.init();
  media.loadArchive(readCache("media58.jag"));
  const dest = path.join(OUT, "media");
  mkdir(dest);
  const written = dumpSpriteMap(dest, media.sprites);
  console.log(`media: ${media.sprites.size} sheets, ${written} frames`);

  const itemDir = path.join(OUT, "items");
  mkdir(itemDir);
  const manifest = [];
  let itemsWritten = 0;
  config.items.forEach((item, id) => {
    try {
      const canvas = media.getSpriteByItemID(id);
      const file = `${id}-${safeName(item.name)}.png`;
      if (writePng(path.join(itemDir, file), canvas)) {
        itemsWritten += 1;
        manifest.push({ id, name: item.name, file, sprite: item.sprite });
      }
    } catch (error) {
      console.warn(`item ${id} (${item.name}): ${error.message}`);
    }
  });
  fs.writeFileSync(path.join(itemDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`items: ${itemsWritten} colourized sprites`);
  return written + itemsWritten;
}

async function dumpTextures(config) {
  const textures = new TextureSprites(config.textures);
  await textures.init();
  textures.loadArchive(readCache("textures17.jag"));
  const dest = path.join(OUT, "textures");
  mkdir(dest);
  const written = dumpSpriteMap(dest, textures.sprites);
  console.log(`textures: ${textures.sprites.size} images, ${written} frames`);
  return written;
}

async function main() {
  mkdir(OUT);
  const config = new Config();
  await config.init();
  config.loadArchive(readCache("config85.jag"));

  const total =
    (await dumpEntity(config)) +
    (await dumpMedia(config)) +
    (await dumpTextures(config));

  console.log(`Wrote ${total} PNGs to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
