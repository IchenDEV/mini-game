import Phaser from "phaser";

export type FishingVisualPhase =
  | "idle"
  | "casting"
  | "waiting"
  | "bite"
  | "reeling"
  | "caught";

export interface FishingReelVisual {
  tension: number;
  progress: number;
  targetCenter: number;
  safeWidth: number;
}

export interface FishingVisualState {
  phase: FishingVisualPhase;
  castPower: number;
  reel: FishingReelVisual | null;
  fishFrame?: number;
  weather?: string;
}

export interface SceneEffectPulse {
  id: number;
  kind: "catch" | "sale" | "upgrade" | "order";
}

type GameEventMap = {
  "scene:sync": [state: FishingVisualState];
  "scene:paused": [paused: boolean];
  "scene:effect": [pulse: SceneEffectPulse];
  "primary:request": [];
};

type GameEventName = keyof GameEventMap;
type GameEventListener<K extends GameEventName> = (
  ...args: GameEventMap[K]
) => void;

/**
 * Typed, retained bridge between React's simulation state and Phaser's visual
 * scene. The latest state is kept so a scene that boots after React's first
 * render still receives the correct fishing phase.
 */
class FishingEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();
  private latestState: FishingVisualState | undefined;
  private latestPaused = false;

  emit<K extends GameEventName>(
    eventName: K,
    ...args: GameEventMap[K]
  ): boolean {
    if (eventName === "scene:sync") {
      this.latestState = args[0] as FishingVisualState;
    } else if (eventName === "scene:paused") {
      this.latestPaused = args[0] as boolean;
    }

    return this.emitter.emit(eventName, ...args);
  }

  on<K extends GameEventName>(
    eventName: K,
    listener: GameEventListener<K>,
  ): () => void {
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  getLatestState(): FishingVisualState | undefined {
    return this.latestState;
  }

  getPaused(): boolean {
    return this.latestPaused;
  }
}

export const gameEvents = new FishingEventBus();
