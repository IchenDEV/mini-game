// Late-bound callbacks so the overworld engine stays decoupled from
// battle / menu / story modules (which register themselves here).
import type { Overworld, NPC } from "./overworld";

export interface HookTable {
  onMapEnter?: (map: string, ow: Overworld) => Promise<void> | void;
  onPlayerStep?: (ow: Overworld) => void;
  openStartMenu?: () => void;
  startWildBattle?: (dex: number, level: number) => Promise<void>;
  trainerSpotted?: (ow: Overworld, npc: NPC, dist: number) => Promise<void>;
  talkToNpc?: (ow: Overworld, npc: NPC) => Promise<void>;
  readSign?: (ow: Overworld, textId: string) => Promise<void>;
  interactTile?: (ow: Overworld, x: number, y: number, tile: number) => Promise<void>;
}

export const Hooks: HookTable = {};
