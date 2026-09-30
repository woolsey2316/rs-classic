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

function pushQuadUV(bucket, corners) {
  const v = bucket.positions.length / 3;
  for (const [point, u, t] of corners) {
    bucket.positions.push(...point);
    bucket.uvs.push(u, t);
  }
  bucket.indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
}

function pushTri(bucket, corners) {
  const v = bucket.positions.length / 3;
  for (const [point, u, t] of corners) {
    bucket.positions.push(...point);
    bucket.uvs.push(u, t);
  }
  bucket.indices.push(v, v + 1, v + 2);
}

function indexWalls(walls) {
  const vertical = new Set();
  const horizontal = new Set();
  const diagonal = new Map();
  for (const [x1, z1, x2, z2] of walls || []) {
    if (x1 === x2) {
      vertical.add(`${x1},${Math.min(z1, z2)}`);
    } else if (z1 === z2) {
      horizontal.add(`${Math.min(x1, x2)},${z1}`);
    } else {
      const ox = Math.min(x1, x2);
      const oz = Math.min(z1, z2);
      const direction = (x2 - x1) * (z2 - z1) < 0 ? "/" : "\\";
      diagonal.set(`${ox},${oz}`, direction);
    }
  }
  return { vertical, horizontal, diagonal };
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

function isSolidWall(kind) {
  return Boolean(kind && kind.name === "Wall" && kind.blocked !== false && !kind.invisible);
}

export function isDoorWall(kind) {
  const name = (kind?.name || "").toLowerCase();
  return name.includes("door");
}

/** Shared parapet height for connected wall segments, in world units. */
function levelWallTops(data, defs) {
  const walls = data.walls || [];
  const parent = walls.map((_, index) => index);
  const find = (index) => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const endpoint = new Map();
  walls.forEach((wall, index) => {
    const kind = defs?.wallKinds?.[wall[5]];
    if (!isSolidWall(kind)) return;
    const textureKey = kind.texture ?? kind.colour ?? kind.name;
    for (const end of [`${wall[0]},${wall[1]}`, `${wall[2]},${wall[3]}`]) {
      const key = `${textureKey}:${end}`;
      if (endpoint.has(key)) union(index, endpoint.get(key));
      else endpoint.set(key, index);
    }
  });

  const maxTop = new Map();
  const ownTop = (wall, kind) =>
    wall[4] * data.heightScale +
    0.02 +
    (kind.height || 192) * WALL_HEIGHT_UNIT;
  walls.forEach((wall, index) => {
    const kind = defs?.wallKinds?.[wall[5]];
    if (!isSolidWall(kind)) return;
    const root = find(index);
    const top = ownTop(wall, kind);
    maxTop.set(root, Math.max(maxTop.get(root) ?? 0, top));
  });

  const tops = new Map();
  const atPoint = new Map();
  const vertical = new Map();
  const horizontal = new Map();
  walls.forEach((wall, index) => {
    const kind = defs?.wallKinds?.[wall[5]];
    if (!isSolidWall(kind)) return;
    const top = maxTop.get(find(index));
    tops.set(index, top);
    const [x1, z1, x2, z2] = wall;
    for (const end of [`${x1},${z1}`, `${x2},${z2}`]) {
      atPoint.set(end, Math.max(atPoint.get(end) ?? 0, top));
    }
    if (x1 === x2) {
      const key = `${x1},${Math.min(z1, z2)}`;
      vertical.set(key, Math.max(vertical.get(key) ?? 0, top));
    } else if (z1 === z2) {
      const key = `${Math.min(x1, x2)},${z1}`;
      horizontal.set(key, Math.max(horizontal.get(key) ?? 0, top));
    }
  });
  return { tops, atPoint, vertical, horizontal };
}

function pushWallQuad(bucket, x1, z1, x2, z2, baseY, topY) {
  const span = Math.hypot(x2 - x1, z2 - z1) || 1;
  const worldHeight = Math.max(0.2, topY - baseY);
  pushQuad(
    bucket,
    [x1, baseY, z1],
    [x2, baseY, z2],
    [x1, topY, z1],
    [x2, topY, z2],
    span,
    worldHeight / 1.8,
  );
}

export function buildWallMeshes(data, defs, textures) {
  const groups = new Map();
  const { tops } = levelWallTops(data, defs);
  (data.walls || []).forEach((wall, index) => {
    const [x1, z1, x2, z2, elevation, wallId] = wall;
    const kind = defs?.wallKinds?.[wallId];
    if (!kind || isDoorWall(kind) || kind.invisible) return;
    if (kind.colour === "transparent" && kind.texture == null) return;

    const texture = kind.texture != null ? textures.get(kind.texture) : null;
    const colour = parseCssColour(kind.colour) ?? 0x7a746c;
    if (!texture && kind.texture != null) return;

    const key = texture ? `tex:${kind.texture}` : `col:${colour}:${kind.height}`;
    const bucket = groupBucket(groups, key, { texture, colour });
    const baseY = elevation * data.heightScale + 0.02;
    const ownTop = baseY + (kind.height || 192) * WALL_HEIGHT_UNIT;
    pushWallQuad(bucket, x1, z1, x2, z2, baseY, Math.max(ownTop, tops.get(index) ?? ownTop));
  });
  return meshesFromGroups(groups);
}

export function buildDoorMeshes(data, defs, textures, openDoorIndexes) {
  const open = openDoorIndexes || new Set();
  const { atPoint } = levelWallTops(data, defs);
  const meshes = [];
  (data.walls || []).forEach((wall, index) => {
    if (open.has(index)) return;
    const [x1, z1, x2, z2, elevation, wallId] = wall;
    const kind = defs?.wallKinds?.[wallId];
    if (!isDoorWall(kind) || kind.blocked === false) return;
    const textureId = kind.texture;
    const texture = textureId != null ? textures.get(textureId) : null;
    if (!texture) return;

    const groups = new Map();
    const bucket = groupBucket(groups, "door", { texture, colour: 0xffffff });
    const baseY = elevation * data.heightScale + 0.02;
    const ownTop = baseY + (kind.height || 192) * WALL_HEIGHT_UNIT;
    const neighbourTop = Math.max(
      atPoint.get(`${x1},${z1}`) ?? 0,
      atPoint.get(`${x2},${z2}`) ?? 0,
    );
    pushWallQuad(bucket, x1, z1, x2, z2, baseY, Math.max(ownTop, neighbourTop));
    const [mesh] = meshesFromGroups(groups);
    if (!mesh) return;
    mesh.userData.door = {
      index,
      wall,
      name: kind.name || "Door",
      description: "A wooden door.",
    };
    meshes.push(mesh);
  });
  return meshes;
}

const FLOOR_WALL_INSET = 0.1;

function isFloorOverlay(defs, overlay) {
  return defs?.tileKinds?.[overlay]?.type === "floor";
}

export function buildFloorMeshes(data, defs, textures) {
  const groups = new Map();
  const { width, depth } = data;
  const walls = indexWalls(data.walls);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileIndex = z * width + x;
      const overlay = data.overlays[tileIndex];
      const kind = defs?.tileKinds?.[overlay];
      if (!kind || kind.type !== "floor" || kind.texture == null) continue;
      const texture = textures.get(kind.texture);
      if (!texture) continue;
      const bucket = groupBucket(groups, `floor:${kind.texture}`, { texture, colour: 0xffffff });
      const y = data.heights[tileIndex] * data.heightScale + 0.03;

      const continues = (nx, nz) =>
        nx >= 0 &&
        nz >= 0 &&
        nx < width &&
        nz < depth &&
        isFloorOverlay(defs, data.overlays[nz * width + nx]);
      const north = continues(x, z - 1);
      const east = continues(x + 1, z);
      const south = continues(x, z + 1);
      const west = continues(x - 1, z);
      const diagonal = walls.diagonal.get(`${x},${z}`);

      const point = (px, pz, u, v) => [[px, y, pz], u, v];
      const nw = point(x, z, 0, 0);
      const ne = point(x + 1, z, 1, 0);
      const sw = point(x, z + 1, 0, 1);
      const se = point(x + 1, z + 1, 1, 1);

      if (diagonal) {
        let corners = null;
        if (!south && !west) corners = [nw, ne, se];
        else if (!north && !east) corners = [nw, sw, se];
        else if (!south && !east) corners = [nw, ne, sw];
        else if (!north && !west) corners = [ne, sw, se];
        else if (diagonal === "\\") {
          const towardNorthEast = (north ? 1 : 0) + (east ? 1 : 0);
          const towardSouthWest = (south ? 1 : 0) + (west ? 1 : 0);
          if (towardNorthEast === towardSouthWest) {
            pushQuadUV(bucket, [nw, ne, sw, se]);
          } else {
            pushTri(
              bucket,
              towardNorthEast > towardSouthWest ? [nw, ne, se] : [nw, sw, se],
            );
          }
          continue;
        } else {
          const towardNorthWest = (north ? 1 : 0) + (west ? 1 : 0);
          const towardSouthEast = (south ? 1 : 0) + (east ? 1 : 0);
          if (towardNorthWest === towardSouthEast) {
            pushQuadUV(bucket, [nw, ne, sw, se]);
          } else {
            pushTri(
              bucket,
              towardNorthWest > towardSouthEast ? [nw, ne, sw] : [ne, sw, se],
            );
          }
          continue;
        }
        pushTri(bucket, corners);
        continue;
      }

      let x0 = x;
      let x1 = x + 1;
      let z0 = z;
      let z1 = z + 1;
      if (walls.vertical.has(`${x},${z}`)) x0 += FLOOR_WALL_INSET;
      if (walls.vertical.has(`${x + 1},${z}`)) x1 -= FLOOR_WALL_INSET;
      if (walls.horizontal.has(`${x},${z}`)) z0 += FLOOR_WALL_INSET;
      if (walls.horizontal.has(`${x},${z + 1}`)) z1 -= FLOOR_WALL_INSET;
      if (x1 - x0 < 0.2 || z1 - z0 < 0.2) continue;
      pushQuadUV(bucket, [
        point(x0, z0, x0 - x, z0 - z),
        point(x1, z0, x1 - x, z0 - z),
        point(x0, z1, x0 - x, z1 - z),
        point(x1, z1, x1 - x, z1 - z),
      ]);
    }
  }
  return meshesFromGroups(groups);
}

