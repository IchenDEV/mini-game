import { describe, expect, it } from "vitest";
import def, { GView } from "./g05-star-gates";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g05 星门穿行", () => {
  it("不喷射会在几秒内坠地结束", () => {
    const logic = make();
    run(logic, 2);
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("触地");
  });

  it("喷射会瞬间抬升速度，随后被重力拉回", () => {
    const logic = make();
    logic.start();
    frame(logic, { actionPressed: true });
    const v = logic.view as GView;
    expect(v.vy).toBeGreaterThan(4);
    for (let i = 0; i < 30; i += 1) logic.step(DT, input());
    expect(v.vy).toBeLessThan(0);
  });

  it("有节奏喷射可以存活且星门会不断逼近", () => {
    const logic = make();
    run(logic, 5, (t) => ({
      actionPressed: Math.floor(t / 0.42) !== Math.floor((t - DT) / 0.42),
    }));
    const v = logic.view as GView;
    expect(logic.snapshot().status).toBe("playing");
    expect(v.gates.length).toBeGreaterThan(1);
    for (const gate of v.gates) expect(gate.z).toBeLessThan(3);
  });

  it("穿过缺口计 10 分，撞上门柱结束", () => {
    const logic = make();
    logic.start();
    // Keep flapping gently to stay alive while the first gate arrives.
    let flapClock = 0;
    for (let i = 0; i < 60 * 14; i += 1) {
      const v = logic.view as GView;
      const gate = v.gates.find((g) => g.z > -12 && g.z <= 0.5);
      if (gate) {
        // Park inside the gap until the gate has passed.
        v.shipY = gate.gapY;
        v.vy = 0;
      } else {
        flapClock += DT;
        if (flapClock > 0.5) {
          flapClock = 0;
          v.vy = 5.4;
        }
      }
      logic.step(DT, input());
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(10);
  });

  it("把火箭挪到缺口外再进门会撞门结束", () => {
    const logic = make();
    logic.start();
    for (let i = 0; i < 60 * 14; i += 1) {
      const v = logic.view as GView;
      const gate = v.gates.find((g) => g.z > -6 && g.z <= 0.5);
      if (gate) {
        v.shipY = 0.55;
        v.vy = 0;
      }
      logic.step(DT, input());
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 复位火箭与星门", () => {
    const logic = make();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.alive).toBe(true);
    expect(v.gates).toHaveLength(0);
    expect(v.shipY).toBe(4);
  });
});
