import { describe, expect, it } from "vitest";
import def, { GView } from "./g01-asteroid-corridor";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g01 陨石回廊", () => {
  it("从待机进入游戏后，得分随飞行距离增长", () => {
    const logic = make();
    expect(logic.snapshot().status).toBe("ready");
    run(logic, 2);
    expect(logic.snapshot().status).toBe("playing");
    expect(logic.snapshot().score).toBeGreaterThan(10);
  });

  it("方向输入会移动飞船并被限制在走廊内", () => {
    const logic = make();
    run(logic, 0.5);
    const startX = (logic.view as GView).shipX;
    run(logic, 1, () => ({ axisX: 1 }));
    const v = logic.view as GView;
    expect(v.shipX).toBeGreaterThan(startX);
    expect(v.shipX).toBeLessThanOrEqual(6);
  });

  it("陨石终会撞上原地不动的飞船并结束本局", () => {
    const logic = make();
    run(logic, 90);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.score).toBeGreaterThan(0);
    expect(snap.best).toBe(snap.score);
    expect(snap.detail).toContain("飞行");
  });

  it("restart 会重置飞船与实体", () => {
    const logic = make();
    run(logic, 90);
    logic.restart();
    const v = logic.view as GView;
    expect(logic.snapshot().status).toBe("playing");
    expect(v.alive).toBe(true);
    expect(v.entities).toHaveLength(0);
    expect(v.shipX).toBe(0);
  });

  it("左右推进核心可以加分并触发提示", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.entities.push({ id: 99, kind: "core", x: 0, y: 1.1, z: 0.5, r: 0.45, spin: 0, passed: false });
    const before = logic.snapshot().score;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(before + 25);
    expect(logic.snapshot().callout?.text).toBe("+25");
  });

  it("暂停后恢复继续计时", () => {
    const logic = make();
    run(logic, 1);
    logic.pause();
    expect(logic.snapshot().status).toBe("paused");
    logic.resume();
    frame(logic);
    expect(logic.snapshot().status).toBe("playing");
  });
});
