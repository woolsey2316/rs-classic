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

function firstCanvas(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function overlayTransparent(r, g, b, a) {
  if (a === 0) return true;
  // RSC combines name + subName using bright green as the knock-out colour.
  return r === 0 && g === 255 && b === 0;
}

function compositeTexture(archive, def) {
  const base = firstCanvas(archive.sprites.get(def.name));
  if (!base) return null;
  const width = base.width;
  const height = base.height;
  const canvas = archive.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  archive.drawImage(canvas, base, 0, 0, width, height);

  if (!def.subName) return canvas;
  const overlay = firstCanvas(archive.sprites.get(def.subName));
  if (!overlay) return canvas;

  const src = overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height);
  const dst = ctx.getImageData(0, 0, width, height);
  const ow = overlay.width;
  const oh = overlay.height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const si = ((y % oh) * ow + (x % ow)) * 4;
      const r = src.data[si];
      const g = src.data[si + 1];
      const b = src.data[si + 2];
      const a = src.data[si + 3];
      if (overlayTransparent(r, g, b, a)) continue;
      const di = (y * width + x) * 4;
      dst.data[di] = r;
      dst.data[di + 1] = g;
      dst.data[di + 2] = b;
      dst.data[di + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  return canvas;
}

// mudclient stores textures row-major, but samples them with transposed indexing
// (see Scene.setTexturePixels). Three.js flipY + our wall UVs also invert V.
function prepareSceneTexture(archive, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const src = canvas.getContext("2d").getImageData(0, 0, width, height);
  const out = archive.createCanvas(width, height);
  const ctx = out.getContext("2d");
  const dst = ctx.createImageData(width, height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const si = (x * width + (height - 1 - y)) * 4;
      const di = (y * width + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}

function dumpLandscapeDefs(config) {
  const defs = {
    textures: config.textures.map((texture, id) => ({
      id,
      name: texture.name,
      subName: texture.subName || "",
      file: `id/${id}.png`,
    })),
    wallKinds: [
      null,
      ...config.wallObjects.map((wall) => ({
        name: wall.name,
        height: wall.height,
        texture: wall.textureFront,
        colour: wall.colourFront,
        invisible: !!wall.invisible,
        blocked: !!wall.blocked,
      })),
    ],
    tileKinds: [
      { name: "Grass", texture: null, colour: null, type: "ground" },
      ...config.tiles.map((tile, index) => ({
        name: tile.type || `overlay ${index + 1}`,
        texture: tile.texture,
        colour: tile.colour,
        type: tile.type,
      })),
    ],
    roofKinds: [
      null,
      ...config.roofs.map((roof) => ({
        height: roof.height,
        texture: roof.texture,
      })),
    ],
  };
  const dest = path.join(ROOT, "public", "landscape");
  mkdir(dest);
  fs.writeFileSync(path.join(dest, "defs.json"), JSON.stringify(defs));
  return defs;
}

async function dumpTextures(config) {
  const textures = new TextureSprites(config.textures);
  await textures.init();
  textures.loadArchive(readCache("textures17.jag"));
  const dest = path.join(OUT, "textures");
  mkdir(dest);
  let written = dumpSpriteMap(dest, textures.sprites);
  console.log(`textures: ${textures.sprites.size} images, ${written} frames`);

  const idDir = path.join(dest, "id");
  mkdir(idDir);
  let composited = 0;
  config.textures.forEach((def, id) => {
    try {
      const canvas = compositeTexture(textures, def);
      const sceneCanvas = canvas ? prepareSceneTexture(textures, canvas) : null;
      if (sceneCanvas && writePng(path.join(idDir, `${id}.png`), sceneCanvas)) {
        composited += 1;
      }
    } catch (error) {
      console.warn(`texture ${id} (${def.name}): ${error.message}`);
    }
  });
  console.log(`textures/id: ${composited} composited`);
  dumpLandscapeDefs(config);
  console.log("Wrote public/landscape/defs.json");
  return written + composited;
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
