import { describe, expect, it } from "vitest";
import def, { GView, PAD_BOOST, SUPER_BOOST } from "./g41-bounce-ascent";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g41 弹射登塔", () => {
  it("踩上普通弹床获得标准弹力", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.pads.push({ id: 900, x: v.ballX, y: v.ballY - 0.1, kind: "normal", used: false });
    v.vy = -5;
    run(logic, 0.08);
    expect(v.vy).toBeGreaterThan(9);
    expect(v.vy).toBeLessThanOrEqual(PAD_BOOST);
    expect(v.pads.find((p) => p.id === 900)!.used).toBe(true);
  });

  it("超弹床弹得更高并加 15 分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.pads.push({ id: 901, x: v.ballX, y: v.ballY - 0.1, kind: "super", used: false });
    v.vy = -5;
    const before = logic.snapshot().score;
    run(logic, 0.08);
    expect(v.vy).toBeGreaterThan(14);
    expect(v.vy).toBeLessThanOrEqual(SUPER_BOOST);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(before + 15);
  });

  it("左右移动被墙夹住", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ axisX: 1 }));
    expect((logic.view as GView).ballX).toBeLessThanOrEqual(4.4 + 1e-6);
  });

  it("掉出画面下方判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.vy = -12;
    v.ballY = v.camY - 6;
    run(logic, 1);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("restart 复位高度", () => {
    const logic = make();
    logic.start();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.ballY).toBe(0.6);
    expect(v.camY).toBe(4);
    expect(logic.snapshot().score).toBe(0);
  });
});
