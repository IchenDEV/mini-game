import { describe, expect, it } from "vitest";
import def, { GView, GATE_HALF_GAP } from "./g19-slalom-rush";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g19 雪山回转", () => {
  it("旗门沿雪道交替出现", () => {
    const logic = make();
    run(logic, 3);
    const v = logic.view as GView;
    expect(v.gates.length).toBeGreaterThanOrEqual(3);
    expect(v.trees.length).toBeGreaterThanOrEqual(1);
  });

  it("从旗门中间穿过计分并累积连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 901, x: v.x, z: -1.2, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(12);
    expect(logic.snapshot().fields[1].value).toBe("×1");
  });

  it("擦到旗杆会摔倒", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 902, x: v.x + GATE_HALF_GAP + 0.2, z: -1.2, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().status).toBe("over");
  });

  it("完全错过旗门只断连击不结束", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gates.push({ id: 903, x: v.x, z: -1.2, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().fields[1].value).toBe("×1");
    v.gates.push({ id: 904, x: v.x + 4, z: -1.2, done: false });
    run(logic, 0.4);
    expect(logic.snapshot().status).toBe("playing");
    expect(logic.snapshot().fields[1].value).toBe("×0");
  });

  it("撞上树也会摔倒", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.trees.push({ id: 905, x: v.x, z: -1.2 });
    run(logic, 0.4);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 复位雪道", () => {
    const logic = make();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.gates).toHaveLength(0);
    expect(v.trees).toHaveLength(0);
    expect(v.alive).toBe(true);
  });
});
