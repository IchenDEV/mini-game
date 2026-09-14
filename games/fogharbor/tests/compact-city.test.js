import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CITY_PLOTS, TERRACE_DESTINATIONS, STAIRS } from "../src/terrain.js";
import { canWalk, canTraverse, heightAt, route } from "../src/movement.js";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import { LIFE_OBSTACLES } from "../src/world-life.js";
import { accentPlacements } from "../src/architecture-accents.js";

const obstacles = [
  ...createNeighborhood(new THREE.Scene()).obstacles,
  ...createDistricts(new THREE.Scene()).obstacles,
  ...LIFE_OBSTACLES,
];
test("the new high street is reached by its real stair, never through a retaining wall", () => {
  const lower = { x: -32, z: 44.8 }, upper = TERRACE_DESTINATIONS.clockwalk;
  assert.ok(canWalk(lower.x, lower.z, obstacles));
  assert.equal(heightAt(lower.x, lower.z), 2.7);
  assert.equal(heightAt(upper.x, upper.z), 5.4);
  assert.equal(canTraverse(lower, upper, obstacles), false);
  const path = route(lower, upper, obstacles);
  assert.ok(path.length);
  const stair = STAIRS.find((s) => s.id === "clock-stairs");
  assert.ok(path.some((p) => Math.abs(p.x - stair.x) < .7 && p.z > stair.z0 && p.z < stair.z1));
  let previous = lower;
  for (const point of path) {
    assert.ok(canTraverse(previous, point, obstacles));
    previous = point;
  }
});
test("upper-storey additions retain pedestrian clearance and sealed galleries span real yards", () => {
  const placements = accentPlacements();
  assert.equal(placements.get("Accent_Gallery").length, 2);
  for (const matrix of placements.get("Accent_Balcony")) {
    const bottom = new THREE.Vector3(0, -.55, 0).applyMatrix4(matrix);
    assert.ok(bottom.y - heightAt(bottom.x, bottom.z) > 2.1);
  }
  for (const matrix of placements.get("Accent_Gallery")) {
    const bottom = new THREE.Vector3(0, -.2, 0).applyMatrix4(matrix);
    const a = new THREE.Vector3(-2, 0, 0).applyMatrix4(matrix);
    const b = new THREE.Vector3(2, 0, 0).applyMatrix4(matrix);
    assert.ok(bottom.y > 2.8);
    assert.ok(a.distanceTo(b) > 5 && a.distanceTo(b) < 7.5);
  }
  assert.ok(CITY_PLOTS.filter((p) => p.terrace === "clock-walk").length >= 2);
});

test("the exported architectural details remain clear of walking space and contain their textures", async () => {
  const { readModel } = await import("./helpers/gltf-geometry.js");
  const { createArchitectureAccents } = await import("../src/architecture-accents.js");
  const { scene, document } = readModel("architecture-accents-v1");
  const root = createArchitectureAccents(scene);
  const instance = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of root.children.filter((m) => m.name.startsWith("Accent_SteamRiser"))) {
    const vertices = mesh.geometry.attributes.position;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, instance);
      for (let v = 0; v < vertices.count; v += 3) {
        point.fromBufferAttribute(vertices, v).applyMatrix4(instance);
        if (point.y - heightAt(point.x, point.z) < 2.1)
          assert.equal(canWalk(point.x, point.z, obstacles), false, `pipe enters a path at ${point.x}, ${point.z}`);
      }
    }
  }
  const triangles = document.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce(
    (total, primitive) => total + document.accessors[primitive.indices].count / 3, 0,
  ), 0);
  assert.ok(triangles < 26000);
  assert.ok(document.images.every((image) => image.bufferView !== undefined && !image.uri));
});

test("the occluded-player cue follows joints without writing depth or entering reflection cameras", async () => {
  const { addPlayerVisibilityCue } = await import("../src/player-visibility.js");
  const actor = new THREE.Group(), joint = new THREE.Group();
  actor.add(joint);
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  joint.add(body);
  const originalMaterial = body.material;
  const [cue] = addPlayerVisibilityCue(actor);
  joint.rotation.x = .6;
  actor.position.set(3, 5.4, 8);
  actor.updateMatrixWorld(true);
  assert.deepEqual(cue.matrixWorld.elements, body.matrixWorld.elements);
  assert.equal(cue.geometry, body.geometry);
  assert.equal(cue.material.depthWrite, false);
  assert.equal(cue.material.depthFunc, THREE.GreaterDepth);
  assert.equal(cue.layers.test(new THREE.OrthographicCamera().layers), false);
  assert.equal(originalMaterial.transparent, false);
  assert.equal(body.material.opacity, 1);
  assert.ok(body.renderOrder > cue.renderOrder);
});
