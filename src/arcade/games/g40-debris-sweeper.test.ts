import { describe, expect, it } from "vitest";
import def, { GView, OXYGEN_MAX, GOAL_DEBRIS, ARENA_HALF } from "./g40-debris-sweeper";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${mathKey()}`));

function mathKey(): string {
  return `k${Math.random()}`;
}

describe("g40 太空清道夫", () => {
  it("推进有惯性，松键后缓慢漂移", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    run(logic, 0.5, () => ({ axisX: 1 }));
    expect(v.vx).toBeGreaterThan(0);
    const x1 = v.x;
    run(logic, 0.4);
    expect(v.x).toBeGreaterThan(x1);
  });

  it("位置被限制在场内", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ axisX: 1, axisY: 1 }));
    const v = logic.view as GView;
    expect(Math.abs(v.x)).toBeLessThanOrEqual(ARENA_HALF + 1e-6);
    expect(Math.abs(v.y)).toBeLessThanOrEqual(4.4 + 1e-6);
  });

  it("收集碎片加分补氧", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.oxygen = 10;
    v.chunks.push({ id: 901, kind: "debris", x: 0, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    const before = logic.snapshot().score;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(before + 10);
    expect(v.oxygen).toBeGreaterThan(10);
    expect(v.collected).toBe(1);
  });

  it("撞到危险卫星扣氧", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.chunks.push({ id: 902, kind: "hazard", x: 0, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    logic.step(DT, input());
    expect(v.oxygen).toBeCloseTo(OXYGEN_MAX - 5, 1);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("氧气耗尽判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.oxygen = 0.05;
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("集满碎片判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.collected = GOAL_DEBRIS - 1;
    v.chunks.push({ id: 903, kind: "debris", x: 0, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain(`收集满 ${GOAL_DEBRIS}`);
  });

  it("restart 复位氧气", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.oxygen = 5;
    v.collected = 9;
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.oxygen).toBe(OXYGEN_MAX);
    expect(v2.collected).toBe(0);
    expect(v2.chunks).toHaveLength(0);
  });
});
