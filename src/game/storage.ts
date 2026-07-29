import {
  BAIT_IDS,
  FISH_SPECIES_IDS,
  GEAR_IDS,
  LOCATION_IDS,
  WEATHER_IDS,
  type GameState,
} from "./types";

export const STORAGE_KEY = "haifeng-fishing-save-v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFiniteNumber(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return typeof value[key] === "number" && Number.isFinite(value[key]);
}

function hasBoolean(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "boolean";
}

function hasStringId<T extends string>(
  value: unknown,
  validIds: readonly T[],
): value is T {
  return typeof value === "string" && validIds.some((id) => id === value);
}

function hasNumericRecord<T extends string>(
  value: unknown,
  keys: readonly T[],
): boolean {
  return (
    isRecord(value) &&
    keys.every(
      (key) =>
        typeof value[key] === "number" &&
        Number.isFinite(value[key]) &&
        value[key] >= 0,
    )
  );
}

function hasDayStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "casts",
    "hooked",
    "caught",
    "missed",
    "escaped",
    "stored",
    "fishSold",
    "totalWeight",
    "revenue",
    "ordersFulfilled",
    "xpEarned",
    "heaviestCatch",
  ].every((key) => hasFiniteNumber(value, key));
}

function hasLifetimeStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "fishCaught",
    "totalWeight",
    "revenue",
    "ordersFulfilled",
    "daysCompleted",
  ].every((key) => hasFiniteNumber(value, key));
}

function hasReel(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasBoolean(value, "held") &&
    ["tension", "progress", "tick", "dangerTicks"].every((key) =>
      hasFiniteNumber(value, key),
    )
  );
}

function hasCaughtFish(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    hasStringId(value.speciesId, FISH_SPECIES_IDS) &&
    hasStringId(value.locationId, LOCATION_IDS) &&
    hasFiniteNumber(value, "weight") &&
    hasFiniteNumber(value, "value") &&
    hasFiniteNumber(value, "atlasFrame") &&
    hasFiniteNumber(value, "caughtDay") &&
    hasBoolean(value, "isTrophy") &&
    ["common", "uncommon", "rare", "legendary"].some(
      (rarity) => rarity === value.rarity,
    )
  );
}

function hasDiscoveredSpecies(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((speciesId) => hasStringId(speciesId, FISH_SPECIES_IDS))
  );
}

function hasBestWeights(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([speciesId, weight]) =>
      hasStringId(speciesId, FISH_SPECIES_IDS) &&
      typeof weight === "number" &&
      Number.isFinite(weight) &&
      weight >= 0,
  );
}

function hasOrders(value: unknown): boolean {
  if (!Array.isArray(value)) return false;

  return value.every((order) => {
    if (!isRecord(order) || !isRecord(order.requirement)) return false;
    const requirement = order.requirement;
    return (
      typeof order.id === "string" &&
      typeof order.title === "string" &&
      ["speciesCount", "totalWeight", "rareCatch"].some(
        (kind) => kind === requirement.kind,
      ) &&
      hasFiniteNumber(order, "rewardCoins") &&
      hasFiniteNumber(order, "rewardXp") &&
      hasFiniteNumber(order, "rewardReputation") &&
      hasBoolean(order, "fulfilled")
    );
  });
}

export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  const cooler = value.cooler;
  const currentCatch = value.currentCatch;
  const gear = value.gear;

  return (
    value.version === 2 &&
    ["playing", "paused", "dayEnd"].some(
      (status) => status === value.status,
    ) &&
    ["idle", "casting", "waiting", "bite", "reeling", "caught"].some(
      (phase) => phase === value.phase,
    ) &&
    hasFiniteNumber(value, "day") &&
    hasFiniteNumber(value, "dailyCastLimit") &&
    hasFiniteNumber(value, "castsRemaining") &&
    hasFiniteNumber(value, "money") &&
    hasFiniteNumber(value, "xp") &&
    hasFiniteNumber(value, "level") &&
    hasFiniteNumber(value, "reputation") &&
    hasStringId(value.weatherId, WEATHER_IDS) &&
    hasStringId(value.locationId, LOCATION_IDS) &&
    hasStringId(value.selectedBaitId, BAIT_IDS) &&
    hasNumericRecord(value.baitInventory, BAIT_IDS) &&
    hasNumericRecord(gear, GEAR_IDS) &&
    isRecord(gear) &&
    GEAR_IDS.every(
      (gearId) =>
        gear[gearId] === 1 || gear[gearId] === 2 || gear[gearId] === 3,
    ) &&
    Array.isArray(cooler) &&
    cooler.every(hasCaughtFish) &&
    hasDiscoveredSpecies(value.discoveredSpecies) &&
    hasBestWeights(value.bestWeights) &&
    (currentCatch === null || hasCaughtFish(currentCatch)) &&
    hasReel(value.reel) &&
    hasOrders(value.orders) &&
    hasDayStats(value.stats) &&
    hasLifetimeStats(value.lifetimeStats) &&
    hasFiniteNumber(value, "eventSequence") &&
    hasBoolean(value, "soundEnabled") &&
    hasBoolean(value, "tutorialSeen") &&
    hasBoolean(value, "qaMode")
  );
}

export function loadGameSave(qaMode: boolean): GameState | null {
  if (qaMode || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isGameState(parsed)) return null;

    return {
      ...parsed,
      reel: {
        ...parsed.reel,
        held: false,
      },
      toast: null,
      qaMode: false,
    };
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  if (state.qaMode || typeof window === "undefined") return;

  try {
    const snapshot: GameState = {
      ...state,
      reel: {
        ...state.reel,
        held: false,
      },
      toast: null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Disabled or full storage must never interrupt the game loop.
  }
}

export function clearGameSave(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}
