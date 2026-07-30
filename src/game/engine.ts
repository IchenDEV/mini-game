import {
  BAITS,
  COOLER_CAPACITY_BY_LEVEL,
  FISH_SPECIES,
  FISH_SPECIES_LIST,
  GEAR,
  LEVEL_XP_THRESHOLDS,
  LOCATIONS,
  NORMAL_DAILY_CASTS,
  QA_DAILY_CASTS,
  RARITY_LABEL,
  RARITY_RANK,
  WEATHER_LIST,
  WEATHERS,
} from "../data/fishing";
import {
  BAIT_IDS,
  type BaitId,
  type BaitInventory,
  type CatchRandomSource,
  type CaughtFish,
  type DaySummary,
  type FishRarity,
  type FishingDayStats,
  type FishingOrder,
  type GameAction,
  type GameState,
  type GameToast,
  type GearId,
  type GearLevel,
  type GearLevels,
  type LevelProgress,
  type LifetimeStats,
  type LocationId,
  type LocationUnlockState,
  type OrderProgress,
  type ReelState,
  type ReelTarget,
  WEATHER_IDS,
} from "./types";

const INITIAL_MONEY = 260;
const MAX_REPUTATION = 100;
const MIN_REPUTATION = 0;
const MAX_LEVEL = LEVEL_XP_THRESHOLDS.length;

const BASE_RARITY_WEIGHT: Record<FishRarity, number> = {
  common: 1,
  uncommon: 0.52,
  rare: 0.2,
  legendary: 0.045,
};

