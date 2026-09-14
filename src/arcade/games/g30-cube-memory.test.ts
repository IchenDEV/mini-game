import { describe, expect, it } from "vitest";
import def, { GView, GRID, PAIRS, cardCenter, FLIP_BACK_DELAY } from "./g30-cube-memory";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function pick(logic: ReturnType<typeof make>, i: number): void {
  logic.step(DT, input({ padPressed: [i] }));
}

describe("g30 立方记忆", () => {
  it("16 张方块共 8 对，初始全部盖着", () => {
    const logic = make();
    const v = logic.view as GView;
    expect(v.cards).toHaveLength(GRID * GRID);
    expect(PAIRS).toBe(8);
    const counts = new Map<number, number>();
    for (const card of v.cards) counts.set(card.pair, (counts.get(card.pair) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
    expect(v.cards.every((c) => !c.flipped && !c.matched)).toBe(true);
  });

  it("翻两张同色即配对成功", () => {
    const logic = make();
    const v = logic.view as GView;
    const byPair = new Map<number, number[]>();
    v.cards.forEach((c, i) => {
      byPair.set(c.pair, [...(byPair.get(c.pair) ?? []), i]);
    });
    const [i, j] = byPair.get(v.cards[0].pair)!;
    pick(logic, i);
    pick(logic, j);
    expect(v.cards[i].matched).toBe(true);
    expect(v.cards[j].matched).toBe(true);
    expect(logic.snapshot().score).toBe(40);
    expect(v.moves).toBe(1);
  });

  it("翻错会在延迟后盖回去", () => {
    const logic = make();
    const v = logic.view as GView;
    const byPair = new Map<number, number[]>();
    v.cards.forEach((c, i) => byPair.set(c.pair, [...(byPair.get(c.pair) ?? []), i]));
    const entries = [...byPair.values()];
    pick(logic, entries[0][0]);
    pick(logic, entries[1][0]);
    expect(v.mismatchTimer).toBeGreaterThan(0);
    expect(v.cards[entries[0][0]].flipped).toBe(true);
    for (let i = 0; i < Math.round(FLIP_BACK_DELAY * 60) + 4; i += 1) logic.step(DT, input());
    expect(v.cards[entries[0][0]].flipped).toBe(false);
    expect(v.cards[entries[1][0]].flipped).toBe(false);
    expect(v.firstPick).toBe(null);
  });

  it("配对全部完成判胜", () => {
    const logic = make();
    const v = logic.view as GView;
    const byPair = new Map<number, number[]>();
    v.cards.forEach((c, i) => byPair.set(c.pair, [...(byPair.get(c.pair) ?? []), i]));
    for (const [a, b] of byPair.values()) {
      if (logic.snapshot().status === "over") break;
      pick(logic, a);
      pick(logic, b);
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`${PAIRS}`);
    expect(snap.score).toBeGreaterThan(0);
  });

  it("同一张牌连点无效", () => {
    const logic = make();
    const v = logic.view as GView;
    pick(logic, 3);
    pick(logic, 3);
    expect(v.moves).toBe(0);
    expect(v.cards[3].flipped).toBe(true);
    expect(cardCenter(3)).toHaveLength(2);
  });

  it("restart 重洗牌", () => {
    const logic = make();
    pick(logic, 0);
    logic.restart();
    const v = logic.view as GView;
    expect(v.cards.every((c) => !c.flipped && !c.matched)).toBe(true);
    expect(v.matchedPairs).toBe(0);
    expect(logic.snapshot().score).toBe(0);
  });
});
