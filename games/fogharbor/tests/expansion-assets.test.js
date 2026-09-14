import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import {
  EXPANSION_BUILDINGS,
  EXPANSION_SCENES,
  buildingPoint,
} from "../src/expansion-layout.js";
import { createExpansionLife } from "../src/expansion-life.js";
import { canWalk } from "../src/movement.js";
import {
  EXPANSION_STORIES,
  ROOM_NOTES,
  EXPANSION_SPEAKERS,
} from "../src/expansion-stories.js";

test("all thirty authored shells have real doors, removable roofs and portable room assets", () => {
  const outside = readModel("expansion-buildings-v1"),
    inside = readModel("expansion-interiors-v1");
  const ray = new THREE.Raycaster();
  const silhouettes = new Set();
  for (const b of EXPANSION_BUILDINGS) {
    const shell = outside.scene.getObjectByName(b.id),
      room = inside.scene.getObjectByName(`Interior_${b.id}`);
    assert.ok(shell && room, b.id + " missing");
    assert.deepEqual(shell.position.toArray(), [0, 0, 0]);
    for (const part of ["Roof", "Shell", "Front"])
      assert.ok(shell.getObjectByName(`${b.id}_${part}`));
    for (const x of [-0.65, 0, 0.65])
      for (const y of [0.2, 1, 2]) {
        ray.set(new THREE.Vector3(x, y, 4.2), new THREE.Vector3(0, 0, -1));
        ray.far = 1.1;
        assert.equal(
          ray
            .intersectObject(shell, true)
            .filter((hit) => !hit.object.material.transparent).length,
          0,
          b.id + " door blocked",
        );
      }
    const box = new THREE.Box3().setFromObject(shell),
      size = box.getSize(new THREE.Vector3());
    silhouettes.add(size.y.toFixed(3));
    const roomBox = new THREE.Box3().setFromObject(room);
    assert.ok(roomBox.min.x >= -3.55 - 0.001 && roomBox.max.x <= 3.55 + 0.001);
    assert.ok(roomBox.min.z >= -3.05 - 0.001 && roomBox.max.z <= 2.5 + 0.001);
  }
  assert.ok(
    silhouettes.size >= 20,
    "building forms collapsed into a few scaled copies",
  );
  for (const asset of [outside, inside])
    assert.ok(
      asset.document.images.length &&
        asset.document.images.every(
          (i) => i.bufferView !== undefined && !i.uri,
        ),
    );
  assert.equal(Object.keys(EXPANSION_STORIES).length, 10);
  assert.equal(Object.keys(ROOM_NOTES).length, 30);
  for (const lines of [
    ...Object.values(EXPANSION_STORIES),
    ...Object.values(ROOM_NOTES),
  ])
    for (const [speaker, text] of lines) {
      assert.ok(
        speaker === "Nora" || Object.hasOwn(EXPANSION_SPEAKERS, speaker),
      );
      assert.ok(text.trim().length > 0);
    }
});

test("residents and animals run their real routes and carriages resume after player obstruction", async () => {
  const companions = readModel("companions-v1").scene,
    asset = readModel("city-animals-v1").scene;
  const life = await createExpansionLife(
    new THREE.Scene(),
    companions,
    [],
    asset,
  );
  const player = new THREE.Vector3(-31, 2.7, 80);
  assert.equal(life.people.length, 20);
  assert.equal(life.animals.length, 10);
  assert.equal(life.vehicles.length, 2);
  const first = life.vehicles[0];
  const startingDistance = first.distance;
  for (let i = 0; i < 600; i++) life.update(i * 0.05, 0.05, player, true);
  assert.ok(
    first.distance - startingDistance > 8,
    "carriage advances from its new near-stop spawn",
  );
  player
    .copy(first.group.position)
    .add(
      new THREE.Vector3(
        Math.sin(first.group.rotation.y) * 4,
        0,
        Math.cos(first.group.rotation.y) * 4,
      ),
    );
  for (let i = 600; i < 660; i++) life.update(i * 0.05, 0.05, player, true);
  assert.ok(first.speed < 0.05, "carriage failed to brake for player");
  player.set(-31, 2.7, 80);
  for (let i = 660; i < 1800; i++) {
    life.update(i * 0.05, 0.05, player, true);
    for (const p of life.people)
      assert.ok(
        canWalk(p.model.position.x, p.model.position.z),
        `resident ${p.model.name} left pavement at ${p.model.position.toArray()} frame ${i}`,
      );
    for (const a of life.animals)
      assert.ok(
        Number.isFinite(a.model.position.y),
        "animal pose is nonfinite",
      );
  }
  assert.ok(
    first.speed > 0.2 || first.wait > 0 || first.status === "queued",
    "carriage remained permanently jammed",
  );
  assert.ok(life.animals.some((a) => a.cat && a.mode !== "idle"));
});