const CATCH_XP: Record<FishRarity, number> = {
  common: 10,
  uncommon: 16,
  rare: 28,
  legendary: 50,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeWholeNumber(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return minimum;
  return clamp(Math.floor(value), minimum, maximum);
}

function createDayStats(): FishingDayStats {
  return {
    casts: 0,
    hooked: 0,
    caught: 0,
    missed: 0,
    escaped: 0,
    stored: 0,
    fishSold: 0,
    totalWeight: 0,
    revenue: 0,
    ordersFulfilled: 0,
    xpEarned: 0,
    heaviestCatch: 0,
  };
}

function createLifetimeStats(): LifetimeStats {
  return {
    fishCaught: 0,
    totalWeight: 0,
    revenue: 0,
    ordersFulfilled: 0,
    daysCompleted: 0,
  };
}

function createGearLevels(): GearLevels {
  return {
    rod: 1,
    reel: 1,
    cooler: 1,
    boat: 1,
  };
}

function createBaitInventory(qaMode: boolean): BaitInventory {
  return {
    bread: qaMode ? 20 : 8,
    shrimp: qaMode ? 20 : 3,
    "glow-worm": qaMode ? 20 : 1,
  };
}

function createReelState(): ReelState {
  return {
    held: false,
    tension: 50,
    progress: 0,
    tick: 0,
    dangerTicks: 0,
  };
}

function getDailyCastLimit(qaMode: boolean): number {
  return qaMode ? QA_DAILY_CASTS : NORMAL_DAILY_CASTS;
}

function getWeatherForDay(day: number): (typeof WEATHER_IDS)[number] {
  return WEATHER_IDS[(Math.max(1, day) - 1) % WEATHER_IDS.length] ?? "sunny";
}

function levelFromXp(xp: number): number {
  let level = 1;
  for (let index = 1; index < LEVEL_XP_THRESHOLDS.length; index += 1) {
    const threshold = LEVEL_XP_THRESHOLDS[index];
    if (threshold === undefined || xp < threshold) break;
    level = index + 1;
  }
  return level;
}

function withToast(
  state: GameState,
  kind: GameToast["kind"],
  message: string,
): GameState {
  const eventSequence = state.eventSequence + 1;
  return {
    ...state,
    eventSequence,
    toast: {
      id: eventSequence,
      kind,
      message,
    },
  };
}

function awardXp(state: GameState, amount: number): GameState {
  const safeAmount = Math.max(0, Math.round(amount));
  const xp = state.xp + safeAmount;
  return {
    ...state,
    xp,
    level: levelFromXp(xp),
    stats: {
      ...state.stats,
      xpEarned: state.stats.xpEarned + safeAmount,
    },
  };
}

function accessibleSpeciesForBoat(boatLevel: GearLevel) {
  return FISH_SPECIES_LIST.filter((fish) =>
    fish.habitats.some(
      (locationId) =>
        LOCATIONS[locationId].requiredBoatLevel <= boatLevel,
    ),
  );
}

export function createDailyOrders(
  day: number,
  boatLevel: GearLevel,
): FishingOrder[] {
  const accessible = accessibleSpeciesForBoat(boatLevel);
  const species =
    accessible[(Math.max(1, day) - 1) % accessible.length] ??
    FISH_SPECIES["red-bream"];
  const speciesCount = day >= 4 ? 3 : 2;
  const weightTarget = roundTo(3.5 + Math.min(day, 8) * 0.6, 1);
  const minimumRarity: "uncommon" | "rare" =
    boatLevel >= 2 ? "rare" : "uncommon";

  return [
    {
      id: `day-${day}-species`,
      customerName: "海鸥食堂",
      title: `${species.name}备货`,
      description: `交付 ${speciesCount} 条${species.name}`,
      requirement: {
        kind: "speciesCount",
        speciesId: species.id,
        count: speciesCount,
      },
      rewardCoins: 68 + day * 8,
      rewardXp: 22 + day * 2,
      rewardReputation: 3,
      fulfilled: false,
    },
    {
      id: `day-${day}-weight`,
      customerName: "灯塔旅店",
      title: "今日鲜鱼拼盘",
      description: `交付总重 ${weightTarget.toFixed(1)} kg 的渔获`,
      requirement: {
        kind: "totalWeight",
        weight: weightTarget,
      },
      rewardCoins: 92 + day * 10,
      rewardXp: 28 + day * 2,
      rewardReputation: 4,
      fulfilled: false,
    },
    {
      id: `day-${day}-rare`,
      customerName: "海风收藏家",
      title: "闪光鳞片",
      description: `交付 1 条${RARITY_LABEL[minimumRarity]}或更稀有的鱼`,
      requirement: {
        kind: "rareCatch",
        minimumRarity,
        count: 1,
      },
      rewardCoins: boatLevel >= 2 ? 170 + day * 12 : 118 + day * 10,
      rewardXp: boatLevel >= 2 ? 48 : 34,
      rewardReputation: 6,
      fulfilled: false,
    },
  ];
}

export function createInitialGameState(qaMode = false): GameState {
  const gear = createGearLevels();
  const dailyCastLimit = getDailyCastLimit(qaMode);

  return {
    version: 2,
    status: "playing",
    phase: "idle",
    day: 1,
    weatherId: "sunny",
    dailyCastLimit,
    castsRemaining: dailyCastLimit,
    money: INITIAL_MONEY,
    xp: 0,
    level: 1,
    reputation: 50,
    gear,
    baitInventory: createBaitInventory(qaMode),
    selectedBaitId: "bread",
    locationId: "sunny-cove",
    cooler: [],
    discoveredSpecies: [],
    bestWeights: {},
    currentCatch: null,
    cast: null,
    reel: createReelState(),
    orders: createDailyOrders(1, gear.boat),
    stats: createDayStats(),
    lifetimeStats: createLifetimeStats(),
    lastDaySummary: null,
    toast: null,
    eventSequence: 0,
    soundEnabled: true,
    tutorialSeen: false,
    qaMode,
  };
}

function normalizeRandom(
  source: CatchRandomSource | undefined,
  state: GameState,
): () => number {
  if (typeof source === "function") {
    return () => clampFiniteRandom(source());
  }

  if (typeof source === "number") {
    const value = clampFiniteRandom(source);
    return () => value;
  }

  let suppliedIndex = 0;
  let seed =
    (Math.imul(state.day, 2_654_435_761) ^
      Math.imul(state.eventSequence + 1, 1_103_515_245) ^
      Math.imul(state.stats.casts + 1, 12_345)) >>>
    0;
  if (seed === 0) seed = 0x9e3779b9;

  return () => {
    const supplied = source?.[suppliedIndex];
    suppliedIndex += 1;
    if (supplied !== undefined) return clampFiniteRandom(supplied);
    if (source === undefined) return Math.random();
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };
}

function clampFiniteRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 0.999_999_999);
}

