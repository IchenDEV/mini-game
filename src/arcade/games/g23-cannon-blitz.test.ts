import { describe, expect, it } from "vitest";
import def, { GView, ROUND_SECONDS } from "./g23-cannon-blitz";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g23 加农打靶", () => {
  it("开炮会发射具有抛物线速度的炮弹", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.power = 0.5;
    frame(logic, { actionReleased: true });
    expect(v.cannonballs).toHaveLength(1);
    expect(v.cannonballs[0].vy).toBeGreaterThan(5);
    expect(v.cannonballs[0].vx).toBeGreaterThan(3);
  });

  it("炮弹命中标靶会摧毁并刷新", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.angle = 0.9;
    v.targets[0].drift = 0;
    frame(logic, { actionReleased: true });
    expect(v.cannonballs).toHaveLength(1);
    // The target shadows the cannonball's flight path until impact.
    run(logic, 2.4, () => {
      const b = (logic.view as GView).cannonballs[0];
      if (b) {
        const t = (logic.view as GView).targets[0];
        t.x = b.x + 0.2;
        t.y = b.y;
      }
      return { axisY: 0 };
    });
    expect(v.destroyed).toBe(1);
    expect(logic.snapshot().score).toBe(25);
    expect(v.targets.some((t) => t.id === v.targets[0].id)).toBe(true);
  });

  it("炮弹落地弹跳后消失", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.power = 0.5;
    frame(logic, { actionReleased: true });
    run(logic, 4, () => ({ axisY: 0 }));
    expect(v.cannonballs).toHaveLength(0);
  });

  it("角度受上下键调整并被夹住", () => {
    const logic = make();
    logic.start();
    run(logic, 2, () => ({ axisY: 1 }));
    const v = logic.view as GView;
    expect(v.angle).toBeGreaterThan(0.8);
    expect(v.angle).toBeLessThanOrEqual(1.35 + 1e-9);
  });

  it("限时结束时按击毁数判定胜负", () => {
    const logic = make();
    run(logic, ROUND_SECONDS + 1);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.meter).toBe(0);
    expect(snap.detail).toContain("45 秒");
  });

  it("restart 复位标靶与时间", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.seconds = 10;
    logic.restart();
    expect((logic.view as GView).seconds).toBe(ROUND_SECONDS);
    expect(logic.snapshot().meter).toBeCloseTo(1, 5);
    expect(v.cannonballs).toHaveLength(0);
  });
});
