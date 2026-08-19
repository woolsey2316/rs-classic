import * as THREE from "three";

/** RSC wall height 192 maps to this many world units. */
export const WALL_HEIGHT_UNIT = 1.8 / 192;

export function textureUrl(id) {
  return `/sprites/rsc/textures/id/${id}.png`;
}

export function collectTextureIds(data, defs) {
  const ids = new Set();
  if (!defs) return [];
  for (const wall of data.walls || []) {
    const kind = defs.wallKinds?.[wall[5]];
    if (kind?.texture != null) ids.add(kind.texture);
  }
  for (const overlay of data.overlays || []) {
    const kind = defs.tileKinds?.[overlay];
    if (kind?.texture != null) ids.add(kind.texture);
  }
  for (const roof of data.roofs || []) {
    const kind = defs.roofKinds?.[roof];
    if (kind?.texture != null) ids.add(kind.texture);
  }
  return [...ids];
}

export function loadRscTextures(ids) {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    ids.map(
      (id) =>
        new Promise((resolve) => {
          loader.load(
            textureUrl(id),
            (texture) => {
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.magFilter = THREE.NearestFilter;
              texture.minFilter = THREE.NearestFilter;
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.needsUpdate = true;
              resolve([id, texture]);
            },
            undefined,
            () => resolve([id, null]),
          );
        }),
    ),
  ).then((entries) => new Map(entries.filter(([, texture]) => texture)));
}

function parseCssColour(value) {
  if (!value || value === "transparent") return null;
  const channels = String(value).match(/\d+/g);
  if (!channels || channels.length < 3) return null;
  return (Number(channels[0]) << 16) + (Number(channels[1]) << 8) + Number(channels[2]);
}

function groupBucket(groups, key, extra) {
  if (!groups.has(key)) {
    groups.set(key, {
      positions: [],
      uvs: [],
      indices: [],
      ...extra,
    });
  }
  return groups.get(key);
}

function pushQuad(bucket, a, b, c, d, uSpan, vSpan) {
  const v = bucket.positions.length / 3;
  bucket.positions.push(...a, ...b, ...c, ...d);
  bucket.uvs.push(0, 0, uSpan, 0, 0, vSpan, uSpan, vSpan);
  bucket.indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
}

function meshesFromGroups(groups) {
  const meshes = [];
  for (const bucket of groups.values()) {
    if (!bucket.positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geometry.setIndex(bucket.indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      map: bucket.texture || null,
      color: bucket.texture ? 0xffffff : bucket.colour,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.15,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

export function buildWallMeshes(data, defs, textures) {
  const groups = new Map();
  for (const [x1, z1, x2, z2, elevation, wallId] of data.walls || []) {
    const kind = defs?.wallKinds?.[wallId];
    if (!kind || kind.invisible) continue;
    if (kind.colour === "transparent" && kind.texture == null) continue;

    const texture = kind.texture != null ? textures.get(kind.texture) : null;
    const colour = parseCssColour(kind.colour) ?? 0x7a746c;
    if (!texture && kind.texture != null) continue;

    const key = texture ? `tex:${kind.texture}` : `col:${colour}:${kind.height}`;
    const bucket = groupBucket(groups, key, { texture, colour });
    const y = elevation * data.heightScale + 0.02;
    const height = (kind.height || 192) * WALL_HEIGHT_UNIT;
    const span = Math.hypot(x2 - x1, z2 - z1) || 1;
    pushQuad(
      bucket,
      [x1, y, z1],
      [x2, y, z2],
      [x1, y + height, z1],
      [x2, y + height, z2],
      span,
      height / 1.8,
    );
  }
  return meshesFromGroups(groups);
}

export function buildFloorMeshes(data, defs, textures, heightAt) {
  const groups = new Map();
  const { width, depth } = data;
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const overlay = data.overlays[z * width + x];
      const kind = defs?.tileKinds?.[overlay];
      if (!kind || kind.texture == null) continue;
      const texture = textures.get(kind.texture);
      if (!texture) continue;
      const bucket = groupBucket(groups, `floor:${kind.texture}`, { texture, colour: 0xffffff });
      const lift = 0.03;
      pushQuad(
        bucket,
        [x, heightAt(data, x, z) + lift, z],
        [x + 1, heightAt(data, x + 1, z) + lift, z],
        [x, heightAt(data, x, z + 1) + lift, z + 1],
        [x + 1, heightAt(data, x + 1, z + 1) + lift, z + 1],
        1,
        1,
      );
    }
  }
  return meshesFromGroups(groups);
}

export function buildRoofMeshes(data, defs, textures, heightAt) {
  if (!data.roofs?.length) return [];
  const groups = new Map();
  const { width, depth } = data;
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const roofId = data.roofs[z * width + x];
      const kind = defs?.roofKinds?.[roofId];
      if (!kind || kind.texture == null) continue;
      const texture = textures.get(kind.texture);
      if (!texture) continue;
      const bucket = groupBucket(groups, `roof:${kind.texture}`, { texture, colour: 0xffffff });
      const top =
        Math.max(
          heightAt(data, x, z),
          heightAt(data, x + 1, z),
          heightAt(data, x, z + 1),
          heightAt(data, x + 1, z + 1),
        ) +
        1.8 +
        ((kind.height || 64) / 192) * 0.2;
      pushQuad(
        bucket,
        [x, top, z],
        [x + 1, top, z],
        [x, top, z + 1],
        [x + 1, top, z + 1],
        1,
        1,
      );
    }
  }
  return meshesFromGroups(groups);
}
