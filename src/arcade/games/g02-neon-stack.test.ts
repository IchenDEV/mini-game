import { describe, expect, it } from "vitest";
import def, { GView } from "./g02-neon-stack";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Steps until the moving slab offset enters the given band on its axis. */
function seekOffset(
  logic: ReturnType<typeof make>,
  min: number,
  max: number,
): number {
  for (let i = 0; i < 3000; i += 1) {
    const v = logic.view as GView;
    if (!v.current) return -1;
    const prev = v.layers[v.layers.length - 1];
    const offset = Math.abs(
      v.axis === "x" ? v.current.x - prev.x : v.current.z - prev.z,
    );
    if (offset >= min && offset <= max) return offset;
    logic.step(DT, input());
  }
  return -1;
}

describe("g02 霓虹叠塔", () => {
  it("常规放下会增加层数并计 10 分", () => {
    const logic = make();
    logic.start();
    const offset = seekOffset(logic, 0.5, 1.0);
    expect(offset).toBeGreaterThan(0);
    logic.step(DT, input({ actionPressed: true }));
    const v = logic.view as GView;
    expect(v.layers).toHaveLength(2);
    expect(logic.snapshot().score).toBe(10);
  });

  it("完全对齐判为完美：额外加分、回补宽度、切换摆动轴", () => {
    const logic = make();
    logic.start();
    expect(seekOffset(logic, 0, 0.02)).toBeGreaterThanOrEqual(0);
    logic.step(DT, input({ actionPressed: true }));
    const v = logic.view as GView;
    expect(v.axis).toBe("z");
    expect(logic.snapshot().score).toBe(35);
    expect(logic.snapshot().callout?.text).toContain("完美");
    expect(v.current?.w).toBeGreaterThanOrEqual(3.2);
  });

  it("完全放空会结束本局", () => {
    const logic = make();
    logic.start();
    // The slab enters from the far end of the swing; an immediate tap misses.
    logic.step(DT, input({ actionPressed: true }));
    expect(logic.snapshot().status).toBe("over");
  });

  it("部分重叠只保留交集宽度", () => {
    const logic = make();
    logic.start();
    const dropped = seekOffset(logic, 1.2, 1.9);
    expect(dropped).toBeGreaterThan(0);
    logic.step(DT, input({ actionPressed: true }));
    const v = logic.view as GView;
    expect(v.layers).toHaveLength(2);
    expect(v.layers[1].w).toBeCloseTo(3.2 - dropped, 5);
  });

  it("塔会沿 x/z 交替摆动", () => {
    const logic = make();
    logic.start();
    expect((logic.view as GView).axis).toBe("x");
    expect(seekOffset(logic, 0.5, 1.2)).toBeGreaterThan(0);
    logic.step(DT, input({ actionPressed: true }));
    expect((logic.view as GView).axis).toBe("z");
  });

  it("restart 重置为一层塔", () => {
    const logic = make();
    logic.start();
    seekOffset(logic, 0.5, 1.2);
    logic.step(DT, input({ actionPressed: true }));
    logic.restart();
    expect(logic.snapshot().status).toBe("playing");
    const v = logic.view as GView;
    expect(v.layers).toHaveLength(1);
    expect(v.axis).toBe("x");
  });
});
