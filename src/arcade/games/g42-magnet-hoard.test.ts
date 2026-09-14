import { describe, expect, it } from "vitest";
import def, { GView, GOAL, MAGNET_R } from "./g42-magnet-hoard";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g42 磁力收集", () => {
  it("按住磁力会把范围内的灵珠吸向自己", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.orbs.push({ id: 901, kind: "orb", x: 3, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    const d0 = Math.hypot(v.orbs[0].x - v.x, v.orbs[0].y - v.y);
    run(logic, 0.5, () => ({ action: true }));
    const d1 = Math.hypot(v.orbs[0]?.x ?? 999 - v.x, (v.orbs[0]?.y ?? 999) - v.y);
    expect(v.collected).toBe(1);
    expect(d0).toBeLessThan(MAGNET_R);
    void d1;
  });

  it("松开磁力时不吸附", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.orbs.push({ id: 902, kind: "orb", x: 4, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    const before = v.orbs[0].x;
    run(logic, 0.5);
    expect(v.orbs[0].x).toBeCloseTo(before, 5);
    expect(v.collected).toBe(0);
  });

  it("接触到追猎者判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.orbs.push({ id: 903, kind: "drone", x: 0.5, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("追猎者会朝玩家移动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.orbs.push({ id: 904, kind: "drone", x: 5, y: 3, z: 0, vx: 0, vy: 0, spin: 1 });
    run(logic, 1);
    const drone = v.orbs.find((o) => o.id === 904)!;
    expect(Math.hypot(drone.x - v.x, drone.y - v.y)).toBeLessThan(Math.hypot(5, 3));
  });

  it("集满灵珠判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.collected = GOAL - 1;
    v.orbs.push({ id: 905, kind: "orb", x: 0.3, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain(`收集满 ${GOAL}`);
  });

  it("restart 复位收集数", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.orbs.push({ id: 906, kind: "orb", x: 0.3, y: 0, z: 0, vx: 0, vy: 0, spin: 1 });
    logic.step(DT, input());
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.collected).toBe(0);
    expect(v2.orbs).toHaveLength(0);
    expect(v2.alive).toBe(true);
  });
});
