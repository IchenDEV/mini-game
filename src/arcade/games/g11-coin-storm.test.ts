import { describe, expect, it } from "vitest";
import def, { GView } from "./g11-coin-storm";
import { DT, frame, input, makeCtx, run } from "./harness";

const make = () => def.createLogic(makeCtx(`t-${def.id}-${Math.random()}`));

describe("g11 金币雨", () => {
  it("撑满 60 秒判胜，进度条归零", () => {
    const logic = make();
    run(logic, 61, () => {
      // Keep bombs out so the run is a guaranteed survival test.
      const v = logic.view as GView;
      v.items = v.items.filter((item) => item.kind !== "bomb");
      return {};
    });
    const snap = logic.snapshot();
    expect(snap.status).toBe("over");
    expect(snap.detail).toContain("坚持满 60 秒");
    expect(snap.meter).toBe(0);
  });

  it("接到金币进入连击，倍率随连击提升", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let i = 0; i < 8; i += 1) {
      v.items.push({ id: 100 + i, kind: "coin", x: 0, y: 1, vy: 0 });
      logic.step(DT, input());
    }
    const fields = Object.fromEntries(
      logic.snapshot().fields.map((f) => [f.label, f.value]),
    );
    expect(fields["连击"]).toBe("×8");
    expect(fields["倍率"]).toBe("×3");
  });

  it("金币落地会清空连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    for (let i = 0; i < 4; i += 1) {
      v.items.push({ id: 200 + i, kind: "coin", x: 0, y: 1, vy: 0 });
      logic.step(DT, input());
    }
    expect(logic.snapshot().fields[0].value).toBe("×4");
    // A coin that falls past the basket breaks the streak once it despawns.
    v.items.push({ id: 300, kind: "coin", x: 5.4, y: 0, vy: 20 });
    for (let i = 0; i < 20; i += 1) logic.step(DT, input());
    expect(logic.snapshot().fields[0].value).toBe("×0");
  });

  it("接到炸弹立即结束", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 400, kind: "bomb", x: 0, y: 1, vy: 0 });
    logic.step(DT, input());
    expect(logic.snapshot().status).toBe("over");
  });

  it("宝石一次加 50 分", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 500, kind: "gem", x: 0, y: 1, vy: 0 });
    const before = logic.snapshot().score;
    logic.step(DT, input());
    expect(logic.snapshot().score).toBe(before + 50);
  });

  it("拖动指针可以移动竹篮", () => {
    const logic = make();
    logic.start();
    run(logic, 0.5, () => ({ pointerActive: true, pointerX: 0.9 }));
    expect((logic.view as GView).basketX).toBeGreaterThan(3);
  });

  it("restart 重置计时与连击", () => {
    const logic = make();
    logic.start();
    const v = logic.view as GView;
    v.items.push({ id: 600, kind: "coin", x: 0, y: 1, vy: 0 });
    logic.step(DT, input());
    logic.restart();
    expect(logic.snapshot().meter).toBeCloseTo(1, 5);
    expect(logic.snapshot().fields).toHaveLength(0);
    logic.step(DT, input());
    expect(logic.snapshot().fields[0].value).toBe("×0");
    expect((logic.view as GView).items.filter((i) => i.id === 600)).toHaveLength(0);
  });
});
