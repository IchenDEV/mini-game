import { describe, expect, it } from "vitest";
import def, { GView, DARTS, ringScore } from "./g26-dart-night";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g26 飞镖之夜", () => {
  it("环距换算分数", () => {
    expect(ringScore(0.1)).toBe(50);
    expect(ringScore(0.4)).toBe(25);
    expect(ringScore(0.8)).toBe(10);
    expect(ringScore(1.2)).toBe(5);
    expect(ringScore(2)).toBe(0);
  });

  it("准星随时间摆动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const x1 = v.crossX;
    run(logic, 0.6);
    expect(v.crossX).not.toBe(x1);
    expect(Math.abs(v.crossX)).toBeLessThanOrEqual(1.6);
  });

  it("掷镖按环距计分并消耗数量", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Wait for the crosshair to come near the bull.
    for (let i = 0; i < 1200; i += 1) {
      if (Math.hypot(v.crossX, v.crossY) < 0.24) break;
      logic.step(DT, input());
    }
    frame(logic, { actionPressed: true });
    expect(v.bulls).toBe(1);
    expect(logic.snapshot().score).toBe(50);
    expect(v.dartsLeft).toBe(DARTS - 1);
  });

  it("九支用完结算", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let i = 0; i < DARTS; i += 1) {
      if (logic.snapshot().status === "over") break;
      // Wait for a near-perfect aim, then throw.
      for (let j = 0; j < 1200; j += 1) {
        if (Math.hypot(v.crossX, v.crossY) < 0.2) break;
        logic.step(DT, input());
      }
      frame(logic, { actionPressed: true });
      logic.step(DT, input());
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`红心 ×${DARTS}`);
    expect(snap.score).toBe(50 * DARTS);
  });

  it("restart 复位镖数", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    logic.restart();
    expect((logic.view as GView).dartsLeft).toBe(DARTS);
    expect(logic.snapshot().score).toBe(0);
  });
});
