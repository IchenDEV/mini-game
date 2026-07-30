import { beforeEach, describe, expect, it } from "vitest";
import {
  BAITS,
  FISH_SPECIES,
  FISH_SPECIES_LIST,
  GEAR,
  createInitialGameState,
  gameReducer,
  generateCatch,
  getCoolerCapacity,
  getGearUpgradeCost,
  getLevelProgress,
  getLocationUnlockState,
  getOrderProgress,
  getReelTarget,
} from "./engine";
import {
  STORAGE_KEY,
  clearGameSave,
  loadGameSave,
  saveGame,
} from "./storage";
import type {
  CaughtFish,
  FishSpeciesId,
  FishingOrder,
  GameState,
} from "./types";

function makeFish(
  id: string,
  speciesId: FishSpeciesId = "red-bream",
  overrides: Partial<CaughtFish> = {},
): CaughtFish {
  const config = FISH_SPECIES[speciesId];
  return {
    id,
    speciesId,
    weight: 2,
    value: 60,
    rarity: config.rarity,
    atlasFrame: config.atlasFrame,
    isTrophy: false,
    caughtDay: 1,
    locationId: "sunny-cove",
    ...overrides,
  };
}

function reachBite(
  state: GameState,
  fish = generateCatch(state, [0, 0.5, 0.25]),
): GameState {
  const cast = gameReducer(state, { type: "CAST_LINE", power: 0.72 });
  const waiting = gameReducer(cast, { type: "LINE_LANDED" });
  return gameReducer(waiting, { type: "FISH_BITE", catch: fish });
}

function completeReel(state: GameState): GameState {
  const hooked = gameReducer(state, { type: "HOOK_FISH" });
  const nextTickState: GameState = {
    ...hooked,
    reel: {
      ...hooked.reel,
      tick: hooked.reel.tick + 1,
    },
  };
  const nextTarget = getReelTarget(nextTickState);
  const prepared: GameState = {
    ...hooked,
    reel: {
      ...hooked.reel,
      held: false,
      tension: nextTarget.center + 6,
      progress: 99,
    },
  };
  return gameReducer(prepared, { type: "TICK_REEL" });
}

