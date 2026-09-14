import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  EXPANSION_SCENES,
  EXPANSION_BUILDINGS,
  buildingPoint,
} from "../src/expansion-layout.js";
import { canWalk, canTraverse, route, heightAt } from "../src/movement.js";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import { LIFE_OBSTACLES } from "../src/world-life.js";
const obstacles = [
  ...createNeighborhood(new THREE.Scene()).obstacles,
  ...createDistricts(new THREE.Scene()).obstacles,
  ...LIFE_OBSTACLES,
];
test("all ten new courtyards and thirty real doorways connect to the existing story world", () => {
  assert.equal(EXPANSION_SCENES.length, 10);
  assert.equal(new Set(EXPANSION_BUILDINGS.map((b) => b.id)).size, 30);
  for (const s of EXPANSION_SCENES) {
    const target = { x: s.x, z: s.z + 3 };
    assert.ok(
      canWalk(target.x, target.z, obstacles),
      s.id + " destination blocked",
    );
    const points = route({ x: -34, z: 19 }, target, obstacles);
    assert.ok(points.length, s.id + " disconnected");
    assert.equal(heightAt(target.x, target.z), s.height);
    let previous = { x: -34, z: 19 };
    for (const p of points) {
      assert.ok(canTraverse(previous, p, obstacles), s.id + " invalid edge");
      previous = p;
    }
  }
  for (const b of EXPANSION_BUILDINGS) {
    const outside = buildingPoint(b, 0, 4.5),
      inside = buildingPoint(b, 0, 0);
    assert.ok(
      canTraverse(outside, inside, obstacles),
      b.id + " doorway blocked",
    );
    assert.equal(
      canTraverse(buildingPoint(b, 3.8, 0), inside, obstacles),
      false,
      b.id + " wall permeable",
    );
  }
});

test("a hitched carriage clears the full circuit, including its horse and rear corners", async () => {
  const { trafficPose, TRAFFIC_LENGTH } = await import(
    "../src/expansion-life.js"
  );
  for (let distance = 0; distance < TRAFFIC_LENGTH; distance += 0.2) {
    const pose = trafficPose(distance);
    for (const [side, along] of [
      [-0.6, 4.6],
      [0.6, 4.6],
      [-1.1, 1.6],
      [1.1, 1.6],
      [-1.1, -1.9],
      [1.1, -1.9],
    ]) {
      const x =
        pose.position.x +
        Math.cos(pose.yaw) * side +
        Math.sin(pose.yaw) * along;
      const z =
        pose.position.z -
        Math.sin(pose.yaw) * side +
        Math.cos(pose.yaw) * along;
      assert.ok(
        canWalk(x, z, obstacles),
        `vehicle sweeps an obstacle at ${x},${z}`,
      );
      assert.ok(
        Math.abs(heightAt(x, z) - pose.position.y) < 0.15,
        "vehicle leaves its level road",
      );
    }
  }
});

test("rendered roads and every stair tread match navigation and remain above the soil", async () => {
  const { createExpansionPavingGeometry, createExpansionLandscapeGeometry } =
    await import("../src/expansion-paving.js");
  const { EXPANSION_ROADS, trafficPose, TRAFFIC_LENGTH } = await import(
    "../src/expansion-layout.js"
  );
  const paving = new THREE.Mesh(
    createExpansionPavingGeometry(),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const soil = new THREE.Mesh(
    createExpansionLandscapeGeometry(),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const samples = EXPANSION_SCENES.map((s) => ({ x: s.x, z: s.z + 3 }));
  for (let i = 0; i < 48; i++) {
    const p = trafficPose((i / 48) * TRAFFIC_LENGTH).position;
    samples.push({ x: p.x, z: p.z });
  }
  for (const stair of EXPANSION_ROADS.filter((r) => r.stairs))
    for (let i = 0; i < 18; i++)
      samples.push({
        x: stair.a[0],
        z: stair.a[1] + ((stair.b[1] - stair.a[1]) * (i + 0.45)) / 18,
      });
  const ray = new THREE.Raycaster();
  for (const p of samples) {
    ray.set(new THREE.Vector3(p.x, 40, p.z), new THREE.Vector3(0, -1, 0));
    const floor = ray.intersectObject(paving)[0],
      earth = ray.intersectObject(soil)[0];
    assert.ok(floor, `missing rendered pavement at ${p.x},${p.z}`);
    assert.ok(
      Math.abs(floor.point.y - heightAt(p.x, p.z)) < 0.04,
      `pavement height differs at ${p.x},${p.z}`,
    );
    if (earth)
      assert.ok(
        earth.point.y < floor.point.y - 0.04,
        `soil buries path at ${p.x},${p.z}`,
      );
  }
});

test("harbour paving stays visible and pickable above the existing hinterland", async () => {
  const { createTerrain } = await import("../src/terrain.js");
  const { createExpansionPavingGeometry } = await import(
    "../src/expansion-paving.js"
  );
  const historic = createTerrain({}, { authoredEnvironment: true }).root;
  const paving = new THREE.Mesh(
    createExpansionPavingGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  paving.userData.walkSurface = true;
  const ray = new THREE.Raycaster();
  // These are the actual courtyard, doorway and aisle of all three low cargo buildings.
  for (const b of EXPANSION_BUILDINGS.filter((b) => b.sceneId === "scene09")) {
    for (const z of [4.5, 3, 0]) {
      const p = buildingPoint(b, 0, z);
      ray.set(new THREE.Vector3(p.x, 30, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects([historic, paving], true)[0];
      assert.equal(
        hit?.object,
        paving,
        `${b.id}: historic grass hides the new street`,
      );
    }
  }
});

test("every new slope joins its end levels without cutting into raised courtyards", async () => {
  const { EXPANSION_ROADS } = await import("../src/expansion-layout.js");
  for (const road of EXPANSION_ROADS.filter((r) => r.a[2] !== r.b[2])) {
    const steps = Math.ceil(
      Math.hypot(road.b[0] - road.a[0], road.b[1] - road.a[1]) / 0.15,
    );
    const point = (i) => ({
      x: road.a[0] + ((road.b[0] - road.a[0]) * i) / steps,
      z: road.a[1] + ((road.b[1] - road.a[1]) * i) / steps,
    });
    for (let i = 0; i < steps; i++)
      assert.ok(
        canTraverse(point(i), point(i + 1), obstacles),
        `${road.id} has an impassable grade joint`,
      );
  }
  for (const [start, end] of [
    [
      { x: 31.8, z: 49.4 },
      { x: -7.4, z: 73.4 },
    ],
    [
      { x: 14.2, z: 70.2 },
      { x: 28.6, z: 103 },
    ],
  ]) {
    const path = route(start, end, obstacles);
    assert.ok(path.length);
    let previous = start,
      length = 0;
    for (const point of path) {
      length += Math.hypot(point.x - previous.x, point.z - previous.z);
      previous = point;
    }
    assert.ok(
      length < 110,
      "nearby quarters require a detour through the old town",
    );
  }
});
