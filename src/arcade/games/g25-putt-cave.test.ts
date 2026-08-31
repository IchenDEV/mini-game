import { describe, expect, it } from "vitest";
import def, { GView, HOLES, MAX_STROKES, HOLE_R } from "./g25-putt-cave";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Teleports the ball next to the cup and taps it in. */
function sinkHole(logic: ReturnType<typeof make>): void {
  const v = logic.view as GView;
  v.ballX = v.hole.hx + 0.2;
  v.ballZ = v.hole.hz;
  v.vx = 0.6;
  v.vz = 0;
  v.rolling = true;
  v.strokes += 1;
  v.totalStrokes += 1;
}

describe("g25 迷你推杆", () => {
  it("蓄力后松手会推球滚动", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    expect((logic.view as GView).charging).toBe(true);
    frame(logic, { actionReleased: true, action: false });
    const v = logic.view as GView;
    expect(v.rolling).toBe(true);
    expect(v.strokes).toBe(1);
  });

  it("球会因摩擦减速停下", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    frame(logic, { actionPressed: true });
    frame(logic, { actionReleased: true, action: false });
    run(logic, 6);
    expect(v.rolling).toBe(false);
    expect(Math.hypot(v.vx, v.vz)).toBeLessThan(0.2);
  });

  it("进洞加分并进入下一洞", () => {
    const logic = make();
    logic.start();
    sinkHole(logic);
    logic.step(DT, input());
    const v = logic.view as GView;
    expect(v.holeIndex).toBe(2);
    expect(logic.snapshot().score).toBe(70);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("三洞全部进洞后胜利结算", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < HOLES; i += 1) {
      if (logic.snapshot().status === "over") break;
      sinkHole(logic);
      logic.step(DT, input());
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`共 ${HOLES} 杆`);
    expect(MAX_STROKES).toBe(8);
  });

  it("坡度会在滚动中改变球速方向", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.hole.slopeX = 2;
    frame(logic, { actionPressed: true });
    frame(logic, { actionReleased: true, action: false });
    const vx0 = v.vx;
    logic.step(DT, input());
    expect(v.vx).toBeGreaterThan(vx0);
    void HOLE_R;
  });

  it("超杆判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.strokes = MAX_STROKES;
    v.rolling = true;
    v.vx = 0.01;
    v.vz = 0;
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 回到第一洞", () => {
    const logic = make();
    logic.start();
    sinkHole(logic);
    logic.step(DT, input());
    logic.restart();
    const v = logic.view as GView;
    expect(v.holeIndex).toBe(1);
    expect(v.totalStrokes).toBe(0);
    expect(logic.snapshot().score).toBe(0);
  });
});
