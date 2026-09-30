import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const equippedDir = path.join(rootDir, "public/sprites/player/equipped");

function playerSpritePlugin() {
  return {
    name: "player-equipped-sprites",
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || "/", "http://localhost");
          const match = url.pathname.match(/^\/sprites\/player\/equipped\/([0-9-]+)\/(\d+)\.png$/);
          if (!match) {
            next();
            return;
          }
          const wieldKey = match[1];
          const angle = Number(match[2]);
          const file = path.join(equippedDir, wieldKey, `${angle}.png`);
          try {
            if (!fs.existsSync(file)) {
              const { renderStandingSprite, STANDING_ANGLES } = require("./scripts/generate-player-sprites.cjs");
              const wielding = wieldKey.split("-").map(Number);
              fs.mkdirSync(path.dirname(file), { recursive: true });
              for (const frame of STANDING_ANGLES) {
                const png = await renderStandingSprite(frame, wielding);
                fs.writeFileSync(path.join(equippedDir, wieldKey, `${frame}.png`), png);
              }
            }
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Cache-Control", "no-cache");
            fs.createReadStream(file).pipe(res);
          } catch (error) {
            console.error("Player sprite generation failed:", error);
            res.statusCode = 500;
            res.end(String(error && error.message ? error.message : error));
          }
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), playerSpritePlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: process.env.SPRITE_SERVER
      ? {
          "/sprites/player/equipped": {
            target: process.env.SPRITE_SERVER,
            changeOrigin: true,
          },
        }
      : undefined,
  },
});
