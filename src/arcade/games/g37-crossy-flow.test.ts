import { describe, expect, it } from "vitest";
import def, { GView, COLS, rowZ } from "./g37-crossy-flow";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g37 过马路", () => {
  it("车道按奇偶交替生成", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.rows[0].kind).toBe("grass");
    expect(v.rows[2].kind).toBe("road");
    expect(v.rows[4].kind).toBe("road");
    expect(v.rows[6].kind).toBe("road");
    expect(rowZ(2)).toBe(-4.4);
  });

  it("点击前进会前跳一排并计分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Park the hopper in a safe grass column first (row 0 has no cars).
    v.col = 0;
    const before = logic.snapshot().score;
    logic.step(DT, input({ actionPressed: true }));
    expect(v.row).toBe(1);
    expect(logic.snapshot().score).toBe(before + 10);
  });

  it("左右换道按边沿触发", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.col = 3;
    v.row = 1; // grass row: no cars
    logic.step(DT, input({ axisX: 1 }));
    expect(v.col).toBe(4);
    logic.step(DT, input({ axisX: 1 }));
    expect(v.col).toBe(4);
    logic.step(DT, input());
    logic.step(DT, input({ axisX: -1 }));
    expect(v.col).toBe(3);
  });

  it("被车撞到会结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.col = 3;
    v.row = 2; // road row
    v.cars.push({ id: 999, row: 2, x: (v.col - 3) * 1.7, speed: 0 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("车辆持续移动并会环绕", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.cars.push({ id: 998, row: 2, x: 6.3, speed: 3 });
    run(logic, 1);
    const car = v.cars.find((c) => c.id === 998)!;
    expect(car.x).toBeLessThan(0);
  });

  it("restart 复位", () => {
    const logic = make();
    logic.start();
    logic.step(DT, input({ actionPressed: true }));
    logic.restart();
    const v = logic.view as GView;
    expect(v.row).toBe(0);
    expect(v.col).toBe(3);
    expect(logic.snapshot().score).toBe(0);
    expect(COLS).toBe(7);
  });
});
