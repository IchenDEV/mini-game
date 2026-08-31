import { describe, expect, it } from "vitest";
import def, { GView, COLS, ROWS, COLORS, findGroup, collapse, hasMoves, idx } from "./g45-block-match";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function tap(logic: ReturnType<typeof make>, x: number, y: number): void {
  logic.step(DT, input({ padPressed: [idx(x, y)] }));
}

describe("g45 方块消消", () => {
  it("findGroup 找出相连同色块", () => {
    const cells = new Array(COLS * ROWS).fill(-1);
    cells[idx(0, 0)] = 1;
    cells[idx(1, 0)] = 1;
    cells[idx(0, 1)] = 1;
    cells[idx(2, 0)] = 2;
    const group = findGroup(cells, 0, 0);
    expect(group).toHaveLength(3);
    expect(group).toContain(idx(1, 0));
  });

  it("collapse 消除后受重力下落", () => {
    const cells = new Array(COLS * ROWS).fill(-1);
    cells[idx(0, 0)] = 1;
    cells[idx(0, 1)] = 2;
    cells[idx(0, 2)] = 1;
    cells[idx(0, 3)] = 1;
    // Remove the two 1s at the bottom rows; the 2 and top 1 fall.
    const next = collapse(cells, [idx(0, 2), idx(0, 3)]);
    expect(next[idx(0, ROWS - 1)]).toBe(2);
    expect(next[idx(0, ROWS - 2)]).toBe(1);
    expect(next[idx(0, 0)]).toBe(-1);
  });

  it("hasMoves 检测剩余可消组合", () => {
    const cells = new Array(COLS * ROWS).fill(-1);
    cells[idx(0, ROWS - 1)] = 3;
    cells[idx(1, ROWS - 1)] = 3;
    expect(hasMoves(cells)).toBe(true);
    const lonely = new Array(COLS * ROWS).fill(-1);
    lonely[idx(0, ROWS - 1)] = 3;
    lonely[idx(1, ROWS - 1)] = 2;
    expect(hasMoves(lonely)).toBe(false);
  });

  it("开局棋盘满且必有可消组合", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.cells).toHaveLength(COLS * ROWS);
    expect(v.cells.every((c) => c >= 0)).toBe(true);
    expect(hasMoves(v.cells)).toBe(true);
    expect(COLORS).toBe(4);
  });

  it("点击双色孤立块不消除", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Set up an isolated pair far apart; tap one cell with no neighbors.
    v.cells = new Array(COLS * ROWS).fill(-1);
    v.cells[idx(0, ROWS - 1)] = 1;
    v.cells[idx(2, ROWS - 1)] = 1;
    const before = logic.snapshot().score;
    tap(logic, 0, ROWS - 1);
    expect(logic.snapshot().score).toBe(before);
    expect(v.cells[idx(0, ROWS - 1)]).toBe(1);
  });

  it("消除成组方块会计分并触发重力", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.cells = new Array(COLS * ROWS).fill(-1);
    // Bottom row: four connected 1s; a row of 2s sits above them.
    for (let x = 0; x < 4; x += 1) v.cells[idx(x, ROWS - 1)] = 1;
    for (let x = 0; x < COLS; x += 1) v.cells[idx(x, ROWS - 2)] = 2;
    const before = logic.snapshot().score;
    tap(logic, 1, ROWS - 1);
    expect(logic.snapshot().score).toBe(before + 4 * 4 * 2);
    // The row of 2s above falls into the cleared bottom row.
    expect(v.cells[idx(0, ROWS - 1)]).toBe(2);
    expect(v.cells[idx(0, ROWS - 2)]).toBe(-1);
    expect(v.cleared).toBe(4);
    expect(v.moves).toBe(1);
  });

  it("无可消组合时结算", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Checkerboard: no orthogonal matches.
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        v.cells[idx(x, y)] = (x + y) % 2;
      }
    }
    tap(logic, 0, 0);
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("无可消");
  });

  it("restart 重铺棋盘", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.cells = new Array(COLS * ROWS).fill(-1);
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.cells.every((c) => c >= 0)).toBe(true);
    expect(v2.moves).toBe(0);
    expect(v2.cleared).toBe(0);
  });
});
