import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readModel } from './helpers/gltf-geometry.js';

const { scene } = readModel('expansion-buildings-v1');
for (const [id, point, normal] of [
  ['B27', [-1.8025, 2.303333, 3.49], [0, 0, 1]],
  ['B16', [3.723333, 3.678333, 3.25], [0, 0, 1]],
  ['B17', [3.723333, 3.528333, 3.25], [0, 0, 1]],
]) {
  test(`${id}: visible window and cornice junctions have one surface`, () => {
    const p = new THREE.Vector3(...point), n = new THREE.Vector3(...normal);
    const ray = new THREE.Raycaster(p.clone().addScaledVector(n, 20), n.negate());
    const hits = ray.intersectObject(scene.getObjectByName(id), true);
    assert.ok(hits.length, 'the junction must remain covered');
    const first = hits[0].distance;
    const overlapping = hits.filter(h => Math.abs(h.distance - first) < 1e-5);
    assert.equal(overlapping.length, 1, `${overlapping.length} faces compete at ${point}`);
  });
}

test('clearing-lane junction has continuous paving instead of exposed soil slivers', async () => {
  const { createExpansionPavingGeometry } = await import('../src/expansion-paving.js');
  const { expansionSurfaceAt } = await import('../src/expansion-layout.js');
  const mesh = new THREE.Mesh(createExpansionPavingGeometry(), new THREE.MeshBasicMaterial());
  for (const [x, z] of [[12.5, 78.5], [14.02, 78.34], [16.77, 77.96], [20.5, 79]]) {
    assert.ok(expansionSurfaceAt(x,z), `missing walk surface at ${x},${z}`);
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0,-1,0));
    const hits = ray.intersectObject(mesh);
    assert.equal(hits.length, 1, `one paved surface required at ${x},${z}`);
    assert.ok(Math.abs(hits[0].point.y - 2.72) < 1e-5);
  }
});
