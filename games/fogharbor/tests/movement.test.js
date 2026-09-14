import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDistricts } from "../src/districts.js";
import { createNeighborhood } from "../src/neighborhood.js";
import { canWalk, route, direction, heightAt, move } from "../src/movement.js";
const world = createNeighborhood(new THREE.Scene());
test("every chapter interaction is reachable from Nora on the actual scene obstacles", () => {
  for (const target of Object.values(world.spots)) {
    const path = route({ x: -6, z: 3.4 }, target, world.obstacles);
    assert.ok(path.length > 0, JSON.stringify(target));
    assert.ok(path.every((p) => canWalk(p.x, p.z, world.obstacles)));
  }
  const bridge = route({ x: -6, z: 3.4 }, { x: -10, z: 17 }, world.obstacles);
  assert.ok(bridge.length > 0);
  assert.ok(heightAt(-10, 11) > 0.5);
  assert.equal(heightAt(0, 3), 0);
});
test("WASD does not bind to camera rotation and diagonals cannot move faster", () => {
  for (const yaw of [0.38, Math.PI / 4, Math.PI]) {
    assert.deepEqual(
      direction(new Set(["a"]), yaw),
      direction(new Set(["arrowleft"]), yaw),
    );
    const d = direction(new Set(["w", "d"]), yaw);
    assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-9);
  }
  const p = { x: 13.49, z: 4 };
  move(p, { x: 1, z: 0 }, 0.1, world.obstacles);
  assert.equal(p.x, 13.49);
  assert.deepEqual(route({ x: 0, z: 3 }, { x: 0, z: 12 }, world.obstacles), []);
});

test("batched scenery preserves story animation, repair relocation, and inspection visibility", () => {
  const wheel = world.root.getObjectByName("iron flywheel");
  const cog = world.root.getObjectByName("reduction gear 2");
  const state = { repairStep: 3, delivered: true, chapterComplete: true };
  world.update(5.6, 0.1, state);
  const before = [wheel.rotation.z, cog.rotation.z];
  world.update(6, 0.1, state);
  assert.deepEqual(
    [wheel.rotation.z, cog.rotation.z],
    before,
    "both mechanisms pause on the same supply beat",
  );
  world.update(6.8, 0.1, state);
  assert.notEqual(wheel.rotation.z, before[0]);
  assert.notEqual(cog.rotation.z, before[1]);
  const repairedAngle = wheel.rotation.z;
  world.update(6, 0.1, { ...state, pumpRestored: true });
  assert.notEqual(
    wheel.rotation.z,
    repairedAngle,
    "repairing the west supply also removes the old salt-lane pause",
  );
  assert.ok(world.kettle.position.x > 0, "delivered kettle reaches the cafe");
  world.setState({ repairStep: 0, delivered: false });
  assert.ok(
    world.kettle.position.x < 0,
    "new repair restores the bench appliance",
  );
  assert.ok(
    world.kettleParts.lid.children.some((child) => child.isMesh),
    "lid remains an independently rendered part",
  );
  world.setWorkshopFocus(true);
  assert.equal(
    world.kettle.visible,
    true,
    "inspection keeps the appliance visible",
  );
  world.setWorkshopFocus(false);
});

test("all three districts and both banks form one traversable circuit", () => {
  const districts = createDistricts(new THREE.Scene());
  const obstacles = [...world.obstacles, ...districts.obstacles];
  const stops = [
    { x: -6, z: 3.4 },
    ...Object.values(districts.spots),
    { x: -58, z: 19 },
    { x: -34, z: 19 },
    { x: -10, z: 19 },
    { x: -6, z: 3.4 },
  ];
  for (let i = 1; i < stops.length; i++) {
    const path = route(stops[i - 1], stops[i], obstacles);
    assert.ok(path.length, JSON.stringify([stops[i - 1], stops[i]]));
    assert.ok(path.every((p) => canWalk(p.x, p.z, obstacles)));
  }
  for (const x of [-10, -34, -58]) assert.ok(heightAt(x, 11) > 0.5);
  assert.deepEqual(
    route({ x: -6, z: 3 }, { x: -23, z: 11 }, obstacles),
    [],
    "water remains impassable between bridges",
  );
});
