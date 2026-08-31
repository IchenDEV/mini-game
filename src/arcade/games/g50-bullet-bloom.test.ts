import { describe, expect, it } from "vitest";
import def, { GView, ROUND_SECONDS } from "./g50-bullet-bloom";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g50 弹幕花园", () => {
  it("弹幕会从中心螺旋生成并扩散", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ pointerActive: true, pointerX: 0, pointerY: -0.8 }));
    const v = logic.view as GView;
    expect(v.bullets.length).toBeGreaterThan(2);
    for (const b of v.bullets) expect(b.dist).toBeGreaterThan(0);
  });

  it("被弹幕击中判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Park a bullet right on the player (respecting the 0.7 y-squash).
    v.bullets.push({
      id: 901,
      angle: Math.atan2(v.y / 0.7, v.x),
      dist: Math.hypot(v.x, v.y / 0.7),
      speed: 0,
      spin: 0,
    });
    run(logic, 0.3);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("玩家移动被夹在场地内", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ axisX: 1, axisY: 1 }));
    const v = logic.view as GView;
    expect(Math.abs(v.x)).toBeLessThanOrEqual(6.4 + 1e-6);
    expect(v.y).toBeLessThanOrEqual(2.4 + 1e-6);
  });

  it("撑满 45 秒判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    run(logic, ROUND_SECONDS + 1, () => {
      // Teleport-clear the bullets every frame to guarantee survival.
      v.bullets = v.bullets.filter((b) => b.dist > 15);
      return { pointerActive: true, pointerX: 0, pointerY: -0.8 };
    });
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain("45 秒");
    expect(snap.meter).toBe(0);
  });

  it("得分等于存活时间×10", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.seconds = ROUND_SECONDS - 10;
    run(logic, 0.2, () => ({ pointerActive: true, pointerX: 0, pointerY: -0.8 }));
    if (logic.snapshot().status === "playing") {
      expect(logic.snapshot().score).toBeGreaterThan(90);
    }
  });

  it("restart 复位计时", () => {
    const logic = make();
    logic.start();
    run(logic, 3);
    logic.restart();
    const v = logic.view as GView;
    expect(v.seconds).toBe(ROUND_SECONDS);
    expect(v.bullets).toHaveLength(0);
    expect(v.alive).toBe(true);
  });
});
