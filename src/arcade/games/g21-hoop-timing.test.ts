import { describe, expect, it } from "vitest";
import def, { GView, TOTAL_BALLS, HOOP_Y, HOOP_RANGE } from "./g21-hoop-timing";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

// Ball flight to the rim takes ~1.655s (vy 11.5, g 9.8, rim 5.6).
// hoopX(t) = sin(t * 1.15) * 3.1 crosses center when elapsed ≈ k·2.732,
// so a shot released at k·2.732 − 1.655 lands when the rim is centered.
const SHOT_SLOTS = [1.077, 3.809, 6.541, 9.273, 12.005, 14.737, 17.469, 20.201, 22.933, 25.665];

describe("g21 投篮节奏", () => {
  it("出手后球会飞起并落回", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    const v = logic.view as GView;
    expect(v.ballsLeft).toBe(TOTAL_BALLS - 1);
    expect(v.flying).toBe(true);
    run(logic, 2);
    expect(v.flying).toBe(false);
    expect(v.ballY).toBe(0.5);
  });

  it("等待篮筐回中再出手就会命中", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < SHOT_SLOTS[0] * 60; i += 1) logic.step(DT, input());
    frame(logic, { actionPressed: true });
    run(logic, 2.2);
    const v = logic.view as GView;
    expect(v.makes).toBe(1);
    expect(logic.snapshot().score).toBe(12);
    expect(v.streak).toBe(1);
  });

  it("立刻出手时球到筐时筐在远处，未中", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    run(logic, 2.2);
    const v = logic.view as GView;
    expect(v.makes).toBe(0);
    expect(logic.snapshot().score).toBe(0);
    expect(HOOP_RANGE).toBeGreaterThan(2);
  });

  it("十球打完结算，全进判胜", () => {
    const logic = make();
    logic.start();
    let clock = 0;
    for (const slot of SHOT_SLOTS) {
      if (logic.snapshot().status === "over") break;
      const frames = Math.max(0, Math.round((slot - clock) * 60));
      for (let i = 0; i < frames; i += 1) logic.step(DT, input());
      clock = slot;
      logic.step(DT, input({ actionPressed: true }));
      clock += DT;
    }
    run(logic, 2.5);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`命中 ${TOTAL_BALLS} / ${TOTAL_BALLS}`);
    expect(HOOP_Y).toBeGreaterThan(0);
  });

  it("restart 复位用球数", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.ballsLeft).toBe(TOTAL_BALLS);
    expect(logic.snapshot().score).toBe(0);
  });
});
