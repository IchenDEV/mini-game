import { describe, expect, it } from "vitest";
import def, { GView, wrapAngle, PLAYER_PLANE } from "./g03-tunnel-rush";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g03 隧道疾驰", () => {
  it("角度随输入旋转并保持归一化", () => {
    const logic = make();
    logic.start();
    const before = (logic.view as GView).angle;
    run(logic, 1, () => ({ axisX: 1 }));
    const v = logic.view as GView;
    expect(v.angle).not.toBe(before);
    expect(v.angle).toBeGreaterThanOrEqual(0);
    expect(v.angle).toBeLessThan(Math.PI * 2);
    expect(wrapAngle(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5, 10);
  });

  it("光环会不断逼近，对准缺口的光环会给分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.rings.push({ id: 999, z: PLAYER_PLANE - 2, gap: v.angle + 0.1, half: 0.8, scored: false });
    const before = logic.snapshot().score;
    let sawScored = false;
    for (let i = 0; i < 90; i += 1) {
      logic.step(DT, input());
      const ring = v.rings.find((r) => r.id === 999);
      if (ring?.scored) sawScored = true;
      if (logic.snapshot().status !== "playing") break;
    }
    expect(sawScored).toBe(true);
    expect(logic.snapshot().score).toBeGreaterThan(before);
  });

  it("撞上环壁结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.rings.push({ id: 998, z: PLAYER_PLANE - 1.5, gap: v.angle + Math.PI, half: 0.5, scored: false });
    for (let i = 0; i < 120; i += 1) {
      logic.step(DT, input());
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("缺口随时间收窄但不会小于下限", () => {
    const logic = make();
    run(logic, 30);
    const v = logic.view as GView;
    for (const ring of v.rings) expect(ring.half).toBeGreaterThanOrEqual(0.42);
  });

  it("restart 复位角度与光环", () => {
    const logic = make();
    run(logic, 3);
    logic.restart();
    const v = logic.view as GView;
    expect(v.rings).toHaveLength(0);
    expect(v.alive).toBe(true);
    expect(logic.snapshot().score).toBe(0);
  });
});
