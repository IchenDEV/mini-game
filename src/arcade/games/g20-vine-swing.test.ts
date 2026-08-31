import { describe, expect, it } from "vitest";
import def, { GView, ROPE_LEN } from "./g20-vine-swing";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g20 藤蔓摆荡", () => {
  it("开局抓在第一根藤蔓上并开始摆动", () => {
    const logic = make();
    logic.start();
    run(logic, 0.6, () => ({ action: true }));
    const v = logic.view as GView;
    expect(v.attached).toBe(v.anchors[0].id);
    expect(v.theta).toBeGreaterThan(-0.85);
    expect(v.anchors.length).toBeGreaterThan(10);
  });

  it("最低点松手会带着速度飞出去", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let i = 0; i < 600; i += 1) {
      if (v.theta > 0.1) break;
      logic.step(DT, input({ action: true }));
    }
    expect(v.theta).toBeGreaterThan(0.1);
    logic.step(DT, input({ actionReleased: true }));
    expect(v.attached).toBe(null);
    expect(v.vx).toBeGreaterThan(0.5);
  });

  it("飞行途中按住可以抓下一根藤蔓", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Simulate mid-flight near the second anchor.
    v.attached = null;
    v.x = v.anchors[1].x - 0.8;
    v.y = v.anchors[1].y - 1.4;
    v.vx = 2;
    v.vy = 0;
    logic.step(DT, input({ action: true }));
    expect(v.attached).toBe(v.anchors[1].id);
    const a = v.anchors[1];
    expect(Math.hypot(v.x - a.x, v.y - a.y)).toBeCloseTo(ROPE_LEN, 1);
  });

  it("前进距离换算成分数", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.attached = null;
    v.x = 12;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(60);
  });

  it("落地或倒退太远会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.attached = null;
    v.y = 0.3;
    v.vy = -2;
    run(logic, 0.3);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 重建藤蔓", () => {
    const logic = make();
    run(logic, 1);
    logic.restart();
    const v = logic.view as GView;
    expect(v.attached).toBe(v.anchors[0].id);
    expect(v.alive).toBe(true);
    expect(logic.snapshot().score).toBe(0);
  });
});
