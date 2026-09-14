import { describe, expect, it } from "vitest";
import def, { GView } from "./g12-slope-marble";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g12 斜坡滚球", () => {
  it("滑行会累积距离分并不断生成障碍", () => {
    const logic = make();
    run(logic, 3);
    const v = logic.view as GView;
    expect(logic.snapshot().score).toBeGreaterThan(10);
    expect(v.things.length).toBeGreaterThan(3);
  });

  it("滚进黑洞会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.things.push({ id: 801, kind: "hole", x: v.ballX, z: 0.5, r: 0.9 });
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
  });

  it("撞上石柱会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.things.push({ id: 802, kind: "pillar", x: v.ballX, z: 0.5, r: 0.42 });
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
  });

  it("捡到宝石加 30 分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.things.push({ id: 803, kind: "gem", x: v.ballX, z: 0.5, r: 0.4 });
    const before = logic.snapshot().score;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(before + 30);
  });

  it("左右转向被坡道边界夹住", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ axisX: 1 }));
    expect((logic.view as GView).ballX).toBeCloseTo(4.4, 5);
  });

  it("restart 复位小球与障碍", () => {
    const logic = make();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.things).toHaveLength(0);
    expect(v.ballX).toBe(0);
    expect(logic.snapshot().score).toBe(0);
    expect(v.alive).toBe(true);
  });
});
