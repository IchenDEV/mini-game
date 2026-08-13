// Global game state + save/load.
import type { Mon } from "./pokemon";

export type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface BagSlot {
  item: string; // item constName
  qty: number;
}

export interface Options {
  textSpeed: number; // frames per character
  battleAnims: boolean;
  battleStyle: "SHIFT" | "SET";
}

export const BADGES = ["BOULDER", "CASCADE", "THUNDER", "RAINBOW", "SOUL", "MARSH", "VOLCANO", "EARTH"] as const;

export interface DoorReturn {
  map: string;
  x: number;
  y: number;
}

class GameStateImpl {
  playerName = "ASH";
  rivalName = "GARY";
  playerId = Math.floor(Math.random() * 65536);
  money = 3000;
  coins = 0;
  badges = 0;
  flags = new Set<string>();
  party: Mon[] = [];
  boxes: Mon[][] = Array.from({ length: 12 }, () => []);
  currentBox = 0;
  bag: BagSlot[] = [];
  pcItems: BagSlot[] = [];
  dexSeen = new Set<number>();
  dexCaught = new Set<number>();
  map = "PALLET_TOWN";
  x = 10;
  y = 12;
  dir: Dir = "DOWN";
  lastOutdoor: DoorReturn = { map: "PALLET_TOWN", x: 10, y: 12 };
  lastHeal: DoorReturn = { map: "REDS_HOUSE_1F", x: 3, y: 4 };
  doorStack: DoorReturn[] = [];
  options: Options = { textSpeed: 2, battleAnims: true, battleStyle: "SHIFT" };
  repelSteps = 0;
  playSeconds = 0;
  pikachuHappiness = 90;
  rivalWins = 0; // rival victories over you in early fights (decides Eevee evolution)
  rivalLosses = 0;

  hasFlag(f: string): boolean {
    return this.flags.has(f);
  }
  setFlag(f: string) {
    this.flags.add(f);
  }
  clearFlag(f: string) {
    this.flags.delete(f);
  }

  hasBadge(i: number): boolean {
    return (this.badges & (1 << i)) !== 0;
  }
  giveBadge(i: number) {
    this.badges |= 1 << i;
  }
  badgeCount(): number {
    let n = 0;
    for (let i = 0; i < 8; i++) if (this.hasBadge(i)) n++;
    return n;
  }

  addItem(item: string, qty = 1): boolean {
    const slot = this.bag.find((s) => s.item === item);
    if (slot) {
      slot.qty = Math.min(99, slot.qty + qty);
      return true;
    }
    if (this.bag.length >= 20) return false;
    this.bag.push({ item, qty });
    return true;
  }

  removeItem(item: string, qty = 1): boolean {
    const i = this.bag.findIndex((s) => s.item === item);
    if (i < 0 || this.bag[i].qty < qty) return false;
    this.bag[i].qty -= qty;
    if (this.bag[i].qty <= 0) this.bag.splice(i, 1);
    return true;
  }

  itemQty(item: string): number {
    return this.bag.find((s) => s.item === item)?.qty ?? 0;
  }

  alivePartyCount(): number {
    return this.party.filter((m) => m.hp > 0).length;
  }

  save() {
    const data = {
      v: 1,
      playerName: this.playerName,
      rivalName: this.rivalName,
      playerId: this.playerId,
      money: this.money,
      coins: this.coins,
      badges: this.badges,
      flags: [...this.flags],
      party: this.party,
      boxes: this.boxes,
      currentBox: this.currentBox,
      bag: this.bag,
      pcItems: this.pcItems,
      dexSeen: [...this.dexSeen],
      dexCaught: [...this.dexCaught],
      map: this.map,
      x: this.x,
      y: this.y,
      dir: this.dir,
      lastOutdoor: this.lastOutdoor,
      lastHeal: this.lastHeal,
      doorStack: this.doorStack,
      options: this.options,
      repelSteps: this.repelSteps,
      playSeconds: this.playSeconds,
      pikachuHappiness: this.pikachuHappiness,
      rivalWins: this.rivalWins,
      rivalLosses: this.rivalLosses,
    };
    localStorage.setItem("pyellow_save", JSON.stringify(data));
  }

  static hasSave(): boolean {
    return localStorage.getItem("pyellow_save") !== null;
  }

  load(): boolean {
    const raw = localStorage.getItem("pyellow_save");
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      Object.assign(this, {
        ...d,
        flags: new Set(d.flags),
        dexSeen: new Set(d.dexSeen),
        dexCaught: new Set(d.dexCaught),
      });
      delete (this as any).v;
      return true;
    } catch {
      return false;
    }
  }
}

export const S = new GameStateImpl();
export const hasSave = () => GameStateImpl.hasSave();
