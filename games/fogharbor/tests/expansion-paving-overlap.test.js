import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createGround } from "../src/ground.js";
import { createTerrain } from "../src/terrain.js";
import { createExpansionPavingGeometry } from "../src/expansion-paving.js";

function combinedFloors() {
  const scene = new THREE.Scene();
  const originalLoad = THREE.TextureLoader.prototype.load;
  // Texture decoding is the only browser-only boundary; floor geometry is real.
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    createGround(scene, { capabilities: { getMaxAnisotropy: () => 8 } });
  } finally {
    THREE.TextureLoader.prototype.load = originalLoad;
  }
  const oldFloors = scene.children.filter(
    (mesh) => mesh.isMesh && mesh.material.name === "Rain-wet quay paving",
  );
  const terrain = createTerrain({}, { authoredEnvironment: true });
  scene.add(terrain.root);
  oldFloors.push(...terrain.walkSurfaces);
  const paving = new THREE.Mesh(
    createExpansionPavingGeometry(),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  scene.add(paving);
  scene.updateMatrixWorld(true);
  return { oldFloors, paving };
}
const floors = combinedFloors();
function topHits(meshes, x, z, height) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, height + 0.12, z),
    new THREE.Vector3(0, -1, 0),
    0,
    0.24,
  );
  return ray.intersectObjects(meshes, false).filter((hit) =>
    hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.25,
  );
}

test("old and new paving form one layer at the actual low and raised city gateways", () => {
  for (const [x, z, height] of [[13, 20, 0], [-62, 49, 2.7]]) {
    const old = topHits(floors.oldFloors, x, z, height);
    const added = topHits([floors.paving], x, z, height);
    assert.ok(old.length, `fixture must reach the existing walking floor at ${x},${z}`);
    assert.equal(
      added.length,
      0,
      `${x},${z}: old floor y=${old[0].point.y.toFixed(3)} and new floor y=${added[0]?.point.y.toFixed(3)} overlap`,
    );
  }
});

function assertSingleLayer(x, z, height) {
  const hits = topHits([...floors.oldFloors, floors.paving], x, z, height);
  assert.ok(hits.length, `walking seam has a hole at ${x},${z}`);
  // Adjacent triangles legitimately share their exact seam. Only distinct
  // heights represent competing floor layers, including a millimetre crack.
  const heights = hits.map((hit) => hit.point.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1e-5,
    `multiple walking layers at ${x},${z}: ${heights.join(", ")}`);
  assert.ok(Math.abs(heights[0] - height) < .035,
    `seam left the walking elevation at ${x},${z}`);
}

test("both city gateway seams stay covered across their full usable width", () => {
  for (const offset of [-1.1, 0, 1.1]) {
    for (const dz of [-.2, -.01, -.001, 0, .001, .01, .2]) {
      assertSingleLayer(13 + 7 * (2 + dz) / 3 + offset, 22 + dz, 0);
      assertSingleLayer(-62 - 2 * (2 + dz) / 7 + offset, 51 + dz, 2.7);
    }
  }
  // The concave inn terrace also has an oblique west edge near its north
  // corner. Its shared edge must be clipped exactly, not by a bounding box.
  for (const dz of [-.01, 0, .01]) {
    const z = 50.5 + dz;
    assertSingleLayer(-64 - (51 - z) * 2 / 7, z, 2.7);
  }
});

test("historic clipping leaves no added walk triangles inside matching old floors", () => {
  const p = floors.paving.geometry.attributes.position;
  let tested = 0;
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (z > 52 || Math.abs(floors.paving.geometry.attributes.normal.getY(i)) < .25) continue;
    tested++;
    const old = topHits(floors.oldFloors, x, z, y)
      .filter((hit) => Math.abs(hit.point.y - y) <= .035);
    assert.equal(old.length, 0, `new triangle centroid overlaps old floor at ${x},${y},${z}`);
  }
  assert.ok(tested > 500, "inspect the actual low and raised gateway triangle regions");
});