function orderOfKind(
  state: GameState,
  kind: FishingOrder["requirement"]["kind"],
): FishingOrder {
  const order = state.orders.find(
    (candidate) => candidate.requirement.kind === kind,
  );
  if (!order) throw new Error(`Missing ${kind} order`);
  return order;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("fishing data and deterministic generation", () => {
  it("defines exactly six 3x2 atlas fish and three bait choices", () => {
    expect(FISH_SPECIES_LIST).toHaveLength(6);
    expect(FISH_SPECIES_LIST.map((fish) => fish.atlasFrame)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(Object.keys(BAITS)).toHaveLength(3);
    expect(FISH_SPECIES_LIST.map((fish) => fish.id)).toEqual([
      "red-bream",
      "mackerel",
      "sea-bass",
      "golden-fin",
      "blue-spotted",
      "moon-ray",
    ]);
  });

  it("generates a repeatable catch from supplied rolls and valid habitat data", () => {
    const state = createInitialGameState();
    const first = generateCatch(state, [0.72, 0.4, 0.123456]);
    const second = generateCatch(state, [0.72, 0.4, 0.123456]);

    expect(first).toEqual(second);
    expect(
      FISH_SPECIES[first.speciesId].habitats.some(
        (location) => location === state.locationId,
      ),
    ).toBe(true);
    expect(first.atlasFrame).toBe(FISH_SPECIES[first.speciesId].atlasFrame);
    expect(first.weight).toBeGreaterThan(0);
    expect(first.value).toBeGreaterThan(0);
  });

  it("moves the reeling safe target over time and widens it in QA mode", () => {
    const fish = makeFish("moving-target", "blue-spotted");
    const normal: GameState = {
      ...createInitialGameState(),
      currentCatch: fish,
    };
    const later: GameState = {
      ...normal,
      reel: { ...normal.reel, tick: 7 },
    };
    const qa: GameState = { ...normal, qaMode: true };
    const upgraded: GameState = {
      ...normal,
      gear: { ...normal.gear, reel: 3 },
    };

    expect(getReelTarget(later).center).not.toBe(getReelTarget(normal).center);
    expect(getReelTarget(normal).width).toBeGreaterThanOrEqual(36);
    expect(getReelTarget(upgraded).width).toBeGreaterThan(
      getReelTarget(normal).width,
    );
    expect(getReelTarget(qa).width).toBeGreaterThan(
      getReelTarget(normal).width,
    );
  });
});

describe("core fishing loop", () => {
  it("consumes one cast and bait once, then catches and stores a fish", () => {
    const initial = {
      ...createInitialGameState(true),
      tutorialSeen: true,
      selectedBaitId: "shrimp" as const,
    };
    const bite = reachBite(initial);

    expect(bite.phase).toBe("bite");
    expect(bite.castsRemaining).toBe(initial.castsRemaining - 1);
    expect(bite.baitInventory.shrimp).toBe(
      initial.baitInventory.shrimp - 1,
    );
    expect(gameReducer(bite, { type: "CAST_LINE", power: 1 })).toBe(bite);

    const caught = completeReel(bite);
    expect(caught.phase).toBe("caught");
    expect(caught.stats).toMatchObject({ hooked: 1, caught: 1 });
    expect(caught.xp).toBeGreaterThan(0);
    expect(caught.discoveredSpecies).toContain(
      caught.currentCatch?.speciesId,
    );
    expect(
      caught.currentCatch
        ? caught.bestWeights[caught.currentCatch.speciesId]
        : undefined,
    ).toBe(caught.currentCatch?.weight);

    const stored = gameReducer(caught, { type: "STORE_CATCH" });
    expect(stored.phase).toBe("idle");
    expect(stored.cooler).toHaveLength(1);
    expect(stored.stats.stored).toBe(1);
    expect(caught.cooler).toHaveLength(0);
  });

  it("keeps a caught fish pending when the cooler is full", () => {
    const fish = makeFish("pending");
    const initial = createInitialGameState();
    const fullCooler = Array.from(
      { length: getCoolerCapacity(initial) },
      (_, index) => makeFish(`stored-${index}`),
    );
    const state: GameState = {
      ...initial,
      phase: "caught",
      currentCatch: fish,
      cooler: fullCooler,
    };
    const result = gameReducer(state, { type: "STORE_CATCH" });

    expect(result.phase).toBe("caught");
    expect(result.currentCatch).toEqual(fish);
    expect(result.cooler).toHaveLength(getCoolerCapacity(initial));
    expect(result.toast?.kind).toBe("warning");
  });

  it("can instantly sell the pending catch or sell every stored fish", () => {
    const pending = makeFish("pending", "sea-bass", { value: 90 });
    const stored = makeFish("stored", "mackerel", { value: 40 });
    const initial: GameState = {
      ...createInitialGameState(),
      phase: "caught",
      currentCatch: pending,
      cooler: [stored],
      money: 100,
    };
    const soldPending = gameReducer(initial, { type: "SELL_CATCH" });

    expect(soldPending.money).toBe(190);
    expect(soldPending.stats).toMatchObject({ fishSold: 1, revenue: 90 });
    expect(soldPending.phase).toBe("idle");
    expect(soldPending.cooler).toEqual([stored]);

    const soldAll = gameReducer(soldPending, { type: "SELL_ALL" });
    expect(soldAll.money).toBe(230);
    expect(soldAll.cooler).toHaveLength(0);
    expect(soldAll.stats).toMatchObject({ fishSold: 2, revenue: 130 });
  });

  it("fails a reel after sustained unsafe tension and settles the attempt once", () => {
    const initial = createInitialGameState();
    const bite = reachBite(initial, makeFish("fighter", "moon-ray"));
    const hooked = gameReducer(bite, { type: "HOOK_FISH" });
    const unsafe: GameState = {
      ...hooked,
      reel: {
        ...hooked.reel,
        held: true,
        tension: 98,
      },
    };
    const escaped = gameReducer(unsafe, { type: "TICK_REEL" });
    const repeated = gameReducer(escaped, { type: "TICK_REEL" });

    expect(escaped.phase).toBe("idle");
    expect(escaped.stats.escaped).toBe(1);
    expect(repeated).toBe(escaped);
  });
});

describe("orders and management progression", () => {
  it("fulfills a species-count order atomically and consumes only matching fish", () => {
    const initial = createInitialGameState();
    const order = orderOfKind(initial, "speciesCount");
    if (order.requirement.kind !== "speciesCount") {
      throw new Error("Expected species order");
    }
    const matching = [
      makeFish("red-1", order.requirement.speciesId),
      makeFish("red-2", order.requirement.speciesId),
    ];
    const untouched = makeFish("other", "mackerel");
    const ready: GameState = {
      ...initial,
      cooler: [...matching, untouched],
    };

    expect(getOrderProgress(ready, order)).toMatchObject({
      current: 2,
      target: 2,
      ratio: 1,
    });
    const fulfilled = gameReducer(ready, {
      type: "FULFILL_ORDER",
      orderId: order.id,
    });

    expect(fulfilled.cooler).toEqual([untouched]);
    expect(fulfilled.money).toBe(initial.money + order.rewardCoins);
    expect(fulfilled.reputation).toBe(
      initial.reputation + order.rewardReputation,
    );
    expect(fulfilled.stats.revenue).toBe(order.rewardCoins);
    expect(fulfilled.lifetimeStats.revenue).toBe(order.rewardCoins);
    expect(
      fulfilled.orders.find((candidate) => candidate.id === order.id)
        ?.fulfilled,
    ).toBe(true);

    const repeated = gameReducer(fulfilled, {
      type: "FULFILL_ORDER",
      orderId: order.id,
    });
    expect(repeated.money).toBe(fulfilled.money);
    expect(repeated.cooler).toEqual(fulfilled.cooler);
  });

  it("supports total-weight and rare-catch orders", () => {
    const initial = createInitialGameState();
    const weightOrder = orderOfKind(initial, "totalWeight");
    const weightReady: GameState = {
      ...initial,
      cooler: [
        makeFish("heavy", "sea-bass", { weight: 3 }),
        makeFish("medium", "mackerel", { weight: 2 }),
      ],
    };
    const weightResult = gameReducer(weightReady, {
      type: "FULFILL_ORDER",
      orderId: weightOrder.id,
    });
    expect(weightResult.cooler).toHaveLength(0);
    expect(weightResult.stats.ordersFulfilled).toBe(1);

    const rareOrder = orderOfKind(initial, "rareCatch");
    const common = makeFish("common", "red-bream");
    const uncommon = makeFish("uncommon", "sea-bass");
    const rareReady: GameState = {
      ...initial,
      cooler: [common, uncommon],
    };
    const rareResult = gameReducer(rareReady, {
      type: "FULFILL_ORDER",
      orderId: rareOrder.id,
    });
    expect(rareResult.cooler).toEqual([common]);
    expect(rareResult.stats.ordersFulfilled).toBe(1);
  });

  it("charges gear upgrades, caps them at level three, and applies benefits", () => {
    const initial: GameState = {
      ...createInitialGameState(),
      money: 4_000,
      currentCatch: makeFish("target"),
    };
    const rodCost = getGearUpgradeCost(initial, "rod");
    const firstRod = gameReducer(
      { ...initial, currentCatch: null },
      { type: "BUY_GEAR", gearId: "rod" },
    );
    const maxRod = gameReducer(firstRod, {
      type: "BUY_GEAR",
      gearId: "rod",
    });
    const alreadyMax = gameReducer(maxRod, {
      type: "BUY_GEAR",
      gearId: "rod",
    });

    expect(rodCost).toBe(GEAR.rod.upgradeCosts[0]);
    expect(firstRod.money).toBe(initial.money - (rodCost ?? 0));
    expect(maxRod.gear.rod).toBe(3);
    expect(getGearUpgradeCost(maxRod, "rod")).toBeNull();
    expect(alreadyMax.money).toBe(maxRod.money);

    const coolerTwo: GameState = {
      ...initial,
      gear: { ...initial.gear, cooler: 2 },
    };
    const coolerThree: GameState = {
      ...initial,
      gear: { ...initial.gear, cooler: 3 },
    };
    expect([
      getCoolerCapacity(initial),
      getCoolerCapacity(coolerTwo),
      getCoolerCapacity(coolerThree),
    ]).toEqual([4, 8, 12]);
  });

  it("unlocks the three locations through boat upgrades", () => {
    let state: GameState = {
      ...createInitialGameState(),
      money: 4_000,
    };
    expect(getLocationUnlockState(state, "sunny-cove").unlocked).toBe(true);
    expect(getLocationUnlockState(state, "coral-reef").unlocked).toBe(false);
    expect(getLocationUnlockState(state, "moonlit-deep").unlocked).toBe(
      false,
    );

    const blocked = gameReducer(state, {
      type: "SELECT_LOCATION",
      locationId: "coral-reef",
    });
    expect(blocked.locationId).toBe("sunny-cove");
    expect(blocked.toast?.kind).toBe("warning");

    state = gameReducer(state, { type: "BUY_GEAR", gearId: "boat" });
    state = gameReducer(state, {
      type: "SELECT_LOCATION",
      locationId: "coral-reef",
    });
    expect(state.locationId).toBe("coral-reef");

    state = gameReducer(state, { type: "BUY_GEAR", gearId: "boat" });
    state = gameReducer(state, {
      type: "SELECT_LOCATION",
      locationId: "moonlit-deep",
    });
    expect(state.locationId).toBe("moonlit-deep");
  });

  it("buys bait without allowing negative money", () => {
    const initial: GameState = { ...createInitialGameState(), money: 100 };
    const bought = gameReducer(initial, {
      type: "BUY_BAIT",
      baitId: "shrimp",
      quantity: 2,
    });
    expect(bought.money).toBe(100 - BAITS.shrimp.price * 2);
    expect(bought.baitInventory.shrimp).toBe(
      initial.baitInventory.shrimp + 2,
    );

    const rejected = gameReducer(
      { ...initial, money: 1 },
      { type: "BUY_BAIT", baitId: "glow-worm", quantity: 2 },
    );
    expect(rejected.money).toBe(1);
    expect(rejected.baitInventory).toEqual(initial.baitInventory);
  });
});

describe("day flow, settings, and reset", () => {
  it("keeps the final catch available for same-day orders before closing", () => {
    const base = createInitialGameState(true);
    const speciesOrder = orderOfKind(base, "speciesCount");
    if (speciesOrder.requirement.kind !== "speciesCount") {
      throw new Error("Expected species order");
    }
    const initial: GameState = {
      ...base,
      castsRemaining: 1,
      cooler: [
        makeFish("first-order-fish", speciesOrder.requirement.speciesId),
      ],
    };
    const caught = completeReel(
      reachBite(
        initial,
        makeFish("final-order-fish", speciesOrder.requirement.speciesId),
      ),
    );

    expect(caught.castsRemaining).toBe(0);
    expect(caught.status).toBe("playing");
    expect(caught.phase).toBe("caught");

    const stored = gameReducer(caught, { type: "STORE_CATCH" });
    expect(stored.status).toBe("playing");
    expect(stored.phase).toBe("idle");
    expect(getOrderProgress(stored, speciesOrder).ratio).toBe(1);

    const fulfilled = gameReducer(stored, {
      type: "FULFILL_ORDER",
      orderId: speciesOrder.id,
    });
    expect(fulfilled.orders.find((order) => order.id === speciesOrder.id)?.fulfilled).toBe(
      true,
    );

    const ended = gameReducer(fulfilled, {
      type: "CAST_LINE",
      power: 0,
    });
    expect(ended.status).toBe("dayEnd");
    expect(ended.lastDaySummary).toMatchObject({
      day: 1,
      coolerCount: 0,
    });
    expect(ended.lifetimeStats.daysCompleted).toBe(1);
  });

  it("lets the player close after a final failed cast, then refreshes the next day", () => {
    const initial: GameState = {
      ...createInitialGameState(true),
      castsRemaining: 1,
      cooler: [makeFish("kept")],
      gear: {
        ...createInitialGameState(true).gear,
        boat: 2,
      },
    };
    const waiting = gameReducer(
      gameReducer(initial, { type: "CAST_LINE", power: 0.5 }),
      { type: "LINE_LANDED" },
    );
    const settled = gameReducer(waiting, { type: "MISS_BITE" });

    expect(settled.status).toBe("playing");
    expect(settled.phase).toBe("idle");
    expect(settled.castsRemaining).toBe(0);
    expect(settled.stats.missed).toBe(1);

    const ended = gameReducer(settled, {
      type: "CAST_LINE",
      power: 0,
    });
    expect(ended.status).toBe("dayEnd");
    expect(ended.lastDaySummary?.stats.missed).toBe(1);

    const next = gameReducer(ended, { type: "START_NEXT_DAY" });
    expect(next.status).toBe("playing");
    expect(next.day).toBe(2);
    expect(next.weatherId).toBe("breezy");
    expect(next.castsRemaining).toBe(next.dailyCastLimit);
    expect(next.stats.casts).toBe(0);
    expect(next.stats.missed).toBe(0);
    expect(next.orders).toHaveLength(3);
    expect(next.orders.every((order) => !order.fulfilled)).toBe(true);
    expect(next.cooler).toEqual(ended.cooler);
    expect(next.gear.boat).toBe(2);
    expect(next.baitInventory.bread).toBe(
      ended.baitInventory.bread + 2,
    );
  });

  it("pauses gameplay actions while keeping sound and toast controls available", () => {
    const initial = gameReducer(createInitialGameState(), {
      type: "TOGGLE_PAUSE",
    });
    expect(initial.status).toBe("paused");
    expect(gameReducer(initial, { type: "CAST_LINE", power: 1 })).toBe(initial);

    const muted = gameReducer(initial, { type: "TOGGLE_SOUND" });
    expect(muted.soundEnabled).toBe(false);
    const resumed = gameReducer(muted, { type: "TOGGLE_PAUSE" });
    expect(resumed.status).toBe("playing");
  });

  it("derives level progress and resets to a fresh independent game", () => {
    const progressed: GameState = {
      ...createInitialGameState(),
      xp: 70,
      level: 2,
      money: 999,
      tutorialSeen: true,
    };
    expect(getLevelProgress(progressed)).toMatchObject({
      level: 2,
      currentXp: 20,
      requiredXp: 80,
      ratio: 0.25,
      isMaxLevel: false,
    });

    const reset = gameReducer(progressed, {
      type: "RESET_GAME",
      qaMode: true,
    });
    const another = createInitialGameState(true);
    expect(reset).toEqual(another);
    reset.baitInventory.bread = 0;
    expect(another.baitInventory.bread).toBe(20);
    expect(() => JSON.stringify(reset)).not.toThrow();
  });
});

describe("local save storage", () => {
  it("round-trips a version-two game without transient toast or held input", () => {
    const state: GameState = {
      ...createInitialGameState(),
      tutorialSeen: true,
      reel: {
        ...createInitialGameState().reel,
        held: true,
      },
      toast: {
        id: 7,
        kind: "success",
        message: "transient",
      },
    };

    saveGame(state);
    const loaded = loadGameSave(false);
    expect(loaded).not.toBeNull();
    expect(loaded?.tutorialSeen).toBe(true);
    expect(loaded?.reel.held).toBe(false);
    expect(loaded?.toast).toBeNull();
  });

  it("rejects old or malformed saves, skips QA persistence, and clears saves", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, money: 999_999 }),
    );
    expect(loadGameSave(false)).toBeNull();

    window.localStorage.clear();
    saveGame(createInitialGameState(true));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    saveGame(createInitialGameState());
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearGameSave();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
