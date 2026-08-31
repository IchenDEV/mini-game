import { describe, expect, it } from "vitest";
import def, { GView, BALLS, BUMPER_R } from "./g49-pinch-pinball";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function launch(logic: ReturnType<typeof make>): void {
  logic.start();
  logic.step(DT, input({ actionPressed: true }));
}

describe("g49 弹珠台", () => {
  it("空格发球后球开始下落", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    expect(v.launched).toBe(true);
    run(logic, 0.5);
    expect(v.ballY).toBeLessThan(8.6);
  });

  it("撞上圆垫反弹并加 10 分", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    v.ballX = v.bumpers[0].x;
    v.ballY = v.bumpers[0].y + BUMPER_R + 0.3;
    v.vy = 1;
    v.vx = 0;
    const before = logic.snapshot().score;
    run(logic, 0.4);
    expect(logic.snapshot().score).toBe(before + 10);
    expect(v.vy).toBeGreaterThan(-2);
  });

  it("球掉进洞会扣一球", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    v.ballX = 0;
    v.ballY = 1;
    v.vy = -6;
    run(logic, 0.5);
    expect(v.ballsLeft).toBe(BALLS - 1);
    expect(v.launched).toBe(false);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("三球耗尽判负", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    v.ballsLeft = 1;
    v.ballX = 0;
    v.ballY = 1;
    v.vy = -6;
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("弹板在按下时能把球打回去", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    v.ballX = -1.1;
    v.ballY = 0.75;
    v.vy = -4;
    v.vx = 0;
    run(logic, 0.25, () => ({ axisX: -1 }));
    expect(v.vy).toBeGreaterThan(0);
  });

  it("restart 补满三球", () => {
    const logic = make();
    launch(logic);
    const v = logic.view as GView;
    v.ballX = 0;
    v.ballY = 1;
    v.vy = -6;
    run(logic, 0.5);
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.ballsLeft).toBe(BALLS);
    expect(logic.snapshot().score).toBe(0);
    expect(v2.alive).toBe(true);
  });
});