export function generateCatch(
  state: GameState,
  randomSource?: CatchRandomSource,
): CaughtFish {
  const random = normalizeRandom(randomSource, state);
  const bait = BAITS[state.selectedBaitId];
  const weather = WEATHERS[state.weatherId];
  const location = LOCATIONS[state.locationId];
  const castPower = state.cast?.power ?? 0.5;
  const rarityBoost =
    bait.rarityBoost +
    weather.rarityBoost +
    location.rarityBoost +
    castPower * 0.15;
  const candidates = FISH_SPECIES_LIST.filter((fish) =>
    fish.habitats.some((habitat) => habitat === state.locationId),
  );
  const weightedCandidates = candidates.map((fish) => ({
    fish,
    weight:
      BASE_RARITY_WEIGHT[fish.rarity] *
      (1 + rarityBoost * RARITY_RANK[fish.rarity]),
  }));
  const totalWeight = weightedCandidates.reduce(
    (total, candidate) => total + candidate.weight,
    0,
  );
  let selection = random() * totalWeight;
  let selected = weightedCandidates[0]?.fish ?? FISH_SPECIES["red-bream"];

  for (const candidate of weightedCandidates) {
    selection -= candidate.weight;
    if (selection <= 0) {
      selected = candidate.fish;
      break;
    }
  }

  const sizeRoll = random();
  const weightBoost =
    bait.weightBoost + weather.weightBoost + castPower * 0.08;
  const rawWeight =
    selected.minWeight +
    (selected.maxWeight - selected.minWeight) *
      clamp(sizeRoll + weightBoost, 0, 1);
  const weight = roundTo(rawWeight, 2);
  const isTrophy =
    weight >=
    selected.minWeight + (selected.maxWeight - selected.minWeight) * 0.9;
  const value = Math.max(
    1,
    Math.round(weight * selected.valuePerKg * (isTrophy ? 1.25 : 1)),
  );
  const idRoll = Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, "0");

  return {
    id: `fish-${state.day}-${state.eventSequence + 1}-${idRoll}`,
    speciesId: selected.id,
    weight,
    value,
    rarity: selected.rarity,
    atlasFrame: selected.atlasFrame,
    isTrophy,
    caughtDay: state.day,
    locationId: state.locationId,
  };
}

export function getCoolerCapacity(
  state: Pick<GameState, "gear">,
): number {
  return COOLER_CAPACITY_BY_LEVEL[state.gear.cooler];
}

export function getGearUpgradeCost(
  state: Pick<GameState, "gear">,
  gearId: GearId,
): number | null {
  const level = state.gear[gearId];
  if (level >= 3) return null;
  return GEAR[gearId].upgradeCosts[level - 1] ?? null;
}

export function getOrderProgress(
  state: Pick<GameState, "cooler">,
  order: FishingOrder,
): OrderProgress {
  let current = 0;
  let target = 1;
  let label = "";

  switch (order.requirement.kind) {
    case "speciesCount": {
      const requirement = order.requirement;
      current = state.cooler.filter(
        (fish) => fish.speciesId === requirement.speciesId,
      ).length;
      target = requirement.count;
      label = `${Math.min(current, target)} / ${target} 条`;
      break;
    }
    case "totalWeight": {
      current = roundTo(
        state.cooler.reduce((total, fish) => total + fish.weight, 0),
        2,
      );
      target = order.requirement.weight;
      label = `${Math.min(current, target).toFixed(1)} / ${target.toFixed(1)} kg`;
      break;
    }
    case "rareCatch": {
      const minimumRank = RARITY_RANK[order.requirement.minimumRarity];
      current = state.cooler.filter(
        (fish) => RARITY_RANK[fish.rarity] >= minimumRank,
      ).length;
      target = order.requirement.count;
      label = `${Math.min(current, target)} / ${target} 条`;
      break;
    }
  }

  return {
    current,
    target,
    ratio: target <= 0 ? 1 : clamp(current / target, 0, 1),
    label,
  };
}

