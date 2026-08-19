/**
 * Compose RSC player standing views with rsc-sprite-generator.
 * RSC only draws 5 unique yaws and mirrors the other 3 at runtime.
 *
 * Usage: node scripts/generate-player-sprites.cjs
 */
const fs = require("fs");
const path = require("path");

let spriteGenerator;
try {
  spriteGenerator = require("rsc-sprite-generator");
} catch {
  console.error(
    "rsc-sprite-generator is not installed. From the repo root:\n" +
      "  npm install --prefix frontend --save-dev file:../rsc-sprite-generator",
  );
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, "../public/sprites/player");
// One planted frame per unique yaw: S, SW, W, NW, N.
const STANDING_ANGLES = [0, 3, 6, 9, 12];

const APPEARANCE = {
  head: 0,
  body: 1,
  colours: { hair: 2, top: 8, legs: 14, skin: 0 },
  wielding: [],
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const angle of STANDING_ANGLES) {
    const canvas = await spriteGenerator.player({ ...APPEARANCE, angle });
    punchOutBlack(canvas);
    const file = path.join(OUT_DIR, `stand-${angle}.png`);
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
    console.log(`Wrote ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
