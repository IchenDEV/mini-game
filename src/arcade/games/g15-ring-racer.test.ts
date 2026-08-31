import { describe, expect, it } from "vitest";
import def, { GView, SHIP_X_MAX, SHIP_Y_MAX } from "./g15-ring-racer";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g15 穿圈竞速", () => {
  it("光圈沿赛道不断出现", () => {
    const logic = make();
    run(logic, 3);
    const v = logic.view as GView;
    expect(v.rings.length).toBeGreaterThanOrEqual(4);
    for (const ring of v.rings) expect(ring.z).toBeLessThan(2);
  });

  it("对准光圈中心穿过会连穿计分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.rings.push({ id: 901, x: v.x, y: v.y, z: -1.2, r: 1.6, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(12);
  });

  it("偏离光圈直接坠毁", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.rings.push({ id: 902, x: v.x + 3.4, y: v.y, z: -1.2, r: 1.6, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("飞船位置被夹在场地内", () => {
    const logic = make();
    logic.start();
    run(logic, 1.5, () => ({ axisX: 1, axisY: 1 }));
    const v = logic.view as GView;
    expect(Math.abs(v.x)).toBeLessThanOrEqual(SHIP_X_MAX + 1e-6);
    expect(v.y).toBeLessThanOrEqual(SHIP_Y_MAX + 1e-6);
  });

  it("restart 复位飞船与光圈", () => {
    const logic = make();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.alive).toBe(true);
    expect(v.x).toBe(0);
    expect(logic.snapshot().score).toBe(0);
  });
});
