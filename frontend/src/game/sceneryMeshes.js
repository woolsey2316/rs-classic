import * as THREE from "three";

function colour(hex) {
  return new THREE.MeshLambertMaterial({ color: hex });
}

function mesh(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  part.castShadow = false;
  part.receiveShadow = true;
  return part;
}

export function createSceneryKit() {
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
    sphere: new THREE.SphereGeometry(0.5, 8, 6),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  const mats = {
    bark: colour(0x6b4a2b),
    barkDark: colour(0x4a321c),
    leaf: colour(0x2f7a32),
    leafDark: colour(0x215c28),
    leafPale: colour(0x6a9a3a),
    palm: colour(0x3d8a38),
    stump: colour(0x5a3d22),
    fern: colour(0x3d8f45),
    cactus: colour(0x3a8a48),
    flower: colour(0xd45c8a),
    flowerLeaf: colour(0x3f8a3a),
    wheat: colour(0xc9b24a),
    potato: colour(0x6a8f3a),
    rushes: colour(0x4a7a4a),
    mushroom: colour(0xb85c3a),
    mushroomStem: colour(0xe8d8b8),
    rock: colour(0x7a746c),
    rockDark: colour(0x5c564e),
    coal: colour(0x3a3a3a),
    iron: colour(0x8a6a58),
    mithril: colour(0x6a7a9a),
    wood: colour(0x8a6238),
    woodLight: colour(0xb08a58),
    stone: colour(0x9a9488),
    marble: colour(0xd8d2c4),
    cloth: colour(0x6a4a8a),
    metal: colour(0x6a6a72),
    water: colour(0x4a8ab8),
    fire: colour(0xe07028),
    ember: colour(0xc43c18),
    sack: colour(0xb8a060),
    grave: colour(0x8a8680),
    generic: colour(0x8a7048),
    door: colour(0x6a4224),
  };

  return {
    geos,
    mats,
    dispose() {
      Object.values(geos).forEach((geo) => geo.dispose());
      Object.values(mats).forEach((mat) => mat.dispose());
    },
  };
}

function styleFor(kind) {
  const name = (kind.name || "").toLowerCase();
  const model = (kind.model || "").toLowerCase();
  const hay = `${name} ${model}`;
  if (model.includes("palm") || name.includes("palm")) return "palm";
  if (model.includes("deadtree") || hay.includes("dead")) return "dead-tree";
  if (model.includes("tree2") || (name === "tree" && model.includes("tree2"))) return "pointy-tree";
  if (model.includes("treestump") || hay.includes("stump")) return "stump";
  if (name === "tree" || model.includes("tree")) return "leafy-tree";
  if (hay.includes("fern")) return "fern";
  if (hay.includes("cactus")) return "cactus";
  if (hay.includes("wheat")) return "wheat";
  if (hay.includes("potato")) return "potato";
  if (hay.includes("bullrush") || hay.includes("rush")) return "rushes";
  if (hay.includes("flower")) return "flower";
  if (hay.includes("mushroom")) return "mushroom";
  if (hay.includes("coalrock")) return "coal";
  if (hay.includes("mithril")) return "mithril";
  if (hay.includes("ironrock")) return "iron";
  if (hay.includes("rock")) return "rock";
  if (hay.includes("gravestone") || hay.includes("grave")) return "grave";
  if (hay.includes("well")) return "well";
  if (hay.includes("fountain")) return "fountain";
  if (hay.includes("ladder")) return "ladder";
  if (hay.includes("chair") || hay.includes("throne")) return "chair";
  if (hay.includes("bench")) return "bench";
  if (hay.includes("bed")) return "bed";
  if (hay.includes("table") || hay.includes("counter")) return "table";
  if (hay.includes("range") || hay.includes("furnace") || hay.includes("altar")) return "hearth";
  if (hay.includes("barrel")) return "barrel";
  if (hay.includes("sack")) return "sacks";
  if (hay.includes("cart")) return "cart";
  if (hay.includes("door") || hay.includes("gate")) return "door";
  if (hay.includes("railing") || hay.includes("fence")) return "railing";
  if (hay.includes("post") || hay.includes("pillar") || hay.includes("sign")) return "post";
  if (hay.includes("fire")) return "fire";
  if (hay.includes("mill")) return "mill";
  if (hay.includes("log")) return "logs";
  if (hay.includes("candle")) return "candle";
  return "generic";
}

function jitter(id, amount) {
  const n = ((id * 1103515245 + 12345) >>> 0) % 1000;
  return ((n / 1000) * 2 - 1) * amount;
}

