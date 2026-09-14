import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import {
  createSteamTrain,
  createAirship,
  createAuthoredRailway,
} from "../src/sculpted-transport.js";
import { RAILWAY, railPoint } from "../src/railway.js";

const train = createSteamTrain(readModel("train-v1").scene);
test("both actual GLB carriages stay fully on track and their four axles meet the running rails", () => {
  for (let time = 0; time < 600; time += 17) {
    train.update(time);
    train.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(train.root, true);
    assert.ok(
      bounds.min.x >= RAILWAY.startX - 0.002 &&
        bounds.max.x <= RAILWAY.endX + 0.002,
      `carriage beyond rail at ${time}`,
    );
    for (const vehicle of train.vehicles)
      for (const { node, wheels } of vehicle.axles) {
        const center = node.getWorldPosition(new THREE.Vector3());
        assert.ok(
          Math.abs(center.y - vehicle.radius - RAILWAY.headY) < 0.00001,
        );
        const contacts = [-1, 1].map((side) =>
          railPoint(center.x, (side * RAILWAY.gauge) / 2),
        );
        const sides = new Set();
        for (const wheel of wheels) {
          const p = wheel.getWorldPosition(new THREE.Vector3());
          const distances = contacts.map((c) =>
            Math.hypot(c.x - p.x, c.z - p.z),
          );
          assert.ok(
            Math.min(...distances) < 0.003,
            `${wheel.name} off rail at ${time}`,
          );
          sides.add(distances[0] < distances[1] ? 0 : 1);
        }
        assert.equal(sides.size, 2);
      }
  }
});
test("the locomotive leads its coach and rods follow the actual rotating crank pins", () => {
  const engine = train.vehicles.find((v) => v.name === "Locomotive"),
    coach = train.vehicles.find((v) => v.name === "Coach");
  for (const t of [0, 1, 145, 220]) {
    train.update(t);
    train.root.updateMatrixWorld(true);
    assert.ok(engine.body.position.x > coach.body.position.x);
    for (const side of ["Left", "Right"]) {
      const rod = engine.body.getObjectByName(`Locomotive_Rod_${side}`);
      const pins = ["Rear", "Front"].map((end) =>
        engine.body
          .getObjectByName(`Locomotive_Crank_${end}_${side}`)
          .getWorldPosition(new THREE.Vector3()),
      );
      const ends = [-0.9, 0.9].map((x) =>
        rod.localToWorld(new THREE.Vector3(x, 0, 0)),
      );
      for (let i = 0; i < 2; i++)
        assert.ok(
          ends[i].distanceTo(pins[i]) < 0.002,
          `rod disconnects from ${side} crank`,
        );
    }
  }
});
test("moving chimney steam originates at the actual exported outlet", () => {
  for (const t of [0, 145, 240]) {
    train.update(t);
    train.root.updateMatrixWorld(true);
    const outlet = train.root
      .getObjectByName("Locomotive_Steam_Outlet")
      .getWorldPosition(new THREE.Vector3());
    assert.ok(
      outlet.distanceTo(new THREE.Vector3(...train.steamAt(t).slice(0, 3))) <
        0.001,
    );
  }
});
test("the authored viaduct preserves gauge and railhead clearance with repeated fixings", () => {
  const root = createAuthoredRailway(readModel("railway-kit-v1").scene);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.far = 0.3;
  for (const x of [-67.8, -48, -35.2, -25, -18, 4.2, 26.7])
    for (const side of [-1, 1]) {
      const p = railPoint(x, (side * RAILWAY.gauge) / 2);
      ray.set(
        new THREE.Vector3(p.x, p.y + 0.1, p.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(root, true)[0];
      assert.ok(hit);
      assert.ok(
        Math.abs(hit.point.y - RAILWAY.headY) < 0.002,
        `fixture intrudes into railhead at ${x}`,
      );
    }
});
test("airship propeller pivots stay fixed while blades and rudder move", () => {
  const ship = createAirship(readModel("airship-v1").scene),
    positions = ship.propellers.map((p) => p.position.toArray());
  ship.update(0);
  const initial = ship.propellers.map((p) => p.rotation.x);
  ship.update(2);
  ship.propellers.forEach((p, i) => {
    assert.deepEqual(p.position.toArray(), positions[i]);
    assert.notEqual(p.rotation.x, initial[i]);
  });
  assert.ok(Math.abs(ship.rudder.rotation.y) < 0.1);
  ship.root.updateMatrixWorld(true);
  assert.ok(new THREE.Box3().setFromObject(ship.root, true).min.y > 9);
});
test("transport material maps are embedded and remain within the asset budgets", () => {
  for (const name of ["train-v1", "airship-v1", "railway-kit-v1"]) {
    const { document } = readModel(name);
    assert.ok(document.materials.length <= 12);
    assert.ok(document.images?.length > 0);
    assert.ok(document.images.every((i) => i.bufferView !== undefined));
    assert.ok(
      document.nodes.some(
        (n) =>
          n.name ===
          {
            "train-v1": "Locomotive",
            "airship-v1": "Airship",
            "railway-kit-v1": "Rail_Pier",
          }[name],
      ),
    );
  }
});
