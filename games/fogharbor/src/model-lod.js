import * as THREE from "three";

const variants = new WeakMap();
const bundles = new Map();

export const hasGeometryLODs = (geometry) => variants.has(geometry);

export function setGeometryLODs(geometry, medium, low) {
  variants.set(geometry, [geometry, medium ?? geometry, low ?? medium ?? geometry]);
}

export function transformLODGeometry(geometry, matrix) {
  const levels = variants.get(geometry) ?? [geometry];
  const transformed = levels.map((level) => level.clone().applyMatrix4(matrix));
  if (levels.length === 3) setGeometryLODs(...transformed);
  return transformed[0];
}

export async function loadModelWithLOD(loader, url, lodUrl) {
  if (!bundles.has(lodUrl)) bundles.set(lodUrl, loader.loadAsync(lodUrl));
  const [model, bundle] = await Promise.all([loader.loadAsync(url), bundles.get(lodUrl)]);
  const geometries = new Map();
  bundle.scene.traverse((mesh) => {
    if (mesh.isMesh) geometries.set(mesh.userData.lodKey ?? mesh.name, mesh.geometry);
  });
  model.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const source = model.parser.associations.get(mesh);
    if (source?.meshes === undefined) return;
    const key = `m${source.meshes}_p${source.primitives ?? 0}`;
    const medium = geometries.get(`${key}_l1`), low = geometries.get(`${key}_l2`);
    if (medium && low) setGeometryLODs(mesh.geometry, medium, low);
  });
  return model;
}

// Hysteresis keeps small camera-follow movements from flipping between levels.
export function selectLOD(distance, current = 0) {
  if (current === 0) return distance > 82 ? 2 : distance > 44 ? 1 : 0;
  if (current === 1) return distance < 36 ? 0 : distance > 82 ? 2 : 1;
  return distance < 36 ? 0 : distance < 68 ? 1 : 2;
}

export function createSceneLOD(scene, { enabled = true } = {}) {
  scene.updateMatrixWorld(true);
  const targets = [];
  scene.traverse((mesh) => {
    if (!mesh.isMesh || !variants.has(mesh.geometry)) return;
    // Retain the complete model's culling bounds through every level.
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    const levels = variants.get(mesh.geometry);
    for (const geometry of levels.slice(1)) {
      geometry.boundingBox = mesh.geometry.boundingBox.clone();
      geometry.boundingSphere = mesh.geometry.boundingSphere.clone();
    }
    targets.push({ mesh, levels, level: 0, bounds: new THREE.Box3().setFromObject(mesh) });
  });
  const counts = [0, 0, 0];
  const center = new THREE.Vector3(), playerPoint = new THREE.Vector3();
  let fullTriangles = 0, activeTriangles = 0;
  return {
    update(camera, player) {
      counts.fill(0);
      fullTriangles = activeTriangles = 0;
      const zoom = (camera.top - camera.bottom) / 24;
      playerPoint.set(player.x, player.y + 1, player.z);
      for (const target of targets) {
        const { mesh, levels, bounds } = target;
        bounds.getCenter(center);
        const distance = camera.position.distanceTo(center) * zoom;
        // The room and immediate surroundings always use the original geometry.
        const level = !enabled || bounds.distanceToPoint(playerPoint) < 10
          ? 0 : selectLOD(distance, target.level);
        if (level !== target.level) {
          mesh.geometry = levels[level];
          target.level = level;
        }
        counts[level]++;
        const copies = mesh.isInstancedMesh ? mesh.count : 1;
        fullTriangles += (levels[0].index?.count ?? levels[0].attributes.position.count) / 3 * copies;
        activeTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * copies;
      }
    },
    setEnabled(value) { enabled = value; },
    state: () => ({ enabled, meshes: targets.length, levels: [...counts], fullTriangles, activeTriangles }),
  };
}

export function splitInstanceBatches(source, cellSize = 18) {
  const cells = new Map(), matrix = new THREE.Matrix4();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(matrix.clone());
  }
  return [...cells].map(([cell, matrices]) => {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, matrices.length);
    mesh.name = `${source.name} · cell ${cell}`;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return mesh;
  });
}
