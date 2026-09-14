import { describe, expect, it } from "vitest";
import def, { GView, WAYPOINTS, samplePath, pathLength, TUBE_R } from "./g35-wire-loop";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g35 穿线走珠", () => {
  it("samplePath 返回到折线的距离与弧长", () => {
    const pts: [number, number][] = [[0, 0], [4, 0]];
    const mid = samplePath(2, 1, pts);
    expect(mid.dist).toBe(1);
    expect(mid.s).toBeCloseTo(2, 9);
    const before = samplePath(-1, 0, pts);
    expect(before.s).toBe(0);
    expect(pathLength(pts)).toBe(4);
  });

  it("开局圆环停在起点且进度为零", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.x).toBe(WAYPOINTS[0][0]);
    expect(v.y).toBe(WAYPOINTS[0][1]);
    expect(v.bestS).toBe(0);
    expect(logic.snapshot().meter).toBe(null);
  });

  it("沿导线移动会推进进度并加分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Walk the first two waypoints with the pointer.
    const [ax, ay] = WAYPOINTS[0];
    const [bx, by] = WAYPOINTS[1];
    for (let t = 0; t <= 20; t += 1) {
      const x = ax + ((bx - ax) * t) / 20;
      const y = ay + ((by - ay) * t) / 20;
      logic.step(DT, input({ pointerActive: true, pointerX: x / 5.5, pointerY: (y - 0.5) / 4 }));
    }
    expect(v.bestS).toBeGreaterThan(pathLength([WAYPOINTS[0], WAYPOINTS[1]]) * 0.8);
    expect(logic.snapshot().score).toBeGreaterThan(0);
    expect(logic.snapshot().meter).toBeGreaterThan(0);
  });

  it("偏离导线过远会结束本局", () => {
    const logic = make();
    logic.start();
    logic.step(DT, input({ pointerActive: true, pointerX: 0.9, pointerY: -0.6 }));
    const v = logic.view as GView;
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
    expect(v.shakeT).toBeGreaterThan(0);
  });

  it("终点在容差内即可通关", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Teleport near the goal and hold steady.
    const [gx, gy] = WAYPOINTS[WAYPOINTS.length - 1];
    for (let i = 0; i < 8; i += 1) {
      logic.step(DT, input({ pointerActive: true, pointerX: gx / 5.5, pointerY: (gy - 0.5) / 4 }));
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("全程");
    expect(TUBE_R).toBeGreaterThan(0);
  });

  it("restart 复位进度", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const [ax, ay] = WAYPOINTS[0];
    const [bx, by] = WAYPOINTS[1];
    for (let t = 0; t <= 10; t += 1) {
      const x = ax + ((bx - ax) * t) / 10;
      const y = ay + ((by - ay) * t) / 10;
      logic.step(DT, input({ pointerActive: true, pointerX: x / 5.5, pointerY: (y - 0.5) / 4 }));
    }
    logic.restart();
    expect((logic.view as GView).bestS).toBe(0);
    expect(logic.snapshot().score).toBe(0);
  });
});
