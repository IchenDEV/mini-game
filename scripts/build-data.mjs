// Extracts game data from the pret/pokeyellow disassembly (vendor/pokeyellow)
// into JSON + PNG assets consumed by the web engine.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PY = path.join(ROOT, "vendor", "pokeyellow");
const OUT_DATA = path.join(ROOT, "public", "assets", "data");
const OUT_ASSETS = path.join(ROOT, "public", "assets");

if (!fs.existsSync(PY)) {
  console.error("vendor/pokeyellow missing. Run: git clone --depth 1 https://github.com/pret/pokeyellow vendor/pokeyellow");
  process.exit(1);
}
fs.mkdirSync(OUT_DATA, { recursive: true });

const read = (p) => fs.readFileSync(path.join(PY, p), "utf8");
const readLines = (p) =>
  read(p)
    .split("\n")
    .map((l) => l.replace(/;.*$/, "").trimEnd());

const writeJSON = (name, obj) => {
  fs.writeFileSync(path.join(OUT_DATA, name), JSON.stringify(obj));
  console.log(`wrote data/${name}`);
};

// ---------- generic const list parser ----------
function parseConstList(file, macroNames = ["const"]) {
  // returns array where arr[value] = NAME
  const out = [];
  let v = 0;
  for (const raw of readLines(file)) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^const_def(?:\s+(\d+))?/))) {
      v = m[1] ? parseInt(m[1]) : 0;
    } else if ((m = l.match(/^const_skip(?:\s+(\d+))?/))) {
      v += m[1] ? parseInt(m[1]) : 1;
    } else if ((m = l.match(/^const_next\s+(\$?[0-9a-fA-F]+)/))) {
      v = parseNum(m[1]);
    } else {
      for (const mac of macroNames) {
        const re = new RegExp(`^${mac}\\s+([A-Za-z0-9_]+)`);
        if ((m = l.match(re))) {
          out[v] = m[1];
          v++;
          break;
        }
      }
    }
  }
  return out;
}
function parseNum(s) {
  s = s.trim();
  if (s.startsWith("$")) return parseInt(s.slice(1), 16);
  if (s.startsWith("%")) return parseInt(s.slice(1), 2);
  return parseInt(s, 10);
}

// ---------- constants ----------
const SPECIES = parseConstList("constants/pokemon_constants.asm", ["const"]); // internal id -> NAME (NO_MON at 0)
const MOVES_C = parseConstList("constants/move_constants.asm", ["const"]); // move id -> NAME
const TILESETS_C = parseConstList("constants/tileset_constants.asm", ["const"]);
const SPRITES_C = parseConstList("constants/sprite_constants.asm", ["const"]);
const TRAINER_C = parseConstList("constants/trainer_constants.asm", ["trainer_const"]);
const DEX_C = parseConstList("constants/pokedex_constants.asm", ["const"]); // dex id -> DEX_NAME

