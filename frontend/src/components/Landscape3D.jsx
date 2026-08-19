import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fromGameCoords } from "../game/landscapeGrid";
import {
  buildFloorMeshes,
  buildRoofMeshes,
  buildWallMeshes,
  collectTextureIds,
  loadRscTextures,
} from "../game/landscapeMeshes";
import {
  PLAYER_SPRITE_ANGLES,
  PLAYER_SPRITE_SIZE,
  playerSpriteUrl,
  spriteViewFromCamera,
} from "../game/playerSprite";
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

function spriteMaterial(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
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
    materials[angle] = spriteMaterial(textures[angle]);
    const flipped = flippedTexture(textures[angle]);
    extraTextures.push(flipped);
    materials[`${angle}-flip`] = spriteMaterial(flipped);
  }

  const sprite = new THREE.Sprite(materials[0]);
  sprite.center.set(0.5, 0);
  sprite.scale.set(
    PLAYER_HEIGHT * (PLAYER_SPRITE_SIZE.width / PLAYER_SPRITE_SIZE.height),
    PLAYER_HEIGHT,
    1,
  );
  sprite.renderOrder = 3;

  const feet = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.34, 20),
    new THREE.MeshBasicMaterial({
      color: 0x1a140e,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  feet.rotation.x = -Math.PI / 2;
  feet.position.y = 0.04;
  feet.renderOrder = 2;
  group.add(feet, sprite);
  group.userData = { sprite, materials, extraTextures, viewKey: "" };
  return group;
}

function loadPlayerTextures() {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    PLAYER_SPRITE_ANGLES.map(
      (angle) =>
        new Promise((resolve, reject) => {
          loader.load(
            playerSpriteUrl(angle),
            (texture) => resolve([angle, texture]),
            undefined,
            () => reject(new Error(`Failed to load ${playerSpriteUrl(angle)}`)),
          );
        }),
    ),
  ).then((entries) => Object.fromEntries(entries));
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

function makeTileMarker(colour) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.48, 24),
    new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 2;
  marker.visible = false;
  return marker;
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
  onLoad,
  onTileClick,
  onTileContextMenu,
  onSceneryClick,
  onSceneryContextMenu,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const handlersRef = useRef({});
  const [message, setMessage] = useState("Loading RSC landscape…");
  const [ready, setReady] = useState(0);

  handlersRef.current = {
    onLoad,
    onTileClick,
    onTileContextMenu,
    onSceneryClick,
    onSceneryContextMenu,
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
        const rscTexturesPromise = defs
          ? loadRscTextures(collectTextureIds(data, defs))
          : Promise.resolve(new Map());
        const [playerTextures, clickIconTextures, rscTextures] = await Promise.all([
          playerTexturesPromise,
          clickIconTexturesPromise,
          rscTexturesPromise,
        ]);
        if (disposed) return;

        if (defs && rscTextures.size) {
          addMeshes(scene, resources, buildWallMeshes(data, defs, rscTextures));
          addMeshes(scene, resources, buildFloorMeshes(data, defs, rscTextures));
          addMeshes(scene, resources, buildRoofMeshes(data, defs, rscTextures, heightAt));
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
        const sceneryKit = createSceneryKit();
        resources.push({ dispose: () => sceneryKit.dispose() });

        const destinationMarker = makeTileMarker(0xffffff);
        const selectionMarker = makeTileMarker(0x8ce27a);
        const clickIndicator = makeClickIndicator(clickIconTextures);
        scene.add(destinationMarker, selectionMarker, clickIndicator.sprite);
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

          const sceneryHit = raycaster.intersectObject(sceneryGroup, true)[0];
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
          destinationMarker,
          selectionMarker,
          clickIndicator,
          clickAnim: null,
          controls,
          sceneryGroup,
          sceneryKit,
        };

        setMessage("");
        setReady((value) => value + 1);
        handlersRef.current.onLoad?.(data);

        const render = () => {
          if (disposed) return;
          controls.update();
          if (player.visible) updatePlayerSprite(player, camera);
          const view = viewRef.current;
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
    if (!view) return;
    const { data, player, destinationMarker, selectionMarker } = view;

    if (playerPos) {
      player.visible = true;
      player.userData.facing = playerFacing;
      player.position.set(
        playerPos.x + 0.5,
        heightAt(data, playerPos.x, playerPos.z),
        playerPos.z + 0.5,
      );
    } else {
      player.visible = false;
    }

    if (destination) {
      destinationMarker.visible = true;
      destinationMarker.position.set(
        destination.x + 0.5,
        heightAt(data, destination.x, destination.z) + 0.06,
        destination.z + 0.5,
      );
    } else {
      destinationMarker.visible = false;
    }

    if (selectedTile) {
      selectionMarker.visible = true;
      selectionMarker.position.set(
        selectedTile.x + 0.5,
        heightAt(data, selectedTile.x, selectedTile.z) + 0.08,
        selectedTile.z + 0.5,
      );
    } else {
      selectionMarker.visible = false;
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