async function trafficFixture() {
  return createExpansionLife(
    new THREE.Scene(),
    readModel("companions-v1").scene,
    [],
    readModel("city-animals-v1").scene,
    readModel("life-props-v1").scene,
  );
}

test("carriage stops use straight paved approaches and animate boarding, alighting and parcel transfer", async () => {
  const life = await trafficFixture();
  const { trafficPose, TRAFFIC_LENGTH } = await import(
    "../src/expansion-life.js"
  );
  const { canTraverse } = await import("../src/movement.js");
  for (const stop of life.stops) {
    assert.ok(
      stop.waiting.every((p) => canWalk(p.x, p.z) && canTraverse(p, stop.curb)),
    );
    assert.ok(canWalk(stop.porterWait.x, stop.porterWait.z));
    for (const offset of [-5, 5]) {
      const angle = trafficPose(stop.distance + offset).yaw - stop.pose.yaw;
      assert.ok(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.025);
    }
  }
  const passenger = life.vehicles[0],
    freight = life.vehicles[1];
  for (const [vehicle, gap] of [
    [passenger, 0.02],
    [freight, 11],
  ]) {
    vehicle.distance = life.stops[0].distance - gap;
    vehicle.nextStop = life.stops[0].distance;
    vehicle.stopIndex = 0;
    vehicle.speed = gap < 1 ? 0.4 : 1.7;
    vehicle.wait = 0;
    const pose = trafficPose(vehicle.distance);
    vehicle.group.position.copy(pose.position);
    vehicle.group.rotation.y = pose.yaw;
  }
  const initialLoopDistance = passenger.distance;
  const player = new THREE.Vector3(1000, 2.7, 1000);
  const actions = new Set();
  const actors = [...life.passengers, ...life.porters];
  const previous = new Map();
  for (const actor of actors)
    previous.set(actor, actor.model.getWorldPosition(new THREE.Vector3()));
  let sawQueued = false;
  let sawLoaded = false;
  let sawUnloaded = false;
  let parcelPosition = life.cargo.model.getWorldPosition(new THREE.Vector3());
  for (let frame = 0; frame < 4800; frame++) {
    const oldDistance = passenger.distance,
      oldWheel = passenger.wheels[0].rotation.x;
    life.update(frame * 0.05, 0.05, player, true);
    assert.ok(
      Math.abs(
        passenger.wheels[0].rotation.x -
          oldWheel -
          (passenger.distance - oldDistance) / 0.52,
      ) < 1e-8,
    );
    for (const vehicle of life.vehicles) {
      if (vehicle.service) {
        actions.add(vehicle.service.action);
        assert.equal(
          vehicle.speed,
          0,
          "service cannot happen on a moving carriage",
        );
        assert.equal(vehicle.distance, vehicle.nextStop);
      }
      if (vehicle.status === "queued") sawQueued = true;
    }
    for (const stop of life.stops) {
      assert.equal(
        new Set(stop.queue).size,
        stop.queue.length,
        "stop queue cannot contain duplicate requests",
      );
      if (stop.occupant) assert.equal(stop.queue[0], stop.occupant);
      assert.equal(
        new Set(stop.passengers).size,
        stop.passengers.length,
        "a passenger cannot be queued twice",
      );
    }
    for (const actor of actors) {
      const position = actor.model.getWorldPosition(new THREE.Vector3());
      assert.ok(
        position.distanceTo(previous.get(actor)) < 0.19,
        `${actor.model.name} teleported in ${actor.mode}`,
      );
      previous.set(actor, position.clone());
      if (actor.model.parent === life.root)
        assert.ok(
          canWalk(position.x, position.z),
          `${actor.model.name} left paving`,
        );
    }
    const parcelNow = life.cargo.model.getWorldPosition(new THREE.Vector3());
    assert.ok(
      parcelNow.distanceTo(parcelPosition) < 0.35,
      "parcel cannot pop between pavement, hands and wagon",
    );
    parcelPosition = parcelNow;
    if (life.cargo.location === "carriage") sawLoaded = true;
    if (sawLoaded && life.stops.some((stop) => stop.id === life.cargo.location))
      sawUnloaded = true;
    if (
      sawUnloaded &&
      passenger.completedStops >= 2 &&
      freight.completedStops >= 2
    )
      break;
  }
  for (const action of [
    "alighting-step",
    "alighting-curb",
    "leaving-curb",
    "approaching-curb",
    "boarding-step",
    "taking-seat",
    "loading-parcel",
    "unloading-parcel",
    "setting-down",
  ]) {
    assert.ok(actions.has(action), `missing visible ${action} action`);
  }
  assert.ok(sawQueued && sawLoaded && sawUnloaded);
  assert.ok(passenger.completedStops >= 2 && freight.completedStops >= 2);
  assert.ok(
    passenger.nextStop > passenger.distance,
    "next visit is queued only after this one completes",
  );
  assert.ok(
    passenger.nextStop >= TRAFFIC_LENGTH,
    "stop schedule advances correctly across the circuit seam",
  );
  assert.ok(
    passenger.distance > initialLoopDistance + TRAFFIC_LENGTH,
    "a real subsequent circuit completes without skipped stops",
  );
});

