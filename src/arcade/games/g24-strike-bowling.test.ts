import { describe, expect, it } from "vitest";
import def, { GView, FRAMES, PINS } from "./g24-strike-bowling";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Runs one full throw from aim through roll completion. */
function throwBall(logic: ReturnType<typeof make>, x: number, power: number): void {
  const v = logic.view as GView;
  v.ballX = x;
  frame(logic, { actionPressed: true });
  expect(v.phase).toBe("charge");
  frame(logic, { actionPressed: true });
  expect(v.phase).toBe("roll");
  v.power = power;
  run(logic, 4, () => ({ axisX: 0 }));
}

describe("g24 保龄全倒", () => {
  it("瞄准阶段可以左右选位", () => {
    const logic = make();
    logic.start();
    run(logic, 0.5, () => ({ axisX: 1 }));
    expect((logic.view as GView).ballX).toBeGreaterThan(0.5);
  });

  it("出球流程是 选位→蓄力→滚动", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    expect((logic.view as GView).phase).toBe("charge");
    frame(logic, { actionPressed: true });
    const v = logic.view as GView;
    expect(v.phase).toBe("roll");
    run(logic, 4);
    expect(v.phase).toBe("aim");
  });

  it("正中球位会连锁全倒", () => {
    const logic = make();
    logic.start();
    throwBall(logic, 0, 0.7);
    const v = logic.view as GView;
    // A strike re-racks the pins; the score and strike counter tell the story.
    expect(logic.snapshot().score).toBe(100);
    expect(v.strikes).toBe(1);
    expect(v.frame).toBe(2);
    expect(v.phase).toBe("aim");
  });

  it("边位出球可能洗沟不得分", () => {
    const logic = make();
    logic.start();
    throwBall(logic, 2.6, 0.7);
    const v = logic.view as GView;
    expect(logic.snapshot().score).toBe(0);
    expect(v.rollInFrame).toBe(2);
  });

  it("五局打完结算", () => {
    const logic = make();
    logic.start();
    for (let f = 0; f < FRAMES; f += 1) {
      if (logic.snapshot().status === "over") break;
      throwBall(logic, 0, 0.7);
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`全中 ×${FRAMES}`);
    expect(PINS).toHaveLength(10);
  });

  it("restart 重摆球瓶", () => {
    const logic = make();
    logic.start();
    throwBall(logic, 0, 0.7);
    logic.restart();
    const v = logic.view as GView;
    expect(v.pins.every((p) => p.up)).toBe(true);
    expect(v.frame).toBe(1);
    expect(logic.snapshot().score).toBe(0);
  });

  it("每帧步进不会提前结束", () => {
    const logic = make();
    logic.start();
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("playing");
  });
});
