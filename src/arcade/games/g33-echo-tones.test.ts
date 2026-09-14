import { describe, expect, it } from "vitest";
import def, { GView, PILLARS, WIN_ROUNDS, SHOW_STEP, LIT_TIME } from "./g33-echo-tones";
import { DT, input, makeCtx } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

/** Advances until the show phase has fully played out. */
function waitForInput(logic: ReturnType<typeof make>): void {
  const v = logic.view as GView;
  for (let i = 0; i < 600; i += 1) {
    if (v.phase === "input") return;
    logic.step(DT, input());
  }
  throw new Error("show never finished");
}

describe("g33 回声音阶", () => {
  it("开局播放第一轮序列", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    expect(v.phase).toBe("show");
    expect(v.sequence).toHaveLength(1);
    waitForInput(logic);
    expect(v.phase).toBe("input");
  });

  it("复述正确会进入下一轮并加分", () => {
    const logic = make();
    logic.start();
    waitForInput(logic);
    const v = logic.view as GView;
    const tone = v.sequence[0];
    logic.step(DT, input({ padPressed: [tone] }));
    expect(v.inputIndex).toBe(1);
    expect(v.phase).toBe("show");
    expect(logic.snapshot().score).toBe(25 + 1 * 2);
    expect(v.sequence).toHaveLength(2);
  });

  it("复述错误会结束本局", () => {
    const logic = make();
    logic.start();
    waitForInput(logic);
    const v = logic.view as GView;
    const wrongTone = (v.sequence[0] + 1) % PILLARS;
    logic.step(DT, input({ padPressed: [wrongTone] }));
    expect(logic.snapshot().status).toBe("over");
    expect(v.alive).toBe(false);
    expect(logic.snapshot().detail).toContain("第 1 轮");
  });

  it("序列逐轮增长", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let round = 0; round < 4; round += 1) {
      waitForInput(logic);
      for (const tone of [...v.sequence]) {
        logic.step(DT, input({ padPressed: [tone] }));
      }
      if (v.phase === "show") {
        waitForInput(logic);
      }
    }
    expect(v.sequence).toHaveLength(5);
    expect(SHOW_STEP).toBeGreaterThan(0);
    expect(LIT_TIME).toBeLessThan(SHOW_STEP);
  });

  it("restart 重新开始第一轮", () => {
    const logic = make();
    logic.start();
    waitForInput(logic);
    logic.restart();
    const v = logic.view as GView;
    expect(v.sequence).toHaveLength(1);
    expect(v.round).toBe(1);
    expect(v.phase).toBe("show");
  });

  it("PILLARS 与 WIN_ROUNDS 契约", () => {
    expect(PILLARS).toBe(4);
    expect(WIN_ROUNDS).toBe(8);
  });
});
