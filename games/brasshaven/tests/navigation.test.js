import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  clampDestination,
  dampAngle,
  WALK_BOUNDS,
} from "../src/navigation.js";

test("all click destinations stay inside the accessible wharf", () => {
  assert.deepEqual(clampDestination(100, -90), {
    x: WALK_BOUNDS.maxX,
    z: WALK_BOUNDS.minZ,
  });
  assert.deepEqual(clampDestination(-100, 90), {
    x: WALK_BOUNDS.minX,
    z: WALK_BOUNDS.maxZ,
  });
  assert.deepEqual(clampDestination(2, 4), { x: 2, z: 4 });
});
test("movement is frame-rate independent and never overshoots", () => {
  const a = { x: 0, z: 0 },
    b = { ...a },
    target = { x: 3, z: 4 };
  for (let i = 0; i < 60; i++) advance(a, target, 2, 1 / 60);
  for (let i = 0; i < 120; i++) advance(b, target, 2, 1 / 120);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-10);
  advance(a, target, 100, 1);
  assert.deepEqual(a, target);
  assert.equal(advance(a, target, 2, 1), 0);
});
test("character turns the short way across the angle boundary", () => {
  const result = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 8, 0.1);
  assert.ok(result > Math.PI - 0.1 && result < Math.PI + 0.1);
});
