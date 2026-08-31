import { describe, expect, it } from "vitest";
import def, { GView, SOLVED, GRID, slide, isSolved } from "./g31-slide-puzzle";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function press(logic: ReturnType<typeof make>, dir: "up" | "down" | "left" | "right"): void {
  const axis = dir === "left" ? { axisX: -1 } : dir === "right" ? { axisX: 1 } : dir === "up" ? { axisY: 1 } : { axisY: -1 };
  logic.step(DT, input(axis));
  logic.step(DT, input());
}

describe("g31 滑块谜阵", () => {
  it("slide 工具函数从终局出发产生合法移动", () => {
    const tiles = [...SOLVED];
    expect(isSolved(tiles)).toBe(true);
    expect(slide(tiles, "right")).toBe(true);
    expect(isSolved(tiles)).toBe(false);
  });

  it("slide 在边界方向返回 false", () => {
    // Blank at bottom-right: only right/down are legal there.
    expect(slide([...SOLVED], "right")).toBe(true);
    expect(slide([...SOLVED], "down")).toBe(true);
    expect(slide([...SOLVED], "left")).toBe(false);
    expect(slide([...SOLVED], "up")).toBe(false);
  });

  it("打乱后可解且不是终局", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.tiles).toHaveLength(GRID * GRID);
    expect(isSolved(v.tiles)).toBe(false);
    expect(v.moves).toBe(0);
  });

  it("滑动会计步数", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Spam legal moves until at least one registers.
    const dirs = ["up", "down", "left", "right"] as const;
    for (let i = 0; i < 12; i += 1) press(logic, dirs[i % 4]);
    expect(v.moves).toBeGreaterThan(0);
  });

  it("手动复原会判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Force one legal move from the solved state, then undo it.
    v.tiles = [1, 2, 3, 4, 5, 6, 7, 0, 8];
    v.moves = 3;
    // Blank sits between 7 and 8; pressing left slides 8 into the blank.
    press(logic, "left");
    expect(isSolved(v.tiles)).toBe(true);
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("步复原");
    expect(logic.snapshot().score).toBe(500 - v.moves * 8);
  });

  it("restart 重新打乱", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const before = v.tiles.join(",");
    press(logic, "left");
    logic.restart();
    expect((logic.view as GView).moves).toBe(0);
    expect(before.length).toBeGreaterThan(0);
  });
});
