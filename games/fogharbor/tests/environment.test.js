import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import {
  createMasonryDetails,
  createAuthoredTrees,
} from "../src/sculpted-environment.js";
import {
  createTerrain,
  COURT_LANES,
  STAIRS,
  TREE_PLOTS,
  COURTYARD_PROPS,
  terrainHeightAt,
  landscapeHeightAt,
} from "../src/terrain.js";

const masonry = createMasonryDetails(readModel("masonry-v1").scene);
masonry.updateMatrixWorld(true);
test("authored stone facing and caps keep every real stair and passage opening clear", () => {
  const openings = [
    ...COURT_LANES.flatMap((l) =>
      [l.a, l.b].map((end) => ({
        p: end,
        d: [l.b[0] - l.a[0], 0, l.b[2] - l.a[2]],
      })),
    ),
    ...STAIRS.map((s) => ({ p: [s.x, s.top, s.z1], d: [0, 0, 1] })),
  ];
  for (const { p, d } of openings) {
    const direction = new THREE.Vector3(...d).normalize(),
      center = new THREE.Vector3(...p).add(new THREE.Vector3(0, 0.42, 0));
    const ray = new THREE.Raycaster(
      center.clone().addScaledVector(direction, -0.6),
      direction,
      0,
      1.2,
    );
    assert.equal(
      ray.intersectObject(masonry, true).length,
      0,
      `stone blocks entrance ${p}`,
    );
  }
});
test("the detailed stone bridge retains the real crowned walk surface", () => {
  const bridge =
    readModel("civic-details-v1").scene.getObjectByName("Civic_Bridge");
  bridge.updateWorldMatrix(true, true);
  for (let z = -4.8; z <= 4.8; z += 0.3)
    for (const x of [-1.2, 0, 1.2]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 10, z),
        new THREE.Vector3(0, -1, 0),
      );
      const expected = 0.55 * Math.sin((Math.PI * (z + 5)) / 10),
        hits = ray
          .intersectObject(bridge, true)
          .filter((h) => h.face.normal.y > 0.5);
      assert.ok(
        hits.length && Math.abs(hits[0].point.y - expected) < 0.006,
        `bridge tread ${x},${z} differs`,
      );
    }
});
test("authored tree roots meet the ground or planter soil and share walk obstacles", () => {
  const placements = [...TREE_PLOTS.map(([x,z]) => [x,z,0]),
    ...COURTYARD_PROPS.filter((p) => p.kind === "planter").map((p) => [p.x,p.z,.36])];
  const { root } = createAuthoredTrees(readModel("trees-v1").scene);
  root.updateMatrixWorld(true);
  const trunks = root.children.filter((m) => /bark/i.test(m.material.name));
  assert.equal(
    trunks.reduce((n, m) => n + m.count, 0),
    placements.length,
  );
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3();
  for (const mesh of trunks)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      assert.ok(
        placements.some(
          ([x, z]) => Math.hypot(position.x - x, position.z - z) < 0.001,
        ),
      );
      const planting = placements.find(([x,z]) => Math.hypot(position.x-x,position.z-z)<.001);
      const expected = (terrainHeightAt(position.x, position.z) ??
        Math.max(0, landscapeHeightAt(position.x, position.z))) + planting[2];
      assert.ok(Math.abs(position.y - expected) < 0.001);
    }
});
test("new environment assets carry their surface maps with bounded geometry", () => {
  for (const [name, budget] of [
    ["trees-v1", 35000],
    ["masonry-v1", 12000],
  ]) {
    const { document } = readModel(name);
    assert.ok(
      document.images.every(
        (image) => image.bufferView !== undefined && !image.uri,
      ),
    );
    const count = document.meshes.reduce(
      (total, m) =>
        total +
        m.primitives.reduce(
          (n, p) => n + document.accessors[p.indices].count / 3,
          0,
        ),
      0,
    );
    assert.ok(count <= budget, `${name}: ${count} triangles`);
  }
});

test("atmosphere wrapping preserves separate GPU programs for wet and ordinary paving", async () => {
  const { finishEnvironmentLighting } =
    await import("../src/environment-lighting.js");
  const scene = new THREE.Scene();
  const wet = new THREE.MeshPhysicalMaterial({ name: "Rain-wet quay paving" });
  const dry = new THREE.MeshPhysicalMaterial({ name: "Terrace wet paving" });
  wet.onBeforeCompile = (shader) => {
    shader.fragmentShader += "\n// local planar reflection program";
  };
  scene.add(
    new THREE.Mesh(new THREE.PlaneGeometry(), wet),
    new THREE.Mesh(new THREE.PlaneGeometry(), dry),
  );
  assert.notEqual(wet.customProgramCacheKey(), dry.customProgramCacheKey());
  finishEnvironmentLighting(scene);
  assert.notEqual(
    wet.customProgramCacheKey(),
    dry.customProgramCacheKey(),
    "different material programs must not alias after wrapping",
  );
});
