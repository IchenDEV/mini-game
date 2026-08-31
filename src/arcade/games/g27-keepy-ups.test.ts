import { describe, expect, it } from "vitest";
import def, { GView, PADDLE_Y } from "./g27-keepy-ups";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g27 弹跳保持", () => {
  it("球会被球拍弹起并计垫球数", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = 0;
    v.paddleX = 0;
    run(logic, 1.6, () => ({ pointerActive: true, pointerX: 0 }));
    expect(v.keepups).toBeGreaterThanOrEqual(1);
    expect(logic.snapshot().score).toBeGreaterThan(0);
  });

  it("击点偏移会让球横向飞出", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.paddleX = 0;
    v.ballX = 0.9;
    v.ballY = 1.2;
    v.vy = -3;
    v.vx = 0;
    for (let i = 0; i < 60; i += 1) {
      logic.step(DT, input());
      if (v.vy > 0) break;
    }
    expect(v.vx).toBeGreaterThan(1);
  });

  it("球落地结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.paddleX = 5;
    v.ballX = -4;
    v.ballY = 1;
    v.vx = 0;
    v.vy = -1;
    run(logic, 2);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("阵风会推动球", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const vx0 = v.vx;
    run(logic, 5);
    expect(v.vx).not.toBe(vx0);
  });

  it("restart 复位球与计数", () => {
    const logic = make();
    logic.start();
    run(logic, 1.6, () => ({ pointerActive: true, pointerX: 0 }));
    logic.restart();
    const v = logic.view as GView;
    expect(v.keepups).toBe(0);
    expect(v.ballY).toBe(5);
    expect(logic.snapshot().score).toBe(0);
    expect(PADDLE_Y).toBeGreaterThan(0);
  });
});
