import { describe, expect, it } from "vitest";
import { PRODUCTS, UPGRADE_CONFIG } from "../data/products";
import type { Customer, GameState } from "./types";
import {
  createInitialGameState,
  gameReducer,
  getShelfCapacity,
} from "./engine";

function queuedCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-test",
    species: "rabbit",
    wants: ["apple", "bread"],
    cart: ["apple", "bread"],
    phase: "queue",
    itemIndex: 2,
    phaseTicks: 0,
    patience: 10,
    missedItems: 0,
    joinedQueueAt: 3,
    ...overrides,
  };
}

function finishCurrentDay(state: GameState): GameState {
  return gameReducer(
    {
      ...state,
      speed: 1,
      elapsedSeconds: state.dayDurationSeconds - 1,
      nextCustomerAt: Number.POSITIVE_INFINITY,
      customers: [],
    },
    { type: "TICK", random: [] },
  );
}

describe("game engine", () => {
  it("creates independent, serializable initial state for normal and QA play", () => {
    const first = createInitialGameState();
    const second = createInitialGameState(true);

    expect(first.dayDurationSeconds).toBe(90);
    expect(second.dayDurationSeconds).toBe(30);
    expect(first.lifetimeStats).toEqual({
      revenue: 0,
      costs: 0,
      served: 0,
      lost: 0,
      itemsSold: 0,
    });

    first.shelves.apple = 0;
    expect(second.shelves.apple).toBe(4);
    expect(() => JSON.stringify(second)).not.toThrow();
  });

  it("charges confirmed orders, adds warehouse stock, and clears the draft", () => {
    const initial = createInitialGameState();
    const withApple = gameReducer(initial, {
      type: "SET_ORDER_QUANTITY",
      productId: "apple",
      quantity: 2,
    });
    const withOrder = gameReducer(withApple, {
      type: "SET_ORDER_QUANTITY",
      productId: "milk",
      quantity: 1,
    });
    const result = gameReducer(withOrder, { type: "CONFIRM_ORDER" });
    const cost =
      PRODUCTS.apple.unitCost * 2 + PRODUCTS.milk.unitCost;

    expect(result.money).toBe(initial.money - cost);
    expect(result.warehouse.apple).toBe(initial.warehouse.apple + 2);
    expect(result.warehouse.milk).toBe(initial.warehouse.milk + 1);
    expect(result.orderDraft.apple).toBe(0);
    expect(result.orderDraft.milk).toBe(0);
    expect(result.stats.costs).toBe(cost);
    expect(result.lifetimeStats.costs).toBe(cost);
    expect(initial.orderDraft.apple).toBe(0);
  });

  it("rejects an unaffordable order without changing stock or money", () => {
    let state = createInitialGameState();
    state = {
      ...state,
      money: 1,
      orderDraft: { ...state.orderDraft, apple: 2 },
    };
    const result = gameReducer(state, { type: "CONFIRM_ORDER" });

    expect(result.money).toBe(1);
    expect(result.warehouse).toEqual(state.warehouse);
    expect(result.orderDraft.apple).toBe(2);
    expect(result.toast?.kind).toBe("warning");
  });

  it("moves one item or as many items as fit from warehouse to a shelf", () => {
    const initial = {
      ...createInitialGameState(),
      shelves: { ...createInitialGameState().shelves, apple: 7 },
      warehouse: { ...createInitialGameState().warehouse, apple: 10 },
    };
    const one = gameReducer(initial, {
      type: "RESTOCK_ONE",
      productId: "apple",
    });
    const full = gameReducer(
      {
        ...one,
        shelves: { ...one.shelves, apple: 6 },
      },
      { type: "RESTOCK_ALL", productId: "apple" },
    );

    expect(one.shelves.apple).toBe(8);
    expect(one.warehouse.apple).toBe(9);
    expect(full.shelves.apple).toBe(getShelfCapacity(full));
    expect(full.warehouse.apple).toBe(7);
  });

  it("spawns customers and advances two logical seconds at double speed", () => {
    const state: GameState = {
      ...createInitialGameState(true),
      tutorialSeen: true,
      speed: 2,
    };
    const result = gameReducer(state, {
      type: "TICK",
      random: [0, 0, 0, 0],
    });

    expect(result.elapsedSeconds).toBe(2);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]?.phase).toBe("shopping");
  });

  it("removes shelf stock as a customer shops item by item", () => {
    const shopper = queuedCustomer({
      phase: "shopping",
      wants: ["apple"],
      cart: [],
      itemIndex: 0,
      phaseTicks: 1,
      joinedQueueAt: null,
    });
    const initial: GameState = {
      ...createInitialGameState(),
      customers: [shopper],
      nextCustomerAt: Number.POSITIVE_INFINITY,
    };
    const result = gameReducer(initial, { type: "TICK", random: [] });

    expect(result.shelves.apple).toBe(initial.shelves.apple - 1);
    expect(result.customers[0]).toMatchObject({
      phase: "queue",
      cart: ["apple"],
      itemIndex: 1,
    });
    expect(initial.shelves.apple).toBe(4);
  });

  it("collects checkout revenue, updates statistics, and starts cooldown", () => {
    const customer = queuedCustomer();
    const initial: GameState = {
      ...createInitialGameState(),
      customers: [customer],
      money: 100,
    };
    const result = gameReducer(initial, { type: "CHECKOUT_NEXT" });
    const sale = PRODUCTS.apple.sellPrice + PRODUCTS.bread.sellPrice;

    expect(result.money).toBe(100 + sale);
    expect(result.stats).toMatchObject({
      revenue: sale,
      served: 1,
      itemsSold: 2,
    });
    expect(result.lifetimeStats).toMatchObject({
      revenue: sale,
      served: 1,
      itemsSold: 2,
    });
    expect(result.customers[0]?.phase).toBe("leaving");
    expect(result.checkoutCooldown).toBe(4);
    expect(result.salePulse).toMatchObject({
      customerId: customer.id,
      amount: sale,
    });
  });

  it("ends each day, carries lifetime totals, and enters the terminal state after day three", () => {
    let state: GameState = {
      ...createInitialGameState(true),
      stats: {
        revenue: 100,
        costs: 25,
        served: 4,
        lost: 1,
        itemsSold: 7,
      },
      lifetimeStats: {
        revenue: 100,
        costs: 25,
        served: 4,
        lost: 1,
        itemsSold: 7,
      },
    };

    state = finishCurrentDay(state);
    expect(state.status).toBe("dayEnd");
    expect(state.lastDayStats?.revenue).toBe(100);
    expect(state.totalProfit).toBe(75);

    state = gameReducer(state, { type: "START_NEXT_DAY" });
    expect(state.day).toBe(2);
    expect(state.stats).toEqual({
      revenue: 0,
      costs: 0,
      served: 0,
      lost: 0,
      itemsSold: 0,
    });
    expect(state.lifetimeStats.revenue).toBe(100);

    state = finishCurrentDay(state);
    state = gameReducer(state, { type: "START_NEXT_DAY" });
    expect(state.day).toBe(3);
    state = finishCurrentDay(state);

    expect(state.status).toBe("gameEnd");
    expect(state.day).toBe(3);
    expect(state.totalProfit).toBe(75);
    expect(gameReducer(state, { type: "START_NEXT_DAY" })).toBe(state);
  });

  it.each([
    ["shelf", 120],
    ["checkout", 150],
    ["patience", 110],
  ] as const)("buys the %s upgrade and applies its gameplay effect", (upgradeId, cost) => {
    const waiting = queuedCustomer({ patience: 3 });
    const initial: GameState = {
      ...createInitialGameState(),
      money: 1_000,
      customers: [waiting],
      checkoutCooldown: 4,
    };
    const result = gameReducer(initial, {
      type: "BUY_UPGRADE",
      upgradeId,
    });

    expect(result.upgrades[upgradeId]).toBe(1);
    expect(result.money).toBe(1_000 - cost);
    expect(cost).toBe(UPGRADE_CONFIG[upgradeId].costs[0]);

    if (upgradeId === "shelf") {
      expect(getShelfCapacity(result)).toBe(11);
    } else if (upgradeId === "checkout") {
      expect(result.checkoutCooldown).toBe(3);
    } else {
      expect(result.customers[0]?.patience).toBe(11);
    }
  });

  it("turns an impatient queued customer away and counts the loss once", () => {
    const initial: GameState = {
      ...createInitialGameState(),
      customers: [queuedCustomer({ patience: 1 })],
      nextCustomerAt: Number.POSITIVE_INFINITY,
    };
    const upset = gameReducer(initial, { type: "TICK", random: [] });
    const departed = gameReducer(upset, { type: "TICK", random: [] });

    expect(upset.customers[0]?.phase).toBe("upset");
    expect(upset.stats.lost).toBe(1);
    expect(upset.lifetimeStats.lost).toBe(1);
    expect(departed.stats.lost).toBe(1);
  });

  it("resets to a fresh state while honoring the requested QA mode", () => {
    const dirty: GameState = {
      ...createInitialGameState(),
      day: 3,
      money: 9_999,
      tutorialSeen: true,
    };
    const reset = gameReducer(dirty, {
      type: "RESET_GAME",
      qaMode: true,
    });

    expect(reset).toEqual(createInitialGameState(true));
    expect(reset.tutorialSeen).toBe(false);
  });
});
