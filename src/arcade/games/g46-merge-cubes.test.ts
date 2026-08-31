import { describe, expect, it } from "vitest";
import def, { GView, GRID, WIN_TILE, slideBoard, hasMovesBoard, idx } from "./g46-merge-cubes";

import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function slide(logic: ReturnType<typeof make>, dir: "left" | "right" | "up" | "down"): void {
  const overrides =
    dir === "left" ? { axisX: -1 }
    : dir === "right" ? { axisX: 1 }
    : dir === "up" ? { axisY: 1 }
    : { axisY: -1 };
  logic.step(DT, input(overrides));
  logic.step(DT, input());
}

describe("g46 合并方块", () => {
  it("slideBoard 向左合并一次", () => {
    const board = new Array(16).fill(0);
    board[idx(0, 0)] = 2;
    board[idx(1, 0)] = 2;
    const result = slideBoard(board, "left");
    expect(result.gained).toBe(4);
    expect(result.board[idx(0, 0)]).toBe(4);
    expect(result.moved).toBe(true);
  });

  it("slideBoard 不合并刚合并过的块", () => {
    const board = new Array(16).fill(0);
    board[idx(0, 0)] = 4;
    board[idx(1, 0)] = 2;
    board[idx(2, 0)] = 2;
    const result = slideBoard(board, "left");
    expect(result.board[idx(0, 0)]).toBe(4);
    expect(result.board[idx(1, 0)]).toBe(4);
    expect(result.gained).toBe(4);
  });

  it("hasMovesBoard 判定", () => {
    // Checkerboard of 2s and 4s: full board with no equal neighbours.
    const full = new Array(16).fill(0);
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        full[idx(x, y)] = (x + y) % 2 === 0 ? 2 : 4;
      }
    }
    expect(hasMovesBoard(full)).toBe(false);
    full[idx(0, 1)] = 2;
    expect(hasMovesBoard(full)).toBe(true);
    const withHole = new Array(16).fill(2);
    withHole[0] = 0;
    expect(hasMovesBoard(withHole)).toBe(true);
  });

  it("开局有两枚方块", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.board.filter((n) => n > 0)).toHaveLength(2);
    expect(v.board.every((n) => n === 2 || n === 4 || n === 0)).toBe(true);
  });

  it("合并会计分并补充新块", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.board = new Array(16).fill(0);
    v.board[idx(0, 0)] = 2;
    v.board[idx(1, 0)] = 2;
    slide(logic, "left");
    expect(v.board[idx(0, 0)]).toBe(4);
    expect(v.board.filter((n) => n > 0).length).toBeGreaterThanOrEqual(2);
    expect(v.moves).toBe(1);
    expect(logic.snapshot().score).toBeGreaterThanOrEqual(4);
  });

  it("合成 2048 判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.board = new Array(16).fill(0);
    v.board[idx(0, 0)] = 1024;
    v.board[idx(1, 0)] = 1024;
    slide(logic, "left");
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("2048");
  });

  it("restart 重铺棋盘", () => {
    const logic = make();
    logic.start();
    slide(logic, "left");
    logic.restart();
    const v = logic.view as GView;
    expect(v.moves).toBe(0);
    expect(v.board.filter((n) => n > 0)).toHaveLength(2);
    expect(GRID).toBe(4);
    expect(WIN_TILE).toBe(2048);
  });
});