// item constants incl. TM/HM macros
const ITEMS_C = [];
const TM_MOVES = []; // tm number (1-based) -> move const
const HM_MOVES = [];
{
  let v = 0;
  for (const raw of readLines("constants/item_constants.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^const_def(?:\s+(\d+))?/))) v = m[1] ? parseInt(m[1]) : 0;
    else if ((m = l.match(/^const_skip(?:\s+(\d+))?/))) v += m[1] ? parseInt(m[1]) : 1;
    else if ((m = l.match(/^const\s+([A-Za-z0-9_]+)/))) {
      ITEMS_C[v] = m[1];
      v++;
    } else if ((m = l.match(/^add_tm\s+([A-Za-z0-9_]+)/))) {
      TM_MOVES.push(m[1]);
      ITEMS_C[v] = `TM${String(TM_MOVES.length).padStart(2, "0")}`;
      v++;
    } else if ((m = l.match(/^add_hm\s+([A-Za-z0-9_]+)/))) {
      HM_MOVES.push(m[1]);
      ITEMS_C[v] = `HM${String(HM_MOVES.length).padStart(2, "0")}`;
      v++;
    }
  }
}

// map constants with dims
const MAPS_C = []; // id -> {name,w,h}
{
  let v = 0;
  for (const raw of readLines("constants/map_constants.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^const_def/))) v = 0;
    else if ((m = l.match(/^map_const\s+([A-Z0-9_]+),\s*(\d+),\s*(\d+)/))) {
      MAPS_C[v] = { name: m[1], w: parseInt(m[2]), h: parseInt(m[3]) };
      v++;
    }
  }
}

// type ids -> name
const TYPE_BY_CONST = {};
{
  let v = 0;
  for (const raw of readLines("constants/type_constants.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^const_def/))) v = 0;
    else if ((m = l.match(/^const_skip(?:\s+(\d+))?/))) v += m[1] ? parseInt(m[1]) : 1;
    else if ((m = l.match(/^const\s+([A-Z0-9_]+)/))) {
      TYPE_BY_CONST[m[1]] = v;
      v++;
    }
  }
}
const TYPE_NAMES = {
  NORMAL: "NORMAL", FIGHTING: "FIGHTING", FLYING: "FLYING", POISON: "POISON",
  GROUND: "GROUND", ROCK: "ROCK", BIRD: "BIRD", BUG: "BUG", GHOST: "GHOST",
  FIRE: "FIRE", WATER: "WATER", GRASS: "GRASS", ELECTRIC: "ELECTRIC",
  PSYCHIC_TYPE: "PSYCHIC", ICE: "ICE", DRAGON: "DRAGON",
};

// ---------- list-of-strings parser (li "...") ----------
function parseLiList(file, macro = "li") {
  const out = [];
  for (const raw of read(file).split("\n")) {
    const m = raw.match(new RegExp(`^\\s*${macro}\\s+"(.*)"`));
    if (m) out.push(m[1]);
  }
  return out;
}

// ---------- pokemon ----------
const monNames = parseLiList("data/pokemon/names.asm", "dname"); // internal order, 190 entries
// dex order: internal id -> dex number
const dexOrder = [];
{
  let i = 1;
  for (const raw of readLines("data/pokemon/dex_order.asm")) {
    const m = raw.trim().match(/^db\s+([A-Z0-9_]+)/);
    if (m) {
      const dn = m[1] === "0" ? 0 : DEX_C.indexOf(m[1]);
      dexOrder[i] = dn > 0 ? dn : 0;
      i++;
    }
  }
}

// base stats (dex order, from included files)
const baseStatsFiles = read("data/pokemon/base_stats.asm")
  .split("\n")
  .map((l) => l.match(/INCLUDE\s+"(data\/pokemon\/base_stats\/[a-z0-9_.']+\.asm)"/))
  .filter(Boolean)
  .map((m) => m[1]);

function parseBaseStats(file) {
  const lines = readLines(file).map((l) => l.trim()).filter(Boolean);
  const dexConst = lines[0].match(/db\s+([A-Z0-9_]+)/)[1];
  const stats = lines[1].match(/db\s+(.*)/)[1].split(",").map((s) => parseInt(s));
  const types = lines[2].match(/db\s+(.*)/)[1].split(",").map((s) => TYPE_NAMES[s.trim()]);
  const catchRate = parseInt(lines[3].match(/db\s+(\d+)/)[1]);
  const baseExp = parseInt(lines[4].match(/db\s+(\d+)/)[1]);
  let li = lines.findIndex((l) => l.startsWith("dw "));
  const lvl1 = lines[li + 1].match(/db\s+(.*)/)[1].split(",").map((s) => s.trim()).filter((s) => s !== "NO_MOVE");
  const growth = lines[li + 2].match(/db\s+([A-Z_]+)/)[1];
  // tmhm: gather all idents after "tmhm" until "db 0"
  const tmhmText = lines.slice(li + 3).join(" ").replace(/\\/g, " ");
  const tmhm = (tmhmText.match(/tmhm\s+(.*?)db 0/s) || [, ""])[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9_]+$/.test(s));
  const base = path.basename(file, ".asm");
  return { dexConst, stats, types, catchRate, baseExp, lvl1, growth, tmhm, base };
}
const baseByDex = [];
for (const f of baseStatsFiles) {
  const b = parseBaseStats(f);
  const dexId = DEX_C.indexOf(b.dexConst);
  baseByDex[dexId] = b;
}

// evolutions + learnsets (internal order)
const evosMoves = {}; // label -> {evolutions, moves}
{
  const lines = readLines("data/pokemon/evos_moves.asm");
  let cur = null;
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9]+)EvosMoves:$/))) {
      cur = { evolutions: [], moves: [], zeros: 0 };
      evosMoves[m[1] + "EvosMoves"] = cur;
    } else if (cur && (m = l.match(/^db\s+(.*)$/))) {
      const parts = m[1].split(",").map((s) => s.trim());
      if (parts[0] === "0" && parts.length === 1) {
        cur.zeros++;
        continue;
      }
      if (cur.zeros === 0) {
        if (parts[0] === "EVOLVE_LEVEL") cur.evolutions.push({ kind: "level", level: parseInt(parts[1]), to: parts[2] });
        else if (parts[0] === "EVOLVE_ITEM") cur.evolutions.push({ kind: "item", item: parts[1], to: parts[3] });
        else if (parts[0] === "EVOLVE_TRADE") cur.evolutions.push({ kind: "trade", to: parts[2] });
      } else if (cur.zeros === 1) {
        cur.moves.push({ level: parseInt(parts[0]), move: parts[1] });
      }
    }
  }
}
const evosPtr = []; // internal id -> label
{
  let i = 1;
  for (const raw of readLines("data/pokemon/evos_moves.asm")) {
    const m = raw.trim().match(/^dw\s+([A-Za-z0-9]+EvosMoves)$/);
    if (m) evosPtr[i++] = m[1];
  }
}

