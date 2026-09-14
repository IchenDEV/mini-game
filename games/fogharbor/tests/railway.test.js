import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import {
  RAILWAY,
  railPoint,
  railPrismGeometry,
  tramPoseAt,
} from "../src/railway.js";

test("rail running faces keep the same upward normals across separately built sections", () => {
  for (const [start, end] of [
    [-68, -25],
    [-25, 27.5],
  ]) {
    const geometry = railPrismGeometry(
      start,
      end,
      0.47,
      0.55,
      RAILWAY.headY - 0.075,
      RAILWAY.headY,
    );
    const positions = geometry.getAttribute("position"),
      normals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i += 3) {
      if (
        [0, 1, 2].every(
          (j) => Math.abs(positions.getY(i + j) - RAILWAY.headY) < 1e-5,
        )
      )
        for (let j = 0; j < 3; j++)
          assert.ok(
            normals.getY(i + j) > 0.99999,
            "rail end-cap normals must not tilt the horizontal running surface",
          );
    }
    geometry.dispose();
  }
});

const scene = new THREE.Scene();
const world = createNeighborhood(scene);
createDistricts(scene);
const tram = world.root.getObjectByName("canal tram");

test("the rendered tram wheels touch the railhead instead of sinking into the deck", () => {
  world.update(0, 0, {});
  world.root.updateMatrixWorld(true);
  const lowestWheel = new THREE.Box3().setFromObject(tram, true).min.y;
  assert.ok(
    Math.abs(lowestWheel - RAILWAY.headY) < 0.012,
    `wheel bottom ${lowestWheel.toFixed(4)}m does not meet the 4.8975m railhead`,
  );
});

test("the full tram stays on the built railway throughout its operating cycle", () => {
  for (let time = 0; time <= 480; time += 2) {
    world.update(time, 0, {});
    world.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(tram, true);
    assert.ok(
      bounds.min.x >= RAILWAY.startX && bounds.max.x <= RAILWAY.endX,
      `at ${time}s carriage spans ${bounds.min.x.toFixed(2)}..${bounds.max.x.toFixed(2)}, outside track ends`,
    );
  }
});

test("the actual front and rear wheel nodes stay on their own rail through the bend", () => {
  let beforeAngle;
  for (const time of [0, 30, 120, 180, 240, 350]) {
    world.update(time, 0, {});
    scene.updateMatrixWorld(true);
    for (const end of ["rear", "front"]) {
      const axle = tram.getObjectByName(`tram ${end} axle`);
      assert.ok(axle, `${end} axle must remain independently steerable`);
      const center = axle.getWorldPosition(new THREE.Vector3());
      const contacts = [-1, 1].map((side) =>
        railPoint(center.x, (side * RAILWAY.gauge) / 2),
      );
      const occupied = new Set();
      for (const side of ["left", "right"]) {
        const wheel = tram.getObjectByName(`tram ${end} ${side} wheel`);
        assert.ok(wheel);
        const point = wheel.getWorldPosition(new THREE.Vector3());
        const distances = contacts.map((p) =>
          Math.hypot(p.x - point.x, p.z - point.z),
        );
        assert.ok(
          Math.min(...distances) < 0.002,
          `${wheel.name} misses its rail at ${time}s`,
        );
        occupied.add(distances[0] < distances[1] ? 0 : 1);
        assert.ok(
          Math.abs(point.y - RAILWAY.wheelRadius - RAILWAY.headY) < 1e-6,
        );
        if (end === "front" && side === "left") {
          if (beforeAngle !== undefined)
            assert.notEqual(
              wheel.rotation.z,
              beforeAngle,
              "wheel must roll with travel",
            );
          beforeAngle = wheel.rotation.z;
        }
      }
      assert.equal(occupied.size, 2, "each axle must straddle both rails");
    }
  }
});

test("both rendered railheads maintain gauge and height across the real east/west seam and bend", () => {
  scene.updateMatrixWorld(true);
  const trackSceneMeshes = [];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (let parent = object; parent; parent = parent.parent)
      if (parent === tram || parent.name === "distant brass airship") return;
    trackSceneMeshes.push(object);
  });
  const ray = new THREE.Raycaster();
  ray.far = 0.4;
  for (const x of [-67.8, -53.3, -48, -42, -35.1, -25, -18, -9.2, 8.6, 26.8]) {
    const rails = [-1, 1].map((side) =>
      railPoint(x, (side * RAILWAY.gauge) / 2),
    );
    assert.ok(
      Math.abs(
        Math.hypot(rails[0].x - rails[1].x, rails[0].z - rails[1].z) -
          RAILWAY.gauge,
      ) < 1e-8,
    );
    for (const point of rails) {
      ray.set(
        new THREE.Vector3(point.x, RAILWAY.headY + 0.15, point.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObjects(trackSceneMeshes, false)[0];
      assert.ok(hit, `missing physical rail at ${JSON.stringify(point)}`);
      assert.ok(
        Math.abs(hit.point.y - RAILWAY.headY) < 0.002,
        `rail at x=${x}: actual top ${hit.point.y}, expected ${RAILWAY.headY}`,
      );
    }
  }
});

test("bogies follow the curve while the carriage follows their chord without abrupt heading changes", () => {
  let previous;
  let changedDirection = false;
  for (let time = 0; time <= 600; time += 0.2) {
    const pose = tramPoseAt(time);
    assert.equal(pose.axles.length, 2);
    for (const axle of pose.axles) {
      const rail = railPoint(axle.position.x);
      assert.ok(Math.abs(axle.position.z - rail.z) < 0.002);
      assert.ok(
        Math.abs(axle.position.y - RAILWAY.wheelRadius - RAILWAY.headY) < 1e-8,
      );
    }
    if (previous) {
      const angle = Math.atan2(
        Math.sin(pose.yaw - previous.yaw),
        Math.cos(pose.yaw - previous.yaw),
      );
      assert.ok(Math.abs(angle) < 0.02, `heading jumps ${angle} at ${time}s`);
      assert.ok(
        Math.hypot(
          pose.position.x - previous.position.x,
          pose.position.z - previous.position.z,
        ) < 0.3,
        `carriage teleports at ${time}s`,
      );
      changedDirection ||= previous.direction * pose.direction < 0;
    }
    previous = pose;
  }
  assert.ok(
    changedDirection,
    "the bounded double-ended tram reverses instead of leaving the rails",
  );
});
