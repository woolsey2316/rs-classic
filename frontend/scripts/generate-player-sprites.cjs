/**
 * Compose RSC player standing views with rsc-sprite-generator.
 * RSC only draws 5 unique yaws and mirrors the other 3 at runtime.
 *
 * This file does not run when a player equips an item. The Vite dev server
 * calls `renderStandingSprite` for the ids the character is wearing. A bare
 * `node scripts/generate-player-sprites.cjs` writes the unequipped fallbacks.
 *
 * Usage:
 *   node scripts/generate-player-sprites.cjs
 *   node scripts/generate-player-sprites.cjs 8,66
 */
const fs = require("fs");
const path = require("path");

let spriteGenerator;
function loadGenerator() {
  const candidates = [
    "rsc-sprite-generator",
    "/rsc-sprite-generator",
    "/opt/src",
    path.resolve(__dirname, "../../rsc-sprite-generator"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try the next location
    }
  }
  return null;
}
spriteGenerator = loadGenerator();

const OUT_DIR = path.resolve(__dirname, "../public/sprites/player");
const STANDING_ANGLES = [0, 3, 6, 9, 12];

const APPEARANCE = {
  head: 0,
  body: 1,
  colours: { hair: 2, top: 8, legs: 14, skin: 0 },
};

function punchOutBlack(canvas) {
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i] === 0 && pixels.data[i + 1] === 0 && pixels.data[i + 2] === 0) {
      pixels.data[i + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);
}

function knownWieldable() {
  if (!spriteGenerator) return null;
  const roots = [];
  try {
    roots.push(path.dirname(require.resolve("rsc-sprite-generator")));
  } catch {
    // not installed as a package
  }
  roots.push("/rsc-sprite-generator", "/opt/src", path.resolve(__dirname, "../../rsc-sprite-generator"));
  for (const root of roots) {
    try {
      return require(path.join(root, "res/definitions")).wieldable;
    } catch {
      // try the next location
    }
  }
  return null;
}

function wieldableIds(ids) {
  const known = knownWieldable();
  const numeric = [...new Set(ids.map(Number))].filter((id) => Number.isInteger(id));
  if (!known) return numeric;
  return numeric.filter((id) => known[id] || known[String(id)]);
}

async function renderStandingSprite(angle, wielding = []) {
  if (!spriteGenerator) {
    throw new Error("rsc-sprite-generator is not installed");
  }
  const canvas = await spriteGenerator.player({
    ...APPEARANCE,
    wielding: wieldableIds(wielding),
    angle,
  });
  punchOutBlack(canvas);
  return canvas.toBuffer("image/png");
}

async function main(wielding = []) {
  if (!spriteGenerator) {
    console.error(
      "rsc-sprite-generator is not installed. From the repo root:\n" +
        "  npm install --prefix frontend --save-dev file:../rsc-sprite-generator",
    );
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const angle of STANDING_ANGLES) {
    const png = await renderStandingSprite(angle, wielding);
    const suffix = wielding.length ? `-w${[...wielding].sort((a, b) => a - b).join("-")}` : "";
    const file = path.join(OUT_DIR, `stand-${angle}${suffix}.png`);
    fs.writeFileSync(file, png);
    console.log(`Wrote ${file}`);
  }
}

module.exports = {
  APPEARANCE,
  STANDING_ANGLES,
  renderStandingSprite,
  wieldableIds,
};

if (require.main === module) {
  const wielding = (process.argv[2] || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id));
  if (process.argv[2] === "--serve") {
    const http = require("http");
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        const match = url.pathname.match(/^\/sprites\/player\/equipped\/([0-9-]+)\/(\d+)\.png$/);
        if (!match) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        const wieldingIds = match[1].split("-").map(Number);
        const angle = Number(match[2]);
        const dir = path.join(OUT_DIR, "equipped", match[1]);
        fs.mkdirSync(dir, { recursive: true });
        for (const frame of STANDING_ANGLES) {
          const target = path.join(dir, `${frame}.png`);
          if (!fs.existsSync(target)) {
            fs.writeFileSync(target, await renderStandingSprite(frame, wieldingIds));
          }
        }
        res.setHeader("Content-Type", "image/png");
        res.end(fs.readFileSync(path.join(dir, `${angle}.png`)));
      } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.end(String(error && error.message ? error.message : error));
      }
    });
    const port = Number(process.env.PLAYER_SPRITE_PORT || 5174);
    server.listen(port, "0.0.0.0", () => {
      console.log(`Player sprite server listening on ${port}`);
    });
  } else {
    main(wielding).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
