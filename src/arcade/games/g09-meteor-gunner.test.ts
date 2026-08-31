import { describe, expect, it } from "vitest";
import def, { GView, MAX_LIVES } from "./g09-meteor-gunner";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g09 陨石炮手", () => {
  it("开火会生成炮弹并进入冷却", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    frame(logic, { action: true });
    expect(v.shots).toHaveLength(1);
    frame(logic, { action: true });
    expect(v.shots).toHaveLength(1);
  });

  it("瞄准方向上的陨石会被击毁计分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Aim via pointer, then park a meteor on the shot's flight path.
    frame(logic, { pointerActive: true, pointerX: 0.5, pointerY: 1, action: false });
    const dx = v.aimX;
    const dy = v.aimY - 0.6;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    v.meteors.push({ id: 777, x: ux * 3, y: 0.6 + uy * 3, vx: 0, vy: 0, r: 0.5 });
    const before = logic.snapshot().score;
    run(logic, 0.5, () => ({ pointerActive: true, pointerX: 0.5, pointerY: 1, action: true }));
    expect(logic.snapshot().score).toBeGreaterThan(before);
    expect(v.meteors.some((m) => m.id === 777)).toBe(false);
  });

  it("陨石落地会扣护盾", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.meteors.push({ id: 778, x: 5, y: 0.55, vx: 0, vy: -1, r: 0.5 });
    run(logic, 0.6);
    expect(v.lives).toBe(MAX_LIVES - 1);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("护盾耗尽结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.lives = 1;
    v.meteors.push({ id: 779, x: 5, y: 0.55, vx: 0, vy: -1, r: 0.5 });
    run(logic, 0.6);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("restart 复位护盾与实体", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    frame(logic, { action: true });
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.shots).toHaveLength(0);
    expect(v2.lives).toBe(MAX_LIVES);
    expect(logic.snapshot().score).toBe(0);
  });
});
