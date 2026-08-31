import { describe, expect, it } from "vitest";
import def, { GView, CITY_HP } from "./g16-meteor-watch";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g16 流星守望", () => {
  it("点击天空会发射拦截弹并命中目标点", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    frame(logic, { pointerActive: true, pointerX: 0.4, pointerY: 0.7, actionPressed: true });
    expect(v.rockets).toHaveLength(1);
    expect(v.rockets[0].tx).toBeCloseTo(2.8, 5);
  });

  it("拦截弹爆炸会击毁半径内陨石", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.meteors.push({ id: 801, x: 3, y: 5, tx: 3, vy: 1.7 });
    frame(logic, { pointerActive: true, pointerX: 3 / 7, pointerY: (5 - 1.5) / 5, actionPressed: true });
    const before = logic.snapshot().score;
    run(logic, 0.5, () => ({ pointerActive: true, pointerX: 3 / 7, pointerY: (5 - 1.5) / 5 }));
    expect(logic.snapshot().score).toBe(before + 15);
    expect(v.meteors.some((m) => m.id === 801)).toBe(false);
  });

  it("陨石落地会削减城市耐久", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.meteors.push({ id: 802, x: 5, y: 0.65, tx: 5, vy: 1 });
    run(logic, 0.6);
    expect(v.hp).toBe(CITY_HP - 1);
    expect(logic.snapshot().status).toBe("playing");
  });

  it("城市耐久归零结束本局", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.hp = 1;
    v.meteors.push({ id: 803, x: 5, y: 0.65, tx: 5, vy: 1 });
    run(logic, 0.6);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("restart 复位城市与天空", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    frame(logic, { actionPressed: true });
    logic.restart();
    const v2 = logic.view as GView;
    expect(v2.hp).toBe(CITY_HP);
    expect(v2.rockets).toHaveLength(0);
    expect(v2.meteors).toHaveLength(0);
  });
});
