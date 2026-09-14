import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { splitStaticMesh, partitionStaticSurfaces } from "../src/spatial-mesh.js";

function triangles(mesh) {
  const geometry = mesh.geometry, positions = geometry.attributes.position;
  const indices = geometry.index, result = [];
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const face = [];
    for (let j = 0; j < 3; j++) {
      const vertex = indices ? indices.getX(i + j) : i + j;
      const values = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld).toArray();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (name === "position") continue;
        for (let c = 0; c < attribute.itemSize; c++) values.push(attribute.getComponent(vertex, c));
      }
      face.push(values.map(value => value.toFixed(5)).join(","));
    }
    result.push(face.join("|"));
  }
  return result.sort();
}

test("spatial chunks preserve every triangle, transform, UV and normalized colour", () => {
  const geometry = new THREE.PlaneGeometry(120, 12, 80, 8);
  geometry.rotateX(-Math.PI / 2);
  const colors = new Uint8Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i++) colors[i] = i % 251;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));
  const source = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
  source.position.set(8, 3, -4); source.rotation.y = .4; source.scale.set(1.2, 1, .8);
  source.updateMatrixWorld(true);
  const expected = triangles(source), chunks = splitStaticMesh(source);
  assert.ok(chunks.length > 3);
  const actual = [];
  for (const chunk of chunks) {
    chunk.updateMatrixWorld(true);
    assert.equal(chunk.material, source.material);
    actual.push(...triangles(chunk));
  }
  assert.deepEqual(actual.sort(), expected);
});

test("street chunk joins remain solid while distant cells can be culled", () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(144, 12, 144, 16), new THREE.MeshBasicMaterial());
  source.geometry.rotateX(-Math.PI / 2);
  const scene = new THREE.Scene(); scene.add(source);
  const registered = [];
  const stats = partitionStaticSurfaces(scene, { onChunk: mesh => registered.push(mesh) });
  assert.equal(stats.sources, 1);
  assert.ok(stats.chunks >= 6);
  scene.updateMatrixWorld(true);
  for (const x of [-48.001, -48, -47.999, -.001, 0, .001, 47.999, 48, 48.001]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, .173), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(registered, false);
    assert.ok(hits.length && hits.every(hit => Math.abs(hit.point.y) < 1e-7), `gap at ${x}`);
  }
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 30);
  camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const visible = registered.filter(mesh => frustum.intersectsObject(mesh));
  assert.ok(visible.length < registered.length / 2, "offscreen road cells should not be submitted");
});

test("excluded LOD or animated meshes keep their original geometry and hierarchy", () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(144, 12, 144, 16));
  const scene = new THREE.Scene(); scene.add(source);
  const stats = partitionStaticSurfaces(scene, { exclude: mesh => mesh === source });
  assert.deepEqual(stats, { sources: 0, chunks: 0 });
  assert.equal(source.parent, scene);
});
