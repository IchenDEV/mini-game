import { describe, expect, it } from "vitest";
import def, { GView, DROPS, GRAB_R } from "./g36-crane-grab";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g36 吊车抓宝", () => {
  it("爪子左右摆动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const x1 = v.clawX;
    run(logic, 0.7);
    expect(v.clawX).not.toBe(x1);
    expect(Math.abs(v.clawX)).toBeLessThanOrEqual(3.6);
  });

  it("下爪在奖品正上方会抓取", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.prizes.push({ id: 99, x: v.clawX, kind: "gold", taken: false });
    frame(logic, { actionPressed: true });
    // Claw needs a moment to reach the pit.
    run(logic, 1);
    expect(v.grabbed).toBe(1);
    expect(logic.snapshot().score).toBe(50);
    expect(v.prizes.find((p) => p.id === 99)!.taken).toBe(true);
  });

  it("偏离奖品会扑空", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.prizes.forEach((p) => (p.x = 99)); // clear the pit
    v.prizes.push({ id: 98, x: v.clawX + 2, kind: "silver", taken: false });
    frame(logic, { actionPressed: true });
    run(logic, 1);
    expect(v.grabbed).toBe(0);
    expect(logic.snapshot().score).toBe(0);
  });

  it("八次机会用完结算", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.prizes.forEach((p) => (p.x = 99));
    for (let i = 0; i < DROPS; i += 1) {
      if (logic.snapshot().status === "over") break;
      if (v.phase === "move") frame(logic, { actionPressed: true });
      run(logic, 1.4);
    }
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("0 件 / 8");
    expect(GRAB_R).toBeGreaterThan(0.5);
  });

  it("restart 重摆奖品", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    run(logic, 1);
    logic.restart();
    const v = logic.view as GView;
    expect(v.dropsLeft).toBe(DROPS);
    expect(v.grabbed).toBe(0);
    expect(v.prizes.length).toBeGreaterThanOrEqual(9);
  });
});
