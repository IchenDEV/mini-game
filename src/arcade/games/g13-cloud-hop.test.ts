import { describe, expect, it } from "vitest";
import def, { GView, WORLD_HALF, CLOUD_R } from "./g13-cloud-hop";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g13 云端跳跳", () => {
  it("踩云弹起，高度分随峰值增长", () => {
    const logic = make();
    run(logic, 4);
    expect(logic.snapshot().status).toBe("playing");
    expect(logic.snapshot().score).toBeGreaterThan(0);
  });

  it("左右移动会改变横坐标，出界会从另一侧绕回", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = WORLD_HALF - 0.1;
    run(logic, 0.5, () => ({ axisX: 1 }));
    expect(v.ballX).toBeLessThan(0);
  });

  it("易碎云踩过一次就消失", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Wait until the ball is falling, then slide a fragile cloud underneath.
    for (let i = 0; i < 240; i += 1) {
      logic.step(DT, input());
      if (v.vy < 0) break;
    }
    const cloud = { id: 999, x: v.ballX, y: v.ballY - 1, kind: "fragile" as const, dir: 1, used: false };
    v.clouds.unshift(cloud);
    for (let i = 0; i < 120; i += 1) {
      logic.step(DT, input());
      if (cloud.used) break;
    }
    expect(cloud.used).toBe(true);
  });

  it("移动云会在边界反弹", () => {
    const logic = make();
    const v = logic.view as GView;
    const cloud = { id: 998, x: WORLD_HALF - 0.62, y: 50, kind: "moving" as const, dir: 1, used: false };
    v.clouds.push(cloud);
    const before = cloud.dir;
    run(logic, 2);
    expect(cloud.dir).toBe(-before);
    expect(cloud.x).toBeLessThan(WORLD_HALF);
    expect(CLOUD_R).toBeGreaterThan(0);
  });

  it("掉出画面下方会结束本局", () => {
    const logic = make();
    run(logic, 1);
    const v = logic.view as GView;
    v.ballY = v.camY - 10;
    v.vy = -6;
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 复位高度与云层", () => {
    const logic = make();
    run(logic, 4);
    logic.restart();
    const v = logic.view as GView;
    expect(v.ballY).toBe(1);
    expect(v.camY).toBe(3);
    expect(logic.snapshot().score).toBe(0);
    expect(v.alive).toBe(true);
  });
});
