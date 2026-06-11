// Gen 1 Pokémon instance math: DVs, stat experience, exp curves, moves, evolution.
import { D, type Species } from "./data";

export type Status = "" | "SLP" | "PSN" | "BRN" | "FRZ" | "PAR";

export interface MoveSlot {
  id: number; // move id (1-based)
  pp: number;
  maxPp: number;
}

export interface Mon {
  dex: number;
  nickname: string | null;
  level: number;
  exp: number;
  hp: number;
  status: Status;
  sleepTurns: number;
  dvs: [number, number, number, number]; // atk def spd spc
  statExp: [number, number, number, number, number]; // hp atk def spd spc
  moves: MoveSlot[];
  otName: string;
  otId: number;
  catchLocation?: string;
}

export function speciesOf(m: Mon): Species {
  return D.pokemon[m.dex];
}

export function displayName(m: Mon): string {
  return m.nickname || speciesOf(m).name;
}

export function hpDV(m: Mon): number {
  const [a, d, s, sp] = m.dvs;
  return ((a & 1) << 3) | ((d & 1) << 2) | ((s & 1) << 1) | (sp & 1);
}

function statFormula(base: number, dv: number, statExp: number, level: number, isHp: boolean): number {
  const ev = Math.floor(Math.ceil(Math.sqrt(statExp)) / 4);
  const core = Math.floor(((base + dv) * 2 + ev) * level / 100);
  return isHp ? core + level + 10 : core + 5;
}

export function maxHpOf(m: Mon): number {
  return statFormula(speciesOf(m).stats[0], hpDV(m), m.statExp[0], m.level, true);
}

// returns [hp, atk, def, spd, spc]
export function statsOf(m: Mon): [number, number, number, number, number] {
  const s = speciesOf(m);
  return [
    maxHpOf(m),
    statFormula(s.stats[1], m.dvs[0], m.statExp[1], m.level, false),
    statFormula(s.stats[2], m.dvs[1], m.statExp[2], m.level, false),
    statFormula(s.stats[3], m.dvs[2], m.statExp[3], m.level, false),
    statFormula(s.stats[4], m.dvs[3], m.statExp[4], m.level, false),
  ];
}

export function expForLevel(growth: string, level: number): number {
  const n = level;
  switch (growth) {
    case "GROWTH_MEDIUM_FAST":
      return n * n * n;
    case "GROWTH_MEDIUM_SLOW":
      return Math.max(0, Math.floor((6 / 5) * n * n * n) - 15 * n * n + 100 * n - 140);
    case "GROWTH_FAST":
      return Math.floor((4 * n * n * n) / 5);
    case "GROWTH_SLOW":
      return Math.floor((5 * n * n * n) / 4);
    default:
      return n * n * n;
  }
}

export function levelForExp(growth: string, exp: number): number {
  let lv = 1;
  while (lv < 100 && expForLevel(growth, lv + 1) <= exp) lv++;
  return lv;
}

export function movesAtLevel(species: Species, level: number): string[] {
  const all = [...species.lvl1Moves];
  for (const lm of species.learnset) if (lm.level <= level) all.push(lm.move);
  // last 4 distinct, keep order of learning
  const dedup: string[] = [];
  for (const mv of all) {
    const i = dedup.indexOf(mv);
    if (i >= 0) dedup.splice(i, 1);
    dedup.push(mv);
  }
  return dedup.slice(-4);
}

export function makeMon(speciesConst: string | number, level: number, opts: { ot?: string; otId?: number; dvs?: [number, number, number, number]; moves?: string[] } = {}): Mon {
  const sp = typeof speciesConst === "number" ? D.pokemon[speciesConst] : D.species(speciesConst);
  const dvs = opts.dvs ?? ([rand16(), rand16(), rand16(), rand16()] as [number, number, number, number]);
  const m: Mon = {
    dex: sp.dex,
    nickname: null,
    level,
    exp: expForLevel(sp.growth, level),
    hp: 0,
    status: "",
    sleepTurns: 0,
    dvs,
    statExp: [0, 0, 0, 0, 0],
    moves: [],
    otName: opts.ot ?? "WILD",
    otId: opts.otId ?? Math.floor(Math.random() * 65536),
  };
  const names = opts.moves ?? movesAtLevel(sp, level);
  m.moves = names.map((n) => {
    const mv = D.move(n);
    return { id: mv.id, pp: mv.pp, maxPp: mv.pp };
  });
  m.hp = maxHpOf(m);
  return m;
}

function rand16(): number {
  return Math.floor(Math.random() * 16);
}

// stat exp gained by defeating a mon of this species
export function grantStatExp(m: Mon, defeated: Species) {
  for (let i = 0; i < 5; i++) m.statExp[i] = Math.min(65535, m.statExp[i] + defeated.stats[i]);
}

export function expGain(defeated: Species, level: number, isTrainer: boolean, participants: number, isTraded: boolean): number {
  let exp = Math.floor((defeated.baseExp * level) / 7 / Math.max(1, participants));
  if (isTrainer) exp = Math.floor(exp * 1.5);
  if (isTraded) exp = Math.floor(exp * 1.5);
  return Math.max(1, exp);
}

// returns moves newly learnable when reaching exactly `level`
export function newMovesAt(species: Species, level: number): string[] {
  return species.learnset.filter((lm) => lm.level === level).map((lm) => lm.move);
}

export function evolutionAtLevel(m: Mon): Species | null {
  const sp = speciesOf(m);
  for (const ev of sp.evolutions) {
    if (ev.kind === "level" && ev.level !== undefined && m.level >= ev.level) return D.species(ev.to);
  }
  return null;
}

export function evolutionWithItem(m: Mon, itemConst: string): Species | null {
  const sp = speciesOf(m);
  for (const ev of sp.evolutions) {
    if (ev.kind === "item" && ev.item === itemConst) return D.species(ev.to);
  }
  return null;
}

export function healMon(m: Mon) {
  m.hp = maxHpOf(m);
  m.status = "";
  m.sleepTurns = 0;
  for (const mv of m.moves) mv.pp = mv.maxPp;
}