// dex entries: genus, height, weight + flavor label (internal order)
const dexEntryPtr = [];
{
  let i = 1;
  for (const raw of readLines("data/pokemon/dex_entries.asm")) {
    const m = raw.trim().match(/^dw\s+([A-Za-z0-9_]+DexEntry)$/);
    if (m) dexEntryPtr[i++] = m[1];
  }
}
const dexEntries = {}; // label -> {genus,feet,inches,weight,flavorLabel}
{
  const lines = readLines("data/pokemon/dex_entries.asm");
  let cur = null;
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9_]+DexEntry):$/))) {
      cur = {};
      dexEntries[m[1]] = cur;
    } else if (cur) {
      if ((m = l.match(/^db\s+"(.*)@"/))) cur.genus = m[1];
      else if ((m = l.match(/^db\s+(\d+),\s*(\d+)/))) ((cur.feet = parseInt(m[1])), (cur.inches = parseInt(m[2])));
      else if ((m = l.match(/^dw\s+(\d+)$/))) cur.weight = parseInt(m[1]) / 10;
      else if ((m = l.match(/^text_far\s+(_[A-Za-z0-9_]+)/))) cur.flavorLabel = m[1];
    }
  }
}
// dex flavor text
function parseTextBlocks(file) {
  // returns {label: paragraphs[]} where paragraph = lines joined by \n
  const out = {};
  let cur = null,
    paras = null,
    lines = null;
  const flushLine = () => {};
  const finish = () => {
    if (cur) {
      if (lines && lines.length) paras.push(lines.join("\n"));
      out[cur] = paras;
    }
    cur = null;
  };
  for (const raw of read(file).split("\n")) {
    const l = raw.replace(/;.*$/, "").trim();
    let m;
    if ((m = l.match(/^(_?[A-Za-z0-9_]+)::?$/))) {
      finish();
      cur = m[1];
      paras = [];
      lines = [];
      continue;
    }
    if (!cur) continue;
    if ((m = l.match(/^(text|line|cont|next|para|page)\s+"(.*)"$/))) {
      let s = m[2].replace(/@+$/, "").replace(/#/g, "POKé");
      if (m[1] === "para" || m[1] === "page") {
        if (lines.length) paras.push(lines.join("\n"));
        lines = [s];
      } else {
        lines.push(s);
      }
    } else if (/^(done|prompt|dex|text_end|text_waitbutton|text_promptbutton)\b/.test(l)) {
      // block continues until next label; nothing to do
    } else if (/^text_asm\b/.test(l)) {
      paras.scripted = true;
    }
  }
  finish();
  return out;
}
const dexText = parseTextBlocks("data/pokemon/dex_text.asm");

// cries (internal order)
const cries = [];
{
  let i = 1;
  for (const raw of readLines("data/pokemon/cries.asm")) {
    const m = raw.trim().match(/^mon_cry\s+SFX_CRY_([0-9A-F]+),\s*\$([0-9a-fA-F]+),\s*\$([0-9a-fA-F]+)/);
    if (m) cries[i++] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
}

// palettes (dex order incl 0 = missingno)
const monPalettes = [];
{
  let i = 0;
  for (const raw of readLines("data/pokemon/palettes.asm")) {
    const m = raw.trim().match(/^db\s+(PAL_[A-Z0-9_]+)/);
    if (m) monPalettes[i++] = m[1];
  }
}
const sgbPalettes = {}; // PAL_NAME -> [[r,g,b]x4]
{
  const names = [];
  for (const raw of read("data/sgb/sgb_palettes.asm").split("\n")) {
    const m = raw.match(/RGB\s+([0-9, ]+)(?:;\s*(PAL_[A-Z0-9_]+))?/);
    if (m && m[2]) {
      const nums = m[1].split(",").map((s) => parseInt(s.trim()));
      const cols = [];
      for (let i = 0; i < 4; i++) cols.push([nums[i * 3] * 8, nums[i * 3 + 1] * 8, nums[i * 3 + 2] * 8]);
      sgbPalettes[m[2]] = cols;
    }
  }
}

// assemble pokemon.json (by dex id 1..151)
const pokemon = [];
for (let dex = 1; dex <= 151; dex++) {
  const b = baseByDex[dex];
  const internal = dexOrder.findIndex((d) => d === dex);
  const label = evosPtr[internal];
  const em = evosMoves[label] || { evolutions: [], moves: [] };
  const de = dexEntries[dexEntryPtr[internal]] || {};
  pokemon[dex] = {
    dex,
    internal,
    name: monNames[internal - 1],
    constName: SPECIES[internal],
    stats: b.stats, // hp atk def spd spc
    types: b.types,
    catchRate: b.catchRate,
    baseExp: b.baseExp,
    growth: b.growth,
    lvl1Moves: b.lvl1,
    learnset: em.moves,
    evolutions: em.evolutions,
    tmhm: b.tmhm,
    sprite: b.base,
    genus: de.genus || "",
    heightFt: de.feet || 0,
    heightIn: de.inches || 0,
    weightLbs: de.weight || 0,
    flavor: (dexText[de.flavorLabel] || []).slice(0, 9),
    cry: cries[internal] || [0, 128, 64],
    palette: monPalettes[dex] || "PAL_MEWMON",
  };
}
writeJSON("pokemon.json", { pokemon, speciesByConst: SPECIES });

// ---------- moves ----------
const moveRows = [];
{
  for (const raw of readLines("data/moves/moves.asm")) {
    const m = raw.trim().match(/^move\s+([A-Z0-9_]+),\s*([A-Z0-9_]+),\s*(\d+),\s*([A-Z_]+),\s*(\d+),\s*(\d+)/);
    if (m) moveRows.push({ name: m[1], effect: m[2], power: parseInt(m[3]), type: TYPE_NAMES[m[4]], accuracy: parseInt(m[5]), pp: parseInt(m[6]) });
  }
}
const moveNames = parseLiList("data/moves/names.asm");
moveRows.forEach((mv, i) => (mv.display = moveNames[i] || mv.name));
writeJSON("moves.json", { moves: moveRows, tmMoves: TM_MOVES, hmMoves: HM_MOVES });

// ---------- type chart ----------
const matchups = [];
for (const raw of readLines("data/types/type_matchups.asm")) {
  const m = raw.trim().match(/^db\s+([A-Z_]+),\s*([A-Z_]+),\s*([A-Z_]+)/);
  if (m && TYPE_NAMES[m[1]]) {
    const eff = m[3] === "SUPER_EFFECTIVE" ? 2 : m[3] === "NOT_VERY_EFFECTIVE" ? 0.5 : 0;
    matchups.push([TYPE_NAMES[m[1]], TYPE_NAMES[m[2]], eff]);
  }
}
writeJSON("types.json", { matchups });

// ---------- items ----------
const itemNames = parseLiList("data/items/names.asm");
const itemPrices = [];
for (const raw of readLines("data/items/prices.asm")) {
  const m = raw.trim().match(/^bcd3\s+(\d+)/);
  if (m) itemPrices.push(parseInt(m[1]));
}
const keyItems = [];
for (const raw of readLines("data/items/key_items.asm")) {
  const m = raw.trim().match(/^dbit\s+(TRUE|FALSE)/);
  if (m) keyItems.push(m[1] === "TRUE");
}
const tmPrices = [];
for (const raw of readLines("data/items/tm_prices.asm")) {
  const m = raw.trim().match(/^bcd3?\s+(\d+)/) || raw.trim().match(/^db\s+(\d+)/);
  if (m) tmPrices.push(parseInt(m[1]));
}
const items = [];
for (let i = 1; i < ITEMS_C.length; i++) {
  if (!ITEMS_C[i]) continue;
  let name = itemNames[i - 1] || ITEMS_C[i];
  let price = itemPrices[i - 1] || 0;
  const tm = ITEMS_C[i].match(/^TM(\d+)$/);
  const hm = ITEMS_C[i].match(/^HM(\d+)$/);
  if (tm) {
    name = `TM${tm[1]}`;
    price = (tmPrices[parseInt(tm[1]) - 1] || 0) * 1000;
  }
  if (hm) {
    name = `HM${hm[1]}`;
    price = 0;
  }
  items[i] = { id: i, constName: ITEMS_C[i], name, price, key: keyItems[i - 1] || !!hm };
}
writeJSON("items.json", { items });

// marts
const marts = {};
{
  let label = null;
  for (const raw of readLines("data/items/marts.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9_]+)::?$/))) label = m[1];
    else if (label && (m = l.match(/^script_mart\s+(.*)$/))) {
      marts[label] = m[1].split(",").map((s) => s.trim());
      label = null;
    }
  }
}
writeJSON("marts.json", marts);

// ---------- trainers ----------
const trainerNames = parseLiList("data/trainers/names.asm");
const parties = {}; // class const -> [ {level(s), species[]} ]
{
  const classOrder = [];
  for (const raw of readLines("data/trainers/parties.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9]+)Data:$/))) {
      classOrder.push(m[1]);
      parties[classOrder.length] = [];
    } else if (classOrder.length && (m = l.match(/^db\s+(.*)$/))) {
      const parts = m[1].split(",").map((s) => s.trim()).filter((s) => s !== "0" || true);
      const arr = parts.filter((s) => s !== "");
      const cls = parties[classOrder.length];
      if (arr[0] === "$FF") {
        const mons = [];
        for (let i = 1; i + 1 < arr.length; i += 2) mons.push({ level: parseInt(arr[i]), species: arr[i + 1] });
        cls.push({ mons });
      } else {
        const lvl = parseInt(arr[0]);
        const mons = arr.slice(1).filter((s) => s !== "0").map((sp) => ({ level: lvl, species: sp }));
        cls.push({ mons });
      }
    }
  }
}
const trainerMoney = [];
for (const raw of readLines("data/trainers/pic_pointers_money.asm")) {
  const m = raw.trim().match(/^pic_money\s+([A-Za-z0-9]+)Pic,\s*(\d+)/);
  // Engine adds only the top two BCD bytes (AddBCD from wTrainerBaseMoney+1
  // walking backwards), so the effective base = table value / 100.
  if (m) trainerMoney.push({ pic: m[1], money: Math.floor(parseInt(m[2]) / 100) });
}
const specialMoves = [];
{
  const lines = readLines("data/trainers/special_moves.asm").map((l) => l.trim()).filter((l) => l.startsWith("db"));
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(/^db\s+([A-Z_0-9]+),\s*(\d+)/);
    if (!head) {
      i++;
      continue;
    }
    const entry = { class: head[1], trainerId: parseInt(head[2]), moves: [] };
    i++;
    while (i < lines.length) {
      const row = lines[i].match(/^db\s+(\d+),\s*(\d+),\s*([A-Z_0-9]+)$/);
      if (!row) break;
      entry.moves.push({ mon: parseInt(row[1]), slot: parseInt(row[2]), move: row[3] });
      i++;
    }
    specialMoves.push(entry);
    i++; // skip terminator db 0
  }
}
writeJSON("trainers.json", { classNames: trainerNames, classConsts: TRAINER_C, parties, money: trainerMoney, specialMoves });

// ---------- tilesets ----------
const tilesetHeaders = [];
for (const raw of readLines("data/tilesets/tileset_headers.asm")) {
  const m = raw.trim().match(/^tileset\s+([A-Za-z0-9]+),\s*(-?\$?[0-9a-fA-F]+),\s*(-?\$?[0-9a-fA-F]+),\s*(-?\$?[0-9a-fA-F]+),\s*(-?\$?[0-9a-fA-F]+),\s*([A-Z_]+)/);
  if (m) {
    const num = (s) => (s.startsWith("-") ? -1 : parseNum(s));
    tilesetHeaders.push({ name: m[1], counterTiles: [num(m[2]), num(m[3]), num(m[4])].filter((x) => x >= 0), grassTile: num(m[5]), anim: m[6] });
  }
}
// gfx/blockset file mapping via stacked labels
const tsGfx = {}, tsBlock = {};
{
  let pendingGfx = [], pendingBlock = [];
  for (const raw of readLines("gfx/tilesets.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9]+)_GFX::?(?:\s+INCBIN\s+"gfx\/tilesets\/([a-z_0-9]+)\.2bpp")?/))) {
      pendingGfx.push(m[1]);
      if (m[2]) {
        for (const n of pendingGfx) tsGfx[n] = m[2];
        pendingGfx = [];
      }
    } else if ((m = l.match(/^([A-Za-z0-9]+)_Block::?(?:\s+INCBIN\s+"gfx\/blocksets\/([a-z_0-9]+)\.bst")?/))) {
      pendingBlock.push(m[1]);
      if (m[2]) {
        for (const n of pendingBlock) tsBlock[n] = m[2];
        pendingBlock = [];
      }
    } else if ((m = l.match(/^INCBIN\s+"gfx\/tilesets\/([a-z_0-9]+)\.2bpp"/)) && pendingGfx.length) {
      for (const n of pendingGfx) tsGfx[n] = m[1];
      pendingGfx = [];
    } else if ((m = l.match(/^INCBIN\s+"gfx\/blocksets\/([a-z_0-9]+)\.bst"/)) && pendingBlock.length) {
      for (const n of pendingBlock) tsBlock[n] = m[1];
      pendingBlock = [];
    }
  }
}
// collision lists with stacked labels
const tsColl = {};
{
  let pending = [];
  for (const raw of readLines("data/tilesets/collision_tile_ids.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9]+)_Coll::?$/))) pending.push(m[1]);
    else if ((m = l.match(/^coll_tiles\s*(.*)$/))) {
      const tiles = m[1] ? m[1].split(",").map((s) => parseNum(s.trim())).filter((n) => !isNaN(n)) : [];
      for (const n of pending) tsColl[n] = tiles;
      pending = [];
    }
  }
}
// warp tiles per tileset (pointer table order = tileset ids)
const warpTilesByTs = {};
{
  const ptrs = [];
  let section = null;
  for (const raw of readLines("data/tilesets/warp_tile_ids.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^dw\s+\.([A-Za-z0-9]+)WarpTileIDs$/))) ptrs.push(m[1]);
    else if ((m = l.match(/^\.([A-Za-z0-9]+)WarpTileIDs:$/))) section = m[1];
    else if (section && (m = l.match(/^warp_tiles\s*(.*)$/))) {
      const tiles = m[1] ? m[1].split(",").map((s) => parseNum(s.trim())) : [];
      warpTilesByTs[section] = tiles;
      section = null;
    }
  }
  // map pointer order to tileset id
  ptrs.forEach((name, i) => {
    if (!(name in warpTilesByTs)) warpTilesByTs[name] = [];
    warpTilesByTs[TILESETS_C[i]] = warpTilesByTs[name];
  });
}
// door tiles
const doorTilesByTs = {};
{
  const sections = {};
  let secName = null;
  const pendingRefs = [];
  for (const raw of readLines("data/tilesets/door_tile_ids.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^dbw\s+([A-Z_0-9]+),\s*\.([A-Za-z0-9]+)$/))) pendingRefs.push([m[1], m[2]]);
    else if ((m = l.match(/^\.([A-Za-z0-9]+):$/))) secName = m[1];
    else if (secName && (m = l.match(/^door_tiles\s*(.*)$/))) {
      sections[secName] = m[1] ? m[1].split(",").map((s) => parseNum(s.trim())) : [];
      secName = null;
    }
  }
  for (const [ts, sec] of pendingRefs) doorTilesByTs[ts] = sections[sec] || [];
}
// ledges
const ledges = [];
for (const raw of readLines("data/tilesets/ledge_tiles.asm")) {
  const m = raw.trim().match(/^db\s+SPRITE_FACING_([A-Z]+),\s*\$([0-9a-fA-F]+),\s*\$([0-9a-fA-F]+),\s*PAD_([A-Z]+)/);
  if (m) ledges.push({ facing: m[1], standOn: parseInt(m[2], 16), ledge: parseInt(m[3], 16), input: m[4] });
}
// pair collisions
const pairColl = { land: [], water: [] };
{
  let mode = null;
  for (const raw of readLines("data/tilesets/pair_collision_tile_ids.asm")) {
    const l = raw.trim();
    if (l.startsWith("TilePairCollisionsLand")) mode = "land";
    else if (l.startsWith("TilePairCollisionsWater")) mode = "water";
    else {
      const m = l.match(/^db\s+([A-Z_0-9]+),\s*\$([0-9a-fA-F]+),\s*\$([0-9a-fA-F]+)/);
      if (m && mode) pairColl[mode].push({ tileset: m[1], a: parseInt(m[2], 16), b: parseInt(m[3], 16) });
    }
  }
}
// water tilesets
const waterTilesets = [];
for (const raw of readLines("data/tilesets/water_tilesets.asm")) {
  const m = raw.trim().match(/^db\s+([A-Z_0-9]+)$/);
  if (m && m[1] !== "-1") waterTilesets.push(m[1]);
}
// blocksets binary -> arrays
const blocksets = {};
for (const name of new Set(Object.values(tsBlock))) {
  const buf = fs.readFileSync(path.join(PY, "gfx", "blocksets", `${name}.bst`));
  const blocks = [];
  for (let i = 0; i + 16 <= buf.length; i += 16) blocks.push([...buf.subarray(i, i + 16)]);
  blocksets[name] = blocks;
}
const tilesets = tilesetHeaders.map((h, id) => ({
  id,
  name: h.name,
  constName: TILESETS_C[id],
  gfx: tsGfx[h.name],
  blockset: tsBlock[h.name],
  coll: tsColl[h.name] || [],
  counterTiles: h.counterTiles,
  grassTile: h.grassTile,
  anim: h.anim,
  warpTiles: warpTilesByTs[TILESETS_C[id]] || [],
  doorTiles: doorTilesByTs[TILESETS_C[id]] || [],
}));
writeJSON("tilesets.json", { tilesets, blocksets, ledges, pairColl, waterTilesets });

// ---------- maps ----------
// header label per map id
const headerLabels = [];
for (const raw of readLines("data/maps/map_header_pointers.asm")) {
  const m = raw.trim().match(/^dw\s+([A-Za-z0-9]+)_h$/);
  if (m) headerLabels.push(m[1]);
}
// wild data: label per map id
const wildPtr = [];
for (const raw of readLines("data/wild/grass_water.asm")) {
  const m = raw.trim().match(/^dw\s+([A-Za-z0-9]+)$/);
  if (m) wildPtr.push(m[1]);
}
// parse all wild files
const wildData = {}; // label -> {grassRate, grass[], waterRate, water[]}
for (const f of fs.readdirSync(path.join(PY, "data", "wild", "maps"))) {
  const lines = readLines(path.join("data", "wild", "maps", f));
  let label = null,
    mode = null;
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^([A-Za-z0-9]+):$/))) {
      label = m[1];
      wildData[label] = { grassRate: 0, grass: [], waterRate: 0, water: [] };
    } else if (label && (m = l.match(/^def_grass_wildmons\s+(\d+)/))) {
      wildData[label].grassRate = parseInt(m[1]);
      mode = "grass";
    } else if (label && (m = l.match(/^def_water_wildmons\s+(\d+)/))) {
      wildData[label].waterRate = parseInt(m[1]);
      mode = "water";
    } else if (label && mode && (m = l.match(/^db\s+(\d+),\s*([A-Z_0-9]+)/))) {
      wildData[label][mode].push({ level: parseInt(m[1]), species: m[2] });
    }
  }
}

// global text labels from text/*.asm
const globalTexts = {};
for (const f of fs.readdirSync(path.join(PY, "text"))) {
  if (!f.endsWith(".asm")) continue;
  Object.assign(globalTexts, parseTextBlocks(path.join("text", f)));
}

function parseMapObjects(label) {
  const file = path.join("data", "maps", "objects", `${label}.asm`);
  if (!fs.existsSync(path.join(PY, file))) return null;
  const out = { border: 0, warps: [], signs: [], objects: [] };
  let ifDepth = 0;
  for (const raw of readLines(file)) {
    const l = raw.trim();
    if (/^IF\s/.test(l)) {
      ifDepth++;
      continue;
    }
    if (/^ENDC/.test(l)) {
      ifDepth = Math.max(0, ifDepth - 1);
      continue;
    }
    if (ifDepth > 0) continue; // skip debug-only blocks
    let m;
    if ((m = l.match(/^db\s+\$?([0-9a-fA-F]+)$/)) && out.warps.length === 0 && out.objects.length === 0 && out.signs.length === 0 && !out._b) {
      out.border = l.includes("$") ? parseInt(m[1], 16) : parseInt(m[1]);
      out._b = true;
    } else if ((m = l.match(/^warp_event\s+(-?\d+),\s*(-?\d+),\s*([A-Z_0-9]+),\s*(\d+)/))) {
      out.warps.push({ x: parseInt(m[1]), y: parseInt(m[2]), dest: m[3], destWarp: parseInt(m[4]) });
    } else if ((m = l.match(/^bg_event\s+(-?\d+),\s*(-?\d+),\s*TEXT_([A-Z_0-9]+)/))) {
      out.signs.push({ x: parseInt(m[1]), y: parseInt(m[2]), textId: m[3] });
    } else if ((m = l.match(/^object_event\s+(.*)$/))) {
      const a = m[1].split(",").map((s) => s.trim());
      const obj = { x: parseInt(a[0]), y: parseInt(a[1]), sprite: a[2], movement: a[3], dir: a[4], textId: a[5].replace(/^TEXT_/, "") };
      if (a.length >= 8 && a[6].startsWith("OPP_")) {
        obj.trainerClass = a[6].slice(4);
        obj.trainerId = parseInt(a[7]);
      } else if (a.length >= 8) {
        obj.pokemon = a[6];
        obj.level = parseInt(a[7]);
      } else if (a.length === 7) {
        obj.item = a[6];
      }
      out.objects.push(obj);
    }
  }
  delete out._b;
  return out;
}

function parseMapScriptsText(label) {
  const file = path.join("scripts", `${label}.asm`);
  const result = { textPointers: {}, trainerHeaders: [], labelInfo: {} };
  if (!fs.existsSync(path.join(PY, file))) return result;
  const src = read(file);
  // text pointers
  const tpRe = /dw_const\s+([A-Za-z0-9_]+),\s*TEXT_([A-Z_0-9]+)/g;
  let m;
  while ((m = tpRe.exec(src))) result.textPointers[m[2]] = m[1];
  // trainer headers
  const thRe = /([A-Za-z0-9_]+TrainerHeader(\d+)):\s*\n\s*trainer\s+(EVENT_[A-Z_0-9]+),\s*(\d+),\s*([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+)/g;
  while ((m = thRe.exec(src))) {
    result.trainerHeaders[parseInt(m[2])] = { event: m[3], range: parseInt(m[4]), battleText: m[5], endText: m[6], afterText: m[7] };
  }
  // label bodies: figure out text_far / trainer binding / mart
  const lines = src.split("\n");
  let cur = null;
  for (const raw of lines) {
    const l = raw.replace(/;.*$/, "").trim();
    let mm;
    if ((mm = l.match(/^([A-Za-z0-9_]+)::?$/))) {
      cur = mm[1];
      result.labelInfo[cur] = result.labelInfo[cur] || {};
    } else if (cur) {
      if ((mm = l.match(/^text_far\s+(_[A-Za-z0-9_]+)/))) result.labelInfo[cur].far = mm[1];
      else if ((mm = l.match(/TrainerHeader(\d+)\b/))) result.labelInfo[cur].trainerHeader = parseInt(mm[1]);
      else if (/^text_asm\b/.test(l)) result.labelInfo[cur].scripted = true;
    }
  }
  return result;
}

function parseHeader(label) {
  const file = path.join("data", "maps", "headers", `${label}.asm`);
  const out = { tileset: null, connections: [] };
  for (const raw of readLines(file)) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^map_header\s+([A-Za-z0-9]+),\s*([A-Z_0-9]+),\s*([A-Z_0-9]+)/))) out.tileset = m[3];
    else if ((m = l.match(/^connection\s+(north|south|east|west),\s*([A-Za-z0-9]+),\s*([A-Z_0-9]+),\s*(-?\d+)/))) {
      out.connections.push({ dir: m[1], mapConst: m[3], offset: parseInt(m[4]) });
    }
  }
  return out;
}

