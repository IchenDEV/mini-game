import type {
  FinishKind,
  GameStatus,
  HudCallout,
  HudField,
  LogicContext,
  LogicSnapshot,
} from "./types";
import { loadBest, saveBest } from "./storage";

export interface BaseOptions {
  hint: string;
  meterLabel?: string;
}

/**
 * Shared scaffolding for game logic: status flow, score/best bookkeeping,
 * transient callouts, the HUD meter. Games add their own step() mechanics
 * on top and delegate everything else here.
 */
export class LogicBase {
  status: GameStatus = "ready";
  score = 0;
  best = 0;
  elapsed = 0;
  meterValue: number | null = null;
  fields: HudField[] = [];
  detail = "";
  callout: HudCallout | null = null;

  private readonly ctx: LogicContext;
  private readonly hint: string;
  private readonly meterLabel: string;
  private calloutRemaining = 0;
  private calloutSeq = 0;

  constructor(ctx: LogicContext, opts: BaseOptions) {
    this.ctx = ctx;
    this.hint = opts.hint;
    this.meterLabel = opts.meterLabel ?? "";
    this.best = loadBest(ctx.bestKey);
  }

  get audio() {
    return this.ctx.audio;
  }

  start(): void {
    if (this.status === "ready" || this.status === "over") {
      this.status = "playing";
    }
  }

  pause(): void {
    if (this.status === "playing") this.status = "paused";
  }

  resume(): void {
    if (this.status === "paused") this.status = "playing";
  }

  /** Shell-level restart: fresh run immediately, skipping the ready screen. */
  restart(): void {
    this.status = "playing";
  }

  say(text: string, duration = 1.1): void {
    this.calloutSeq += 1;
    this.callout = { text, key: this.calloutSeq };
    this.calloutRemaining = duration;
  }

  addScore(points: number): void {
    if (points === 0) return;
    this.score = Math.max(0, this.score + Math.round(points));
  }

  setMeter(value: number | null): void {
    this.meterValue = value;
  }

  setFields(fields: HudField[]): void {
    this.fields = fields;
  }

  finish(kind: FinishKind = "lose"): void {
    if (this.status === "over") return;
    this.status = "over";
    if (this.score > this.best) {
      this.best = this.score;
      saveBest(this.ctx.bestKey, this.best);
    }
    this.callout = null;
    this.calloutRemaining = 0;
    this.ctx.audio.play(kind === "win" ? "win" : "lose");
  }

  /** Per-frame housekeeping; call at the top of each game's step(). */
  tick(dt: number): void {
    this.elapsed += dt;
    if (this.calloutRemaining > 0) {
      this.calloutRemaining -= dt;
      if (this.calloutRemaining <= 0) this.callout = null;
    }
  }

  /**
   * Reset HUD state at the top of a game's reset(); also freezes elapsed
   * so speed curves restart with each run.
   */
  clearHud(meter: number | null = null): void {
    this.score = 0;
    this.detail = "";
    this.meterValue = meter;
    this.fields = [];
    this.callout = null;
    this.calloutRemaining = 0;
    this.elapsed = 0;
  }

  snapshot(): LogicSnapshot {
    return {
      status: this.status,
      score: this.score,
      best: this.best,
      fields: this.fields,
      meter: this.meterValue,
      meterLabel: this.meterLabel,
      callout: this.callout,
      hint: this.hint,
      detail: this.detail,
    };
  }
}

/** Deterministic RNG for games that need seeded runs (qa-friendly). */
export function makeRng(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function formatScore(n: number): string {
  return n.toLocaleString("zh-CN");
}

/** Normalizes an angle into [0, 2π). */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}
