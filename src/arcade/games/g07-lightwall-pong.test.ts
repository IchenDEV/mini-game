import { describe, expect, it } from "vitest";
import def, { GView, ARENA_W, PADDLE_Y } from "./g07-lightwall-pong";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Drops the ball onto the paddle center and waits for the rebound. */
function bounceOnce(logic: ReturnType<typeof make>): void {
  const v = logic.view as GView;
  v.ballX = 0;
  v.ballY = 4;
  v.vx = 0;
  v.vy = -5;
  for (let i = 0; i < 240; i += 1) {
    logic.step(DT, input());
    if (v.vy > 0 || logic.snapshot().status === "over") break;
  }
}

describe("g07 光墙弹球", () => {
  it("移动输入会带动挡板并被墙夹住", () => {
    const logic = make();
    logic.start();
    run(logic, 1.2, () => ({ axisX: 1 }));
    const v = logic.view as GView;
    expect(v.paddleX).toBeGreaterThan(ARENA_W / 2 - 2);
  });

  it("球落在挡板上会反弹并计 10 分", () => {
    const logic = make();
    logic.start();
    bounceOnce(logic);
    const v = logic.view as GView;
    expect(v.vy).toBeGreaterThan(0);
    expect(logic.snapshot().score).toBe(10);
  });

  it("球滑出挡板会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = 5.6;
    v.ballY = 3;
    v.vx = 0;
    v.vy = -5;
    run(logic, 2);
    expect(logic.snapshot().status).toBe("over");
  });

  it("每接 5 次提速并缩小挡板", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < 5; i += 1) bounceOnce(logic);
    const v = logic.view as GView;
    expect(v.paddleW).toBeCloseTo(2.4 * 0.85, 5);
    expect(v.speed).toBeGreaterThan(7);
    expect(logic.snapshot().score).toBe(50);
  });

  it("反弹角随击球位置变化", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.paddleX = 0;
    v.ballX = 1.4;
    v.ballY = 4;
    v.vx = 0;
    v.vy = -5;
    for (let i = 0; i < 240; i += 1) {
      logic.step(DT, input());
      if (v.vy > 0) break;
    }
    expect(v.vx).toBeGreaterThan(0);
  });

  it("restart 复位球速与板宽", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < 3; i += 1) bounceOnce(logic);
    logic.restart();
    const v = logic.view as GView;
    expect(v.paddleW).toBe(2.4);
    expect(v.speed).toBe(7);
    expect(logic.snapshot().score).toBe(0);
    expect(v.paddleX).toBe(0);
    expect(v.ballY).toBeGreaterThan(PADDLE_Y);
  });

  it("暂停后恢复", () => {
    const logic = make();
    run(logic, 0.5);
    logic.pause();
    expect(logic.snapshot().status).toBe("paused");
    logic.resume();
    frame(logic);
    expect(logic.snapshot().status).toBe("playing");
  });
});
