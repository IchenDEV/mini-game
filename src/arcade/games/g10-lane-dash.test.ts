import { describe, expect, it } from "vitest";
import def, { GView, LANES } from "./g10-lane-dash";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g10 三道狂奔", () => {
  it("按键沿边沿换道，且不会跑出赛道", () => {
    const logic = make();
    logic.start();
    frame(logic, { axisX: 1 });
    expect((logic.view as GView).lane).toBe(2);
    frame(logic, { axisX: 1 });
    expect((logic.view as GView).lane).toBe(2);
    frame(logic, { axisX: -1 });
    expect((logic.view as GView).lane).toBe(1);
    frame(logic, { axisX: -1 });
    expect((logic.view as GView).lane).toBe(1);
    frame(logic, { axisX: 0 });
    frame(logic, { axisX: -1 });
    expect((logic.view as GView).lane).toBe(0);
  });

  it("点击屏幕左右两侧也能换道", () => {
    const logic = make();
    logic.start();
    frame(logic, { pointerActive: true, actionPressed: true, pointerX: 0.6 });
    expect((logic.view as GView).lane).toBe(2);
    frame(logic, { pointerActive: true, actionPressed: true, pointerX: -0.6 });
    expect((logic.view as GView).lane).toBe(1);
  });

  it("吃金币加连击分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 901, kind: "coin", lane: 1, z: 0.8 });
    const before = logic.snapshot().score;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(before + 12);
    expect(v.items.some((i) => i.id === 901)).toBe(false);
  });

  it("撞上同 lane 尖刺会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 902, kind: "hazard", lane: 1, z: 0.8 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("滑行途中的相邻 lane 尖刺是安全的", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Force the runner fully into the center lane first.
    v.laneX = 0;
    v.items.push({ id: 903, kind: "hazard", lane: 2, z: 0.8 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("playing");
  });

  it("跑动会随时间累积距离分", () => {
    const logic = make();
    run(logic, 2);
    expect(logic.snapshot().score).toBeGreaterThan(10);
    expect(LANES).toHaveLength(3);
  });

  it("restart 重置 lane 与实体", () => {
    const logic = make();
    run(logic, 2);
    frame(logic, { axisX: 1 });
    logic.restart();
    const v = logic.view as GView;
    expect(v.lane).toBe(1);
    expect(v.items).toHaveLength(0);
    expect(v.alive).toBe(true);
  });
});
