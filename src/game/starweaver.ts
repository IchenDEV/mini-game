/** A small, renderer-agnostic vector contract shared with the game scene. */
export interface Vector2Like {
  readonly x: number;
  readonly y: number;
}

export interface StarAnchor extends Vector2Like {
  readonly id: string;
}

export type RandomSource = () => number;

/** The subset of Web Storage needed to persist a high score. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STARWEAVER_DURATION_MS = 75_000;
export const ECLIPSE_HIT_PENALTY_MS = 4_000;
export const BEST_SCORE_KEY = "starweaver-best-v1";

const BASE_STITCH_SCORE = 100;
const COMBO_MULTIPLIER_STEP = 0.25;
const MAX_REWARD_CHAIN = 20;
const NEAR_MISS_SCORE = 35;
const BASE_TIME_BONUS_MS = 1_000;
const COMBO_TIME_BONUS_MS = 150;
const MAX_TIME_BONUS_COMBO = 10;

export function distanceSquared(a: Vector2Like, b: Vector2Like): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vector2Like, b: Vector2Like): number {
  return Math.sqrt(distanceSquared(a, b));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Formats remaining countdown time. Partial seconds round up so that a live
 * game never displays 00:00 before its timer actually expires.
 */
export function formatTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "00:00";

  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0;
  }

  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A deterministic Mulberry32 stream whose values are always in [0, 1). */
export function createSeededRandom(seed: number | string): RandomSource {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function safeRandomValue(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1 - Number.EPSILON);
}

/**
 * Selects a target with roulette-wheel sampling weighted by squared distance
 * from the player. This keeps every alternative reachable while strongly
 * favouring the more daring, distant route.
 */
export function chooseNextTarget<T extends StarAnchor>(
  anchors: readonly T[],
  currentId: string | null,
  playerPosition: Vector2Like,
  random: RandomSource,
): T | null {
  const candidates = anchors.filter((anchor) => anchor.id !== currentId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map((anchor) => {
    const squared = distanceSquared(playerPosition, anchor);
    return Number.isFinite(squared) && squared >= 0 ? Math.max(1, squared) : 1;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = safeRandomValue(random) * totalWeight;

  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return candidates[index];
  }

  return candidates[candidates.length - 1];
}

function normalizeChain(value: number, maximum = MAX_REWARD_CHAIN): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(maximum, Math.floor(value));
}

/** Score for one successful stitch, including combo and near-miss sparks. */
export function scoreForStitch(combo: number, nearMissChain: number): number {
  const safeCombo = normalizeChain(combo);
  const safeNearMissChain = normalizeChain(nearMissChain);
  const multiplier = 1 + safeCombo * COMBO_MULTIPLIER_STEP;
  return Math.round(
    (BASE_STITCH_SCORE + safeNearMissChain * NEAR_MISS_SCORE) * multiplier,
  );
}

/** Milliseconds restored after a stitch, with a deliberately bounded combo bonus. */
export function timeBonusForStitch(combo: number): number {
  const safeCombo = normalizeChain(combo, MAX_TIME_BONUS_COMBO);
  return BASE_TIME_BONUS_MS + safeCombo * COMBO_TIME_BONUS_MS;
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function parseStoredScore(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  return normalizeScore(Number(value));
}

/**
 * Returns the best score and attempts to persist it. Reads and writes are both
 * guarded so private browsing, denied storage, SSR, and test fakes stay safe.
 */
export function updateBestScore(
  score: number,
  storage?: KeyValueStorage | null,
  key = BEST_SCORE_KEY,
): number {
  const candidate = normalizeScore(score);
  let previousBest = 0;

  if (storage) {
    try {
      previousBest = parseStoredScore(storage.getItem(key));
    } catch {
      previousBest = 0;
    }
  }

  const best = Math.max(previousBest, candidate);
  if (storage && best > previousBest) {
    try {
      storage.setItem(key, String(best));
    } catch {
      // Persistence is optional; the in-memory result is still useful.
    }
  }

  return best;
}
