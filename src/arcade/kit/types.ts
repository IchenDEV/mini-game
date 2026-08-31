import type * as THREE from "three";

export type GameStatus = "ready" | "playing" | "paused" | "over";

export type FinishKind = "win" | "lose";

export type AudioCueName =
  | "pickup"
  | "hit"
  | "shoot"
  | "win"
  | "lose"
  | "tick"
  | "power"
  | "swap";

export interface AudioCue {
  enabled: boolean;
  play(name: AudioCueName, variation?: number): void;
}

/**
 * Unified per-frame input. The shell fills it from keyboard + pointer;
 * logic modules stay pure and just read it.
 */
export interface InputState {
  /** -1 (left) .. 1 (right), from arrow/A-D keys or pointer steering. */
  axisX: number;
  /** -1 (down) .. 1 (up), from arrow/W-S keys. */
  axisY: number;
  /** Primary action held (space / enter / pointer down). */
  action: boolean;
  /** Primary action pressed this frame (edge). */
  actionPressed: boolean;
  /** Primary action released this frame (edge). */
  actionReleased: boolean;
  /** Pointer position in NDC (-1..1), pointerActive false until first move. */
  pointerX: number;
  pointerY: number;
  pointerActive: boolean;
  /** Pad keys (D F J K / 1-4) pressed this frame, as indices 0-7. */
  padPressed: number[];
}

export function emptyInput(): InputState {
  return {
    axisX: 0,
    axisY: 0,
    action: false,
    actionPressed: false,
    actionReleased: false,
    pointerX: 0,
    pointerY: 0,
    pointerActive: false,
    padPressed: [],
  };
}

export interface HudField {
  label: string;
  value: string;
}

/** One-shot visual effect request from logic to stage (particle burst). */
export interface FxEvent {
  x: number;
  y: number;
  z: number;
  color: number;
  count?: number;
}

export interface HudCallout {
  text: string;
  key: number;
}

export interface LogicSnapshot {
  status: GameStatus;
  score: number;
  best: number;
  fields: HudField[];
  /** 0..1 progress/time meter; null hides the meter. */
  meter: number | null;
  meterLabel: string;
  callout: HudCallout | null;
  hint: string;
  /** Extra line on the result screen, e.g. "抵达第 12 层". */
  detail: string;
}

export interface LogicContext {
  audio: AudioCue;
  /** localStorage key for the best score of this game. */
  bestKey: string;
}

/**
 * The pure, unit-testable heart of a game. No DOM, no WebGL — the arcade
 * contract test suite drives every game through this interface.
 */
export interface GameLogic {
  /** Leave the ready screen and start playing. */
  start(): void;
  pause(): void;
  resume(): void;
  /** Reset to a fresh playing run. */
  restart(): void;
  /** Advance the simulation; only called while status === "playing". */
  step(dt: number, input: InputState): void;
  snapshot(): LogicSnapshot;
  /**
   * Render-facing state (positions, entities). Written by step(), read by
   * the Three.js stage. Kept out of LogicSnapshot so tests only touch the
   * HUD contract.
   */
  view: unknown;
}

export interface StageContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  audio: AudioCue;
  /** Accent color as 0xRRGGBB. */
  accent: number;
}

export interface GameStage {
  /** Sync visuals; runs every frame, including ready/paused/over. */
  update(dt: number, input: InputState, logic: GameLogic): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface GameMeta {
  /** Stable id used in the hash route and storage keys, e.g. "g01-asteroid-corridor". */
  id: string;
  /** 1-based arcade number. */
  no: number;
  name: string;
  tagline: string;
  category: string;
  /** Short control summary shown on the ready screen. */
  controls: string;
  /** One-line hint shown while playing. */
  hint: string;
  /** Accent color as "#rrggbb". */
  accent: string;
}

export interface GameDefinition extends GameMeta {
  createLogic(ctx: LogicContext): GameLogic;
  createStage(ctx: StageContext): GameStage;
}
