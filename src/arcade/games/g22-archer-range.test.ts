import { describe, expect, it } from "vitest";
import def, { GView, ARROWS, range45 } from "./g22-archer-range";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

// power(t) = |sin(-π/2 + 2.1·t)| peaks (slope 0) when phase = π/2 + m·π,
// i.e. every 89.7 frames. Releasing there is frame-quantization-proof.
const PEAK_FRAMES = Math.round((Math.PI / 2.1) * 60);
const FULL_POWER = 8 + 1 * 11;
const FULL_RANGE = -range45(FULL_POWER);

/** Steps to the next power peak and releases, returning the landing z. */
function shootAtPeak(logic: ReturnType<typeof make>, targetZ: number, targetX = 0): number {
  const v = logic.view as GView;
  v.wind = 0;
  v.targets[0].z = targetZ;
  v.targets[0].x = targetX;
  let phase = -Math.PI / 2 + 2.1 * 0;
  // Track frames since the logic started via the power value itself.
  // Simply walk until |sin| is within ε of 1.
  for (let i = 0; i < PEAK_FRAMES * 2 + 5; i += 1) {
    if (v.power > 0.9995) break;
    logic.step(DT, input());
  }
  logic.step(DT, input({ actionReleased: true }));
  return FULL_RANGE;
}

describe("g22 靶心射击", () => {
  it("45 度射程公式随力度增长", () => {
    expect(range45(10)).toBeCloseTo(100 / 9.8, 9);
    expect(range45(14)).toBeGreaterThan(range45(10));
  });

  it("正中靶心得 50 分", () => {
    const logic = make();
    logic.start();
    shootAtPeak(logic, FULL_RANGE);
    const v = logic.view as GView;
    expect(v.bulls).toBe(1);
    expect(v.hits).toBe(1);
    expect(logic.snapshot().score).toBe(50);
    expect(v.arrowsLeft).toBe(ARROWS - 1);
  });

  it("上靶但偏离中心得 20 分", () => {
    const logic = make();
    logic.start();
    shootAtPeak(logic, FULL_RANGE + 0.8);
    const v = logic.view as GView;
    expect(v.hits).toBe(1);
    expect(v.bulls).toBe(0);
    expect(logic.snapshot().score).toBe(20);
  });

  it("脱靶不得分且风力会换", () => {
    const logic = make();
    logic.start();
    shootAtPeak(logic, FULL_RANGE + 5);
    const v = logic.view as GView;
    expect(v.hits).toBe(0);
    expect(logic.snapshot().score).toBe(0);
    expect(Math.abs(v.wind)).toBeGreaterThan(0);
  });

  it("八支箭用完结算，全上靶判胜", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < ARROWS + 1; i += 1) {
      if (logic.snapshot().status === "over") break;
      shootAtPeak(logic, FULL_RANGE);
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`上靶 ${ARROWS} / ${ARROWS}`);
  });

  it("力度条持续摆动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const p1 = v.power;
    for (let i = 0; i < 30; i += 1) logic.step(DT, input());
    expect(v.power).not.toBe(p1);
  });
});
