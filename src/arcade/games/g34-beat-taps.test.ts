import { describe, expect, it } from "vitest";
import def, { GView, TOTAL_NOTES, HIT_Y, laneX, LANES } from "./g34-beat-taps";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g34 节奏敲击", () => {
  it("音符会下落", () => {
    const logic = make();
    logic.start();
    run(logic, 2);
    const v = logic.view as GView;
    expect(v.notes.length).toBeGreaterThan(1);
  });

  it("在命中线附近敲判定为命中", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.notes.push({ id: 901, lane: 0, y: HIT_Y, judged: false });
    logic.step(DT, input({ padPressed: [0] }));
    expect(v.notes[0].judged).toBe(true);
    expect(v.done).toBe(1);
    expect(v.combo).toBe(1);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(12);
  });

  it("精准时给更高分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.notes.push({ id: 902, lane: 1, y: HIT_Y + 0.02, judged: false });
    logic.step(DT, input({ padPressed: [1] }));
    expect(v.perfects).toBe(1);
    expect(logic.snapshot().score).toBe(30);
  });

  it("空敲不会误判最近的音", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.notes.push({ id: 903, lane: 2, y: 6, judged: false });
    logic.step(DT, input({ padPressed: [2] }));
    expect(v.notes[0].judged).toBe(false);
    expect(v.done).toBe(0);
  });

  it("漏过命中线会断连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.combo = 5;
    v.notes.push({ id: 904, lane: 3, y: HIT_Y - 0.5, judged: false });
    run(logic, 0.2);
    expect(v.combo).toBe(0);
    expect(v.done).toBe(1);
  });

  it("60 音全部结算", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let i = 0; i < 6000; i += 1) {
      const target = v.notes.find((n) => !n.judged && n.y < HIT_Y + 0.3 && n.y > HIT_Y - 0.3);
      if (target) {
        logic.step(DT, input({ padPressed: [target.lane] }));
      } else {
        logic.step(DT, input());
      }
      if (logic.snapshot().status === "over") break;
    }
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("60/60 音");
    expect(LANES).toBe(4);
  });

  it("restart 清空音轨", () => {
    const logic = make();
    logic.start();
    run(logic, 2);
    logic.restart();
    const v = logic.view as GView;
    expect(v.notes).toHaveLength(0);
    expect(v.done).toBe(0);
    expect(v.combo).toBe(0);
    expect(laneX(0)).toBeLessThan(0);
  });
});
