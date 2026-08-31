import { describe, expect, it } from "vitest";
import def, { GView, BEAM_HALF } from "./g18-beam-balance";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g18 平衡木板", () => {
  it("不干预时球会随阵风滚落", () => {
    const logic = make();
    run(logic, 12);
    expect(logic.snapshot().status).toBe("over");
  });

  it("反向压杆能把球推回中间", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = 1;
    run(logic, 1.2, () => ({ axisX: 1 }));
    expect(v.ballX).toBeLessThan(1);
  });

  it("球滚出木板末端结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.ballX = BEAM_HALF + 0.1;
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
  });

  it("得分等于坚持时间×10", () => {
    const logic = make();
    logic.start();
    // Pin the ball near the center with counter-lean.
    for (let i = 0; i < 240; i += 1) {
      const v = logic.view as GView;
      logic.step(DT, input({ axisX: Math.sign(v.ballX) }));
      if (logic.snapshot().status === "over") break;
    }
    const v = logic.view as GView;
    expect(v.seconds).toBeGreaterThan(2);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(20);
  });

  it("restart 复位小球与倾角", () => {
    const logic = make();
    run(logic, 1);
    logic.restart();
    const v = logic.view as GView;
    expect(v.ballX).toBe(0);
    expect(v.tilt).toBe(0);
    expect(v.seconds).toBe(0);
  });
});
