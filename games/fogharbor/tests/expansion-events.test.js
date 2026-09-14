import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import { createExpansionLife } from "../src/expansion-life.js";
import { EXPANSION_BUILDINGS, buildingLocal } from "../src/expansion-layout.js";
import {
  createExpansionEvents,
  EXPANSION_EVENT_PLANS,
} from "../src/expansion-events.js";
import { EXPANSION_SPEAKERS } from "../src/expansion-stories.js";
const interiors = readModel("expansion-interiors-v1").scene;
const companions = readModel("companions-v1").scene;
const animalAsset = readModel("city-animals-v1").scene;
const parcelAsset = readModel("life-props-v1").scene;
function snapshot(root) {
  const result = [];
  root.traverse((o) =>
    result.push([
      o.name,
      o.position.toArray(),
      o.quaternion.toArray(),
      o.scale.toArray(),
      o.visible,
      o.material?.emissiveIntensity,
      o.material?.opacity,
      o.material?.color?.getHex(),
    ]),
  );
  return JSON.stringify(result);
}
async function fixture() {
  const scene = new THREE.Scene();
  const buildings = EXPANSION_BUILDINGS.map((data) => {
    const holder = new THREE.Group(),
      room = interiors.getObjectByName(`Interior_${data.id}`).clone(true);
    holder.position.set(data.x, data.height, data.z);
    holder.rotation.y = data.yaw;
    holder.add(room);
    scene.add(holder);
    return { data, holder, room };
  });
  const life = await createExpansionLife(
    scene,
    companions,
    [],
    animalAsset,
    parcelAsset,
  );
  const originalUpdates = life.people.map((p) => p.update);
  const streetPositions = life.people
    .filter((p) => !p.work)
    .map((p) => p.model.position.clone());
  const staticSnapshots = buildings.map((b) => b.room.children.map(snapshot));
  const events = createExpansionEvents(buildings);
  events.bindWorkers(life.people);
  return {
    buildings,
    life,
    events,
    originalUpdates,
    streetPositions,
    staticSnapshots,
  };
}
function advance(events, id, seconds) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05)
    events.update(0.05, new THREE.Vector3(), id);
}
test("ten real workplace acts animate, pause outside, settle once and preserve authored furniture", async () => {
  const f = await fixture(),
    { events, life, buildings } = f;
  assert.equal(events.state().completed, 0);
  assert.equal(
    Object.values(events.state().scenes).filter((s) => s.workerBound).length,
    10,
  );
  assert.throws(() => events.bindWorkers(life.people), /once/);
  for (const [i, p] of life.people.entries()) {
    if (!p.work) {
      assert.equal(p.update, f.originalUpdates[i]);
      assert.deepEqual(
        p.model.position.toArray(),
        f.streetPositions[Math.floor(i / 2)].toArray(),
      );
      continue;
    }
    const b = buildings.find(
      (b) => b.data.sceneId === p.home.id && b.data.primary,
    );
    const local = buildingLocal(b.data, p.model.position.x, p.model.position.z);
    assert.ok(Math.abs(Math.abs(local.x) - 1.12) < 1e-6);
    assert.ok(local.z < 2.2, "worker must not occupy the door threshold");
    assert.ok(Math.abs(p.model.position.y - b.data.height - 0.035) < 1e-6);
    assert.ok(p.model.getObjectByName(`${p.source}_RightArm`));
    assert.equal(
      p.model.getObjectByName("Life_Parcel")?.visible ?? false,
      false,
    );
  }
  for (const plan of EXPANSION_EVENT_PLANS) {
    const b = buildings.find((b) => b.data.id === plan.building);
    const task = b.room.getObjectByName(`${plan.scene}_daily_task`);
    assert.ok(
      task,
      "task props must belong to the real room visibility hierarchy",
    );
    const original = snapshot(task),
      pendingScript = events.script(plan.scene);
    assert.ok(pendingScript.some(([key]) => key === "Nora"));
    assert.ok(
      pendingScript.some(
        ([key]) => EXPANSION_SPEAKERS[key]?.sceneId === plan.scene,
      ),
      "missing local worker dialogue",
    );
    const worker = life.people.find((p) => p.home.id === plan.scene && p.work);
    const arm = worker.model.getObjectByName(`${worker.source}_RightArm`),
      initialArm = arm.quaternion.clone();
    advance(events, plan.building, 2.4);
    assert.equal(events.state().scenes[plan.scene].phase, "act");
    assert.notEqual(
      snapshot(task),
      original,
      `${plan.scene} did not visibly act`,
    );
    assert.ok(
      initialArm.angleTo(arm.quaternion) > 0.1,
      "work arm never reached toward its task",
    );
    assert.ok(
      events.state().scenes[plan.scene].handGap < 0.2,
      `${plan.scene} hand too far: ${events.state().scenes[plan.scene].handGap}`,
    );
    const pausedTime = events.state().scenes[plan.scene].time,
      pausedProps = snapshot(task);
    advance(events, null, 3);
    assert.equal(
      events.state().scenes[plan.scene].time,
      pausedTime,
      "leaving must pause",
    );
    assert.equal(snapshot(task), pausedProps);
    let maximumHandGap = 0;
    for (let tick = 0; tick < 160; tick++) {
      events.update(0.05, new THREE.Vector3(), plan.building);
      const sample = events.state().scenes[plan.scene];
      if (sample.phase === "act")
        maximumHandGap = Math.max(maximumHandGap, sample.handGap);
    }
    assert.ok(
      maximumHandGap < 0.2,
      `${plan.scene} hand missed moving task: ${maximumHandGap}`,
    );
    const state = events.state().scenes[plan.scene];
    assert.equal(state.phase, "done");
    assert.equal(state.completed, true);
    assert.ok(state.result);
    assert.notDeepEqual(events.script(plan.scene), pendingScript);
    assert.notEqual(
      snapshot(task),
      original,
      `${plan.scene} left no settled result`,
    );
    const settled = snapshot(task),
      finishedTime = state.time;
    advance(events, null, 2);
    advance(events, plan.building, 3);
    assert.equal(
      events.state().scenes[plan.scene].time,
      finishedTime,
      "revisit restarted event",
    );
    assert.equal(snapshot(task), settled, "settled props drifted on revisit");
  }
  assert.equal(events.state().completed, 10);
  buildings.forEach((b, i) =>
    f.staticSnapshots[i].forEach((before, j) =>
      assert.equal(snapshot(b.room.children[j]), before),
    ),
  );
  events.dispose();
  life.people.forEach((p, i) => assert.equal(p.update, f.originalUpdates[i]));
  assert.ok(
    buildings.every(
      (b) => !b.room.children.some((o) => o.name.endsWith("_daily_task")),
    ),
  );
});
