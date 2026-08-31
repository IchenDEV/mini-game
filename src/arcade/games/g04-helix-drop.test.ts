import { describe, expect, it } from "vitest";
import def, { GView, SECTORS, PLATFORM_GAP_Y, sectorOfAngle } from "./g04-helix-drop";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g04 螺旋跳塔", () => {
  it("塔身旋转决定球前的扇区编号", () => {
    expect(sectorOfAngle(0)).toBe(0);
    expect(sectorOfAngle(Math.PI)).toBe(SECTORS / 2);
    expect(sectorOfAngle(Math.PI / 6)).toBe(SECTORS - 1);
  });

  it("每层塔都有缺口，缺口长度在 2~4 段", () => {
    const logic = make();
    const v = logic.view as GView;
    for (const plat of v.platforms) {
      const gaps = plat.solid.filter((s) => !s).length;
      expect(gaps).toBeGreaterThanOrEqual(2);
      expect(gaps).toBeLessThanOrEqual(4);
    }
  });

  it("对准缺口时球会穿层计分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.platforms[0].solid.fill(false);
    run(logic, 1.2);
    expect(v.platforms[0].broken).toBe(true);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(12);
  });

  it("转到实心扇区会被弹起", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (const plat of v.platforms) plat.solid.fill(true);
    run(logic, 0.75);
    expect(v.vy).toBeGreaterThan(0);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("连穿两层后可以粉碎实心平台", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.platforms.forEach((plat) => plat.solid.fill(false));
    v.platforms[2].solid.fill(true);
    run(logic, 8);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain("粉碎 ×1");
    expect(snap.score).toBeGreaterThanOrEqual(12 + 14 + 15);
  });

  it("岩浆追上球会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.lavaY = v.ballY;
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 重建塔身", () => {
    const logic = make();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.alive).toBe(true);
    expect(v.ballY).toBe(2);
    expect(v.platforms.length).toBeGreaterThanOrEqual(14);
    expect(v.platforms[0].y).toBeCloseTo(0, 9);
    expect(v.platforms[1].y).toBeCloseTo(-PLATFORM_GAP_Y, 9);
  });
});
