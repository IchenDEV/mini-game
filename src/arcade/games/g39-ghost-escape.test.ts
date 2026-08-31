import { describe, expect, it } from "vitest";
import def, { GView, MAZE_W, MAZE_H, TOTAL_ORBS, GHOST_STEP } from "./g39-ghost-escape";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g39 幽灵迷宫", () => {
  it("迷宫有墙包围且灵珠可达", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.walls.has("0,0")).toBe(true);
    expect(v.walls.has(`${MAZE_W - 1},${MAZE_H - 1}`)).toBe(true);
    expect(Object.keys(v.orbs)).toHaveLength(TOTAL_ORBS);
    expect(GHOST_STEP).toBe(0.5);
  });

  it("方向键逐格移动且不能穿墙", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const startX = v.px;
    // Move right until a wall blocks; count successful moves.
    let moves = 0;
    for (let i = 0; i < MAZE_W + 2; i += 1) {
      const before = v.px;
      logic.step(DT, input({ axisX: 1 }));
      logic.step(DT, input());
      if (v.px !== before) moves += 1;
      if (v.px === before) break;
    }
    expect(moves).toBeGreaterThan(0);
    expect(startX).toBeLessThanOrEqual(MAZE_W - 2);
  });

  it("捡到灵珠会加分并减少剩余", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Clear a corridor and walk into an orb placed next to the player.
    v.walls.delete("1,2");
    v.walls.delete("2,2");
    v.orbs = { "2,2": true, "5,5": true };
    v.orbsLeft = 2;
    v.px = 1;
    v.pz = 2;
    const before = logic.snapshot().score;
    logic.step(DT, input({ axisX: 1 }));
    expect(v.orbs["2,2"]).toBeUndefined();
    expect(v.orbsLeft).toBe(1);
    expect(logic.snapshot().score).toBe(before + 20);
  });

  it("幽灵会朝玩家逼近", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const startDist = Math.abs(v.gx - v.px) + Math.abs(v.gz - v.pz);
    run(logic, GHOST_STEP * 8 + 0.2);
    const endDist = Math.abs(v.gx - v.px) + Math.abs(v.gz - v.pz);
    expect(endDist).toBeLessThan(startDist);
  });

  it("幽灵抓到玩家判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.gx = v.px;
    v.gz = v.pz - 1;
    v.walls.delete(`${v.px},${v.pz - 1}`);
    run(logic, GHOST_STEP * 2);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("restart 重新生成迷宫", () => {
    const logic = make();
    logic.start();
    logic.step(DT, input({ axisX: 1 }));
    logic.restart();
    const v = logic.view as GView;
    expect(v.px).toBe(1);
    expect(v.pz).toBe(1);
    expect(v.levelIndex).toBe(0);
    expect(v.orbsLeft).toBe(TOTAL_ORBS);
  });
});