// ---------- hidden events (PCs, hidden items, statues...) ----------
const hiddenEvents = {}; // map const -> [{x,y,routine,arg}]
{
  let cur = null;
  for (const raw of readLines("data/events/hidden_events.asm")) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^hidden_events_for\s+([A-Z_0-9]+)/))) {
      cur = m[1];
      hiddenEvents[cur] = [];
    } else if (cur && (m = l.match(/^hidden_event\s+(-?\d+),\s*(-?\d+),\s*(\w+)(?:,\s*([A-Za-z_0-9]+))?/))) {
      hiddenEvents[cur].push({ x: parseInt(m[1]), y: parseInt(m[2]), routine: m[3], arg: m[4] ?? null });
    } else if (cur && (m = l.match(/^hidden_text_predef\s+(-?\d+),\s*(-?\d+),\s*(\w+),\s*([A-Za-z_0-9]+)/))) {
      hiddenEvents[cur].push({ x: parseInt(m[1]), y: parseInt(m[2]), routine: m[3], arg: m[4] });
    }
  }
}

const mapsOut = {};
const seenLabels = new Set();
for (let id = 0; id < MAPS_C.length; id++) {
  const mc = MAPS_C[id];
  if (!mc || mc.name.startsWith("UNUSED")) continue;
  const label = headerLabels[id];
  if (!label || seenLabels.has(label)) continue;
  seenLabels.add(label);
  const header = parseHeader(label);
  const objects = parseMapObjects(label);
  const st = parseMapScriptsText(label);
  // resolve texts
  const texts = {}; // TEXT id -> {paras}|{scripted}|{mart}|{trainerHeader}
  for (const [tid, lab] of Object.entries(st.textPointers)) {
    const info = st.labelInfo[lab] || {};
    if (info.far && globalTexts[info.far]) texts[tid] = { paras: globalTexts[info.far] };
    else if (info.trainerHeader !== undefined) texts[tid] = { trainerHeader: info.trainerHeader };
    else if (marts[lab]) texts[tid] = { mart: lab };
    else if (globalTexts[lab]) texts[tid] = { paras: globalTexts[lab] };
    else texts[tid] = { scripted: true };
  }
  const trainerHeaders = st.trainerHeaders.map((th) =>
    th
      ? {
          event: th.event,
          range: th.range,
          battle: globalTexts[(st.labelInfo[th.battleText] || {}).far] || null,
          end: globalTexts[(st.labelInfo[th.endText] || {}).far] || null,
          after: globalTexts[(st.labelInfo[th.afterText] || {}).far] || null,
        }
      : null
  );
  // blk
  const blkPath = path.join(PY, "maps", `${label}.blk`);
  let blocks = [];
  if (fs.existsSync(blkPath)) blocks = [...fs.readFileSync(blkPath)];
  const wildLabel = wildPtr[id];
  mapsOut[mc.name] = {
    id,
    name: mc.name,
    label,
    w: mc.w,
    h: mc.h,
    tileset: header.tileset,
    connections: header.connections,
    border: objects ? objects.border : 0,
    warps: objects ? objects.warps : [],
    signs: objects ? objects.signs : [],
    objects: objects ? objects.objects : [],
    blocks,
    wild: wildLabel && wildData[wildLabel] ? wildData[wildLabel] : null,
    texts,
    trainerHeaders,
    hidden: hiddenEvents[mc.name] || [],
  };
}
writeJSON("maps.json", mapsOut);

