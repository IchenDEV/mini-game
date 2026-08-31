import { describe, expect, it } from "vitest";
import def, { GView, CORE_HP, SHIELD_HALF, ORBIT_R } from "./g43-deflect-shield";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g43 护盾偏转", () => {
  it("护盾角随输入旋转并归一化", () => {
    const logic = make();
    logic.start();
    run(logic, 1, () => ({ axisX: 1 }));
    const v = logic.view as GView;
    expect(v.shield).toBeGreaterThanOrEqual(0);
    expect(v.shield).toBeLessThan(Math.PI * 2);
    expect(v.shield).toBeGreaterThan(3);
  });

  it("对准来袭方向的挡住计分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.bolts.push({ id: 901, angle: v.shield, dist: ORBIT_R + 0.4, speed: 3 });
    const before = logic.snapshot().score;
    run(logic, 0.3);
    expect(v.bolts).toHaveLength(0);
    expect(v.blocked).toBe(1);
    expect(logic.snapshot().score).toBe(before + 10);
  });

  it("护盾没转到位会被击中扣核心", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.bolts.push({ id: 902, angle: v.shield + 2.5, dist: ORBIT_R + 0.4, speed: 3 });
    run(logic, 1.5);
    expect(v.hp).toBe(CORE_HP - 1);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("核心三次被击中判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.hp = 1;
    v.bolts.push({ id: 903, angle: v.shield + 2.5, dist: ORBIT_R + 0.4, speed: 3 });
    run(logic, 1.5);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("来袭会越来越快", () => {
    const logic = make();
    run(logic, 10);
    expect((logic.view as GView).speed).toBeGreaterThan(3.5);
    expect(SHIELD_HALF).toBeLessThan(Math.PI / 4);
  });

  it("restart 复位核心", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.bolts.push({ id: 904, angle: v.shield + 2.5, dist: ORBIT_R + 0.4, speed: 3 });
    logic.step(DT, input());
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.hp).toBe(CORE_HP);
    expect(v2.bolts).toHaveLength(0);
    expect(v2.blocked).toBe(0);
  });
});
