import { describe, expect, it } from "vitest";
import def, { GView, FUEL_MAX, GRAVITY, THRUST } from "./g14-rocket-lander";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g14 火箭着陆", () => {
  it("不喷射时被重力下拉", () => {
    const logic = make();
    logic.start();
    run(logic, 0.5);
    const v = logic.view as GView;
    expect(v.vy).toBeLessThan(0);
    expect(GRAVITY).toBeLessThan(THRUST);
  });

  it("按住喷射会抬升并消耗燃料", () => {
    const logic = make();
    logic.start();
    run(logic, 1, () => ({ action: true }));
    const v = logic.view as GView;
    expect(v.fuel).toBeLessThan(FUEL_MAX);
    expect(logic.snapshot().meter).toBeLessThan(1);
    expect(v.fuel).toBeGreaterThan(0);
  });

  it("燃料耗尽后无法继续喷射", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.fuel = 0.05;
    const vyBefore = v.vy;
    run(logic, 0.5, () => ({ action: true }));
    expect(v.thrusting).toBe(false);
    expect(v.vy).toBeLessThan(vyBefore);
  });

  it("偏移出停机坪会坠毁", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.x = v.pad.x + v.pad.half + 1;
    v.y = 0.5;
    v.vy = -1;
    v.vx = 0;
    v.angle = 0;
    run(logic, 0.3);
    expect(logic.snapshot().status).toBe("over");
  });

  it("平稳落在停机坪上会进入下一关并加分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.x = v.pad.x;
    v.y = 0.5;
    v.vy = -1;
    v.vx = 0;
    v.angle = 0;
    for (let i = 0; i < 30; i += 1) {
      logic.step(DT, input());
      if (v.level === 2) break;
    }
    expect(v.level).toBe(2);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(100);
    expect(v.y).toBeGreaterThan(10);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("姿态过斜时触地判坠毁", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.x = v.pad.x;
    v.y = 0.5;
    v.vy = -1;
    v.vx = 0;
    v.angle = 0.9;
    run(logic, 0.3);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 回到第 1 关", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.x = v.pad.x;
    v.y = 0.5;
    v.vy = -1;
    for (let i = 0; i < 30; i += 1) {
      logic.step(DT, input());
      if (v.level === 2) break;
    }
    logic.restart();
    expect((logic.view as GView).level).toBe(1);
    expect(logic.snapshot().score).toBe(0);
  });
});
