import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGIONS,
  newJourney,
  restoreJourney,
  collectGear,
  activateRegulator,
  travelTo,
} from "../src/game-state.js";

test("six regions form a complete unlockable journey with no skipped gates", () => {
  const state = newJourney();
  assert.equal(REGIONS.length, 6);
  assert.equal(travelTo(state, 1), false);
  for (let i = 0; i < 6; i++) {
    assert.ok(travelTo(state, i));
    assert.equal(activateRegulator(state, REGIONS[i].order[0]), "needs-gears");
    for (const id of [0, 2, 1]) assert.ok(collectGear(state, id));
    assert.equal(collectGear(state, 1), false);
    assert.deepEqual(
      REGIONS[i].order.map((id) => activateRegulator(state, id)),
      ["correct", "correct", i === 5 ? "win" : "restore"],
    );
    assert.equal(activateRegulator(state, 0), "already-restored");
    assert.equal(state.finished, i === 5);
  }
  assert.deepEqual(restoreJourney(JSON.parse(JSON.stringify(state))), state);
});

test("wrong sequence resets only regulators, preserving collected gears", () => {
  const state = newJourney();
  [0, 1, 2].forEach((i) => collectGear(state, i));
  activateRegulator(state, 0);
  assert.equal(activateRegulator(state, 2), "wrong");
  assert.deepEqual(state.districts[0].sequence, []);
  assert.equal(state.districts[0].collected.length, 3);
  assert.equal(state.unlocked, 0);
  assert.equal(state.mistakes, 1);
});

test("invalid or partial saves cannot unlock later regions or corrupt progress", () => {
  const broken = restoreJourney({
    version: 1,
    current: 99,
    unlocked: 99,
    finished: true,
    districts: [
      { collected: [0, 0, -1, 5], sequence: [0, 1, 2], restored: true },
    ],
  });
  assert.equal(broken.current, 0);
  assert.equal(broken.unlocked, 0);
  assert.equal(broken.finished, false);
  assert.deepEqual(broken.districts[0].collected, [0]);
  assert.deepEqual(broken.districts[0].sequence, []);
  assert.deepEqual(restoreJourney(null), newJourney());
  assert.equal(travelTo(broken, NaN), false);
});
