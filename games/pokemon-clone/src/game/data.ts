// Typed access layer over the JSON extracted from pokeyellow.
import { loadJSON } from "../core/loader";
import type { RGB } from "../core/gfx";

export interface Species {
  dex: number;
  internal: number;
  name: string;
  constName: string;
  stats: [number, number, number, number, number]; // hp atk def spd spc
  types: [string, string];
  catchRate: number;
  baseExp: number;
  growth: string;
  lvl1Moves: string[];
  learnset: { level: number; move: string }[];
  evolutions: { kind: "level" | "item" | "trade"; level?: number; item?: string; to: string }[];
  tmhm: string[];
  sprite: string;
  genus: string;
  heightFt: number;
  heightIn: number;
  weightLbs: number;
  flavor: string[];
  cry: [number, number, number];
  palette: string;
}

export interface Move {
  id: number;
  name: string;
  effect: string;
  power: number;
  type: string;
  accuracy: number;
  pp: number;
  display: string;
}

export interface Item {
  id: number;
  constName: string;
  name: string;
  price: number;
  key: boolean;
}

export interface MapObjectDef {
  x: number;
  y: number;
  sprite: string;
  movement: string;
  dir: string;
  textId: string;
  trainerClass?: string;
  trainerId?: number;
  item?: string;
  pokemon?: string;
  level?: number;
}

export interface WildSlot {
  level: number;
  species: string;
}

export interface TrainerHeader {
  event: string;
  range: number;
  battle: string[] | null;
  end: string[] | null;
  after: string[] | null;
}

export interface MapData {
  id: number;
  name: string;
  label: string;
  w: number;
  h: number;
  tileset: string;
  connections: { dir: "north" | "south" | "east" | "west"; mapConst: string; offset: number }[];
  border: number;
  warps: { x: number; y: number; dest: string; destWarp: number }[];
  signs: { x: number; y: number; textId: string }[];
  objects: MapObjectDef[];
  blocks: number[];
  wild: { grassRate: number; grass: WildSlot[]; waterRate: number; water: WildSlot[] } | null;
  texts: Record<string, { paras?: string[]; scripted?: boolean; mart?: string; trainerHeader?: number }>;
  trainerHeaders: (TrainerHeader | null)[];
  hidden: { x: number; y: number; routine: string; arg: string | null }[];
}

export interface Tileset {
  id: number;
  name: string;
  constName: string;
  gfx: string;
  blockset: string;
  coll: number[];
  counterTiles: number[];
  grassTile: number;
  anim: string;
  warpTiles: number[];
  doorTiles: number[];
}

export interface TrainerParty {
  mons: { level: number; species: string }[];
}

class GameData {
  pokemon: Species[] = [];
  speciesByConst = new Map<string, Species>();
  speciesByInternal = new Map<number, Species>();
  moves: Move[] = [];
  movesByConst = new Map<string, Move>();
  tmMoves: string[] = [];
  hmMoves: string[] = [];
  items: Item[] = [];
  itemsByConst = new Map<string, Item>();
  typeChart = new Map<string, number>();
  maps: Record<string, MapData> = {};
  tilesets: Tileset[] = [];
  tilesetByConst = new Map<string, Tileset>();
  blocksets: Record<string, number[][]> = {};
  ledges: { facing: string; standOn: number; ledge: number; input: string }[] = [];
  pairColl: { land: { tileset: string; a: number; b: number }[]; water: { tileset: string; a: number; b: number }[] } = { land: [], water: [] };
  waterTilesets: string[] = [];
  charmap: Record<string, number> = {};
  palettes: Record<string, RGB[]> = {};
  sprites: Record<string, { file: string; tiles: number }> = {};
  trainerClassNames: string[] = [];
  trainerClassConsts: string[] = [];
  trainerParties: Record<number, TrainerParty[]> = {};
  trainerPics: Record<string, { file: string | null; money: number }> = {};
  trainerSpecialMoves: { class: string; trainerId: number; moves: { mon: number; slot: number; move: string }[] }[] = [];
  marts: Record<string, string[]> = {};

  async load() {
    const [pk, mv, ty, it, mp, ts, cm, pal, sp, tr, tp, marts] = await Promise.all([
      loadJSON<any>("/assets/data/pokemon.json"),
      loadJSON<any>("/assets/data/moves.json"),
      loadJSON<any>("/assets/data/types.json"),
      loadJSON<any>("/assets/data/items.json"),
      loadJSON<any>("/assets/data/maps.json"),
      loadJSON<any>("/assets/data/tilesets.json"),
      loadJSON<any>("/assets/data/charmap.json"),
      loadJSON<any>("/assets/data/palettes.json"),
      loadJSON<any>("/assets/data/sprites.json"),
      loadJSON<any>("/assets/data/trainers.json"),
      loadJSON<any>("/assets/data/trainer_pics.json"),
      loadJSON<any>("/assets/data/marts.json"),
    ]);
    this.pokemon = pk.pokemon;
    for (const s of this.pokemon) {
      if (!s) continue;
      this.speciesByConst.set(s.constName, s);
      this.speciesByInternal.set(s.internal, s);
    }
    this.moves = mv.moves.map((m: any, i: number) => ({ ...m, id: i + 1 }));
    for (const m of this.moves) this.movesByConst.set(m.name, m);
    this.tmMoves = mv.tmMoves;
    this.hmMoves = mv.hmMoves;
    for (const row of ty.matchups) this.typeChart.set(`${row[0]}>${row[1]}`, row[2]);
    this.items = it.items;
    for (const i of this.items) if (i) this.itemsByConst.set(i.constName, i);
    this.maps = mp;
    this.tilesets = ts.tilesets;
    for (const t of this.tilesets) this.tilesetByConst.set(t.constName, t);
    this.blocksets = ts.blocksets;
    this.ledges = ts.ledges;
    this.pairColl = ts.pairColl;
    this.waterTilesets = ts.waterTilesets;
    this.charmap = cm;
    this.palettes = pal;
    this.sprites = sp;
    this.trainerClassNames = tr.classNames;
    this.trainerClassConsts = tr.classConsts;
    this.trainerParties = tr.parties;
    this.trainerSpecialMoves = tr.specialMoves;
    this.trainerPics = tp;
    this.marts = marts;
  }

  species(constOrDex: string | number): Species {
    if (typeof constOrDex === "number") return this.pokemon[constOrDex];
    const s = this.speciesByConst.get(constOrDex);
    if (!s) throw new Error(`unknown species ${constOrDex}`);
    return s;
  }

  move(c: string | number): Move {
    if (typeof c === "number") return this.moves[c - 1];
    const m = this.movesByConst.get(c);
    if (!m) throw new Error(`unknown move ${c}`);
    return m;
  }

  item(c: string): Item {
    const i = this.itemsByConst.get(c);
    if (!i) throw new Error(`unknown item ${c}`);
    return i;
  }

  typeMult(atk: string, def: string): number {
    return this.typeChart.get(`${atk}>${def}`) ?? 1;
  }

  trainerClassId(constName: string): number {
    return this.trainerClassConsts.indexOf(constName);
  }

  trainerParty(classConst: string, id: number): TrainerParty | null {
    const cid = this.trainerClassId(classConst);
    const list = this.trainerParties[cid];
    if (!list) return null;
    return list[id - 1] || null;
  }

  trainerName(classConst: string): string {
    const cid = this.trainerClassId(classConst);
    return this.trainerClassNames[cid - 1] || classConst;
  }
}

export const D = new GameData();