function scaleFor(id, min, max) {
  const n = ((id * 2654435761) >>> 0) % 1000;
  return min + (n / 1000) * (max - min);
}

function assemble(kit, parts) {
  const group = new THREE.Group();
  for (const part of parts) group.add(part);
  return group;
}

function makeStyle(kit, style, objectId) {
  const { geos, mats } = kit;
  const s = scaleFor(objectId, 0.88, 1.12);

  switch (style) {
    case "pointy-tree":
      return assemble(kit, [
        mesh(geos.cylinder, mats.bark, 0, 0.55 * s, 0, 0.22 * s, 1.1 * s, 0.22 * s),
        mesh(geos.cone, mats.leafDark, 0, 1.55 * s, 0, 1.15 * s, 1.7 * s, 1.15 * s),
        mesh(geos.cone, mats.leaf, 0, 2.15 * s, 0, 0.75 * s, 1.2 * s, 0.75 * s),
      ]);
    case "leafy-tree":
      return assemble(kit, [
        mesh(geos.cylinder, mats.bark, 0, 0.5 * s, 0, 0.26 * s, 1.0 * s, 0.26 * s),
        mesh(geos.sphere, mats.leaf, 0, 1.55 * s, 0, 1.45 * s, 1.2 * s, 1.45 * s),
        mesh(geos.sphere, mats.leafDark, 0.28 * s, 1.35 * s, -0.18 * s, 0.9 * s, 0.8 * s, 0.9 * s),
      ]);
    case "palm":
      return assemble(kit, [
        mesh(geos.cylinder, mats.bark, 0, 0.85 * s, 0, 0.16 * s, 1.7 * s, 0.16 * s),
        mesh(geos.sphere, mats.palm, 0, 1.75 * s, 0, 0.55 * s, 0.35 * s, 0.55 * s),
        mesh(geos.cone, mats.palm, 0.45 * s, 1.7 * s, 0, 0.9 * s, 0.18 * s, 0.45 * s),
        mesh(geos.cone, mats.palm, -0.45 * s, 1.7 * s, 0, 0.9 * s, 0.18 * s, 0.45 * s),
        mesh(geos.cone, mats.palm, 0, 1.7 * s, 0.45 * s, 0.45 * s, 0.18 * s, 0.9 * s),
        mesh(geos.cone, mats.palm, 0, 1.7 * s, -0.45 * s, 0.45 * s, 0.18 * s, 0.9 * s),
      ]);
    case "dead-tree":
      return assemble(kit, [
        mesh(geos.cylinder, mats.barkDark, 0, 0.7 * s, 0, 0.18 * s, 1.4 * s, 0.18 * s),
        mesh(geos.box, mats.barkDark, 0.28 * s, 1.15 * s, 0, 0.55 * s, 0.1 * s, 0.1 * s),
        mesh(geos.box, mats.barkDark, -0.18 * s, 1.35 * s, 0.12 * s, 0.4 * s, 0.08 * s, 0.08 * s),
      ]);
    case "stump":
      return assemble(kit, [
        mesh(geos.cylinder, mats.stump, 0, 0.22, 0, 0.42, 0.44, 0.42),
      ]);
    case "fern":
      return assemble(kit, [
        mesh(geos.cone, mats.fern, 0, 0.28, 0, 0.7, 0.55, 0.7),
        mesh(geos.cone, mats.leafPale, jitter(objectId, 0.12), 0.22, jitter(objectId + 3, 0.12), 0.5, 0.4, 0.5),
      ]);
    case "cactus":
      return assemble(kit, [
        mesh(geos.cylinder, mats.cactus, 0, 0.45, 0, 0.22, 0.9, 0.22),
        mesh(geos.cylinder, mats.cactus, 0.18, 0.5, 0, 0.12, 0.45, 0.12),
      ]);
    case "wheat":
      return assemble(kit, [
        mesh(geos.box, mats.wheat, -0.12, 0.28, -0.1, 0.08, 0.55, 0.08),
        mesh(geos.box, mats.wheat, 0.1, 0.32, 0.08, 0.08, 0.64, 0.08),
        mesh(geos.box, mats.wheat, 0.02, 0.24, -0.16, 0.07, 0.48, 0.07),
        mesh(geos.box, mats.wheat, -0.16, 0.22, 0.14, 0.07, 0.44, 0.07),
      ]);
    case "potato":
      return assemble(kit, [
        mesh(geos.sphere, mats.potato, 0, 0.12, 0, 0.55, 0.18, 0.55),
        mesh(geos.sphere, mats.leafPale, 0.12, 0.2, -0.08, 0.28, 0.16, 0.28),
      ]);
    case "rushes":
      return assemble(kit, [
        mesh(geos.cone, mats.rushes, -0.1, 0.4, 0, 0.22, 0.8, 0.22),
        mesh(geos.cone, mats.leafDark, 0.12, 0.35, 0.08, 0.18, 0.7, 0.18),
      ]);
    case "flower":
      return assemble(kit, [
        mesh(geos.cylinder, mats.flowerLeaf, 0, 0.16, 0, 0.06, 0.32, 0.06),
        mesh(geos.sphere, mats.flower, 0, 0.36, 0, 0.28, 0.18, 0.28),
      ]);
    case "mushroom":
      return assemble(kit, [
        mesh(geos.cylinder, mats.mushroomStem, 0, 0.12, 0, 0.12, 0.24, 0.12),
        mesh(geos.sphere, mats.mushroom, 0, 0.28, 0, 0.42, 0.22, 0.42),
      ]);
    case "rock":
      return assemble(kit, [
        mesh(geos.box, mats.rock, 0, 0.22, 0, 0.7, 0.44, 0.55),
        mesh(geos.box, mats.rockDark, 0.18, 0.16, 0.12, 0.4, 0.32, 0.35),
      ]);
    case "coal":
      return assemble(kit, [
        mesh(geos.box, mats.coal, 0, 0.2, 0, 0.65, 0.4, 0.55),
        mesh(geos.box, mats.rockDark, -0.16, 0.14, 0.1, 0.35, 0.28, 0.3),
      ]);
    case "iron":
      return assemble(kit, [
        mesh(geos.box, mats.iron, 0, 0.2, 0, 0.65, 0.4, 0.55),
        mesh(geos.box, mats.rock, 0.14, 0.14, -0.1, 0.32, 0.26, 0.3),
      ]);
    case "mithril":
      return assemble(kit, [
        mesh(geos.box, mats.mithril, 0, 0.2, 0, 0.65, 0.4, 0.55),
        mesh(geos.box, mats.rock, -0.14, 0.14, 0.1, 0.32, 0.26, 0.3),
      ]);
    case "grave":
      return assemble(kit, [
        mesh(geos.box, mats.grave, 0, 0.38, 0, 0.42, 0.76, 0.12),
      ]);
    case "well":
      return assemble(kit, [
        mesh(geos.cylinder, mats.stone, 0, 0.22, 0, 0.7, 0.44, 0.7),
        mesh(geos.cylinder, mats.water, 0, 0.42, 0, 0.42, 0.08, 0.42),
      ]);
    case "fountain":
      return assemble(kit, [
        mesh(geos.cylinder, mats.marble, 0, 0.16, 0, 0.85, 0.32, 0.85),
        mesh(geos.cylinder, mats.water, 0, 0.34, 0, 0.55, 0.1, 0.55),
        mesh(geos.cylinder, mats.marble, 0, 0.5, 0, 0.16, 0.55, 0.16),
      ]);
    case "ladder":
      return assemble(kit, [
        mesh(geos.box, mats.wood, -0.18, 0.7, 0, 0.08, 1.4, 0.08),
        mesh(geos.box, mats.wood, 0.18, 0.7, 0, 0.08, 1.4, 0.08),
        mesh(geos.box, mats.woodLight, 0, 0.3, 0, 0.4, 0.08, 0.08),
        mesh(geos.box, mats.woodLight, 0, 0.65, 0, 0.4, 0.08, 0.08),
        mesh(geos.box, mats.woodLight, 0, 1.0, 0, 0.4, 0.08, 0.08),
      ]);
    case "chair":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.22, 0, 0.42, 0.12, 0.42),
        mesh(geos.box, mats.wood, 0, 0.5, -0.16, 0.42, 0.55, 0.08),
      ]);
    case "bench":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.22, 0, 0.95, 0.12, 0.32),
        mesh(geos.box, mats.barkDark, -0.38, 0.1, 0, 0.1, 0.2, 0.28),
        mesh(geos.box, mats.barkDark, 0.38, 0.1, 0, 0.1, 0.2, 0.28),
      ]);
    case "bed":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.16, 0, 0.85, 0.22, 1.35),
        mesh(geos.box, mats.cloth, 0, 0.3, 0.05, 0.75, 0.12, 1.05),
      ]);
    case "table":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.42, 0, 0.95, 0.08, 0.65),
        mesh(geos.box, mats.barkDark, -0.38, 0.2, -0.24, 0.08, 0.4, 0.08),
        mesh(geos.box, mats.barkDark, 0.38, 0.2, -0.24, 0.08, 0.4, 0.08),
        mesh(geos.box, mats.barkDark, -0.38, 0.2, 0.24, 0.08, 0.4, 0.08),
        mesh(geos.box, mats.barkDark, 0.38, 0.2, 0.24, 0.08, 0.4, 0.08),
      ]);
    case "hearth":
      return assemble(kit, [
        mesh(geos.box, mats.stone, 0, 0.28, 0, 0.85, 0.55, 0.55),
        mesh(geos.box, mats.ember, 0, 0.42, 0.05, 0.45, 0.2, 0.2),
      ]);
    case "barrel":
      return assemble(kit, [
        mesh(geos.cylinder, mats.wood, 0, 0.32, 0, 0.45, 0.64, 0.45),
      ]);
    case "sacks":
      return assemble(kit, [
        mesh(geos.sphere, mats.sack, -0.12, 0.2, 0, 0.45, 0.35, 0.4),
        mesh(geos.sphere, mats.wheat, 0.16, 0.18, 0.08, 0.38, 0.3, 0.35),
      ]);
    case "cart":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.32, 0, 1.1, 0.28, 0.55),
        mesh(geos.cylinder, mats.barkDark, -0.35, 0.16, 0.28, 0.28, 0.08, 0.28),
        mesh(geos.cylinder, mats.barkDark, 0.35, 0.16, 0.28, 0.28, 0.08, 0.28),
        mesh(geos.cylinder, mats.barkDark, -0.35, 0.16, -0.28, 0.28, 0.08, 0.28),
        mesh(geos.cylinder, mats.barkDark, 0.35, 0.16, -0.28, 0.28, 0.08, 0.28),
      ]);
    case "door":
      return assemble(kit, [
        mesh(geos.box, mats.door, 0, 0.85, 0, 0.85, 1.7, 0.1),
      ]);
    case "railing":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.45, 0, 0.9, 0.08, 0.08),
        mesh(geos.box, mats.barkDark, -0.35, 0.25, 0, 0.08, 0.5, 0.08),
        mesh(geos.box, mats.barkDark, 0.35, 0.25, 0, 0.08, 0.5, 0.08),
      ]);
    case "post":
      return assemble(kit, [
        mesh(geos.box, mats.wood, 0, 0.7, 0, 0.14, 1.4, 0.14),
        mesh(geos.box, mats.woodLight, 0, 1.15, 0.08, 0.42, 0.28, 0.06),
      ]);
    case "fire":
      return assemble(kit, [
        mesh(geos.box, mats.barkDark, 0, 0.08, 0, 0.55, 0.12, 0.55),
        mesh(geos.cone, mats.fire, 0, 0.32, 0, 0.35, 0.5, 0.35),
        mesh(geos.cone, mats.ember, 0, 0.28, 0, 0.18, 0.35, 0.18),
      ]);
    case "mill":
      return assemble(kit, [
        mesh(geos.cylinder, mats.stone, 0, 0.7, 0, 1.1, 1.4, 1.1),
        mesh(geos.box, mats.wood, 0, 1.5, 0, 1.6, 0.12, 0.12),
        mesh(geos.box, mats.wood, 0, 1.5, 0, 0.12, 0.12, 1.6),
      ]);
    case "logs":
      return assemble(kit, [
        mesh(geos.cylinder, mats.bark, 0, 0.12, 0, 0.22, 0.7, 0.22),
        mesh(geos.cylinder, mats.barkDark, 0.08, 0.28, 0.05, 0.2, 0.65, 0.2),
      ]);
    case "candle":
      return assemble(kit, [
        mesh(geos.cylinder, mats.woodLight, 0, 0.28, 0, 0.12, 0.2, 0.12),
        mesh(geos.cylinder, mats.generic, 0, 0.42, 0, 0.06, 0.22, 0.06),
        mesh(geos.sphere, mats.fire, 0, 0.55, 0, 0.08, 0.1, 0.08),
      ]);
    default:
      return assemble(kit, [
        mesh(geos.box, mats.generic, 0, 0.28, 0, 0.45, 0.55, 0.45),
      ]);
  }
}

export function makeSceneryMesh(kit, kind, object) {
  const group = makeStyle(kit, styleFor(kind), object.id);
  group.userData.scenery = true;
  return group;
}
