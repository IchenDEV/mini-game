import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import { canWalk, heightAt, route } from "../src/movement.js";
import { TERRACE_DESTINATIONS } from "../src/terrain.js";
import { readModel } from "./helpers/gltf-geometry.js";
import { LIFE_OBSTACLES, LIFE_SPOTS, RESIDENT_ROUTES, createResident, residentCircuit } from "../src/world-life.js";

const world = createNeighborhood(new THREE.Scene());
const districts = createDistricts(new THREE.Scene());
const obstacles = [...world.obstacles, ...districts.obstacles, ...LIFE_OBSTACLES];

test("daily-life furnishings preserve story access, stairs and optional discoveries", () => {
  for (const target of [
    ...Object.values(world.spots), ...Object.values(districts.spots),
    ...Object.values(TERRACE_DESTINATIONS), ...LIFE_SPOTS,
  ]) {
    assert.ok(route({ x: -6.3, z: 1.6 }, target, obstacles).length, `unreachable ${JSON.stringify(target)}`);
  }
});

test("residents complete actual obstacle-aware circuits without walking through scenery", () => {
  const companions = readModel("companions-v1").scene;
  const visitor = new THREE.Vector3(100, 0, 100);
  for (const plan of RESIDENT_ROUTES) {
    const paths = residentCircuit(plan, obstacles);
    assert.ok(paths.every((path) => path.every((p) => canWalk(p.x, p.z, obstacles))), plan.name);
    const resident = createResident(companions, plan, obstacles);
    const start = resident.model.position.clone();
    let distance = 0;
    for (let frame = 0; frame < 2400; frame++) {
      const before = resident.model.position.clone();
      resident.update(frame / 20, .05, visitor, true);
      const p = resident.model.position;
      assert.ok(canWalk(p.x, p.z, obstacles), `${plan.name}: ${p.x}, ${p.z}`);
      assert.ok(Math.abs(p.y - heightAt(p.x, p.z)) < .02, `${plan.name} floats`);
      distance += Math.hypot(p.x - before.x, p.z - before.z);
    }
    assert.ok(distance > 6, `${plan.name} never leaves the waiting pose`);
    const before = resident.model.position.clone();
    resident.update(121, .05, before.clone(), true);
    assert.equal(Math.hypot(before.x - resident.model.position.x, before.z - resident.model.position.z), 0, "resident yields near the player");
    assert.notDeepEqual(resident.model.position.toArray(), start.toArray());
  }
});

test("resident wardrobe changes preserve story colors and shared position buffers", () => {
  const asset = readModel("companions-v1").scene;
  const source = asset.getObjectByName("Milo"), originals = [];
  source.traverse((mesh) => { if (mesh.isMesh) originals.push(mesh.geometry); });
  const snapshots = originals.map((geometry) => geometry.attributes.color.array.slice());
  const resident = createResident(asset, RESIDENT_ROUTES[0], obstacles), copies = [];
  resident.model.traverse((mesh) => { if (mesh.isMesh) copies.push(mesh.geometry); });
  let changed = 0;
  originals.forEach((geometry, index) => {
    assert.deepEqual(geometry.attributes.color.array, snapshots[index]);
    assert.equal(copies[index].attributes.position, geometry.attributes.position);
    const before = snapshots[index], after = copies[index].attributes.color.array;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > .02) changed++;
  });
  assert.ok(changed > 500, "the actual exported cloth palette must change");
});

test("authored life props fit their navigation footprints and ship packed textures", async () => {
  const { LIFE_PROPS } = await import("../src/world-life.js");
  const { scene, document } = readModel("life-props-v1");
  for (const prop of LIFE_PROPS) {
    const model = scene.getObjectByName(prop.model);
    const bounds = new THREE.Box3().setFromObject(model);
    assert.ok(bounds.min.y >= -.001, `${prop.model} sits below its foundation`);
    assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= prop.width / 2);
    assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= prop.depth / 2);
  }
  const triangles = document.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce(
    (count, primitive) => count + document.accessors[primitive.indices].count / 3, 0,
  ), 0);
  assert.ok(triangles < 35000);
  assert.ok(document.images.every((image) => image.bufferView !== undefined && !image.uri));
});
