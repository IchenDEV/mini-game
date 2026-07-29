import Phaser from "phaser";
import type { Customer, SalePulse } from "./types";

type GameEventMap = {
  "customers:sync": [customers: Customer[]];
  "sale:pulse": [sale: SalePulse];
  "game:paused": [paused: boolean];
  "checkout:request": [];
};

type GameEventName = keyof GameEventMap;
type GameEventListener<K extends GameEventName> = (
  ...args: GameEventMap[K]
) => void;

/**
 * A small typed boundary between React's simulation state and Phaser's
 * presentation scene. State-like events are retained so a scene that finishes
 * booting after React's first effect still receives the latest snapshot.
 */
class GameEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();
  private latestCustomers: Customer[] | undefined;
  private latestPaused: boolean | undefined;

  emit<K extends GameEventName>(
    eventName: K,
    ...args: GameEventMap[K]
  ): boolean {
    if (eventName === "customers:sync") {
      this.latestCustomers = args[0] as Customer[];
    } else if (eventName === "game:paused") {
      this.latestPaused = args[0] as boolean;
    }

    return this.emitter.emit(eventName, ...args);
  }

  on<K extends GameEventName>(
    eventName: K,
    listener: GameEventListener<K>,
  ): () => void {
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }

  getCustomers(): Customer[] | undefined {
    return this.latestCustomers;
  }

  getPaused(): boolean | undefined {
    return this.latestPaused;
  }
}

export const gameEvents = new GameEventBus();
