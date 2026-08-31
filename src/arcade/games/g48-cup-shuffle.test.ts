import { describe, expect, it } from "vitest";
import def, { GView, CUPS, ROUNDS, SWAP_STEP } from "./g48-cup-shuffle";
import { DT, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

function waitForGuess(logic: ReturnType<typeof make>): void {
  const v = logic.view as GView;
  for (let i = 0; i < 1200; i += 1) {
    if (v.phase === "guess") return;
    logic.step(DT, input());
  }
  throw new Error("never reached guess phase");
}

function pick(logic: ReturnType<typeof make>, cup: number): void {
  logic.step(DT, input({ padPressed: [cup] }));
}

describe("g48 三仙归洞", () => {
  it("开场先亮出珠子再交换", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    expect(v.phase).toBe("reveal");
    expect(v.ballCup).toBeGreaterThanOrEqual(0);
    expect(v.ballCup).toBeLessThan(CUPS);
    waitForGuess(logic);
    expect(v.phase).toBe("guess");
  });

  it("交换阶段会把珠子随碗移动", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    // Mirror every swap exactly when the logic applies it.
    let cup = v.ballCup;
    let applied = 0;
    for (let guard = 0; guard < 3000 && applied < v.swaps.length; guard += 1) {
      logic.step(DT, input());
      if (v.swapIndex > applied) {
        const [a, b] = v.swaps[applied];
        if (cup === a) cup = b;
        else if (cup === b) cup = a;
        applied += 1;
      }
    }
    waitForGuess(logic);
    expect(v.ballCup).toBe(cup);
    expect(SWAP_STEP).toBeGreaterThan(0);
  });

  it("押中加分并进入下一轮", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    waitForGuess(logic);
    const scoreBefore = logic.snapshot().score;
    pick(logic, v.ballCup);
    expect(logic.snapshot().score).toBe(scoreBefore + 30 + 1 * 5);
    expect(v.round).toBe(2);
  });

  it("押错判负", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    waitForGuess(logic);
    const wrong = (v.ballCup + 1) % CUPS;
    pick(logic, wrong);
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
  });

  it("六轮全部押中判胜", () => {
    const logic = make();
    logic.start();
    for (let round = 0; round < ROUNDS; round += 1) {
      if (logic.snapshot().status === "over") break;
      waitForGuess(logic);
      pick(logic, (logic.view as GView).ballCup);
    }
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain(`押中 ${ROUNDS} 次`);
  });

  it("restart 重新开始第一轮", () => {
    const logic = make();
    logic.start();
    waitForGuess(logic);
    logic.restart();
    const v = logic.view as GView;
    expect(v.phase).toBe("reveal");
    expect(v.round).toBe(1);
    expect(v.swaps.length).toBe(2 + 1);
  });
});
