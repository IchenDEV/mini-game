import { describe, expect, it } from "vitest";
import def, { GView, traceBeam, BOARD_W, BOARD_H, LEVEL_MIRRORS } from "./g44-laser-align";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function pressPad(logic: ReturnType<typeof make>, pad: number): void {
  logic.step(DT, input({ padPressed: [pad] }));
}

describe("g44 激光校准", () => {
  it("光束直行在无镜路径上", () => {
    const result = traceBeam({});
    // Straight from (0,2) heading +x exits the board without hitting the target.
    expect(result.hit).toBe(false);
    expect(result.x).toBe(BOARD_W);
  });

  it("光束击中目标接收器时 hit 为真", () => {
    // '/' at (5,2) bends the beam up, '/' at (5,1) bends it +x into (7,1).
    const r = traceBeam({ "5,2": 0, "5,1": 0 });
    expect(r.hit).toBe(true);
    expect(r.x).toBe(BOARD_W - 1);
    expect(r.z).toBe(1);
  });

  it("开局加载第一关并绘制光路", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(Object.keys(v.mirrors).length).toBe(Object.keys(LEVEL_MIRRORS[0]).length);
    expect(v.beam.length).toBeGreaterThanOrEqual(2);
    expect(v.solved).toBe(false);
  });

  it("旋转棱镜会计步数并更新光路", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    const key = Object.keys(v.mirrors)[0];
    const before = v.mirrors[key];
    pressPad(logic, 0);
    expect(v.moves).toBe(1);
    expect(v.mirrors[key]).toBe(before === 0 ? 1 : 0);
  });

  it("两关依次解出后判胜", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // L1: both prisms start as '\\'; rotate each to '/'.
    pressPad(logic, 0);
    pressPad(logic, 1);
    expect(v.levelIndex).toBe(1);
    expect(v.moves).toBe(0);
    // L2: rotate the "4,1" prism (index 3) to '/'.
    pressPad(logic, 3);
    expect(logic.snapshot().status).toBe("over");
    expect(logic.snapshot().detail).toContain("全部校准");
    expect(LEVEL_MIRRORS).toHaveLength(2);
  });

  it("restart 回到第一关", () => {
    const logic = make();
    logic.start();
    pressPad(logic, 0);
    logic.restart();
    const v = logic.view as GView;
    expect(v.levelIndex).toBe(0);
    expect(v.moves).toBe(0);
    expect(v.solved).toBe(false);
  });
});
