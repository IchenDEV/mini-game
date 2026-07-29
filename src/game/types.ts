export const FISH_SPECIES_IDS = [
  "red-bream",
  "mackerel",
  "sea-bass",
  "golden-fin",
  "blue-spotted",
  "moon-ray",
] as const;

export type FishSpeciesId = (typeof FISH_SPECIES_IDS)[number];

export const BAIT_IDS = ["bread", "shrimp", "glow-worm"] as const;

export type BaitId = (typeof BAIT_IDS)[number];

export const GEAR_IDS = ["rod", "reel", "cooler", "boat"] as const;

export type GearId = (typeof GEAR_IDS)[number];
export type GearLevel = 1 | 2 | 3;

export const LOCATION_IDS = [
  "sunny-cove",
  "coral-reef",
  "moonlit-deep",
] as const;

export type LocationId = (typeof LOCATION_IDS)[number];

export const WEATHER_IDS = ["sunny", "breezy", "rainy", "starry"] as const;

export type WeatherId = (typeof WEATHER_IDS)[number];

export type FishRarity = "common" | "uncommon" | "rare" | "legendary";
export type FishingPhase =
  | "idle"
  | "casting"
  | "waiting"
  | "bite"
  | "reeling"
  | "caught";
export type GameStatus = "playing" | "paused" | "dayEnd";

export interface FishSpeciesConfig {
  id: FishSpeciesId;
  name: string;
  description: string;
  atlasFrame: number;
  rarity: FishRarity;
  minWeight: number;
  maxWeight: number;
  valuePerKg: number;
  reelDifficulty: number;
  habitats: readonly LocationId[];
}

export interface BaitConfig {
  id: BaitId;
  name: string;
  description: string;
  price: number;
  rarityBoost: number;
  weightBoost: number;
}

export interface GearConfig {
  id: GearId;
  name: string;
  description: string;
  upgradeCosts: readonly [number, number];
  benefitLabels: readonly [string, string, string];
}

export interface LocationConfig {
  id: LocationId;
  name: string;
  description: string;
  requiredBoatLevel: GearLevel;
  rarityBoost: number;
}

export interface WeatherConfig {
  id: WeatherId;
  name: string;
  description: string;
  rarityBoost: number;
  weightBoost: number;
}

export interface CaughtFish {
  id: string;
  speciesId: FishSpeciesId;
  weight: number;
  value: number;
  rarity: FishRarity;
  atlasFrame: number;
  isTrophy: boolean;
  caughtDay: number;
  locationId: LocationId;
}

export interface CastState {
  power: number;
  waitTicks: number;
  biteWindowTicks: number;
}

export interface ReelState {
  held: boolean;
  tension: number;
  progress: number;
  tick: number;
  dangerTicks: number;
}

export interface ReelTarget {
  center: number;
  min: number;
  max: number;
  width: number;
}

export interface LevelProgress {
  level: number;
  currentXp: number;
  requiredXp: number;
  ratio: number;
  isMaxLevel: boolean;
}

export interface LocationUnlockState {
  unlocked: boolean;
  selected: boolean;
  requiredBoatLevel: GearLevel;
  currentBoatLevel: GearLevel;
}

export interface SpeciesCountRequirement {
  kind: "speciesCount";
  speciesId: FishSpeciesId;
  count: number;
}

export interface TotalWeightRequirement {
  kind: "totalWeight";
  weight: number;
}

export interface RareCatchRequirement {
  kind: "rareCatch";
  minimumRarity: Exclude<FishRarity, "common">;
  count: number;
}

export type OrderRequirement =
  | SpeciesCountRequirement
  | TotalWeightRequirement
  | RareCatchRequirement;

export interface FishingOrder {
  id: string;
  customerName: string;
  title: string;
  description: string;
  requirement: OrderRequirement;
  rewardCoins: number;
  rewardXp: number;
  rewardReputation: number;
  fulfilled: boolean;
}

export interface OrderProgress {
  current: number;
  target: number;
  ratio: number;
  label: string;
}

export interface FishingDayStats {
  casts: number;
  hooked: number;
  caught: number;
  missed: number;
  escaped: number;
  stored: number;
  fishSold: number;
  totalWeight: number;
  revenue: number;
  ordersFulfilled: number;
  xpEarned: number;
  heaviestCatch: number;
}

export interface LifetimeStats {
  fishCaught: number;
  totalWeight: number;
  revenue: number;
  ordersFulfilled: number;
  daysCompleted: number;
}

export interface DaySummary {
  day: number;
  weatherId: WeatherId;
  locationId: LocationId;
  stats: FishingDayStats;
  endingMoney: number;
  coolerCount: number;
}

export type GearLevels = Record<GearId, GearLevel>;
export type BaitInventory = Record<BaitId, number>;

export interface GameToast {
  id: number;
  kind: "success" | "warning" | "info";
  message: string;
}

export interface GameState {
  version: 2;
  status: GameStatus;
  phase: FishingPhase;
  day: number;
  weatherId: WeatherId;
  dailyCastLimit: number;
  castsRemaining: number;
  money: number;
  xp: number;
  level: number;
  reputation: number;
  gear: GearLevels;
  baitInventory: BaitInventory;
  selectedBaitId: BaitId;
  locationId: LocationId;
  cooler: CaughtFish[];
  discoveredSpecies: FishSpeciesId[];
  bestWeights: Partial<Record<FishSpeciesId, number>>;
  currentCatch: CaughtFish | null;
  cast: CastState | null;
  reel: ReelState;
  orders: FishingOrder[];
  stats: FishingDayStats;
  lifetimeStats: LifetimeStats;
  lastDaySummary: DaySummary | null;
  toast: GameToast | null;
  eventSequence: number;
  soundEnabled: boolean;
  tutorialSeen: boolean;
  qaMode: boolean;
}

export type GameAction =
  | { type: "DISMISS_TUTORIAL" }
  | { type: "SELECT_BAIT"; baitId: BaitId }
  | { type: "CAST_LINE"; power: number }
  | { type: "LINE_LANDED" }
  | { type: "FISH_BITE"; catch: CaughtFish }
  | { type: "HOOK_FISH" }
  | { type: "SET_REELING"; held: boolean }
  | { type: "TICK_REEL" }
  | { type: "MISS_BITE" }
  | { type: "STORE_CATCH" }
  | { type: "SELL_CATCH"; catchId?: string }
  | { type: "FULFILL_ORDER"; orderId: string }
  | { type: "SELL_ALL" }
  | { type: "BUY_GEAR"; gearId: GearId }
  | { type: "SELECT_LOCATION"; locationId: LocationId }
  | { type: "BUY_BAIT"; baitId: BaitId; quantity?: number }
  | { type: "START_NEXT_DAY" }
  | { type: "TOGGLE_SOUND" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "DISMISS_TOAST"; toastId?: number }
  | { type: "RESET_GAME"; qaMode?: boolean };

export type CatchRandomSource =
  | number
  | readonly number[]
  | (() => number);
