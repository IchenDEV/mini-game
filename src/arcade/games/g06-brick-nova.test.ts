import { describe, expect, it } from "vitest";
import def, { GView, COLS, ROWS, BRICK_TOP, ARENA_W, PADDLE_Y } from "./g06-brick-nova";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g06 砖块风暴", () => {
  it("开局有整面砖墙且都悬在场地内", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.bricks).toHaveLength(COLS * ROWS);
    for (const b of v.bricks) {
      expect(Math.abs(b.x)).toBeLessThan(ARENA_W / 2);
      expect(b.y).toBeLessThan(BRICK_TOP + 0.3);
    }
  });

  it("球落在挡板上会反弹", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = v.paddleX;
    v.ballY = 2.5;
    v.vx = 0;
    v.vy = -5;
    for (let i = 0; i < 200; i += 1) {
      logic.step(DT, input());
      if (v.vy > 0) break;
    }
    expect(v.vy).toBeGreaterThan(0);
  });

  it("击中砖块扣血计分，hp 归零后移除", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const brick = v.bricks[v.bricks.length - 1];
    const before = logic.snapshot().score;
    for (let burst = 0; burst < 2; burst += 1) {
      v.ballX = brick.x;
      v.ballY = brick.y - 0.8;
      v.vx = 0;
      v.vy = 6;
      for (let i = 0; i < 20; i += 1) logic.step(DT, input());
    }
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(before + 44);
    expect(v.bricks.some((b) => b.id === brick.id)).toBe(false);
  });

  it("清空砖墙进入下一波并奖励 200", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const brick = v.bricks[0];
    v.bricks = [brick];
    v.ballX = brick.x;
    v.ballY = brick.y - 0.6;
    v.vx = 0;
    v.vy = 6;
    for (let i = 0; i < 60; i += 1) {
      logic.step(DT, input());
      if (v.wave === 2) break;
    }
    expect(v.wave).toBe(2);
    expect(v.bricks.length).toBeGreaterThan(0);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(220);
  });

  it("球落出挡板会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = 5.7;
    v.ballY = 2;
    v.vx = 0;
    v.vy = -5;
    run(logic, 2);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 重建第一波", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.bricks = [];
    logic.restart();
    expect((logic.view as GView).bricks).toHaveLength(COLS * ROWS);
    expect(logic.snapshot().score).toBe(0);
    expect(v.alive).toBe(true);
    expect(logic.snapshot().status).toBe("playing");
    expect(PADDLE_Y).toBeGreaterThan(0);
  });
});
