import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

export default function Landscape3D({ src = "/landscape/lumbridge-3d.json" }) {
  const hostRef = useRef(null);
  const [message, setMessage] = useState("Loading RSC landscape…");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let frame = 0;
    let renderer;
    let controls;
    const resources = [];

    async function start() {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Landscape request failed (${response.status})`);
        const data = await response.json();
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

        const wallGeometry = buildWalls(data);
        const wallMaterial = new THREE.LineBasicMaterial({
          color: 0x4d463f,
          transparent: true,
          opacity: 0.9,
        });
        scene.add(new THREE.LineSegments(wallGeometry, wallMaterial));
        resources.push(wallGeometry, wallMaterial);

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

        setMessage("");
        const render = () => {
          if (disposed) return;
          controls.update();
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
      controls?.dispose();
      renderer?.dispose();
      resources.forEach((resource) => resource.dispose());
      host.replaceChildren();
    };
  }, [src]);

  return (
    <div className="landscape-3d">
      <div className="landscape-3d-canvas" ref={hostRef} />
      {message && <div className="landscape-3d-message">{message}</div>}
    </div>
  );
}
