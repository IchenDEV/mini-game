import { describe, expect, it } from "vitest";
import def, { GView, COLORS } from "./g17-color-gates";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g17 色彩闸门", () => {
  it("动作键循环切换自身颜色", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    expect(v.colorIndex).toBe(0);
    frame(logic, { actionPressed: true });
    expect(v.colorIndex).toBe(1);
    frame(logic, { actionPressed: true });
    frame(logic, { actionPressed: true });
    expect(v.colorIndex).toBe(0);
    expect(COLORS).toHaveLength(3);
  });

  it("同色穿门加分并累积连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 901, z: -1, color: v.colorIndex, passed: false });
    for (let i = 0; i < 60; i += 1) {
      logic.step(DT, input());
      if (v.gates.some((g) => g.id === 901 && g.passed)) break;
    }
    expect(logic.snapshot().score).toBe(12);
    expect(logic.snapshot().fields[0].value).toBe("×1");
  });

  it("异色穿门立即结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 902, z: -1, color: (v.colorIndex + 1) % COLORS.length, passed: false });
    for (let i = 0; i < 60; i += 1) {
      logic.step(DT, input());
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("闸门速度随时间提升", () => {
    const logic = make();
    run(logic, 6);
    expect((logic.view as GView).speed).toBeGreaterThan(10);
  });

  it("restart 复位颜色与连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 903, z: -1, color: v.colorIndex, passed: false });
    for (let i = 0; i < 60; i += 1) {
      logic.step(DT, input());
      if (v.gates.some((g) => g.id === 903 && g.passed)) break;
    }
    logic.restart();
    expect(v.colorIndex).toBe(0);
    expect(v.gates).toHaveLength(0);
    expect(logic.snapshot().score).toBe(0);
    expect(v.alive).toBe(true);
  });
});
