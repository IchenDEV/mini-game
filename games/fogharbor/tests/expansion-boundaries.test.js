import * as THREE from "three";
import { createBoundaryCopingGeometry } from "../src/expansion-boundaries.js";
import test from "node:test";
import assert from "node:assert/strict";
import { EXPANSION_BOUNDARIES } from "../src/expansion-layout.js";
import { canWalk, canTraverse, move } from "../src/movement.js";

test("the open hospital junction has no rendered railing across its walking connection", () => {
  const from = { x: -25.75, z: 109.6 },
    to = { x: -24.65, z: 109.6 };
  assert.ok(canTraverse(from, to));
  const across = EXPANSION_BOUNDARIES.filter(
    (e) =>
      e.railing &&
      Math.abs(e.a[0] - e.b[0]) < 1e-6 &&
      e.a[0] > from.x &&
      e.a[0] < to.x &&
      Math.min(e.a[2], e.b[2]) < from.z &&
      Math.max(e.a[2], e.b[2]) > from.z,
  );
  assert.equal(across.length, 0, "a drawn railing intersects the valid route");
});

test("the character body cannot enter the west upper street railing", () => {
  assert.ok(
    EXPANSION_BOUNDARIES.some((e) => e.railing && Math.abs(e.a[0] + 76) < 1e-6),
  );
  assert.equal(canWalk(-75.68, 96), false, "body overlaps a visible railing");
  assert.ok(
    canWalk(-75.3, 96),
    "space behind the railing must remain walkable",
  );
});

test("repeated movement stops the whole body at a railing and still crosses the open junction", () => {
  const player = { x: -75.3, y: 5.4, z: 96 };
  for (let i = 0; i < 30; i++) move(player, { x: -1, z: 0 }, 0.08, []);
  assert.ok(player.x >= -75.62, "movement entered the railing capsule");
  assert.ok(player.x < -75.3, "movement never approached the railing");
  const crossing = { x: -25.75, y: 5.4, z: 109.6 };
  move(crossing, { x: 1, z: 0 }, 1.1, []);
  assert.ok(Math.abs(crossing.x + 24.65) < 1e-6);
});

test("retaining-wall corner copings contain only one visible top surface", () => {
  const mesh = new THREE.Mesh(
    createBoundaryCopingGeometry(EXPANSION_BOUNDARIES),
    new THREE.MeshBasicMaterial(),
  );
  const ray = new THREE.Raycaster();
  // Rear northwest corner of the hospital terrace, away from triangle diagonals.
  ray.set(
    new THREE.Vector3(-25 + 0.073, 20, 94 + 0.031),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = ray
    .intersectObject(mesh)
    .filter((hit) => Math.abs(hit.point.y - 5.49) < 0.001);
  assert.equal(
    hits.length,
    1,
    "two cap top faces overlap at a right-angle corner",
  );
});

test("the hospital stair has continuous handrails through the full flight", () => {
  for (const x of [-28, -25.2])
    for (let z = 86.15; z < 92.95; z += 0.2)
      assert.ok(
        EXPANSION_BOUNDARIES.some(
          (edge) =>
            edge.source === "gateway-3-1" &&
            edge.railing &&
            Math.abs(edge.a[0] - x) < 0.001 &&
            Math.min(edge.a[2], edge.b[2]) <= z &&
            Math.max(edge.a[2], edge.b[2]) >= z,
        ),
        `missing stair handrail at ${x},${z}`,
      );
});
