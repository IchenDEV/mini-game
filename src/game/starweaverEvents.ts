export type StarweaverStatus = "ready" | "playing" | "paused" | "gameover";
export type StarweaverEventLabel = string | null;

export type StarweaverCommand =
  | "restart"
  | "toggle-pause"
  | "toggle-sound";

/**
 * Stable, renderer-independent state consumed by the React HUD. Keep this
 * object intentionally small: Phaser owns animation state, React owns chrome.
 */
export interface StarweaverSnapshot {
  status: StarweaverStatus;
  timeRemainingMs: number;
  score: number;
  bestScore: number;
  stitches: number;
  combo: number;
  maxCombo: number;
  nearMisses: number;
  soundEnabled: boolean;
  label: StarweaverEventLabel;
  eventSequence: number;
}

type StoreListener = () => void;
type CommandListener = (command: StarweaverCommand) => void;

const INITIAL_SNAPSHOT: StarweaverSnapshot = Object.freeze({
  status: "ready",
  timeRemainingMs: 75_000,
  score: 0,
  bestScore: 0,
  stitches: 0,
  combo: 0,
  maxCombo: 0,
  nearMisses: 0,
  soundEnabled: true,
  label: "按住星盘，蓄势后松手穿针",
  eventSequence: 0,
});

function snapshotsEqual(
  left: StarweaverSnapshot,
  right: StarweaverSnapshot,
): boolean {
  return (
    left.status === right.status &&
    left.timeRemainingMs === right.timeRemainingMs &&
    left.score === right.score &&
    left.bestScore === right.bestScore &&
    left.stitches === right.stitches &&
    left.combo === right.combo &&
    left.maxCombo === right.maxCombo &&
    left.nearMisses === right.nearMisses &&
    left.soundEnabled === right.soundEnabled &&
    left.label === right.label &&
    left.eventSequence === right.eventSequence
  );
}

/**
 * Tiny external store + command bridge. `subscribe` and `getSnapshot` are
 * bound arrow properties so they can be passed straight to useSyncExternalStore.
 */
class StarweaverEventBridge {
  private snapshot: StarweaverSnapshot = INITIAL_SNAPSHOT;
  private readonly storeListeners = new Set<StoreListener>();
  private readonly commandListeners = new Set<CommandListener>();
  private readonly pendingCommands: StarweaverCommand[] = [];

  readonly getSnapshot = (): StarweaverSnapshot => this.snapshot;

  readonly getServerSnapshot = (): StarweaverSnapshot => INITIAL_SNAPSHOT;

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.storeListeners.add(listener);
    return () => this.storeListeners.delete(listener);
  };

  command(command: StarweaverCommand): void {
    if (this.commandListeners.size === 0) {
      // The React start control can be clicked while Phaser is still loading
      // its textures. Retain a short command queue so that input is not lost.
      this.pendingCommands.push(command);
      if (this.pendingCommands.length > 8) this.pendingCommands.shift();
    } else {
      for (const listener of [...this.commandListeners]) listener(command);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<StarweaverCommand>("starweaver:command", {
          detail: command,
        }),
      );
    }
  }

  /** Scene-facing retained publication. No-op publications stay silent. */
  publish(next: StarweaverSnapshot): void {
    if (snapshotsEqual(this.snapshot, next)) return;

    this.snapshot = Object.freeze({ ...next });
    for (const listener of [...this.storeListeners]) listener();

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<StarweaverSnapshot>("starweaver:snapshot", {
          detail: this.snapshot,
        }),
      );
    }
  }

  /** Internal scene command subscription; exposed for alternate renderers. */
  onCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    if (this.pendingCommands.length > 0) {
      const pending = this.pendingCommands.splice(0);
      for (const command of pending) listener(command);
    }
    return () => this.commandListeners.delete(listener);
  }
}

export const starweaverEvents = new StarweaverEventBridge();