// ---------- charmap ----------
const charmap = {};
for (const raw of read("constants/charmap.asm").split("\n")) {
  const m = raw.match(/charmap\s+"((?:[^"\\]|\\.)+)",\s*\$([0-9a-fA-F]+)/);
  if (m) charmap[m[1]] = parseInt(m[2], 16);
}
writeJSON("charmap.json", charmap);

// ---------- palettes for towns/overworld ----------
writeJSON("palettes.json", sgbPalettes);

// ---------- copy images ----------
const manifest = {};
function copyDir(srcRel, dstRel, filter = (f) => f.endsWith(".png")) {
  const src = path.join(PY, srcRel);
  const dst = path.join(OUT_ASSETS, dstRel);
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  manifest[dstRel] = manifest[dstRel] || [];
  for (const f of fs.readdirSync(src)) {
    if (!filter(f)) continue;
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
    manifest[dstRel].push(f);
    n++;
  }
  console.log(`copied ${n} -> assets/${dstRel}`);
}
copyDir("gfx/tilesets", "tilesets");
copyDir("gfx/tilesets/flower", "tilesets/flower");
copyDir("gfx/sprites", "sprites");
copyDir("gfx/pokemon/front", "pokemon/front");
copyDir("gfx/pokemon/back", "pokemon/back");
copyDir("gfx/trainers", "trainers");
copyDir("gfx/font", "font");
copyDir("gfx/emotes", "emotes");
// player pics (front for intro/trainer card, back for battles)
for (const f of ["red.png", "redb.png"]) {
  fs.copyFileSync(path.join(PY, "gfx", "player", f), path.join(OUT_ASSETS, "trainers", f));
  manifest["trainers"].push(f);
}
fs.copyFileSync(path.join(PY, "gfx", "battle", "ghost.png"), path.join(OUT_ASSETS, "pokemon", "front", "ghost.png"));
manifest["pokemon/front"].push("ghost.png");

