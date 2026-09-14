import { describe, expect, it } from "vitest";
import def, { GView, ROUND_SECONDS, CELLS, cellCenter } from "./g29-mole-patrol";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Clicks a grid cell via pointer mapping (same transform as the logic). */
function whackCell(logic: ReturnType<typeof make>, cell: number): void {
  const [cx, cy] = cellCenter(cell);
  logic.step(DT, input({
    pointerActive: true,
    actionPressed: true,
    pointerX: cx / 4.6,
    pointerY: (cy - 0.8) / 3.4,
  }));
}

describe("g29 打地鼠3D", () => {
  it("洞口坐标按 3×3 排布", () => {
    expect(cellCenter(0)).toEqual([-2.4, -2.4]);
    expect(cellCenter(4)).toEqual([0, 0]);
    expect(cellCenter(8)).toEqual([2.4, 2.4]);
    expect(CELLS).toBe(9);
  });

  it("地鼠会自动冒头", () => {
    const logic = make();
    logic.start();
    run(logic, 3);
    expect((logic.view as GView).moles.length).toBeGreaterThanOrEqual(1);
  });

  it("敲中普通地鼠得分并累积连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.moles.push({ cell: 4, kind: "normal", upTimer: 1, total: 1.2, whacked: false });
    whackCell(logic, 4);
    expect(v.hits).toBe(1);
    expect(v.streak).toBe(1);
    expect(logic.snapshot().score).toBe(11);
  });

  it("敲中金地鼠加 30 分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.moles.push({ cell: 2, kind: "gold", upTimer: 0.5, total: 0.8, whacked: false });
    whackCell(logic, 2);
    expect(logic.snapshot().score).toBe(30);
  });

  it("敲中炸弹鼠断连击但不扣分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.moles.push({ cell: 0, kind: "normal", upTimer: 1, total: 1, whacked: false });
    whackCell(logic, 0);
    const score = logic.snapshot().score;
    v.moles.push({ cell: 1, kind: "bomb", upTimer: 1, total: 1.3, whacked: false });
    whackCell(logic, 1);
    expect(logic.snapshot().score).toBe(score);
    expect(v.streak).toBe(0);
  });

  it("冒头超时会自动缩回", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.moles.push({ cell: 5, kind: "normal", upTimer: 0.1, total: 1, whacked: false });
    run(logic, 0.4);
    expect(v.moles.some((m) => m.cell === 5)).toBe(false);
  });

  it("限时结束结算", () => {
    const logic = make();
    run(logic, ROUND_SECONDS + 1);
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().meter).toBe(0);
  });

  it("restart 复位", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.moles.push({ cell: 4, kind: "normal", upTimer: 1, total: 1, whacked: false });
    whackCell(logic, 4);
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.moles).toHaveLength(0);
    expect(v2.hits).toBe(0);
    expect(v2.seconds).toBe(ROUND_SECONDS);
  });
});