export function canFulfillOrder(
  state: Pick<GameState, "cooler">,
  order: FishingOrder,
): boolean {
  return !order.fulfilled && getOrderProgress(state, order).ratio >= 1;
}

function reelTargetFor(
  state: Pick<GameState, "currentCatch" | "reel" | "gear" | "qaMode">,
): ReelTarget {
  const fish = state.currentCatch
    ? FISH_SPECIES[state.currentCatch.speciesId]
    : FISH_SPECIES["red-bream"];
  const difficulty = fish.reelDifficulty;
  const amplitude = 7 + difficulty * 1.7;
  const center = clamp(
    50 +
      Math.sin(state.reel.tick * 0.52 + fish.atlasFrame * 0.73) * amplitude +
      Math.sin(state.reel.tick * 0.19) * 2.5,
    25,
    75,
  );
  const halfWidth =
    18 + (state.gear.reel - 1) * 5 + (state.qaMode ? 12 : 0);
  const min = clamp(center - halfWidth, 0, 100);
  const max = clamp(center + halfWidth, 0, 100);

  return {
    center: roundTo(center, 2),
    min: roundTo(min, 2),
    max: roundTo(max, 2),
    width: roundTo(max - min, 2),
  };
}

export function getReelTarget(
  state: Pick<GameState, "currentCatch" | "reel" | "gear" | "qaMode">,
): ReelTarget {
  return reelTargetFor(state);
}

export function getLevelProgress(
  state: Pick<GameState, "xp" | "level">,
): LevelProgress {
  const level = clamp(state.level, 1, MAX_LEVEL);
  const levelStart = LEVEL_XP_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_XP_THRESHOLDS[level];

  if (nextThreshold === undefined) {
    return {
      level,
      currentXp: Math.max(0, state.xp - levelStart),
      requiredXp: 0,
      ratio: 1,
      isMaxLevel: true,
    };
  }

  const currentXp = clamp(state.xp - levelStart, 0, nextThreshold - levelStart);
  const requiredXp = nextThreshold - levelStart;
  return {
    level,
    currentXp,
    requiredXp,
    ratio: requiredXp === 0 ? 1 : currentXp / requiredXp,
    isMaxLevel: false,
  };
}

export function getLocationUnlockState(
  state: Pick<GameState, "gear" | "locationId">,
  locationId: LocationId,
): LocationUnlockState {
  const requiredBoatLevel = LOCATIONS[locationId].requiredBoatLevel;
  return {
    unlocked: state.gear.boat >= requiredBoatLevel,
    selected: state.locationId === locationId,
    requiredBoatLevel,
    currentBoatLevel: state.gear.boat,
  };
}

function makeDaySummary(state: GameState): DaySummary {
  return {
    day: state.day,
    weatherId: state.weatherId,
    locationId: state.locationId,
    stats: { ...state.stats },
    endingMoney: state.money,
    coolerCount: state.cooler.length,
  };
}

function endDay(state: GameState): GameState {
  const summary = makeDaySummary(state);
  const ended: GameState = {
    ...state,
    status: "dayEnd",
    phase: "idle",
    currentCatch: null,
    cast: null,
    reel: createReelState(),
    lastDaySummary: summary,
    lifetimeStats: {
      ...state.lifetimeStats,
      daysCompleted: state.lifetimeStats.daysCompleted + 1,
    },
  };
  return withToast(
    ended,
    "info",
    `第 ${state.day} 天收竿：捕获 ${state.stats.caught} 条，收入 ${state.stats.revenue} 贝壳币`,
  );
}

