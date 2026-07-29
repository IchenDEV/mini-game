import { PRODUCTS, UPGRADE_CONFIG } from "../data/products";
import {
  PRODUCT_IDS,
  SPECIES_IDS,
  type Customer,
  type DayStats,
  type GameAction,
  type GameState,
  type GameToast,
  type Inventory,
  type OrderDraft,
  type ProductId,
  type UpgradeId,
  type UpgradeLevels,
} from "./types";

const DEFAULT_DAY_DURATION_SECONDS = 90;
const QA_DAY_DURATION_SECONDS = 30;
const MAX_ORDER_QUANTITY = 99;
const MAX_ACTIVE_CUSTOMERS = 12;
const ENTERING_TICKS = 1;
const SHOPPING_ITEM_TICKS = 2;
const EXIT_TICKS = 2;

function makeInventory(value: number): Inventory {
  return Object.fromEntries(
    PRODUCT_IDS.map((productId) => [productId, value]),
  ) as Inventory;
}

function makeOrderDraft(): OrderDraft {
  return makeInventory(0);
}

function makeStats(): DayStats {
  return {
    revenue: 0,
    costs: 0,
    served: 0,
    lost: 0,
    itemsSold: 0,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return clamp(Math.floor(value), minimum, maximum);
}

function createToast(
  state: GameState,
  kind: GameToast["kind"],
  message: string,
): GameState {
  const id = state.eventSequence + 1;
  return {
    ...state,
    eventSequence: id,
    toast: { id, kind, message },
  };
}

function createRandomSource(
  suppliedValues: readonly number[] | undefined,
  state: GameState,
): () => number {
  let suppliedIndex = 0;
  let seed =
    (state.eventSequence * 1_103_515_245 +
      state.elapsedSeconds * 12_345 +
      state.day * 2_654_435_761) >>>
    0;

  if (seed === 0) {
    seed = 0x9e3779b9;
  }

  return () => {
    const supplied = suppliedValues?.[suppliedIndex];
    suppliedIndex += 1;

    if (supplied !== undefined && Number.isFinite(supplied)) {
      return clamp(supplied, 0, 0.999_999_999);
    }

    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };
}

function customerPatience(state: GameState): number {
  return Math.min(99, 75 + state.upgrades.patience * 8);
}

function patienceDecay(state: GameState): number {
  return state.qaMode
    ? Math.max(6, 15 - state.upgrades.patience * 3)
    : Math.max(3, 6 - state.upgrades.patience);
}

function checkoutCooldownForLevel(level: number): number {
  return Math.max(1, 4 - level);
}

function nextSpawnDelay(state: GameState, random: () => number): number {
  if (state.qaMode) {
    return 2;
  }

  const baseByDay = [0, 7, 5, 4] as const;
  const jitter = Math.floor(random() * 3) - 1;
  return Math.max(3, baseByDay[state.day] + jitter);
}

function makeCustomer(
  state: GameState,
  random: () => number,
): { customer: Customer; eventSequence: number } {
  const eventSequence = state.eventSequence + 1;
  const species =
    SPECIES_IDS[Math.floor(random() * SPECIES_IDS.length)] ?? SPECIES_IDS[0];
  const maximumItems = state.day === 1 ? 2 : 3;
  const itemCount = 1 + Math.floor(random() * maximumItems);
  const productPool = [...PRODUCT_IDS];
  const wants: ProductId[] = [];

  for (let index = 0; index < itemCount && productPool.length > 0; index += 1) {
    const productIndex = Math.floor(random() * productPool.length);
    const [productId] = productPool.splice(productIndex, 1);
    if (productId) {
      wants.push(productId);
    }
  }

  return {
    customer: {
      id: `day-${state.day}-customer-${eventSequence}`,
      species,
      wants,
      cart: [],
      phase: "entering",
      itemIndex: 0,
      phaseTicks: 0,
      patience: customerPatience(state),
      missedItems: 0,
      joinedQueueAt: null,
    },
    eventSequence,
  };
}

function markCustomerLost(
  customer: Customer,
  state: GameState,
): {
  customer: Customer;
  stats: DayStats;
  lifetimeStats: DayStats;
  reputation: number;
} {
  return {
    customer: {
      ...customer,
      phase: "upset",
      phaseTicks: 0,
      patience: 0,
    },
    stats: { ...state.stats, lost: state.stats.lost + 1 },
    lifetimeStats: {
      ...state.lifetimeStats,
      lost: state.lifetimeStats.lost + 1,
    },
    reputation: clamp(state.reputation - 2, 0, 100),
  };
}

function finalizeDay(state: GameState): GameState {
  const unfinishedCustomers = state.customers.filter(
    (customer) =>
      customer.phase === "entering" ||
      customer.phase === "shopping" ||
      customer.phase === "queue",
  ).length;
  const stats = {
    ...state.stats,
    lost: state.stats.lost + unfinishedCustomers,
  };
  const lifetimeStats = {
    ...state.lifetimeStats,
    lost: state.lifetimeStats.lost + unfinishedCustomers,
  };
  const profit = stats.revenue - stats.costs;
  const eventSequence = state.eventSequence + 1;
  const isFinalDay = state.day >= 3;

  return {
    ...state,
    status: isFinalDay ? "gameEnd" : "dayEnd",
    elapsedSeconds: state.dayDurationSeconds,
    customers: [],
    checkoutCooldown: 0,
    stats,
    lifetimeStats,
    lastDayStats: { ...stats },
    totalProfit: state.totalProfit + profit,
    reputation: clamp(
      state.reputation - Math.min(unfinishedCustomers, 5),
      0,
      100,
    ),
    salePulse: null,
    eventSequence,
    toast: {
      id: eventSequence,
      kind: isFinalDay ? "success" : "info",
      message: isFinalDay
        ? `三天营业结束，本日利润 ${profit} 松果币`
        : `第 ${state.day} 天打烊，本日利润 ${profit} 松果币`,
    },
  };
}

function advanceOneSecond(state: GameState, random: () => number): GameState {
  const elapsedSeconds = Math.min(
    state.dayDurationSeconds,
    state.elapsedSeconds + 1,
  );
  let workingState: GameState = {
    ...state,
    elapsedSeconds,
    checkoutCooldown: Math.max(0, state.checkoutCooldown - 1),
    shelves: { ...state.shelves },
    stats: { ...state.stats },
    lifetimeStats: { ...state.lifetimeStats },
    customers: [],
    salePulse: null,
  };
  const nextCustomers: Customer[] = [];

  for (const originalCustomer of state.customers) {
    if (
      originalCustomer.phase === "leaving" ||
      originalCustomer.phase === "upset"
    ) {
      const phaseTicks = originalCustomer.phaseTicks + 1;
      if (phaseTicks < EXIT_TICKS) {
        nextCustomers.push({ ...originalCustomer, phaseTicks });
      }
      continue;
    }

    if (originalCustomer.phase === "entering") {
      const phaseTicks = originalCustomer.phaseTicks + 1;
      nextCustomers.push(
        phaseTicks >= ENTERING_TICKS
          ? { ...originalCustomer, phase: "shopping", phaseTicks: 0 }
          : { ...originalCustomer, phaseTicks },
      );
      continue;
    }

    if (originalCustomer.phase === "queue") {
      const patience = Math.max(
        0,
        originalCustomer.patience - patienceDecay(workingState),
      );
      if (patience === 0) {
        const lost = markCustomerLost(originalCustomer, workingState);
        workingState = {
          ...workingState,
          stats: lost.stats,
          lifetimeStats: lost.lifetimeStats,
          reputation: lost.reputation,
        };
        nextCustomers.push(lost.customer);
      } else {
        nextCustomers.push({ ...originalCustomer, patience });
      }
      continue;
    }

    const phaseTicks = originalCustomer.phaseTicks + 1;
    if (phaseTicks < SHOPPING_ITEM_TICKS) {
      nextCustomers.push({ ...originalCustomer, phaseTicks });
      continue;
    }

    const wantedProduct = originalCustomer.wants[originalCustomer.itemIndex];
    let cart = originalCustomer.cart;
    let missedItems = originalCustomer.missedItems;

    if (
      wantedProduct !== undefined &&
      workingState.shelves[wantedProduct] > 0
    ) {
      workingState.shelves[wantedProduct] -= 1;
      cart = [...cart, wantedProduct];
    } else {
      missedItems += 1;
    }

    const itemIndex = originalCustomer.itemIndex + 1;
    const finishedShopping = itemIndex >= originalCustomer.wants.length;
    const updatedCustomer: Customer = {
      ...originalCustomer,
      cart,
      missedItems,
      itemIndex,
      phaseTicks: 0,
    };

    if (!finishedShopping) {
      nextCustomers.push(updatedCustomer);
    } else if (cart.length > 0) {
      nextCustomers.push({
        ...updatedCustomer,
        phase: "queue",
        patience: customerPatience(workingState),
        joinedQueueAt: elapsedSeconds,
      });
    } else {
      const lost = markCustomerLost(updatedCustomer, workingState);
      workingState = {
        ...workingState,
        stats: lost.stats,
        lifetimeStats: lost.lifetimeStats,
        reputation: lost.reputation,
      };
      nextCustomers.push(lost.customer);
    }
  }

  workingState = { ...workingState, customers: nextCustomers };

  if (
    elapsedSeconds < state.dayDurationSeconds &&
    elapsedSeconds >= workingState.nextCustomerAt
  ) {
    if (workingState.customers.length < MAX_ACTIVE_CUSTOMERS) {
      const spawned = makeCustomer(workingState, random);
      workingState = {
        ...workingState,
        customers: [...workingState.customers, spawned.customer],
        eventSequence: spawned.eventSequence,
        nextCustomerAt:
          elapsedSeconds + nextSpawnDelay(workingState, random),
      };
    } else {
      workingState = {
        ...workingState,
        nextCustomerAt: elapsedSeconds + 1,
      };
    }
  }

  return elapsedSeconds >= state.dayDurationSeconds
    ? finalizeDay(workingState)
    : workingState;
}

export function createInitialGameState(qaMode = false): GameState {
  const upgrades: UpgradeLevels = {
    shelf: 0,
    checkout: 0,
    patience: 0,
  };

  return {
    version: 1,
    status: "playing",
    drawer: "order",
    day: 1,
    elapsedSeconds: 0,
    dayDurationSeconds: qaMode
      ? QA_DAY_DURATION_SECONDS
      : DEFAULT_DAY_DURATION_SECONDS,
    money: 380,
    reputation: 70,
    totalProfit: 0,
    shelves: makeInventory(4),
    warehouse: makeInventory(2),
    orderDraft: makeOrderDraft(),
    upgrades,
    customers: [],
    nextCustomerAt: qaMode ? 1 : 3,
    checkoutCooldown: 0,
    stats: makeStats(),
    lifetimeStats: makeStats(),
    lastDayStats: null,
    toast: null,
    salePulse: null,
    eventSequence: 0,
    soundEnabled: true,
    tutorialSeen: false,
    speed: 1,
    qaMode,
  };
}

export function getShelfCapacity(
  state: Pick<GameState, "upgrades">,
): number {
  return 8 + state.upgrades.shelf * 3;
}

export function getOrderTotal(orderDraft: OrderDraft): number {
  return PRODUCT_IDS.reduce(
    (total, productId) =>
      total + PRODUCTS[productId].unitCost * orderDraft[productId],
    0,
  );
}

export function getUpgradeCost(
  state: Pick<GameState, "upgrades">,
  upgradeId: UpgradeId,
): number | null {
  const level = state.upgrades[upgradeId];
  return UPGRADE_CONFIG[upgradeId].costs[level] ?? null;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "TICK": {
      if (state.status !== "playing") {
        return state;
      }

      const random = createRandomSource(action.random, state);
      let nextState = state;
      const secondsToAdvance = state.speed;

      for (
        let second = 0;
        second < secondsToAdvance && nextState.status === "playing";
        second += 1
      ) {
        nextState = advanceOneSecond(nextState, random);
      }

      return nextState;
    }

    case "SET_DRAWER":
      return action.drawer === state.drawer
        ? state
        : { ...state, drawer: action.drawer };

    case "SET_ORDER_QUANTITY": {
      const quantity = safeInteger(
        action.quantity,
        0,
        MAX_ORDER_QUANTITY,
      );
      if (state.orderDraft[action.productId] === quantity) {
        return state;
      }

      return {
        ...state,
        orderDraft: { ...state.orderDraft, [action.productId]: quantity },
      };
    }

    case "CONFIRM_ORDER": {
      if (state.status !== "playing" && state.status !== "paused") {
        return createToast(state, "warning", "请在营业期间安排进货");
      }

      const orderTotal = getOrderTotal(state.orderDraft);
      if (orderTotal <= 0) {
        return createToast(state, "info", "先选择要进货的商品");
      }
      if (orderTotal > state.money) {
        return createToast(state, "warning", "松果币不足，无法完成进货");
      }

      const warehouse = { ...state.warehouse };
      for (const productId of PRODUCT_IDS) {
        warehouse[productId] += state.orderDraft[productId];
      }

      return createToast(
        {
          ...state,
          money: state.money - orderTotal,
          warehouse,
          orderDraft: makeOrderDraft(),
          stats: { ...state.stats, costs: state.stats.costs + orderTotal },
          lifetimeStats: {
            ...state.lifetimeStats,
            costs: state.lifetimeStats.costs + orderTotal,
          },
        },
        "success",
        `进货完成，支出 ${orderTotal} 松果币`,
      );
    }

    case "RESTOCK_ONE":
    case "RESTOCK_ALL": {
      if (state.status !== "playing" && state.status !== "paused") {
        return createToast(state, "warning", "请在营业期间补货");
      }

      const productId = action.productId;
      const available = state.warehouse[productId];
      const freeSlots = getShelfCapacity(state) - state.shelves[productId];
      const requested = action.type === "RESTOCK_ONE" ? 1 : available;
      const transfer = Math.max(0, Math.min(available, freeSlots, requested));

      if (available <= 0) {
        return createToast(
          state,
          "warning",
          `${PRODUCTS[productId].name}的仓库库存不足`,
        );
      }
      if (freeSlots <= 0) {
        return createToast(
          state,
          "info",
          `${PRODUCTS[productId].name}货架已经放满`,
        );
      }

      return createToast(
        {
          ...state,
          shelves: {
            ...state.shelves,
            [productId]: state.shelves[productId] + transfer,
          },
          warehouse: {
            ...state.warehouse,
            [productId]: state.warehouse[productId] - transfer,
          },
        },
        "success",
        `${PRODUCTS[productId].name}补货 ${transfer} 件`,
      );
    }

    case "CHECKOUT_NEXT": {
      if (state.status !== "playing") {
        return state;
      }
      if (state.checkoutCooldown > 0) {
        return createToast(
          state,
          "warning",
          `收银台还需 ${state.checkoutCooldown} 秒准备`,
        );
      }

      let customerIndex = -1;
      let earliestQueueTime = Number.POSITIVE_INFINITY;
      state.customers.forEach((customer, index) => {
        const queueTime =
          customer.joinedQueueAt ?? Number.MAX_SAFE_INTEGER;
        if (
          customer.phase === "queue" &&
          queueTime < earliestQueueTime
        ) {
          customerIndex = index;
          earliestQueueTime = queueTime;
        }
      });

      if (customerIndex < 0) {
        return createToast(state, "info", "暂时没有等待结账的顾客");
      }

      const customer = state.customers[customerIndex];
      if (!customer) {
        return state;
      }

      if (customer.cart.length === 0) {
        const lost = markCustomerLost(customer, state);
        const customers = [...state.customers];
        customers[customerIndex] = lost.customer;
        return createToast(
          {
            ...state,
            customers,
            stats: lost.stats,
            lifetimeStats: lost.lifetimeStats,
            reputation: lost.reputation,
          },
          "warning",
          "顾客的购物篮是空的",
        );
      }

      const amount = customer.cart.reduce(
        (total, productId) => total + PRODUCTS[productId].sellPrice,
        0,
      );
      const customers = [...state.customers];
      customers[customerIndex] = {
        ...customer,
        phase: "leaving",
        phaseTicks: 0,
      };
      const eventSequence = state.eventSequence + 1;

      return {
        ...state,
        money: state.money + amount,
        reputation: clamp(
          state.reputation + 1 - customer.missedItems,
          0,
          100,
        ),
        customers,
        checkoutCooldown: checkoutCooldownForLevel(state.upgrades.checkout),
        stats: {
          ...state.stats,
          revenue: state.stats.revenue + amount,
          served: state.stats.served + 1,
          itemsSold: state.stats.itemsSold + customer.cart.length,
        },
        lifetimeStats: {
          ...state.lifetimeStats,
          revenue: state.lifetimeStats.revenue + amount,
          served: state.lifetimeStats.served + 1,
          itemsSold:
            state.lifetimeStats.itemsSold + customer.cart.length,
        },
        eventSequence,
        salePulse: {
          id: eventSequence,
          customerId: customer.id,
          amount,
        },
        toast: {
          id: eventSequence,
          kind: "success",
          message: `结账成功，收入 ${amount} 松果币`,
        },
      };
    }

    case "BUY_UPGRADE": {
      if (state.status === "gameEnd") {
        return createToast(state, "info", "三天挑战已经结束");
      }

      const upgradeId = action.upgradeId;
      const currentLevel = state.upgrades[upgradeId];
      const upgradeCost = getUpgradeCost(state, upgradeId);

      if (
        upgradeCost === null ||
        currentLevel >= UPGRADE_CONFIG[upgradeId].maxLevel
      ) {
        return createToast(
          state,
          "info",
          `${UPGRADE_CONFIG[upgradeId].name}已经升到最高级`,
        );
      }
      if (state.money < upgradeCost) {
        return createToast(state, "warning", "松果币不足，暂时无法升级");
      }

      const upgrades = {
        ...state.upgrades,
        [upgradeId]: currentLevel + 1,
      };
      let customers = state.customers;
      let checkoutCooldown = state.checkoutCooldown;

      if (upgradeId === "patience") {
        customers = state.customers.map((customer) =>
          customer.phase === "queue"
            ? {
                ...customer,
                patience: Math.min(99, customer.patience + 8),
              }
            : customer,
        );
      }
      if (upgradeId === "checkout") {
        checkoutCooldown = Math.min(
          checkoutCooldown,
          checkoutCooldownForLevel(upgrades.checkout),
        );
      }

      return createToast(
        {
          ...state,
          money: state.money - upgradeCost,
          upgrades,
          customers,
          checkoutCooldown,
        },
        "success",
        `${UPGRADE_CONFIG[upgradeId].name}升级成功`,
      );
    }

    case "TOGGLE_PAUSE":
      if (state.status === "playing") {
        return { ...state, status: "paused" };
      }
      if (state.status === "paused") {
        return { ...state, status: "playing" };
      }
      return state;

    case "TOGGLE_SOUND":
      return { ...state, soundEnabled: !state.soundEnabled };

    case "TOGGLE_SPEED":
      return { ...state, speed: state.speed === 1 ? 2 : 1 };

    case "DISMISS_TUTORIAL":
      return state.tutorialSeen ? state : { ...state, tutorialSeen: true };

    case "START_NEXT_DAY": {
      if (state.status !== "dayEnd" || state.day >= 3) {
        return state;
      }

      const eventSequence = state.eventSequence + 1;
      return {
        ...state,
        status: "playing",
        day: state.day + 1,
        elapsedSeconds: 0,
        customers: [],
        nextCustomerAt: state.qaMode ? 1 : 3,
        checkoutCooldown: 0,
        stats: makeStats(),
        salePulse: null,
        eventSequence,
        toast: {
          id: eventSequence,
          kind: "info",
          message: `第 ${state.day + 1} 天开始营业`,
        },
      };
    }

    case "RESET_GAME":
      return createInitialGameState(action.qaMode ?? state.qaMode);

    case "DISMISS_TOAST":
      return state.toast?.id === action.toastId
        ? { ...state, toast: null }
        : state;

    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}
