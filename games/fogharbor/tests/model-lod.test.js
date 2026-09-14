import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHash } from "node:crypto";
import { readModel } from "./helpers/gltf-geometry.js";
import { readFileSync } from "node:fs";
import { selectLOD, setGeometryLODs, transformLODGeometry, createSceneLOD, splitInstanceBatches } from "../src/model-lod.js";

const cube = (segments) => new THREE.BoxGeometry(4, 6, 4, segments, segments, segments);

test("LOD hysteresis resists camera-follow jitter at both boundaries", () => {
  let level = 0;
  for (const distance of [43, 44.1, 42, 40, 37, 42, 43]) level = selectLOD(distance, level);
  assert.equal(level, 1);
  assert.equal(selectLOD(35, level), 0);
  level = selectLOD(83, level);
  for (const distance of [80, 75, 70, 68.1]) level = selectLOD(distance, level);
  assert.equal(level, 2);
  assert.equal(selectLOD(67.9, level), 1);
});

test("main-camera LOD preserves materials, instance transforms and nearby detail", () => {
  const high = cube(4), medium = cube(2), low = cube(1);
  setGeometryLODs(high, medium, low);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.InstancedMesh(high, material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(60, 0, 0));
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  const scene = new THREE.Scene(); scene.add(mesh);
  const manager = createSceneLOD(scene);
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12);
  camera.position.set(0, 12, 0);
  manager.update(camera, new THREE.Vector3());
  assert.equal(mesh.geometry, medium);
  camera.top = 24; camera.bottom = -24;
  manager.update(camera, new THREE.Vector3());
  assert.equal(mesh.geometry, low, "zooming out reduces detail in an isometric camera");
  assert.equal(mesh.material, material);
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 60);
  manager.update(camera, new THREE.Vector3(60, 0, 0));
  assert.equal(mesh.geometry, high, "approaching restores the actual doorway and window meshes");
  assert.ok(low.boundingBox.equals(high.boundingBox), "coarse meshes retain full culling bounds");
});

test("transformed foliage retains all levels and masonry batching retains every instance", () => {
  const high = cube(4); setGeometryLODs(high, cube(2), cube(1));
  const transformed = transformLODGeometry(high, new THREE.Matrix4().makeTranslation(0, 8, 0));
  const mesh = new THREE.InstancedMesh(transformed, new THREE.MeshStandardMaterial(), 3);
  [-40, 0, 40].forEach((x, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0)));
  const batches = splitInstanceBatches(mesh);
  assert.equal(batches.length, 3);
  const scene = new THREE.Scene(); scene.add(...batches);
  const manager = createSceneLOD(scene);
  assert.equal(manager.state().meshes, 3);
  assert.equal(batches.reduce((count, batch) => count + batch.count, 0), 3);
});

for (const name of ["city-kit-v1", "trees-v1", "masonry-v1", "expansion-buildings-v1",
  "wharf-v1", "pumpworks-v1", "architecture-accents-v1", "railway-kit-v1"]) {
  test(`${name}: baked LODs contain finite textured geometry and substantial reductions`, async () => {
    const bytes = readFileSync(new URL(`../public/models/${name}-lod.glb`, import.meta.url));
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const original = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
    const manifest = JSON.parse(readFileSync(new URL("../models/lod-manifest.json", import.meta.url)));
    assert.equal(createHash("sha256").update(original).digest("hex"), manifest[name].sourceSha256, "regenerate LODs when the source changes");
    const document = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)));
    const originalScene = readModel(name).scene;
    const originals = new Map(document.nodes.filter(node => node.mesh !== undefined)
      .map(node => [node.mesh, originalScene.getObjectByName(node.name)]));
    let triangles = [0, 0], count = 0;
    asset.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      assert.match(mesh.userData.lodKey, /^m\d+_p\d+_l[12]$/);
      const [, sourceMesh, sourcePrimitive] = mesh.userData.lodKey.match(/^m(\d+)_p(\d+)/);
      const attributes = document.meshes[sourceMesh].primitives[sourcePrimitive].attributes;
      if (attributes.TEXCOORD_0 !== undefined)
        assert.ok(mesh.geometry.attributes.uv, "preserve original texture coordinates");
      if (attributes.COLOR_0 !== undefined)
        assert.ok(mesh.geometry.attributes.color, "preserve foliage vertex colours");
      const sourceGeometry = originals.get(Number(sourceMesh)).children[Number(sourcePrimitive)].geometry;
      const sourceBox = new THREE.Box3();
      for (const index of sourceGeometry.index.array)
        sourceBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(sourceGeometry.attributes.position, index));
      const sourceBounds = { min: sourceBox.min.toArray(), max: sourceBox.max.toArray() };
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      for (const [i, axis] of ["x", "y", "z"].entries()) {
        const extent = sourceBounds.max[i] - sourceBounds.min[i];
        assert.ok(box.min[axis] >= sourceBounds.min[i] - .001 && box.max[axis] <= sourceBounds.max[i] + .001, `${mesh.name} ${axis}: ${box.min[axis]}..${box.max[axis]} vs ${sourceBounds.min[i]}..${sourceBounds.max[i]}`);
        assert.ok(box.max[axis] - box.min[axis] >= extent * .7, `${mesh.name} ${axis}: silhouette extent ${box.max[axis] - box.min[axis]} vs ${extent}`);
      }
      for (const attribute of Object.values(mesh.geometry.attributes))
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
      const level = Number(mesh.userData.lodKey.at(-1)) - 1;
      triangles[level] += mesh.geometry.index.count / 3;
      count++;
    });
    assert.ok(count > 0);
    assert.ok(triangles[1] < triangles[0] * .75, "far geometry must be cheaper than medium geometry");
  });
}
