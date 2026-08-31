import { describe, expect, it } from "vitest";
import def, { GView, GRID, DIR_VECTORS } from "./g08-snake-field";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));
const MID = Math.floor(GRID / 2);

describe("g08 贪吃蛇域", () => {
  it("蛇按步频前进，默认向上", () => {
    const logic = make();
    logic.start();
    run(logic, 0.4);
    const v = logic.view as GView;
    expect(v.snake[0]).toEqual({ x: MID, y: MID - 1 });
    expect(DIR_VECTORS.up).toEqual([0, -1]);
  });

  it("按右键后下一步横向移动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    run(logic, 0.5, () => ({ axisX: 1 }));
    expect(v.dir).toBe("right");
    expect(v.snake[0].x).toBeGreaterThan(MID);
  });

  it("不能直接 180° 掉头", () => {
    const logic = make();
    logic.start();
    run(logic, 0.4, () => ({ axisY: -1 }));
    const v = logic.view as GView;
    expect(v.dir).toBe("up");
    run(logic, 0.4, () => ({ axisY: 1 }));
    expect(v.dir).toBe("up");
  });

  it("吃到光点会变长加分并刷新食物", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.food = { x: v.snake[0].x, y: v.snake[0].y - 1 };
    const lenBefore = v.snake.length;
    run(logic, 0.35);
    expect(v.snake.length).toBe(lenBefore + 1);
    expect(logic.snapshot().score).toBe(21);
  });

  it("撞墙结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.snake = [{ x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }];
    v.want = "left";
    v.moving = true;
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
  });

  it("撞到自己身体结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.snake = [
      { x: MID, y: MID },
      { x: MID + 1, y: MID },
      { x: MID + 1, y: MID + 1 },
    ];
    v.want = "right";
    v.moving = true;
    run(logic, 0.5);
    expect(logic.snapshot().status).toBe("over");
  });

  it("restart 复位蛇与食物", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.food = { x: v.snake[0].x, y: v.snake[0].y - 1 };
    run(logic, 0.35);
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.snake).toHaveLength(3);
    expect(v2.snake[0]).toEqual({ x: MID, y: MID });
    expect(logic.snapshot().score).toBe(0);
    expect(v2.alive).toBe(true);
  });
});