export function buildRoofMeshes(data, defs, textures, heightAt) {
  if (!data.roofs?.length) return [];
  const groups = new Map();
  const { width, depth } = data;
  const wallIndex = indexWalls(data.walls);
  const { vertical: wallTopsV, horizontal: wallTopsH } = levelWallTops(data, defs);
  const tiles = [];
  const at = new Map();

  const edgeTop = (x, z) => {
    const values = [
      wallTopsV.get(`${x},${z}`),
      wallTopsV.get(`${x + 1},${z}`),
      wallTopsH.get(`${x},${z}`),
      wallTopsH.get(`${x},${z + 1}`),
    ].filter((value) => value != null);
    return values.length ? Math.max(...values) : null;
  };

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const roofId = data.roofs[z * width + x];
      const kind = defs?.roofKinds?.[roofId];
      if (!kind || kind.texture == null) continue;
      if (!textures.get(kind.texture)) continue;
      const fallback =
        Math.max(
          heightAt(data, x, z),
          heightAt(data, x + 1, z),
          heightAt(data, x, z + 1),
          heightAt(data, x + 1, z + 1),
        ) + 1.8;
      const index = tiles.length;
      tiles.push({ x, z, texture: kind.texture, ownTop: edgeTop(x, z) ?? fallback });
      at.set(`${x},${z}`, index);
    }
  }

  const parent = tiles.map((_, index) => index);
  const find = (index) => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (const tile of tiles) {
    const here = at.get(`${tile.x},${tile.z}`);
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const next = at.get(`${tile.x + dx},${tile.z + dz}`);
      if (next == null || tiles[next].texture !== tile.texture) continue;
      union(here, next);
    }
  }

  const flatTop = new Map();
  tiles.forEach((tile, index) => {
    const root = find(index);
    flatTop.set(root, Math.max(flatTop.get(root) ?? 0, tile.ownTop));
  });

  for (const tile of tiles) {
    const texture = textures.get(tile.texture);
    const bucket = groupBucket(groups, `roof:${tile.texture}`, { texture, colour: 0xffffff });
    const y = flatTop.get(find(at.get(`${tile.x},${tile.z}`))) + 0.02;
    const { x, z } = tile;
    const hasRoof = (nx, nz) => {
      const next = at.get(`${nx},${nz}`);
      return next != null && tiles[next].texture === tile.texture;
    };
    const north = hasRoof(x, z - 1);
    const east = hasRoof(x + 1, z);
    const south = hasRoof(x, z + 1);
    const west = hasRoof(x - 1, z);
    const diagonal = wallIndex.diagonal.get(`${x},${z}`);
    const point = (px, pz, u, v) => [[px, y, pz], u, v];
    const nw = point(x, z, 0, 0);
    const ne = point(x + 1, z, 1, 0);
    const sw = point(x, z + 1, 0, 1);
    const se = point(x + 1, z + 1, 1, 1);

    if (diagonal) {
      let corners = null;
      if (!south && !west) corners = [nw, ne, se];
      else if (!north && !east) corners = [nw, sw, se];
      else if (!south && !east) corners = [nw, ne, sw];
      else if (!north && !west) corners = [ne, sw, se];
      else if (diagonal === "\\") {
        const towardNorthEast = (north ? 1 : 0) + (east ? 1 : 0);
        const towardSouthWest = (south ? 1 : 0) + (west ? 1 : 0);
        if (towardNorthEast === towardSouthWest) pushQuadUV(bucket, [nw, ne, sw, se]);
        else pushTri(bucket, towardNorthEast > towardSouthWest ? [nw, ne, se] : [nw, sw, se]);
        continue;
      } else {
        const towardNorthWest = (north ? 1 : 0) + (west ? 1 : 0);
        const towardSouthEast = (south ? 1 : 0) + (east ? 1 : 0);
        if (towardNorthWest === towardSouthEast) pushQuadUV(bucket, [nw, ne, sw, se]);
        else pushTri(bucket, towardNorthWest > towardSouthEast ? [nw, ne, sw] : [ne, sw, se]);
        continue;
      }
      pushTri(bucket, corners);
      continue;
    }

    let x0 = x;
    let x1 = x + 1;
    let z0 = z;
    let z1 = z + 1;
    if (wallIndex.vertical.has(`${x},${z}`)) x0 += FLOOR_WALL_INSET;
    if (wallIndex.vertical.has(`${x + 1},${z}`)) x1 -= FLOOR_WALL_INSET;
    if (wallIndex.horizontal.has(`${x},${z}`)) z0 += FLOOR_WALL_INSET;
    if (wallIndex.horizontal.has(`${x},${z + 1}`)) z1 -= FLOOR_WALL_INSET;
    if (x1 - x0 < 0.2 || z1 - z0 < 0.2) continue;
    pushQuadUV(bucket, [
      point(x0, z0, x0 - x, z0 - z),
      point(x1, z0, x1 - x, z0 - z),
      point(x0, z1, x0 - x, z1 - z),
      point(x1, z1, x1 - x, z1 - z),
    ]);
  }
  return meshesFromGroups(groups);
}
