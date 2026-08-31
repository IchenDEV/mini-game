import { describe, expect, it } from "vitest";
import def, { GView, LEVELS } from "./g38-ice-push";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function slide(logic: ReturnType<typeof make>, dir: "up" | "down" | "left" | "right"): void {
  const overrides =
    dir === "left" ? { axisX: -1 }
    : dir === "right" ? { axisX: 1 }
    : dir === "up" ? { axisY: 1 }
    : { axisY: -1 };
  logic.step(DT, input(overrides));
  logic.step(DT, input());
}

describe("g38 冰面推箱", () => {
  it("玩家在冰面上一滑到底", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    slide(logic, "right");
    // Level 1: from (1,1) the player slides until crate at (4,1) pushes it.
    expect(v.px).toBe(4);
    expect(v.pz).toBe(1);
    // The crate was pushed into the goal at (5,1).
    expect(v.crates.has("5,1")).toBe(true);
    expect(v.goals.has("5,1")).toBe(true);
    expect(v.moves).toBe(1);
  });

  it("箱子被推后滑到障碍前", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.crates = new Set(["3,2"]);
    v.px = 1;
    v.pz = 2;
    slide(logic, "right");
    expect(v.crates.has("5,2")).toBe(true);
    expect(v.px).toBe(4);
  });

  it("顶住墙的箱子推不动，玩家停在前一格", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.crates = new Set(["5,2"]);
    v.px = 1;
    v.pz = 2;
    slide(logic, "right");
    expect(v.crates.has("5,2")).toBe(true);
    expect(v.px).toBe(4);
    expect(v.moves).toBe(1);
  });

  it("两关全部归位判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Level 1: slide right (crate 1), then handle row-3 crate.
    slide(logic, "right");
    expect(v.levelIndex).toBe(0);
    // Player at (4,1). Go down to row 3, then right to push crate 2.
    slide(logic, "down");
    slide(logic, "left");
    slide(logic, "down");
    slide(logic, "right");
    // Level 1 complete -> level 2 loaded.
    expect(v.levelIndex).toBe(1);
    // Level 2: down then right pushes the single crate home.
    slide(logic, "down");
    slide(logic, "right");
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("全部完成");
  });

  it("restart 回到第一关", () => {
    const logic = make();
    logic.start();
    slide(logic, "right");
    logic.restart();
    const v = logic.view as GView;
    expect(v.levelIndex).toBe(0);
    expect(v.moves).toBe(0);
    expect(v.px).toBe(1);
    expect(LEVELS).toHaveLength(2);
  });
});