function settleAttempt(state: GameState): GameState {
  return {
    ...state,
    phase: "idle",
    currentCatch: null,
    cast: null,
    reel: createReelState(),
  };
}

function recordSoldFish(
  state: GameState,
  fish: readonly CaughtFish[],
): GameState {
  const revenue = fish.reduce((total, item) => total + item.value, 0);
  return {
    ...state,
    money: state.money + revenue,
    stats: {
      ...state.stats,
      fishSold: state.stats.fishSold + fish.length,
      revenue: state.stats.revenue + revenue,
    },
    lifetimeStats: {
      ...state.lifetimeStats,
      revenue: state.lifetimeStats.revenue + revenue,
    },
  };
}

function fishIdsForOrder(
  cooler: readonly CaughtFish[],
  order: FishingOrder,
): Set<string> {
  switch (order.requirement.kind) {
    case "speciesCount": {
      const requirement = order.requirement;
      return new Set(
        cooler
          .filter((fish) => fish.speciesId === requirement.speciesId)
          .slice(0, requirement.count)
          .map((fish) => fish.id),
      );
    }
    case "rareCatch": {
      const minimumRank = RARITY_RANK[order.requirement.minimumRarity];
      return new Set(
        cooler
          .filter((fish) => RARITY_RANK[fish.rarity] >= minimumRank)
          .sort((left, right) => left.value - right.value)
          .slice(0, order.requirement.count)
          .map((fish) => fish.id),
      );
    }
    case "totalWeight": {
      const sorted = [...cooler].sort(
        (left, right) =>
          right.weight - left.weight || left.value - right.value,
      );
      const ids = new Set<string>();
      let total = 0;
      for (const fish of sorted) {
        if (total >= order.requirement.weight) break;
        ids.add(fish.id);
        total += fish.weight;
      }
      return ids;
    }
  }
}

function canManage(state: GameState): boolean {
  return (
    state.status !== "paused" &&
    (state.status === "dayEnd" ||
      (state.status === "playing" && state.phase === "idle"))
  );
}