// sprite const -> file mapping
const spriteFiles = {};
{
  let i = 1;
  for (const raw of readLines("data/sprites/sprites.asm")) {
    const m = raw.trim().match(/^overworld_sprite\s+([A-Za-z0-9]+)Sprite,\s*(\d+)/);
    if (m) {
      const snake = m[1].replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
      spriteFiles[SPRITES_C[i] || `SPRITE_${i}`] = { file: snake, tiles: parseInt(m[2]) };
      i++;
    }
  }
  // verify
  for (const [k, v] of Object.entries(spriteFiles)) {
    if (!fs.existsSync(path.join(PY, "gfx", "sprites", `${v.file}.png`))) console.warn(`missing sprite png: ${k} -> ${v.file}`);
  }
}
writeJSON("sprites.json", spriteFiles);

// trainer pics mapping
const trainerPics = {};
trainerMoney.forEach((t, i) => {
  const cls = TRAINER_C[i + 1];
  const base = t.pic.toLowerCase().replace(/_/g, "");
  const dotted = t.pic.replace(/([a-z0-9])([A-Z])/, "$1.$2").toLowerCase().replace(/_/g, "");
  const candidates = [base, t.pic.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(), dotted];
  let file = null;
  for (const c of candidates) {
    if (fs.existsSync(path.join(PY, "gfx", "trainers", `${c}.png`))) {
      file = c;
      break;
    }
  }
  if (!file) console.warn(`missing trainer pic for ${cls}: tried ${candidates.join(",")}`);
  trainerPics[cls] = { file, money: t.money };
});
writeJSON("trainer_pics.json", trainerPics);
writeJSON("manifest.json", manifest);

console.log("done.");
