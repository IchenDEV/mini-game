import test from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  applyEvent,
  readState,
  phase,
  validOrders,
} from "../src/narrative.js";
test("new chapter introduces the story before movement and repair", () => {
  let s = freshState();
  assert.equal(phase(s), "opening");
  assert.deepEqual(applyEvent(s, "diagnose"), s);
  s = applyEvent(s, "start");
  assert.equal(phase(s), "walk");
  s = applyEvent(s, "walk");
  assert.equal(phase(s), "inspect");
  for (const x of ["note", "lid", "spout"]) s = applyEvent(s, "inspect", x);
  s = applyEvent(s, "diagnose");
  assert.equal(phase(s), "repair");
  assert.deepEqual(
    applyEvent(s, "repair", 2),
    s,
    "repair actions cannot skip the isolation step",
  );
  for (let i = 0; i < 3; i++) s = applyEvent(s, "repair", i);
  assert.equal(phase(s), "orders");
  assert.equal(validOrders({ winch: "today", clock: "today" }), false);
  s = applyEvent(s, "orders", { winch: "today", clock: "contact" });
  assert.equal(phase(s), "delivery");
  s = applyEvent(s, "deliver");
  assert.equal(phase(s), "signals");
  for (const x of ["laundry", "pump"]) s = applyEvent(s, "signal", x);
  assert.equal(phase(s), "infer");
  s = applyEvent(s, "infer");
  assert.equal(phase(s), "letter");
  s = applyEvent(s, "letter");
  assert.equal(phase(s), "closing");
  s = applyEvent(s, "complete");
  assert.equal(phase(s), "wharf");
  assert.deepEqual(applyEvent(s, "pumpRepair", 0), s);
  for (const event of ["wharf", "doorstep", "beck"]) s = applyEvent(s, event);
  assert.equal(phase(s), "pumpInspect");
  for (const item of ["gauge", "seam", "ledger"])
    s = applyEvent(s, "pumpObserve", item);
  s = applyEvent(s, "pumpDiagnose");
  assert.deepEqual(applyEvent(s, "pumpRepair", 2), s);
  s = applyEvent(s, "pumpRepair", 0);
  assert.equal(readState(JSON.parse(JSON.stringify(s))).pumpStep, 1);
  s = applyEvent(s, "pumpRepair", 1);
  s = applyEvent(s, "pumpRepair", 2);
  assert.equal(phase(s), "debrief");
  assert.equal(s.pumpRestored, true);
  s = applyEvent(s, "debrief");
  assert.equal(phase(s), "homecoming");
  s = applyEvent(s, "homecoming");
  assert.equal(phase(s), "explore");
  assert.deepEqual(readState(JSON.parse(JSON.stringify(s))), s);
});
test("partial saves resume the exact task; bad saves cannot invent completed story", () => {
  assert.equal(
    phase(readState({ version: 2, chapterComplete: true })),
    "opening",
  );
  let s = applyEvent(applyEvent(freshState(), "start"), "walk");
  s = applyEvent(s, "inspect", "lid");
  assert.deepEqual(applyEvent(s, "inspect", "lid"), s);
  assert.deepEqual(readState(s), s);
  assert.equal(phase(readState(s)), "inspect");
  assert.equal(readState({ version: 1, delivered: true }).started, false);
});

test("legacy chapter-complete saves continue down the river without losing work", () => {
  const legacy = {
    version: 2,
    started: true,
    walked: true,
    inspected: ["lid", "spout", "note"],
    diagnosed: true,
    repairStep: 3,
    orders: { winch: "today", clock: "contact" },
    delivered: true,
    signals: ["laundry", "pump"],
    inferred: true,
    letterRead: true,
    chapterComplete: true,
  };
  const s = readState(legacy);
  assert.equal(phase(s), "wharf");
  assert.equal(s.repairStep, 3);
  assert.deepEqual(s.orders, legacy.orders);
  const corrupt = readState({
    ...legacy,
    pumpStep: 3,
    pumpRestored: true,
    position: [Infinity, 0],
  });
  assert.equal(corrupt.pumpRestored, false);
  assert.deepEqual(corrupt.position, [-6, 3.4]);
});
