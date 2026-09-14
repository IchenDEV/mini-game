import { describe, expect, it } from "vitest";
import def, { GView, SIZE, MINES, mineCount, neighbors } from "./g47-mine-sweep";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Probes a cell through the pointer mapping used by the logic. */
function probe(logic: ReturnType<typeof make>, x: number, z: number): void {
  logic.step(DT, input({
    pointerActive: true,
    actionPressed: true,
    pointerX: (x - (SIZE - 1) / 2) / (SIZE / 2),
    pointerY: (z - (SIZE - 1) / 2) / (SIZE / 2),
  }));
  logic.step(DT, input());
}

function sweepAll(logic: ReturnType<typeof make>): void {
  const v = logic.view as GView;
  probe(logic, 0, 5);
  const safe: [number, number][] = [];
  for (let x = 0; x < SIZE; x += 1) {
    for (let z = 0; z < SIZE; z += 1) {
      if (!v.mines.has(`${x},${z}`)) safe.push([x, z]);
    }
  }
  for (const [x, z] of safe) {
    if (logic.snapshot().status === "over") break;
    probe(logic, x, z);
  }
}

describe("g47 扫雷星域", () => {
  it("neighbors 返回八邻域", () => {
    expect(neighbors(0, 0)).toHaveLength(3);
    expect(neighbors(1, 1)).toHaveLength(8);
  });

  it("mineCount 统计周围雷数", () => {
    const mines = new Set(["0,0", "1,0"]);
    expect(mineCount(mines, 1, 1)).toBe(2);
    expect(mineCount(mines, 5, 5)).toBe(0);
  });

  it("首次探测安全且雷不会出现在落点周围", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    probe(logic, 0, 5);
    expect(v.firstDone).toBe(true);
    expect(v.mines.size).toBe(MINES);
    for (const [nx, nz] of [[0, 4], [1, 4], [0, 5], [1, 5]] as [number, number][]) {
      expect(v.mines.has(`${nx},${nz}`)).toBe(false);
    }
  });

  it("数字 0 会泛洪展开", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    probe(logic, 0, 5);
    expect(v.revealed.size).toBeGreaterThanOrEqual(3);
  });

  it("踩雷判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    probe(logic, 0, 5);
    const mine = [...v.mines][0];
    const [mx, mz] = mine.split(",").map(Number);
    probe(logic, mx, mz);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("两片星域排净后判胜", () => {
    const logic = make();
    logic.start();
    sweepAll(logic);
    if (logic.snapshot().status === "playing") sweepAll(logic);
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain("排净");
  });

  it("restart 重置星域", () => {
    const logic = make();
    logic.start();
    probe(logic, 0, 5);
    logic.restart();
    const v = logic.view as GView;
    expect(v.revealed.size).toBe(0);
    expect(v.firstDone).toBe(false);
    expect(v.level).toBe(1);
    expect(SIZE * SIZE - MINES).toBeGreaterThan(0);
  });
});
