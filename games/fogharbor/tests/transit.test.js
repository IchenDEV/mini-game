import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import { createSteamTrain, createAirship } from "../src/sculpted-transport.js";
import {
  createTransit,
  TRANSIT_STOPS,
  serviceAt,
  airshipPose,
  stopDeck,
} from "../src/transit.js";
import { createIndustrialCity } from "../src/industrial-city.js";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import { LIFE_OBSTACLES } from "../src/world-life.js";
import { canWalk, route, heightAt } from "../src/movement.js";
import { railPoint, RAILWAY } from "../src/railway.js";
import { CITY_PLOTS } from "../src/terrain.js";
import { industrialOverlap } from "../src/industrial-layout.js";
import { freshState, readState } from "../src/narrative.js";

function setup() {
  const transport = {
    train: createSteamTrain(readModel("train-v1").scene),
    airship: createAirship(readModel("airship-v1").scene),
  };
  const player = new THREE.Object3D();
  const transit = createTransit(transport, player);
  return { transport, player, transit };
}
test("arrival saves retain the upper air dock while rejecting nonfinite or off-map positions", () => {
  const position = [-37.8, 99];
  const saved = { ...freshState(), position };
  assert.deepEqual(
    readState(JSON.parse(JSON.stringify(saved))).position,
    position,
  );
  for (const bad of [
    [0, Infinity],
    [1e9, 99],
    [-37.8, 999],
  ])
    assert.deepEqual(
      readState({ ...saved, position: bad }).position,
      freshState().position,
    );
});
function step(transit, seconds, active = true) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++)
    transit.update(0.05, active);
}

test("both real vehicles board, carry and return the passenger to a walkable street at either terminus", () => {
  for (const mode of ["train", "airship"]) {
    const { transport, player, transit } = setup();
    const stops = TRANSIT_STOPS.filter((s) => s.mode === mode);
    for (const [index, stop] of stops.entries()) {
      if (index === 0) player.position.set(stop.x, stop.height, stop.z);
      assert.ok(transit.request(stop.id));
      let rode = false,
        exited = false,
        previous = player.position.clone();
      for (let i = 0; i < 6000; i++) {
        transit.update(0.05, true);
        const state = transit.state(),
          rider = state.passenger;
        assert.ok(
          player.position.distanceTo(previous) < 0.5,
          "no teleport during lift, gangway or flight",
        );
        previous.copy(player.position);
        if (rider?.stage === "riding") {
          rode = true;
          const body =
            mode === "train"
              ? transport.train.vehicles[0].body
              : transport.airship.root;
          const local = body.worldToLocal(player.position.clone());
          assert.ok(
            local.distanceTo(
              new THREE.Vector3(
                mode === "train" ? 0 : -1.2,
                mode === "train" ? 0.64 : -1.9,
                mode === "train" ? 1.12 : 1.18,
              ),
            ) < 1e-6,
          );
          if (mode === "train")
            for (const vehicle of transport.train.vehicles)
              for (const axle of vehicle.axles) {
                const p = axle.node.getWorldPosition(new THREE.Vector3());
                assert.ok(
                  Math.abs(p.y - vehicle.radius - RAILWAY.headY) < 1e-6,
                );
                assert.ok(Math.abs(p.z - railPoint(p.x).z) < 0.003);
              }
        }
        if (rode && !rider) {
          exited = true;
          break;
        }
      }
      assert.ok(rode && exited, `${mode} must complete the journey`);
      assert.equal(transit.state().lastArrival, stops[1 - index].id);
      assert.ok(canWalk(player.position.x, player.position.z));
      assert.ok(
        Math.abs(
          player.position.y - heightAt(player.position.x, player.position.z),
        ) < 0.06,
      );
    }
  }
});
test("modal pause freezes all travel; waiting can be cancelled and cannot board remotely", () => {
  const { transit, player } = setup();
  assert.equal(transit.request("rail_salt"), false);
  player.position.set(-15, 0, -7);
  assert.ok(transit.request("rail_salt"));
  transit.cancelWaiting();
  step(transit, 1);
  assert.equal(transit.locked, false);
  assert.ok(transit.request("rail_salt"));
  step(transit, 2);
  const before = player.position.clone(),
    state = transit.state();
  step(transit, 30, false);
  assert.ok(player.position.equals(before));
  assert.deepEqual(transit.state(), state);
  step(transit, 10);
  transit.toggleExit();
  step(transit, 35);
  assert.equal(
    transit.state().passenger.stage,
    "riding",
    "stay aboard must suppress automatic exit",
  );
});
test("new station columns keep all four public approaches connected to the story street", () => {
  const scene = new THREE.Scene(),
    world = createNeighborhood(scene),
    districts = createDistricts(scene);
  const { transport } = setup(),
    city = createIndustrialCity(scene, transport);
  const obstacles = [
    ...world.obstacles,
    ...districts.obstacles,
    ...LIFE_OBSTACLES,
    ...city.obstacles,
  ];
  for (const stop of TRANSIT_STOPS) {
    assert.ok(canWalk(stop.x, stop.z, obstacles), stop.id);
    assert.ok(
      route({ x: -6.3, z: 1 }, stop, obstacles).length,
      `route to ${stop.id}`,
    );
    assert.ok(Math.abs(heightAt(stop.x, stop.z) - stop.height) < 0.05);
  }
});
test("airship approaches meet the boarding deck and flight clears the central skyline", () => {
  for (const [time, stop] of [
    [0, TRANSIT_STOPS[2]],
    [60, TRANSIT_STOPS[3]],
  ]) {
    const p = airshipPose(serviceAt("airship", time)).position;
    assert.ok(Math.abs(p.y - 2.47 - stopDeck(stop)) < 1e-6);
    assert.ok(Math.abs(p.z + 1.534 - (stop.z - 1.8)) < 1e-6);
  }
  for (let t = 31; t < 46; t++)
    assert.ok(airshipPose(serviceAt("airship", t)).position.y > 27);
});
test("the new works replace overlapping houses and the observation deck clears both propellers", () => {
  const kit = readModel("city-kit-v1").scene;
  for (const plot of CITY_PLOTS.filter((p) => p.z < -13)) {
    const house = kit.getObjectByName(`City_${plot.name}`).clone(true);
    house.position.set(plot.x, 0, plot.z);
    house.rotation.y = plot.yaw;
    house.scale.setScalar(plot.size);
    const box = new THREE.Box3().setFromObject(house),
      center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    assert.equal(
      industrialOverlap(center.x, center.z, size.x / 2, size.z / 2),
      false,
      `${plot.name} at ${plot.x},${plot.z}`,
    );
  }
  const { transport } = setup();
  createIndustrialCity(new THREE.Scene(), transport);
  transport.airship.root.updateMatrixWorld(true);
  const deck = new THREE.Box3().setFromObject(
    transport.airship.root.getObjectByName("airship observation deck"),
  );
  for (const propeller of transport.airship.propellers) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      propeller.rotation.x = angle;
      assert.equal(
        deck.intersectsBox(new THREE.Box3().setFromObject(propeller)),
        false,
      );
    }
  }
});