function handleReelTick(state: GameState): GameState {
  if (state.status !== "playing" || state.phase !== "reeling") return state;
  const fish = state.currentCatch;
  if (!fish) return settleAttempt(state);

  const reelLevel = state.gear.reel;
  const nextTick = state.reel.tick + 1;
  const heldDelta = Math.max(3.8, 5 - (reelLevel - 1) * 0.6);
  const releasedDelta = Math.min(-3.2, -4 + (reelLevel - 1) * 0.4);
  const tension = clamp(
    state.reel.tension + (state.reel.held ? heldDelta : releasedDelta),
    0,
    100,
  );
  const target = reelTargetFor({
    ...state,
    reel: { ...state.reel, tick: nextTick },
  });
  const safe = tension >= target.min && tension <= target.max;
  const progressGain = state.qaMode
    ? 35
    : 13 + state.gear.rod * 3;
  const progress = clamp(
    state.reel.progress + (safe ? progressGain : state.qaMode ? -1 : -2),
    0,
    100,
  );
  const dangerTicks = safe
    ? Math.max(0, state.reel.dangerTicks - 2)
    : state.reel.dangerTicks + 1;
  const reel: ReelState = {
    ...state.reel,
    tension,
    progress,
    tick: nextTick,
    dangerTicks,
  };
  const dangerLimit = state.qaMode ? 12 : 8 + reelLevel * 2;

  if (tension <= 1 || tension >= 99 || dangerTicks >= dangerLimit) {
    const failed = withToast(
      {
        ...state,
        reel,
        stats: {
          ...state.stats,
          escaped: state.stats.escaped + 1,
        },
      },
      "warning",
      `${FISH_SPECIES[fish.speciesId].name}挣脱了，留意张力安全区`,
    );
    return settleAttempt(failed);
  }

  if (progress < 100) {
    return {
      ...state,
      reel,
    };
  }

  const catchXp = CATCH_XP[fish.rarity] + Math.round(fish.weight * 2);
  const caught = awardXp(
    {
      ...state,
      phase: "caught",
      reel,
      discoveredSpecies: state.discoveredSpecies.some(
        (speciesId) => speciesId === fish.speciesId,
      )
        ? state.discoveredSpecies
        : [...state.discoveredSpecies, fish.speciesId],
      bestWeights: {
        ...state.bestWeights,
        [fish.speciesId]: Math.max(
          state.bestWeights[fish.speciesId] ?? 0,
          fish.weight,
        ),
      },
      stats: {
        ...state.stats,
        caught: state.stats.caught + 1,
        totalWeight: roundTo(state.stats.totalWeight + fish.weight, 2),
        heaviestCatch: Math.max(state.stats.heaviestCatch, fish.weight),
      },
      lifetimeStats: {
        ...state.lifetimeStats,
        fishCaught: state.lifetimeStats.fishCaught + 1,
        totalWeight: roundTo(
          state.lifetimeStats.totalWeight + fish.weight,
          2,
        ),
      },
      reputation: clamp(
        state.reputation + (fish.isTrophy ? 1 : 0),
        MIN_REPUTATION,
        MAX_REPUTATION,
      ),
    },
    catchXp,
  );
  return withToast(
    caught,
    "success",
    `钓到 ${FISH_SPECIES[fish.speciesId].name} · ${fish.weight.toFixed(2)} kg`,
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "DISMISS_TUTORIAL":
      return state.tutorialSeen ? state : { ...state, tutorialSeen: true };

    case "SELECT_BAIT":
      if (state.status === "paused" || state.phase !== "idle") return state;
      return { ...state, selectedBaitId: action.baitId };

    case "CAST_LINE": {
      if (state.status !== "playing" || state.phase !== "idle") return state;
      if (state.castsRemaining <= 0) return endDay(state);
      if (state.baitInventory[state.selectedBaitId] <= 0) {
        return withToast(state, "warning", "这种鱼饵用完了，先去补充吧");
      }

      return {
        ...state,
        phase: "casting",
        castsRemaining: state.castsRemaining - 1,
        baitInventory: {
          ...state.baitInventory,
          [state.selectedBaitId]:
            state.baitInventory[state.selectedBaitId] - 1,
        },
        cast: {
          power: clamp(
            Number.isFinite(action.power) ? action.power : 0,
            0,
            1,
          ),
          waitTicks: 0,
          biteWindowTicks: 0,
        },
        currentCatch: null,
        reel: createReelState(),
        stats: {
          ...state.stats,
          casts: state.stats.casts + 1,
        },
        toast: null,
      };
    }

    case "LINE_LANDED":
      if (state.status !== "playing" || state.phase !== "casting") return state;
      return {
        ...state,
        phase: "waiting",
        cast: state.cast ? { ...state.cast, waitTicks: 0 } : null,
      };

    case "FISH_BITE":
      if (state.status !== "playing" || state.phase !== "waiting") return state;
      return {
        ...state,
        phase: "bite",
        currentCatch: action.catch,
        cast: state.cast
          ? {
              ...state.cast,
              biteWindowTicks: state.qaMode ? 8 : 4,
            }
          : null,
      };

    case "HOOK_FISH": {
      if (
        state.status !== "playing" ||
        state.phase !== "bite" ||
        !state.currentCatch
      ) {
        return state;
      }
      const target = reelTargetFor({
        ...state,
        reel: createReelState(),
      });
      return {
        ...state,
        phase: "reeling",
        reel: {
          ...createReelState(),
          tension: target.center,
        },
        stats: {
          ...state.stats,
          hooked: state.stats.hooked + 1,
        },
      };
    }

    case "SET_REELING":
      if (state.status !== "playing" || state.phase !== "reeling") return state;
      return {
        ...state,
        reel: { ...state.reel, held: action.held },
      };

    case "TICK_REEL":
      return handleReelTick(state);

    case "MISS_BITE": {
      if (
        state.status !== "playing" ||
        (state.phase !== "waiting" && state.phase !== "bite")
      ) {
        return state;
      }
      const missed = withToast(
        {
          ...state,
          stats: {
            ...state.stats,
            missed: state.stats.missed + 1,
          },
        },
        "warning",
        state.phase === "bite" ? "下钩慢了一步，鱼儿跑掉了" : "这次没有鱼上钩",
      );
      return settleAttempt(missed);
    }

    case "STORE_CATCH": {
      if (
        state.status !== "playing" ||
        state.phase !== "caught" ||
        !state.currentCatch
      ) {
        return state;
      }
      if (state.cooler.length >= getCoolerCapacity(state)) {
        return withToast(state, "warning", "冷藏箱已满，出售渔获或升级容量吧");
      }
      const fish = state.currentCatch;
      const stored = withToast(
        {
          ...state,
          cooler: [...state.cooler, fish],
          stats: {
            ...state.stats,
            stored: state.stats.stored + 1,
          },
        },
        "success",
        `${FISH_SPECIES[fish.speciesId].name}已放入冷藏箱`,
      );
      return settleAttempt(stored);
    }

    case "SELL_CATCH": {
      const currentCatch =
        state.phase === "caught" &&
        state.currentCatch !== null &&
        (action.catchId === undefined ||
          action.catchId === state.currentCatch.id)
          ? state.currentCatch
          : null;

      if (currentCatch) {
        const sold = withToast(
          recordSoldFish(state, [currentCatch]),
          "success",
          `渔获售出，获得 ${currentCatch.value} 贝壳币`,
        );
        return settleAttempt(sold);
      }

      if (action.catchId === undefined || state.status === "paused") return state;
      const coolerFish = state.cooler.find(
        (fish) => fish.id === action.catchId,
      );
      if (!coolerFish) return state;
      return withToast(
        recordSoldFish(
          {
            ...state,
            cooler: state.cooler.filter((fish) => fish.id !== action.catchId),
          },
          [coolerFish],
        ),
        "success",
        `${FISH_SPECIES[coolerFish.speciesId].name}售出，获得 ${coolerFish.value} 贝壳币`,
      );
    }

    case "FULFILL_ORDER": {
      if (state.status === "paused") return state;
      const order = state.orders.find((item) => item.id === action.orderId);
      if (!order) return state;
      if (!canFulfillOrder(state, order)) {
        return withToast(state, "warning", "冷藏箱里的渔获还不满足这份订单");
      }
      const consumedIds = fishIdsForOrder(state.cooler, order);
      const fulfilled = awardXp(
        {
          ...state,
          cooler: state.cooler.filter((fish) => !consumedIds.has(fish.id)),
          orders: state.orders.map((item) =>
            item.id === order.id ? { ...item, fulfilled: true } : item,
          ),
          money: state.money + order.rewardCoins,
          reputation: clamp(
            state.reputation + order.rewardReputation,
            MIN_REPUTATION,
            MAX_REPUTATION,
          ),
          stats: {
            ...state.stats,
            ordersFulfilled: state.stats.ordersFulfilled + 1,
            revenue: state.stats.revenue + order.rewardCoins,
          },
          lifetimeStats: {
            ...state.lifetimeStats,
            ordersFulfilled: state.lifetimeStats.ordersFulfilled + 1,
            revenue:
              state.lifetimeStats.revenue + order.rewardCoins,
          },
        },
        order.rewardXp,
      );
      return withToast(
        fulfilled,
        "success",
        `完成「${order.title}」，获得 ${order.rewardCoins} 贝壳币`,
      );
    }

    case "SELL_ALL": {
      if (state.status === "paused" || state.cooler.length === 0) return state;
      const revenue = state.cooler.reduce(
        (total, fish) => total + fish.value,
        0,
      );
      return withToast(
        recordSoldFish({ ...state, cooler: [] }, state.cooler),
        "success",
        `冷藏箱清空，获得 ${revenue} 贝壳币`,
      );
    }

    case "BUY_GEAR": {
      if (!canManage(state)) return state;
      const cost = getGearUpgradeCost(state, action.gearId);
      if (cost === null) {
        return withToast(state, "info", `${GEAR[action.gearId].name}已满级`);
      }
      if (state.money < cost) {
        return withToast(state, "warning", "贝壳币不够，先去多钓几条鱼吧");
      }
      const nextLevel = (state.gear[action.gearId] + 1) as GearLevel;
      return withToast(
        {
          ...state,
          money: state.money - cost,
          gear: {
            ...state.gear,
            [action.gearId]: nextLevel,
          },
        },
        "success",
        `${GEAR[action.gearId].name}升级到 Lv.${nextLevel}`,
      );
    }

    case "SELECT_LOCATION": {
      if (!canManage(state)) return state;
      const unlock = getLocationUnlockState(state, action.locationId);
      if (!unlock.unlocked) {
        return withToast(
          state,
          "warning",
          `渔船达到 Lv.${unlock.requiredBoatLevel} 才能前往${LOCATIONS[action.locationId].name}`,
        );
      }
      return {
        ...state,
        locationId: action.locationId,
      };
    }

    case "BUY_BAIT": {
      if (!canManage(state)) return state;
      const quantity = safeWholeNumber(action.quantity ?? 1, 1, 99);
      const cost = BAITS[action.baitId].price * quantity;
      if (state.money < cost) {
        return withToast(state, "warning", "贝壳币不够，无法购买这些鱼饵");
      }
      return withToast(
        {
          ...state,
          money: state.money - cost,
          baitInventory: {
            ...state.baitInventory,
            [action.baitId]:
              state.baitInventory[action.baitId] + quantity,
          },
        },
        "success",
        `购买 ${quantity} 份${BAITS[action.baitId].name}`,
      );
    }

    case "START_NEXT_DAY": {
      if (state.status !== "dayEnd") return state;
      const day = state.day + 1;
      const dailyCastLimit = getDailyCastLimit(state.qaMode);
      return {
        ...state,
        status: "playing",
        phase: "idle",
        day,
        weatherId: getWeatherForDay(day),
        dailyCastLimit,
        castsRemaining: dailyCastLimit,
        baitInventory: {
          ...state.baitInventory,
          bread: state.baitInventory.bread + 2,
        },
        currentCatch: null,
        cast: null,
        reel: createReelState(),
        orders: createDailyOrders(day, state.gear.boat),
        stats: createDayStats(),
        toast: null,
      };
    }

    case "TOGGLE_SOUND":
      return { ...state, soundEnabled: !state.soundEnabled };

    case "TOGGLE_PAUSE":
      if (state.status === "dayEnd") return state;
      return {
        ...state,
        status: state.status === "paused" ? "playing" : "paused",
        reel:
          state.status === "paused"
            ? state.reel
            : { ...state.reel, held: false },
      };

    case "DISMISS_TOAST":
      if (
        !state.toast ||
        (action.toastId !== undefined && action.toastId !== state.toast.id)
      ) {
        return state;
      }
      return { ...state, toast: null };

    case "RESET_GAME":
      return createInitialGameState(action.qaMode ?? state.qaMode);
  }
}

export {
  BAITS,
  COOLER_CAPACITY_BY_LEVEL,
  FISH_SPECIES,
  FISH_SPECIES_LIST,
  GEAR,
  LEVEL_XP_THRESHOLDS,
  LOCATIONS,
  NORMAL_DAILY_CASTS,
  QA_DAILY_CASTS,
  RARITY_LABEL,
  RARITY_RANK,
  WEATHER_LIST,
  WEATHERS,
};

export { BAIT_IDS, WEATHER_IDS };
