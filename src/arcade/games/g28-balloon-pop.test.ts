import { describe, expect, it } from "vitest";
import def, { GView, MAX_LIVES, ROUND_SECONDS } from "./g28-balloon-pop";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Clicks at the given world point (converted like the logic does). */
function click(logic: ReturnType<typeof make>, wx: number, wy: number): void {
  logic.step(DT, input({ pointerActive: true, actionPressed: true, pointerX: wx / 6.2, pointerY: (wy - 0.6) / 4.4 }));
}

describe("g28 气球爆破", () => {
  it("点中气球计分并累积连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 1, kind: "balloon", x: 0, y: 2, vy: 0, r: 0.46, colorIdx: 1 });
    click(logic, 0, 2);
    expect(v.popped).toBe(1);
    expect(v.streak).toBe(1);
    expect(logic.snapshot().score).toBeGreaterThan(0);
    expect(v.items).toHaveLength(0);
  });

  it("点中炸弹扣一条命", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 2, kind: "bomb", x: 0, y: 2, vy: 0, r: 0.36, colorIdx: 0 });
    click(logic, 0, 2);
    expect(v.lives).toBe(MAX_LIVES - 1);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("三条命耗尽结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.lives = 1;
    v.items.push({ id: 3, kind: "bomb", x: 0, y: 2, vy: 0, r: 0.36, colorIdx: 0 });
    click(logic, 0, 2);
    expect(logic.snapshot().status).toBe("over");
  });

  it("飘出顶部的气球会断连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.streak = 4;
    v.items.push({ id: 4, kind: "balloon", x: 0, y: 7.35, vy: 2, r: 0.46, colorIdx: 0 });
    run(logic, 0.3);
    expect(v.streak).toBe(0);
  });

  it("点空处不会误判", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 5, kind: "balloon", x: 4, y: 2, vy: 0, r: 0.46, colorIdx: 0 });
    click(logic, -5, 2);
    expect(v.items).toHaveLength(1);
    expect(v.popped).toBe(0);
  });

  it("限时结束结算", () => {
    const logic = make();
    run(logic, ROUND_SECONDS + 1);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.meter).toBe(0);
  });

  it("restart 复位", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 6, kind: "balloon", x: 0, y: 2, vy: 0, r: 0.46, colorIdx: 0 });
    click(logic, 0, 2);
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.items).toHaveLength(0);
    expect(v2.lives).toBe(MAX_LIVES);
    expect(v2.seconds).toBe(ROUND_SECONDS);
  });
});
