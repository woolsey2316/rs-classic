import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fromGameCoords } from "../game/landscapeGrid";
import {
  buildDoorMeshes,
  buildFloorMeshes,
  buildRoofMeshes,
  buildWallMeshes,
  collectTextureIds,
  loadRscTextures,
} from "../game/landscapeMeshes";
import { TICK_MS } from "../game/tick";
import {
  PLAYER_SPRITE_ANGLES,
  PLAYER_SPRITE_SIZE,
  playerSpriteUrl,
  equippedSpriteUrl,
  spriteViewFromCamera,
} from "../game/playerSprite";
import { FIGHT_FRAMES } from "../game/rats";
import { createSceneryKit, makeSceneryMesh } from "../game/sceneryMeshes";
import {
  clickIconFrame,
  clickIconUrl,
} from "../game/clickIndicator";

function colourAt(data, index) {
  const [r, g, b] = data.palette[data.colours[index]] || [60, 90, 45];
  return [r / 255, g / 255, b / 255];
}

function heightAt(data, x, z) {
  const clampedX = Math.max(0, Math.min(data.width - 1, x));
  const clampedZ = Math.max(0, Math.min(data.depth - 1, z));
  return data.heights[clampedZ * data.width + clampedX] * data.heightScale;
}

function buildTerrain(data) {
  const positions = [];
  const colours = [];
  const indices = [];
  let vertex = 0;

  for (let z = 0; z < data.depth; z += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const tileIndex = z * data.width + x;
      const colour = colourAt(data, tileIndex);
      const h00 = heightAt(data, x, z);
      const h10 = heightAt(data, x + 1, z);
      const h01 = heightAt(data, x, z + 1);
      const h11 = heightAt(data, x + 1, z + 1);

      positions.push(
        x, h00, z,
        x + 1, h10, z,
        x, h01, z + 1,
        x + 1, h11, z + 1,
      );

      // Four independent vertices per tile preserve RSC's tile colours.
      for (let i = 0; i < 4; i += 1) colours.push(...colour);
      indices.push(vertex, vertex + 2, vertex + 1);
      indices.push(vertex + 1, vertex + 2, vertex + 3);
      vertex += 4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colours, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildWalls(data) {
  const positions = [];
  const wallHeight = 1.8;

  for (const [x1, z1, x2, z2, elevation] of data.walls) {
    const base = elevation * data.heightScale + 0.05;
    positions.push(
      x1, base, z1,
      x2, base, z2,
      x1, base, z1,
      x1, base + wallHeight, z1,
      x2, base, z2,
      x2, base + wallHeight, z2,
      x1, base + wallHeight, z1,
      x2, base + wallHeight, z2,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

function addMeshes(scene, resources, meshes) {
  for (const mesh of meshes) {
    scene.add(mesh);
    resources.push(mesh.geometry);
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => resources.push(material));
    } else {
      resources.push(mesh.material);
    }
  }
}

const PLAYER_HEIGHT = 1.35;

const walkUniforms = {
  uTime: { value: 0 },
  uWalk: { value: 0 },
};

function spriteMaterial(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

function playerSpriteMaterial(texture) {
  const material = spriteMaterial(texture);
  material.customProgramCacheKey = () => "player-walk";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = walkUniforms.uTime;
    shader.uniforms.uWalk = walkUniforms.uWalk;
    shader.fragmentShader =
      "uniform float uTime;\nuniform float uWalk;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec2 walkUv = vMapUv;
          float stride = sin(uTime * 11.0) * uWalk;
          if (walkUv.y < 0.36) {
            float leg = walkUv.x < 0.5 ? stride : -stride;
            walkUv.y -= leg * 0.03;
          } else if (walkUv.y < 0.74) {
            float edge = 1.0 - smoothstep(0.05, 0.38, min(walkUv.x, 1.0 - walkUv.x));
            float arm = walkUv.x < 0.5 ? stride : -stride;
            walkUv.y += arm * 0.0275 * edge;
          }
          vec4 sampledDiffuseColor = texture2D(map, walkUv);
          diffuseColor *= sampledDiffuseColor;
        #endif
        `,
      );
  };
  return material;
}

function flippedTexture(texture) {
  const clone = texture.clone();
  clone.wrapS = THREE.RepeatWrapping;
  clone.repeat.x = -1;
  clone.offset.x = 1;
  clone.needsUpdate = true;
  return clone;
}

function makePlayerMarker(textures) {
  const group = new THREE.Group();
  const materials = {};
  const extraTextures = [];
  for (const angle of PLAYER_SPRITE_ANGLES) {
    materials[angle] = playerSpriteMaterial(textures[angle]);
    const flipped = flippedTexture(textures[angle]);
    extraTextures.push(flipped);
    materials[`${angle}-flip`] = playerSpriteMaterial(flipped);
  }

  const sprite = new THREE.Sprite(materials[0]);
  sprite.center.set(0.5, 0);
  sprite.scale.set(
    PLAYER_HEIGHT * (PLAYER_SPRITE_SIZE.width / PLAYER_SPRITE_SIZE.height),
    PLAYER_HEIGHT,
    1,
  );
  sprite.renderOrder = 1000;
  group.renderOrder = 1000;

  group.add(sprite);
  group.userData = { sprite, materials, extraTextures, viewKey: "" };
  return group;
}

function loadPlayerTextures(itemIds = []) {
  const loader = new THREE.TextureLoader();
  const loadAngle = (angle, url) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (texture) => resolve(texture),
        undefined,
        () => resolve(null),
      );
    });

  return Promise.all(
    PLAYER_SPRITE_ANGLES.map(async (angle) => {
      const equipped = itemIds.length ? await loadAngle(angle, equippedSpriteUrl(angle, itemIds)) : null;
      const texture = equipped || (await loadAngle(angle, playerSpriteUrl(angle)));
      return [angle, texture];
    }),
  ).then((entries) => Object.fromEntries(entries.filter(([, texture]) => texture)));
}

function applyPlayerTextures(player, textures) {
  const { sprite, materials, extraTextures } = player.userData;
  extraTextures.forEach((texture) => texture.dispose());
  extraTextures.length = 0;
  for (const angle of PLAYER_SPRITE_ANGLES) {
    const current = materials[angle];
    if (current?.map && current.map !== textures[angle]) current.map.dispose();
    materials[angle]?.dispose();
    materials[`${angle}-flip`]?.dispose();
    if (!textures[angle]) continue;
    materials[angle] = playerSpriteMaterial(textures[angle]);
    const flipped = flippedTexture(textures[angle]);
    extraTextures.push(flipped);
    materials[`${angle}-flip`] = playerSpriteMaterial(flipped);
  }
  player.userData.viewKey = "";
  if (materials[0]) sprite.material = materials[0];
}

function updatePlayerSprite(player, camera) {
  const { sprite, materials } = player.userData;
  if (!sprite) return;
  const view = spriteViewFromCamera(player.userData.facing, {
    x: camera.position.x - player.position.x,
    z: camera.position.z - player.position.z,
  });
  const key = `${view.angle}:${view.flip}`;
  if (player.userData.viewKey === key) return;
  player.userData.viewKey = key;
  sprite.material = materials[view.flip ? `${view.angle}-flip` : view.angle];
}

const RAT_HEIGHT = 0.55;
const RAT_FRAMES = 18;

function ratFrame(facing, cameraOffset, moving, step) {
  const view = spriteViewFromCamera(facing, cameraOffset);
  const frame = view.octant * 2 + (moving && step % 2 ? 1 : 0);
  return frame % RAT_FRAMES;
}

function loadRatTextures() {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    Array.from({ length: RAT_FRAMES }, (_, frame) =>
      new Promise((resolve) => {
        loader.load(
          `/sprites/rsc/entity/rat/${frame}.png`,
          (texture) => {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
            resolve(texture);
          },
          undefined,
          () => resolve(null),
        );
      }),
    ),
  );
}

function updateRats(view, rats, now) {
  const group = view.ratsGroup;
  if (!group || !view.ratTextures) return;
  const motions = view.ratMotions || (view.ratMotions = new Map());
  const seen = new Set();
  for (const rat of rats || []) {
    seen.add(rat.id);
    let sprite = group.getObjectByName(`rat-${rat.id}`);
    if (!sprite) {
      const material = spriteMaterial(view.ratTextures[0] || view.ratTextures.find(Boolean));
      if (!material) continue;
      sprite = new THREE.Sprite(material);
      sprite.name = `rat-${rat.id}`;
      sprite.center.set(0.5, 0);
      sprite.scale.set(RAT_HEIGHT * 1.15, RAT_HEIGHT, 1);
      sprite.renderOrder = 900;
      sprite.userData.ratId = rat.id;
      group.add(sprite);
      motions.set(rat.id, {
        display: new THREE.Vector3(rat.x + 0.5, 0, rat.z + 0.5),
        from: null,
        goal: { x: rat.x, z: rat.z },
        startedAt: null,
      });
    }
    const motion = motions.get(rat.id);
    const y = heightAt(view.data, rat.x, rat.z);
    if (motion.goal.x !== rat.x || motion.goal.z !== rat.z) {
      motion.from = motion.display.clone();
      motion.goal = { x: rat.x, z: rat.z };
      motion.startedAt = now;
    }
    let shown = motion.display;
    if (motion.from && motion.startedAt != null) {
      const t = smoothStep((now - motion.startedAt) / TICK_MS);
      shown = motion.display.lerpVectors(
        motion.from,
        new THREE.Vector3(motion.goal.x + 0.5, y, motion.goal.z + 0.5),
        t,
      );
      if (t >= 1) motion.from = null;
    } else {
      shown.set(rat.x + 0.5, y, rat.z + 0.5);
    }
    sprite.position.copy(shown);
    sprite.userData.rat = rat;
    sprite.visible = !rat.dead;
    if (rat.dead) continue;
    let frame;
    let texture;
    if (rat.fighting) {
      const swing = FIGHT_FRAMES[Math.floor(now / 200) % FIGHT_FRAMES.length];
      const toPlayer = new THREE.Vector3().subVectors(view.player.position, shown);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(view.camera.quaternion);
      const flip = toPlayer.dot(right) < 0;
      frame = swing;
      texture = flip ? view.ratFightFlip?.[swing] : view.ratTextures[swing];
    } else {
      frame = ratFrame(
        rat.facing,
        {
          x: view.camera.position.x - shown.x,
          z: view.camera.position.z - shown.z,
        },
        rat.moving,
        rat.step,
      );
      texture = view.ratTextures[frame];
    }
    if (texture && sprite.material.map !== texture) {
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
    }
  }
  for (const child of [...group.children]) {
    if (!seen.has(child.userData.ratId)) group.remove(child);
  }
}

function ratUnderPointer(ratsGroup, camera, rect, event) {
  if (!ratsGroup) return null;
  const point = new THREE.Vector3();
  let closest = null;
  let closestDist = 36;
  for (const sprite of ratsGroup.children) {
    if (!sprite.userData?.rat || sprite.userData.rat.dead || !sprite.visible) continue;
    point.copy(sprite.position);
    point.y += RAT_HEIGHT * 0.55;
    point.project(camera);
    if (point.z < -1 || point.z > 1) continue;
    const sx = (point.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-point.y * 0.5 + 0.5) * rect.height + rect.top;
    const dist = Math.hypot(sx - event.clientX, sy - event.clientY);
    if (dist < closestDist) {
      closestDist = dist;
      closest = sprite.userData.rat;
    }
  }
  return closest;
}

const SPLAT_LIFE = 1200;
const splatTextureCache = new Map();

function splatTexture(images, damage) {
  const kind = damage > 0 ? 0 : 1;
  const image = images?.[kind];
  if (!image?.width) return null;
  const key = `${kind}:${damage}`;
  const cached = splatTextureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${damage > 9 ? 9 : 11}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(damage), canvas.width / 2, canvas.height / 2 + 0.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  splatTextureCache.set(key, texture);
  return texture;
}

function loadSplatImages() {
  return Promise.all(
    [0, 1].map(
      (frame) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = `/sprites/rsc/media/splat/${frame}.png`;
        }),
    ),
  );
}

function updateSplats(view, splats, now) {
  const group = view.splatGroup;
  if (!group || !view.splatImages) return;
  const seen = new Set();
  for (const splat of splats || []) {
    const age = now - splat.born;
    if (age < 0 || age > SPLAT_LIFE) continue;
    const texture = splatTexture(view.splatImages, splat.damage);
    if (!texture) continue;
    seen.add(splat.id);
    let sprite = group.getObjectByName(`splat-${splat.id}`);
    if (!sprite) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      sprite = new THREE.Sprite(material);
      sprite.name = `splat-${splat.id}`;
      sprite.center.set(0.5, 0.5);
      sprite.scale.set(0.48, 0.48, 1);
      sprite.renderOrder = 1100;
      group.add(sprite);
    }
    const rise = (age / SPLAT_LIFE) * 0.45;
    if (splat.target === "player") {
      const pos = view.player.position;
      sprite.position.set(pos.x, pos.y + PLAYER_HEIGHT + 0.12 + rise, pos.z);
    } else {
      const ratSprite = view.ratsGroup?.getObjectByName(`rat-${splat.ratId}`);
      if (!ratSprite) continue;
      sprite.position.set(
        ratSprite.position.x,
        ratSprite.position.y + RAT_HEIGHT + 0.18 + rise,
        ratSprite.position.z,
      );
    }
    const fadeAt = SPLAT_LIFE * 0.65;
    sprite.material.opacity = age > fadeAt ? 1 - (age - fadeAt) / (SPLAT_LIFE - fadeAt) : 1;
  }
  for (const child of [...group.children]) {
    const id = Number(String(child.name).slice(6));
    if (!seen.has(id)) {
      child.material.dispose();
      group.remove(child);
    }
  }
}

function loadClickIconTextures() {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    [0, 1, 2, 3].map(
      (frame) =>
        new Promise((resolve, reject) => {
          loader.load(
            clickIconUrl(frame),
            (texture) => {
              texture.magFilter = THREE.NearestFilter;
              texture.minFilter = THREE.NearestFilter;
              texture.colorSpace = THREE.SRGBColorSpace;
              resolve(texture);
            },
            undefined,
            () => reject(new Error(`Failed to load ${clickIconUrl(frame)}`)),
          );
        }),
    ),
  );
}

function makeClickIndicator(textures) {
  const materials = textures.map(
    (texture) =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
  );
  const sprite = new THREE.Sprite(materials[0]);
  sprite.center.set(0.5, 0.5);
  sprite.scale.set(0.3, 0.3, 1);
  sprite.renderOrder = 4;
  sprite.visible = false;
  return { sprite, materials };
}

function updateClickIndicator(indicator, data, animation, now) {
  if (!indicator || !animation) {
    if (indicator) indicator.sprite.visible = false;
    return false;
  }
  const frame = clickIconFrame(now - animation.startedAt);
  if (frame < 0) {
    indicator.sprite.visible = false;
    return false;
  }
  indicator.sprite.visible = true;
  indicator.sprite.material = indicator.materials[frame];
  indicator.sprite.position.set(
    animation.x + 0.5,
    heightAt(data, animation.x, animation.z) + 0.14,
    animation.z + 0.5,
  );
  return true;
}

function smoothStep(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function followPlayerWithCamera(view, displayPosition) {
  if (!displayPosition || !view?.controls || !view?.camera) return;
  const nextTarget = displayPosition.clone();
  if (view.cameraFollowTarget) {
    cameraDelta.subVectors(nextTarget, view.cameraFollowTarget);
    view.camera.position.add(cameraDelta);
  }
  view.controls.target.copy(nextTarget);
  view.cameraFollowTarget = nextTarget;
}

const cameraDelta = new THREE.Vector3();

function updatePlayerMotion(view, now) {
  const motion = view.playerMotion;
  if (!motion?.goal) return;
  const { player } = view;

  let shown = motion.goal;
  if (motion.from && motion.startedAt != null) {
    const t = smoothStep((now - motion.startedAt) / TICK_MS);
    motion.display.lerpVectors(motion.from, motion.goal, t);
    if (t >= 1) motion.from = null;
    shown = motion.display;
  }
  player.position.copy(shown);
  player.visible = true;
  followPlayerWithCamera(view, shown);
  updateNearbyRoofs(view, shown.x, shown.z);
  walkUniforms.uTime.value = now * 0.001;
  walkUniforms.uWalk.value = motion.from || view.playerFighting ? 1 : 0;
}

const ROOF_HIDE_TILES = 1;

function updateNearbyRoofs(view, x, z) {
  const roofs = view.roofs;
  if (!roofs?.length) return;
  const tileX = Math.floor(x);
  const tileZ = Math.floor(z);
  if (view.roofFocusX === tileX && view.roofFocusZ === tileZ) return;
  view.roofFocusX = tileX;
  view.roofFocusZ = tileZ;
  for (const mesh of roofs) {
    const tiles = mesh.userData.roofTiles;
    mesh.visible = !tiles?.some(
      (tile) =>
        Math.max(Math.abs(tile.x - tileX), Math.abs(tile.z - tileZ)) <= ROOF_HIDE_TILES,
    );
  }
}

/**
 * Renders the exported RSC region. Pointer events are resolved by raycasting
 * scenery first, then the terrain mesh. Tile callbacks receive landscape
 * coordinates (`{x, z}`); scenery callbacks receive the placement, kind, and
 * tile. `screen` is passed so callers can position a menu at the cursor.
 */
export default function Landscape3D({
  src = "/landscape/lumbridge-3d.json",
  playerPos = null,
  playerFacing = { x: 0, z: 1 },
  destination = null,
  selectedTile = null,
  scenery = null,
  openDoors = null,
  equipmentIds = [],
  rats = [],
  hitsplats = [],
  playerFighting = false,
  onLoad,
  onTileClick,
  onTileContextMenu,
  onSceneryClick,
  onSceneryContextMenu,
  onDoorClick,
  onDoorContextMenu,
  onRatClick,
  onRatContextMenu,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const handlersRef = useRef({});
  const ratsRef = useRef(rats);
  ratsRef.current = rats;
  const splatsRef = useRef(hitsplats);
  splatsRef.current = hitsplats;
  const fightingRef = useRef(playerFighting);
  fightingRef.current = playerFighting;
  const [message, setMessage] = useState("Loading RSC landscape…");
  const [ready, setReady] = useState(0);

  handlersRef.current = {
    onLoad,
    onTileClick,
    onTileContextMenu,
    onSceneryClick,
    onSceneryContextMenu,
    onDoorClick,
    onDoorContextMenu,
    onRatClick,
    onRatContextMenu,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let frame = 0;
    let renderer;
    let controls;
    let detachPointer = () => {};
    const resources = [];

    async function start() {
      try {
        const [landResponse, defsResponse] = await Promise.all([
          fetch(src),
          fetch("/landscape/defs.json"),
        ]);
        if (!landResponse.ok) throw new Error(`Landscape request failed (${landResponse.status})`);
        const data = await landResponse.json();
        const defs = defsResponse.ok ? await defsResponse.json() : null;
        if (disposed) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x8bb9d9);
        scene.fog = new THREE.Fog(0x8bb9d9, 150, 300);

        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
        const spawnX = data.spawn?.x ?? data.width / 2;
        const spawnZ = data.spawn?.z ?? data.depth / 2;
        camera.position.set(spawnX + 58, 88, spawnZ + 72);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        host.replaceChildren(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(
          spawnX,
          heightAt(data, Math.floor(spawnX), Math.floor(spawnZ)),
          spawnZ,
        );
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 4;
        controls.maxDistance = 180;
        controls.maxPolarAngle = Math.PI * 0.48;
        controls.update();

        const terrainGeometry = buildTerrain(data);
        const terrainMaterial = new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        });
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.receiveShadow = true;
        scene.add(terrain);
        resources.push(terrainGeometry, terrainMaterial);

        const playerTexturesPromise = loadPlayerTextures();
        const clickIconTexturesPromise = loadClickIconTextures();
        const ratTexturesPromise = loadRatTextures();
        const splatImagesPromise = loadSplatImages();
        const rscTexturesPromise = defs
          ? loadRscTextures(collectTextureIds(data, defs))
          : Promise.resolve(new Map());
        const [playerTextures, clickIconTextures, rscTextures, ratTextures, splatImages] =
          await Promise.all([
            playerTexturesPromise,
            clickIconTexturesPromise,
            rscTexturesPromise,
            ratTexturesPromise,
            splatImagesPromise,
          ]);
        if (disposed) return;

        let roofMeshes = [];
        if (defs && rscTextures.size) {
          addMeshes(scene, resources, buildWallMeshes(data, defs, rscTextures));
          addMeshes(scene, resources, buildFloorMeshes(data, defs, rscTextures));
          roofMeshes = buildRoofMeshes(data, defs, rscTextures, heightAt);
          addMeshes(scene, resources, roofMeshes);
          rscTextures.forEach((texture) => resources.push(texture));
        } else {
          const wallGeometry = buildWalls(data);
          const wallMaterial = new THREE.LineBasicMaterial({
            color: 0x4d463f,
            transparent: true,
            opacity: 0.9,
          });
          scene.add(new THREE.LineSegments(wallGeometry, wallMaterial));
          resources.push(wallGeometry, wallMaterial);
        }

        const player = makePlayerMarker(playerTextures);
        player.visible = false;
        player.userData.facing = { x: 0, z: 1 };
        scene.add(player);
        Object.values(playerTextures).forEach((texture) => resources.push(texture));
        player.userData.extraTextures.forEach((texture) => resources.push(texture));
        Object.values(player.userData.materials).forEach((material) => resources.push(material));

        const sceneryGroup = new THREE.Group();
        sceneryGroup.name = "scenery";
        scene.add(sceneryGroup);
        const doorsGroup = new THREE.Group();
        doorsGroup.name = "doors";
        scene.add(doorsGroup);
        const ratsGroup = new THREE.Group();
        ratsGroup.name = "rats";
        scene.add(ratsGroup);
        const splatGroup = new THREE.Group();
        splatGroup.name = "hitsplats";
        scene.add(splatGroup);
        const sceneryKit = createSceneryKit();
        resources.push({ dispose: () => sceneryKit.dispose() });

        const clickIndicator = makeClickIndicator(clickIconTextures);
        scene.add(clickIndicator.sprite);
        clickIconTextures.forEach((texture) => resources.push(texture));
        clickIndicator.materials.forEach((material) => resources.push(material));

        const hemisphere = new THREE.HemisphereLight(0xe6f4ff, 0x44552e, 2.2);
        scene.add(hemisphere);

        const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
        sun.position.set(spawnX - 30, 65, spawnZ - 20);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -80;
        sun.shadow.camera.right = 80;
        sun.shadow.camera.top = 80;
        sun.shadow.camera.bottom = -80;
        scene.add(sun);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        function pickHit(event) {
          const rect = renderer.domElement.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const screen = { x: event.clientX, y: event.clientY };

          const rat = ratUnderPointer(ratsGroup, camera, rect, event);
          if (rat) return { type: "rat", rat, screen };

          const sceneryHit = raycaster.intersectObject(sceneryGroup, true)[0];
          const doorHit = raycaster.intersectObject(doorsGroup, true)[0];
          if (doorHit && (!sceneryHit || doorHit.distance <= sceneryHit.distance)) {
            let node = doorHit.object;
            while (node && node !== doorsGroup && !node.userData?.door) node = node.parent;
            if (node?.userData?.door) {
              return { type: "door", door: node.userData.door, screen };
            }
          }
          if (sceneryHit) {
            let node = sceneryHit.object;
            while (node && node !== sceneryGroup && !node.userData?.placement) {
              node = node.parent;
            }
            if (node?.userData?.placement) {
              return { type: "scenery", placement: node.userData.placement, screen };
            }
          }

          const hit = raycaster.intersectObject(terrain, false)[0];
          if (!hit) return null;
          return {
            type: "tile",
            tile: {
              x: Math.max(0, Math.min(data.width - 1, Math.floor(hit.point.x))),
              z: Math.max(0, Math.min(data.depth - 1, Math.floor(hit.point.z))),
            },
            screen,
          };
        }

        let pressedAt = null;

        const onPointerDown = (event) => {
          pressedAt = event.button === 0
            ? { x: event.clientX, y: event.clientY }
            : null;
        };

        const onPointerUp = (event) => {
          if (event.button !== 0 || !pressedAt) return;
          const dragged =
            Math.abs(event.clientX - pressedAt.x) > 4 ||
            Math.abs(event.clientY - pressedAt.y) > 4;
          pressedAt = null;
          if (dragged) return;
          const hit = pickHit(event);
          if (!hit) return;
          if (hit.type === "rat") {
            handlersRef.current.onRatClick?.(hit.rat);
            return;
          }
          if (hit.type === "door") {
            handlersRef.current.onDoorClick?.(hit.door);
            return;
          }
          if (hit.type === "scenery") {
            handlersRef.current.onSceneryClick?.(hit.placement);
            return;
          }
          if (viewRef.current) {
            viewRef.current.clickAnim = {
              startedAt: performance.now(),
              x: hit.tile.x,
              z: hit.tile.z,
            };
          }
          handlersRef.current.onTileClick?.(hit.tile);
        };

        const onContextMenu = (event) => {
          event.preventDefault();
          const hit = pickHit(event);
          if (!hit) {
            handlersRef.current.onTileContextMenu?.(null);
            return;
          }
          if (hit.type === "rat") {
            handlersRef.current.onRatContextMenu?.({
              rat: hit.rat,
              screen: hit.screen,
            });
            return;
          }
          if (hit.type === "door") {
            handlersRef.current.onDoorContextMenu?.({
              door: hit.door,
              screen: hit.screen,
            });
            return;
          }
          if (hit.type === "scenery") {
            handlersRef.current.onSceneryContextMenu?.({
              placement: hit.placement,
              screen: hit.screen,
            });
            return;
          }
          handlersRef.current.onTileContextMenu?.({
            tile: hit.tile,
            screen: hit.screen,
          });
        };

        const canvas = renderer.domElement;
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("contextmenu", onContextMenu);
        detachPointer = () => {
          canvas.removeEventListener("pointerdown", onPointerDown);
          canvas.removeEventListener("pointerup", onPointerUp);
          canvas.removeEventListener("contextmenu", onContextMenu);
        };

        const resize = () => {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resources.push({ dispose: () => resizeObserver.disconnect() });

        viewRef.current = {
          data,
          player,
          camera,
          clickIndicator,
          clickAnim: null,
          controls,
          cameraFollowTarget: controls.target.clone(),
          sceneryGroup,
          sceneryKit,
          doorsGroup,
          ratsGroup,
          ratTextures,
          ratFightFlip: ratTextures.map((texture, index) =>
            FIGHT_FRAMES.includes(index) && texture ? flippedTexture(texture) : null,
          ),
          splatGroup,
          splatImages,
          defs,
          rscTextures,
          roofs: roofMeshes,
        };

        setMessage("");
        setReady((value) => value + 1);
        handlersRef.current.onLoad?.(data);

        const render = () => {
          if (disposed) return;
          const view = viewRef.current;
          if (view) {
            view.playerFighting = fightingRef.current;
            updatePlayerMotion(view, performance.now());
            updateRats(view, ratsRef.current, performance.now());
            updateSplats(view, splatsRef.current, performance.now());
          }
          controls.update();
          if (player.visible) updatePlayerSprite(player, camera);
          if (view?.clickIndicator) {
            const active = updateClickIndicator(
              view.clickIndicator,
              data,
              view.clickAnim,
              performance.now(),
            );
            if (!active && view.clickAnim) {
              view.clickAnim = null;
            }
          }
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
      } catch (error) {
        setMessage(error.message || "Unable to load the 3D landscape.");
      }
    }

    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      detachPointer();
      controls?.dispose();
      renderer?.dispose();
      resources.forEach((resource) => resource.dispose());
      viewRef.current = null;
      host.replaceChildren();
    };
  }, [src]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.doorsGroup || !view.defs || !view.rscTextures) return;
    const { doorsGroup, data, defs, rscTextures } = view;
    for (const child of [...doorsGroup.children]) {
      child.geometry?.dispose();
      child.material?.dispose();
      doorsGroup.remove(child);
    }
    const open = openDoors instanceof Set ? openDoors : new Set(openDoors || []);
    for (const mesh of buildDoorMeshes(data, defs, rscTextures, open)) {
      doorsGroup.add(mesh);
    }
  }, [openDoors, ready]);

  const equipmentKey = equipmentIds.join(",");

  useEffect(() => {
    const view = viewRef.current;
    if (!ready || !view?.player || view.equipmentKey === equipmentKey) return undefined;
    const ids = equipmentKey ? equipmentKey.split(",").map(Number) : [];
    let cancelled = false;
    loadPlayerTextures(ids).then((textures) => {
      if (cancelled || !viewRef.current?.player || !Object.keys(textures).length) return;
      applyPlayerTextures(viewRef.current.player, textures);
      viewRef.current.equipmentKey = equipmentKey;
    });
    return () => {
      cancelled = true;
    };
  }, [equipmentKey, ready]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const { data, player, destinationMarker, selectionMarker } = view;

    if (playerPos) {
      player.visible = true;
      player.userData.facing = playerFacing;
      const goal = new THREE.Vector3(
        playerPos.x + 0.5,
        heightAt(data, playerPos.x, playerPos.z),
        playerPos.z + 0.5,
      );
      if (!view.playerMotion) {
        view.playerMotion = {
          from: null,
          goal,
          display: goal.clone(),
          startedAt: null,
        };
        player.position.copy(goal);
        followPlayerWithCamera(view, goal);
      } else if (!view.playerMotion.goal.equals(goal)) {
        const motion = view.playerMotion;
        motion.from = motion.display.clone();
        motion.goal = goal;
        motion.startedAt = performance.now();
      }
    } else {
      player.visible = false;
      view.playerMotion = null;
      view.roofFocusX = null;
      view.roofFocusZ = null;
      for (const mesh of view.roofs || []) mesh.visible = true;
    }

  }, [playerPos, playerFacing, destination, selectedTile, ready]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.sceneryGroup || !view.sceneryKit) return;
    const { data, sceneryGroup, sceneryKit } = view;
    sceneryGroup.clear();
    if (!scenery?.objects?.length) return;

    const kinds = new Map((scenery.kinds || []).map((kind) => [kind.rsc_id, kind]));
    for (const object of scenery.objects) {
      const kind = kinds.get(object.kind);
      if (!kind) continue;
      const tile = fromGameCoords(data, object.x, object.y);
      if (!tile) continue;
      const mesh = makeSceneryMesh(sceneryKit, kind, object);
      mesh.position.set(
        tile.x + 0.5,
        heightAt(data, tile.x, tile.z),
        tile.z + 0.5,
      );
      mesh.rotation.y = (object.direction || 0) * (Math.PI / 4);
      mesh.userData.placement = { object, kind, tile };
      sceneryGroup.add(mesh);
    }
  }, [scenery, ready]);

  return (
    <div className="landscape-3d">
      <div className="landscape-3d-canvas" ref={hostRef} />
      {message && <div className="landscape-3d-message">{message}</div>}
    </div>
  );
}
