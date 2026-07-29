import { PRODUCT_IDS, type GameState } from "./types";

const STORAGE_KEY = "songguo-market-save-v1";

export function loadGameSave(qaMode: boolean): GameState | null {
  if (qaMode || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GameState>;
    const hasInventory = (value: unknown) =>
      typeof value === "object" &&
      value !== null &&
      PRODUCT_IDS.every(
        (productId) =>
          typeof (value as Record<string, unknown>)[productId] === "number",
      );
    const hasStats = (value: unknown) =>
      typeof value === "object" &&
      value !== null &&
      ["revenue", "costs", "served", "lost", "itemsSold"].every(
        (key) => typeof (value as Record<string, unknown>)[key] === "number",
      );

    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.customers) ||
      !hasInventory(parsed.shelves) ||
      !hasInventory(parsed.warehouse) ||
      !hasInventory(parsed.orderDraft) ||
      !hasStats(parsed.stats) ||
      !hasStats(parsed.lifetimeStats) ||
      typeof parsed.money !== "number" ||
      typeof parsed.day !== "number"
    ) {
      return null;
    }

    return parsed as GameState;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  if (state.qaMode || typeof window === "undefined") return;

  try {
    const snapshot: GameState = {
      ...state,
      toast: null,
      salePulse: null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A full/disabled localStorage must never stop the game loop.
  }
}

export function clearGameSave(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