test("boarding holds for player obstruction and freezes its queue and poses while paused", async () => {
  const life = await trafficFixture();
  const v = life.vehicles[0],
    stop = life.stops[0];
  v.distance = v.nextStop = stop.distance;
  v.wait = 0;
  const pose = stop.pose;
  v.group.position.copy(pose.position);
  v.group.rotation.y = pose.yaw;
  const player = new THREE.Vector3(1000, 2.7, 1000);
  for (let frame = 0; frame < 90; frame++)
    life.update(frame * 0.05, 0.05, player, true);
  assert.ok(v.service);
  const actor = life.passengers.find((p) => /alighting|leaving/.test(p.mode));
  assert.ok(actor);
  player.copy(stop.curb);
  for (let frame = 90; frame < 300; frame++)
    life.update(frame * 0.05, 0.05, player, true);
  const blockedActor = v.service.jobs[v.service.index].actor;
  assert.ok(blockedActor, "a moving passenger is held at the obstruction");
  const held = blockedActor.model.position.clone();
  for (let frame = 300; frame < 340; frame++)
    life.update(frame * 0.05, 0.05, player, true);
  assert.ok(
    blockedActor.model.position.distanceTo(held) < 1e-8,
    "actor must wait at the blocked curb",
  );
  assert.equal(v.completedStops, 0);
  const snapshot = JSON.stringify(life.state());
  for (let frame = 340; frame < 390; frame++)
    life.update(frame * 0.05, 0.05, player, false);
  const paused = life.state();
  const before = JSON.parse(snapshot);
  assert.deepEqual(paused.vehicles, before.vehicles);
  assert.deepEqual(paused.stops, before.stops);
  assert.deepEqual(paused.passengers, before.passengers);
  assert.deepEqual(paused.cargo, before.cargo);
  player.set(1000, 2.7, 1000);
  for (let frame = 390; frame < 900 && !v.completedStops; frame++)
    life.update(frame * 0.05, 0.05, player, true);
  assert.equal(v.completedStops, 1);
  assert.equal(stop.occupant, null);
});

test("the reused passenger door opens a real passage without deleting carriage triangles", async () => {
  const life = await trafficFixture();
  const vehicle = life.vehicles[0];
  const carriage = vehicle.group.getObjectByName("PassengerCarriage");
  const triangleCount = (root) => {
    let count = 0;
    root.traverse((mesh) => {
      if (mesh.isMesh)
        count +=
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3;
    });
    return count;
  };
  assert.equal(
    triangleCount(carriage),
    triangleCount(
      readModel("city-animals-v1").scene.getObjectByName("PassengerCarriage"),
    ),
  );
  const passageHits = () => {
    life.root.updateMatrixWorld(true);
    const origin = carriage.localToWorld(new THREE.Vector3(-1.5, 1.3, -0.3));
    const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(
      carriage.getWorldQuaternion(new THREE.Quaternion()),
    );
    return new THREE.Raycaster(origin, direction, 0, 1.3).intersectObject(
      carriage,
      true,
    );
  };
  assert.ok(passageHits().length, "closed door occupies the opening");
  vehicle.doors[-1].rotation.y = -1.35;
  assert.equal(
    passageHits().length,
    0,
    "boarding cannot pass through a closed side panel",
  );
  vehicle.doors[-1].rotation.y = 0;
  assert.ok(passageHits().length, "closing restores the same door geometry");
});
