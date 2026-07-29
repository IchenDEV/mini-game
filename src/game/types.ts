export const PRODUCT_IDS = [
  "apple",
  "milk",
  "bread",
  "juice",
  "cookie",
  "greens",
] as const;

export type ProductId = (typeof PRODUCT_IDS)[number];

export const SPECIES_IDS = [
  "redPanda",
  "shiba",
  "cat",
  "rabbit",
  "capybara",
  "duck",
] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

export type CustomerPhase =
  | "entering"
  | "shopping"
  | "queue"
  | "leaving"
  | "upset";

export type GameStatus = "playing" | "paused" | "dayEnd" | "gameEnd";
export type DrawerMode = "order" | "restock" | "upgrade";
export type UpgradeId = "shelf" | "checkout" | "patience";

export interface ProductConfig {
  id: ProductId;
  name: string;
  unitCost: number;
  sellPrice: number;
  atlasFrame: number;
  shelfLabel: string;
  shelfPoint: { x: number; y: number };
}

export interface SpeciesConfig {
  id: SpeciesId;
  name: string;
  atlasFrame: number;
}

export interface Customer {
  id: string;
  species: SpeciesId;
  wants: ProductId[];
  cart: ProductId[];
  phase: CustomerPhase;
  itemIndex: number;
  phaseTicks: number;
  patience: number;
  missedItems: number;
  joinedQueueAt: number | null;
}

export interface DayStats {
  revenue: number;
  costs: number;
  served: number;
  lost: number;
  itemsSold: number;
}

export type Inventory = Record<ProductId, number>;
export type OrderDraft = Record<ProductId, number>;
export type UpgradeLevels = Record<UpgradeId, number>;

export interface GameToast {
  id: number;
  kind: "success" | "warning" | "info";
  message: string;
}

export interface SalePulse {
  id: number;
  customerId: string;
  amount: number;
}

export interface GameState {
  version: 1;
  status: GameStatus;
  drawer: DrawerMode;
  day: number;
  elapsedSeconds: number;
  dayDurationSeconds: number;
  money: number;
  reputation: number;
  totalProfit: number;
  shelves: Inventory;
  warehouse: Inventory;
  orderDraft: OrderDraft;
  upgrades: UpgradeLevels;
  customers: Customer[];
  nextCustomerAt: number;
  checkoutCooldown: number;
  stats: DayStats;
  lifetimeStats: DayStats;
  lastDayStats: DayStats | null;
  toast: GameToast | null;
  salePulse: SalePulse | null;
  eventSequence: number;
  soundEnabled: boolean;
  tutorialSeen: boolean;
  speed: 1 | 2;
  qaMode: boolean;
}

export type GameAction =
  | { type: "TICK"; random?: number[] }
  | { type: "SET_DRAWER"; drawer: DrawerMode }
  | { type: "SET_ORDER_QUANTITY"; productId: ProductId; quantity: number }
  | { type: "CONFIRM_ORDER" }
  | { type: "RESTOCK_ONE"; productId: ProductId }
  | { type: "RESTOCK_ALL"; productId: ProductId }
  | { type: "CHECKOUT_NEXT" }
  | { type: "BUY_UPGRADE"; upgradeId: UpgradeId }
  | { type: "TOGGLE_PAUSE" }
  | { type: "TOGGLE_SOUND" }
  | { type: "TOGGLE_SPEED" }
  | { type: "DISMISS_TUTORIAL" }
  | { type: "START_NEXT_DAY" }
  | { type: "RESET_GAME"; qaMode?: boolean }
  | { type: "DISMISS_TOAST"; toastId: number };
