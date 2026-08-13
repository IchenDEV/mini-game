// Overworld engine: tile rendering, collision, connections, warps, NPCs,
// Pikachu follower, wild encounters, trainer line-of-sight.
import { D, type MapData, type MapObjectDef, type Tileset } from "./data";
import { S, type Dir } from "./state";
import { Game, type Scene } from "./game";
import { tinted, type RGB, GRAYS } from "../core/gfx";
import { Input } from "../core/input";
import { nextFrame } from "../core/frame";
import { SFX } from "../core/audio";
import { hasImage } from "../core/loader";
import { drawText } from "../core/font";
import { Hooks } from "./hooks";

export const DIRV: Record<Dir, [number, number]> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const STEP_FRAMES = 16;
// tilesets where tile $14 is actual water (from data/tilesets/water_tilesets.asm)
const WATER_TILESETS = new Set(["OVERWORLD", "FOREST", "DOJO", "GYM", "SHIP", "SHIP_PORT", "CAVERN", "FACILITY", "PLATEAU"]);

const TOWN_PALS: Record<string, string> = {
  PALLET_TOWN: "PAL_PALLET", VIRIDIAN_CITY: "PAL_VIRIDIAN", PEWTER_CITY: "PAL_PEWTER",
  CERULEAN_CITY: "PAL_CERULEAN", LAVENDER_TOWN: "PAL_LAVENDER", VERMILION_CITY: "PAL_VERMILION",
  CELADON_CITY: "PAL_CELADON", FUCHSIA_CITY: "PAL_FUCHSIA", CINNABAR_ISLAND: "PAL_CINNABAR",
  INDIGO_PLATEAU: "PAL_INDIGO", SAFFRON_CITY: "PAL_SAFFRON",
};

// OBJ palettes (shade0 transparent, then light->dark)
const OBJ_PALS: Record<string, RGB[]> = {
  RED: [[255, 255, 255], [255, 245, 235], [216, 40, 40], [16, 16, 24]],
  YELLOW: [[255, 255, 255], [248, 216, 88], [200, 128, 32], [16, 16, 24]],
  BLUE: [[255, 255, 255], [240, 240, 255], [64, 88, 216], [16, 16, 24]],
  GREEN: [[255, 255, 255], [235, 255, 235], [56, 144, 80], [16, 16, 24]],
  GRAY: [[255, 255, 255], [240, 240, 240], [120, 120, 128], [16, 16, 24]],
  PINK: [[255, 255, 255], [255, 240, 240], [216, 96, 136], [16, 16, 24]],
  BROWN: [[255, 255, 255], [248, 232, 208], [144, 96, 56], [16, 16, 24]],
};
const SPRITE_PAL: Record<string, string> = {
  red: "RED", pikachu: "YELLOW", blue: "BLUE", oak: "GRAY", scientist: "GRAY", nurse: "PINK",
  girl: "PINK", lass: "PINK", daisy: "PINK", mom: "PINK", brunette_girl: "PINK", little_girl: "PINK",
  beauty: "PINK", granny: "PINK", old_amber: "BROWN", poke_ball: "RED", fossil: "GRAY", boulder: "GRAY",
  monster: "GREEN", fairy: "PINK", bird: "BROWN", clefairy: "PINK", jigglypuff: "PINK", chansey: "PINK",
  machoke: "GRAY", slowbro: "PINK", lapras: "BLUE", surfing_pikachu: "YELLOW", snorlax: "GREEN",
  guard: "GRAY", rocket: "GRAY", jessie: "PINK", james: "BLUE", brock: "BROWN", misty: "RED",
};

export interface NPC {
  idx: number;
  def: MapObjectDef;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  dir: Dir;
  stepFrom: { x: number; y: number } | null;
  stepT: number;
  walkTimer: number;
  hidden: boolean;
  emote: { name: string; t: number } | null;
  spriteFile: string;
  frames: number;
  noClip?: boolean;
}

const DIR_FROM_CONST: Record<string, Dir> = { UP: "UP", DOWN: "DOWN", LEFT: "LEFT", RIGHT: "RIGHT", NONE: "DOWN" };

export class Overworld implements Scene {
  map!: MapData;
  tileset!: Tileset;
  tiles!: Uint8Array; // tile grid (w*4) x (h*4)
  tw = 0; // tiles wide
  th = 0;
  npcs: NPC[] = [];
  player = { x: 0, y: 0, dir: "DOWN" as Dir, stepFrom: null as { x: number; y: number } | null, stepT: 0, jumping: false, turnCd: 0, surfing: false };
  follower = { active: false, x: 0, y: 0, dir: "DOWN" as Dir, stepFrom: null as { x: number; y: number } | null, stepT: 0 };
  locked = 0; // >0: player input disabled (scripts)
  justWarped = false;
  paletteName = "PAL_PALLET";
  animT = 0;
  stepsSinceSpawn = 0;
  private connCache: Record<string, MapData | undefined> = {};
  pendingDoorSquare: { x: number; y: number } | null = null;

  // ---------- map entry ----------
  async enter(mapName: string, x: number, y: number, dir: Dir = "DOWN", opts: { keepFollower?: boolean } = {}) {
    const map = D.maps[mapName];
    if (!map) throw new Error(`no map ${mapName}`);
    this.map = map;
    this.tileset = D.tilesetByConst.get(map.tileset)!;
    this.tw = map.w * 4;
    this.th = map.h * 4;
    this.buildTiles();
    this.player.x = x;
    this.player.y = y;
    this.player.dir = dir;
    this.player.stepFrom = null;
    this.player.stepT = 0;
    if (TOWN_PALS[mapName]) this.paletteName = TOWN_PALS[mapName];
    else if (mapName.startsWith("ROUTE_")) this.paletteName = "PAL_ROUTE";
    else if (this.tileset.constName === "CAVERN") this.paletteName = "PAL_PEWTER";
    else if (this.tileset.constName === "FOREST") this.paletteName = "PAL_VIRIDIAN";
    this.connCache = {};
    for (const c of map.connections) this.connCache[c.dir] = D.maps[c.mapConst];
    this.spawnNpcs();
    S.map = mapName;
    S.x = x;
    S.y = y;
    S.dir = dir;
    if (this.isOutdoor(mapName)) S.lastOutdoor = { map: mapName, x, y };
    // follower snaps behind player
    this.follower.x = x;
    this.follower.y = y;
    this.follower.stepFrom = null;
    this.updateFollowerActive();
    this.justWarped = true;
    this.stepsSinceSpawn = 0;
    await Hooks.onMapEnter?.(mapName, this);
  }

  isOutdoor(name: string): boolean {
    return !!TOWN_PALS[name] || name.startsWith("ROUTE_");
  }

  private buildTiles() {
    const { map } = this;
    const bs = D.blocksets[this.tileset.blockset];
    this.tiles = new Uint8Array(this.tw * this.th);
    for (let by = 0; by < map.h; by++)
      for (let bx = 0; bx < map.w; bx++) {
        const block = bs[map.blocks[by * map.w + bx]] || bs[0];
        for (let t = 0; t < 16; t++) {
          const tx = bx * 4 + (t % 4);
          const ty = by * 4 + (t >> 2);
          this.tiles[ty * this.tw + tx] = block[t];
        }
      }
  }

  spawnNpcs() {
    this.npcs = [];
    this.map.objects.forEach((def, idx) => {
      if (S.hasFlag(`HIDE_${this.map.name}_${idx}`)) return;
      if (def.item && S.hasFlag(`GOT_${this.map.name}_${idx}`)) return;
      const sp = D.sprites[def.sprite];
      const file = sp?.file ?? "youngster";
      this.npcs.push({
        idx,
        def,
        x: def.x,
        y: def.y,
        spawnX: def.x,
        spawnY: def.y,
        dir: DIR_FROM_CONST[def.dir] || "DOWN",
        stepFrom: null,
        stepT: 0,
        walkTimer: 30 + Math.floor(Math.random() * 120),
        hidden: false,
        emote: null,
        spriteFile: file,
        frames: sp ? (sp.tiles >= 12 ? 6 : 1) : 6,
      });
    });
  }

  spawnExtraNpc(def: MapObjectDef, file?: string): NPC {
    const sp = D.sprites[def.sprite];
    const npc: NPC = {
      idx: 1000 + this.npcs.length,
      def,
      x: def.x,
      y: def.y,
      spawnX: def.x,
      spawnY: def.y,
      dir: DIR_FROM_CONST[def.dir] || "DOWN",
      stepFrom: null,
      stepT: 0,
      walkTimer: 999999,
      hidden: false,
      emote: null,
      spriteFile: file ?? sp?.file ?? "youngster",
      frames: 6,
    };
    this.npcs.push(npc);
    return npc;
  }

  updateFollowerActive() {
    const starter = S.party.find((m) => D.pokemon[m.dex]?.constName === "PIKACHU" && m.otId === S.playerId);
    this.follower.active = !!starter && S.hasFlag("GOT_PIKACHU");
  }

  // ---------- tile helpers ----------
  tileAt(tx: number, ty: number): number {
    if (tx >= 0 && ty >= 0 && tx < this.tw && ty < this.th) return this.tiles[ty * this.tw + tx];
    // try connections
    const n = this.neighborBlockTile(tx, ty);
    if (n >= 0) return n;
    const bs = D.blocksets[this.tileset.blockset];
    const block = bs[this.map.border] || bs[0];
    return block[(((ty % 4) + 4) % 4) * 4 + (((tx % 4) + 4) % 4)];
  }

  private neighborBlockTile(tx: number, ty: number): number {
    const bx = Math.floor(tx / 4);
    const by = Math.floor(ty / 4);
    for (const c of this.map.connections) {
      const nm = this.connCache[c.dir];
      if (!nm) continue;
      let nbx = -1, nby = -1;
      if (c.dir === "north" && by < 0) { nby = nm.h + by; nbx = bx - c.offset; }
      else if (c.dir === "south" && by >= this.map.h) { nby = by - this.map.h; nbx = bx - c.offset; }
      else if (c.dir === "west" && bx < 0) { nbx = nm.w + bx; nby = by - c.offset; }
      else if (c.dir === "east" && bx >= this.map.w) { nbx = bx - this.map.w; nby = by - c.offset; }
      else continue;
      if (nbx < 0 || nby < 0 || nbx >= nm.w || nby >= nm.h) continue;
      const nts = D.tilesetByConst.get(nm.tileset)!;
      const bs = D.blocksets[nts.blockset];
      const block = bs[nm.blocks[nby * nm.w + nbx]] || bs[0];
      return block[(((ty % 4) + 4) % 4) * 4 + (((tx % 4) + 4) % 4)];
    }
    return -1;
  }

  standTile(sx: number, sy: number): number {
    return this.tileAt(sx * 2, sy * 2 + 1);
  }

  isWater(tile: number): boolean {
    return tile === 0x14 && WATER_TILESETS.has(this.tileset.constName);
  }

  walkableTile(tile: number): boolean {
    return this.tileset.coll.includes(tile);
  }

  npcAtSquare(x: number, y: number): NPC | null {
    for (const n of this.npcs) {
      if (n.hidden) continue;
      if (n.x === x && n.y === y) return n;
      if (n.stepFrom && n.stepFrom.x === x && n.stepFrom.y === y) return n;
    }
    return null;
  }

  canStep(fromX: number, fromY: number, dir: Dir, forNpc = false): boolean {
    const [dx, dy] = DIRV[dir];
    const tx = fromX + dx;
    const ty = fromY + dy;
    const inBounds = tx >= 0 && ty >= 0 && tx < this.map.w * 2 && ty < this.map.h * 2;
    if (!inBounds) {
      if (forNpc) return false;
      // connection crossing allowed if connection exists that direction
      const side = dir === "UP" ? "north" : dir === "DOWN" ? "south" : dir === "LEFT" ? "west" : "east";
      if (!this.connCache[side]) return false;
    }
    const target = this.standTile(tx, ty);
    const cur = this.standTile(fromX, fromY);
    if (!this.walkableTile(target)) {
      if (!forNpc && this.player.surfing && this.isWater(target)) {
        // continue surfing
      } else if (!forNpc && this.isWater(cur) && this.player.surfing && this.walkableTile(target)) {
        // landing
      } else if (!forNpc && this.isWater(target)) {
        return false;
      } else {
        return false;
      }
    } else if (!forNpc && this.player.surfing && !this.isWater(target)) {
      // landing on shore: ok
    }
    // pair collisions (elevation)
    for (const pc of D.pairColl.land) {
      if (pc.tileset === this.tileset.constName) {
        if ((pc.a === cur && pc.b === target) || (pc.b === cur && pc.a === target)) return false;
      }
    }
    if (this.npcAtSquare(tx, ty)) return false;
    if (!forNpc) {
      // player can't step onto own square
    } else {
      if (this.player.x === tx && this.player.y === ty) return false;
      if (this.player.stepFrom && this.player.stepFrom.x === tx && this.player.stepFrom.y === ty) return false;
      if (this.follower.active && this.follower.x === tx && this.follower.y === ty) return false;
    }
    return true;
  }

  ledgeFor(dir: Dir, fromX: number, fromY: number): boolean {
    const [dx, dy] = DIRV[dir];
    const stand = this.standTile(fromX, fromY);
    const target = this.standTile(fromX + dx, fromY + dy);
    for (const l of D.ledges) {
      if (l.facing === dir && l.standOn === stand && l.ledge === target) return true;
    }
    return false;
  }

  // ---------- update ----------
  update() {
    this.animT++;
    this.updateNpcs();
    this.updatePlayer();
    this.updateFollower();
  }

  private updateNpcs() {
    for (const n of this.npcs) {
      if (n.emote) {
        n.emote.t--;
        if (n.emote.t <= 0) n.emote = null;
      }
      if (n.stepFrom) {
        n.stepT++;
        if (n.stepT >= STEP_FRAMES) {
          n.stepFrom = null;
          n.stepT = 0;
        }
        continue;
      }
      if (n.def.movement === "WALK" && this.locked === 0) {
        n.walkTimer--;
        if (n.walkTimer <= 0) {
          n.walkTimer = 40 + Math.floor(Math.random() * 140);
          const dirs: Dir[] =
            n.def.dir === "UP_DOWN" ? ["UP", "DOWN"] : n.def.dir === "LEFT_RIGHT" ? ["LEFT", "RIGHT"] : ["UP", "DOWN", "LEFT", "RIGHT"];
          const d = dirs[Math.floor(Math.random() * dirs.length)];
          n.dir = d;
          const [dx, dy] = DIRV[d];
          const nx = n.x + dx;
          const ny = n.y + dy;
          if (Math.abs(nx - n.spawnX) <= 4 && Math.abs(ny - n.spawnY) <= 4 && this.canStep(n.x, n.y, d, true)) {
            n.stepFrom = { x: n.x, y: n.y };
            n.stepT = 0;
            n.x = nx;
            n.y = ny;
          }
        }
      }
    }
  }

  private updatePlayer() {
    const p = this.player;
    if (p.turnCd > 0) p.turnCd--;
    if (p.stepFrom) {
      p.stepT++;
      const dur = p.jumping ? STEP_FRAMES * 2 : STEP_FRAMES;
      if (p.stepT >= dur) {
        p.stepFrom = null;
        p.stepT = 0;
        p.jumping = false;
        this.onPlayerArrived();
      }
      return;
    }
    if (this.locked > 0) return;
    const d = Input.heldDir() as Dir | null;
    if (Input.pressed("A")) {
      this.tryInteract();
      return;
    }
    if (Input.pressed("START")) {
      Hooks.openStartMenu?.();
      return;
    }
    if (!d) return;
    if (p.dir !== d) {
      p.dir = d;
      S.dir = d;
      p.turnCd = 6;
      return;
    }
    if (p.turnCd > 0) return;
    this.tryStep(d);
  }

  private tryStep(d: Dir) {
    const p = this.player;
    const [dx, dy] = DIRV[d];
    const tx = p.x + dx;
    const ty = p.y + dy;
    const w2 = this.map.w * 2;
    const h2 = this.map.h * 2;
    // warp by walking off edge while on warp square
    const warpHere = this.map.warps.find((w) => w.x === p.x && w.y === p.y);
    if ((tx < 0 || ty < 0 || tx >= w2 || ty >= h2) && warpHere && !this.justWarped) {
      this.doWarp(warpHere);
      return;
    }
    // ledge hop
    if (this.ledgeFor(d, p.x, p.y)) {
      SFX.ledge();
      p.stepFrom = { x: p.x, y: p.y };
      p.stepT = 0;
      p.jumping = true;
      p.x += dx * 2;
      p.y += dy * 2;
      return;
    }
    if (!this.canStep(p.x, p.y, d)) {
      // attempt warp on facing door-ish tiles (e.g. stepping into a doorway tile that is blocked)
      if (this.animT % 16 === 0) SFX.bump();
      return;
    }
    const targetTile = this.standTile(tx, ty);
    if (this.isWater(targetTile) && !p.surfing) {
      if (this.animT % 16 === 0) SFX.bump();
      return;
    }
    if (p.surfing && !this.isWater(targetTile) && this.walkableTile(targetTile)) p.surfing = false;
    // move follower into player's old square
    this.moveFollowerTo(p.x, p.y);
    p.stepFrom = { x: p.x, y: p.y };
    p.stepT = 0;
    p.x = tx;
    p.y = ty;
  }

  private onPlayerArrived() {
    const p = this.player;
    S.x = p.x;
    S.y = p.y;
    this.stepsSinceSpawn++;
    if (S.repelSteps > 0) S.repelSteps--;
    // crossed map edge?
    const w2 = this.map.w * 2;
    const h2 = this.map.h * 2;
    if (p.x < 0 || p.y < 0 || p.x >= w2 || p.y >= h2) {
      this.crossConnection();
      return;
    }
    const warp = this.map.warps.find((w) => w.x === p.x && w.y === p.y);
    const standTile = this.standTile(p.x, p.y);
    if (warp && !this.justWarped && this.tileset.warpTiles.includes(standTile)) {
      this.doWarp(warp);
      return;
    }
    if (this.justWarped) {
      const stillOnWarp = this.map.warps.some((w) => w.x === p.x && w.y === p.y);
      if (!stillOnWarp) this.justWarped = false;
    }
    // wild encounter
    this.maybeEncounter(standTile);
    // trainer sight
    if (this.locked === 0) this.checkTrainerSight();
    Hooks.onPlayerStep?.(this);
  }

  private crossConnection() {
    const p = this.player;
    const w2 = this.map.w * 2;
    const h2 = this.map.h * 2;
    let side: "north" | "south" | "west" | "east";
    if (p.y < 0) side = "north";
    else if (p.y >= h2) side = "south";
    else if (p.x < 0) side = "west";
    else side = "east";
    const conn = this.map.connections.find((c) => c.dir === side);
    const nm = conn && D.maps[conn.mapConst];
    if (!conn || !nm) {
      // shouldn't happen; clamp back
      p.x = Math.max(0, Math.min(w2 - 1, p.x));
      p.y = Math.max(0, Math.min(h2 - 1, p.y));
      return;
    }
    let nx = p.x;
    let ny = p.y;
    if (side === "north") { nx = p.x - conn.offset * 2; ny = nm.h * 2 - 1; }
    else if (side === "south") { nx = p.x - conn.offset * 2; ny = 0; }
    else if (side === "west") { ny = p.y - conn.offset * 2; nx = nm.w * 2 - 1; }
    else { ny = p.y - conn.offset * 2; nx = 0; }
    void this.enter(conn.mapConst, nx, ny, p.dir, { keepFollower: true });
  }

  doWarp(warp: { dest: string; destWarp: number }) {
    let destName = warp.dest;
    let destWarp = warp.destWarp;
    if (destName === "LAST_MAP") {
      const ret = S.doorStack.pop() ?? S.lastOutdoor;
      SFX.warp();
      void this.fadeWarpTo(ret.map, ret.x, ret.y, "DOWN");
      return;
    }
    const dm = D.maps[destName];
    if (!dm) return;
    if (this.isOutdoor(this.map.name) && !this.isOutdoor(destName)) {
      S.doorStack.push({ map: this.map.name, x: this.player.x, y: this.player.y });
      if (S.doorStack.length > 8) S.doorStack.shift();
    }
    const w = dm.warps[destWarp - 1] ?? dm.warps[0];
    SFX.warp();
    void this.fadeWarpTo(destName, w ? w.x : 4, w ? w.y : 4, this.player.dir === "UP" ? "UP" : "DOWN");
  }

  async fadeWarpTo(map: string, x: number, y: number, dir: Dir) {
    this.locked++;
    const fadeScene: Scene & { a: number } = {
      transparent: true,
      a: 0,
      update() {},
      draw: (ctx) => {
        ctx.fillStyle = `rgba(8,8,16,${(fadeScene as any).a})`;
        ctx.fillRect(0, 0, 160, 144);
      },
    };
    Game.push(fadeScene);
    for (let i = 0; i <= 8; i++) {
      (fadeScene as any).a = i / 8;
      await nextFrame();
    }
    await this.enter(map, x, y, dir, { keepFollower: true });
    for (let i = 8; i >= 0; i--) {
      (fadeScene as any).a = i / 8;
      await nextFrame();
    }
    Game.pop(fadeScene);
    this.locked--;
  }

  private maybeEncounter(standTile: number) {
    if (this.locked > 0) return;
    const wild = this.map.wild;
    if (!wild) return;
    const onWater = this.player.surfing;
    const table = onWater ? wild.water : wild.grass;
    const rate = onWater ? wild.waterRate : wild.grassRate;
    if (!table.length || rate <= 0) return;
    const grassTile = this.tileset.grassTile;
    if (!onWater) {
      if (grassTile >= 0 && standTile !== grassTile) return;
      // cave-style maps (no grass tile): encounters anywhere
    }
    if (Math.floor(Math.random() * 256) >= rate) return;
    const widths = [51, 51, 39, 25, 25, 25, 13, 10, 10, 7];
    let r = Math.floor(Math.random() * 256);
    let slot = 0;
    for (let i = 0; i < widths.length; i++) {
      if (r < widths[i]) {
        slot = i;
        break;
      }
      r -= widths[i];
    }
    const entry = table[Math.min(slot, table.length - 1)];
    const sp = D.species(entry.species);
    if (S.repelSteps > 0 && S.party.length && entry.level < S.party[0].level) return;
    void Hooks.startWildBattle?.(sp.dex, entry.level);
  }

  private checkTrainerSight() {
    for (const n of this.npcs) {
      const def = n.def;
      if (!def.trainerClass || n.hidden) continue;
      const th = this.trainerHeaderFor(n);
      const defeatFlag = th?.event ?? `BEAT_TR_${this.map.name}_${n.idx}`;
      if (S.hasFlag(defeatFlag)) continue;
      const range = th?.range ?? 3;
      const [dx, dy] = DIRV[n.dir];
      for (let dist = 1; dist <= range; dist++) {
        const sx = n.x + dx * dist;
        const sy = n.y + dy * dist;
        if (this.npcs.some((o) => o !== n && !o.hidden && o.x === sx && o.y === sy)) break;
        if (this.player.x === sx && this.player.y === sy) {
          void Hooks.trainerSpotted?.(this, n, dist);
          return;
        }
      }
    }
  }

  trainerHeaderFor(n: NPC) {
    const t = this.map.texts[n.def.textId];
    if (t && t.trainerHeader !== undefined) return this.map.trainerHeaders[t.trainerHeader] ?? null;
    return null;
  }

  // ---------- interactions ----------
  private tryInteract() {
    const p = this.player;
    const [dx, dy] = DIRV[p.dir];
    let tx = p.x + dx;
    let ty = p.y + dy;
    // counter talk-over
    const facingTile = this.standTile(tx, ty);
    if (this.tileset.counterTiles.includes(facingTile)) {
      tx += dx;
      ty += dy;
    }
    const npc = this.npcAtSquare(tx, ty);
    if (npc) {
      void Hooks.talkToNpc?.(this, npc);
      return;
    }
    const sign = this.map.signs.find((s) => s.x === tx && s.y === ty);
    if (sign) {
      void Hooks.readSign?.(this, sign.textId);
      return;
    }
    // facing water: nothing (surf via party menu)
    void Hooks.interactTile?.(this, tx, ty, facingTile);
  }

  // ---------- follower ----------
  private moveFollowerTo(x: number, y: number) {
    const f = this.follower;
    if (!f.active) return;
    if (f.x === x && f.y === y) return;
    const ddx = x - f.x;
    const ddy = y - f.y;
    f.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "RIGHT" : "LEFT") : ddy > 0 ? "DOWN" : "UP";
    f.stepFrom = { x: f.x, y: f.y };
    f.stepT = 0;
    f.x = x;
    f.y = y;
  }

  private updateFollower() {
    const f = this.follower;
    if (f.stepFrom) {
      f.stepT++;
      if (f.stepT >= STEP_FRAMES) {
        f.stepFrom = null;
        f.stepT = 0;
      }
    }
    // teleport follower if too far (after warps)
    if (!f.stepFrom && Math.abs(f.x - this.player.x) + Math.abs(f.y - this.player.y) > 2) {
      f.x = this.player.x;
      f.y = this.player.y;
    }
  }

  // ---------- script helpers ----------
  lock() {
    this.locked++;
  }
  unlock() {
    this.locked = Math.max(0, this.locked - 1);
  }

  async npcStep(n: NPC, d: Dir, ignoreCollision = false) {
    n.dir = d;
    const [dx, dy] = DIRV[d];
    if (!ignoreCollision && !this.canStep(n.x, n.y, d, true)) return false;
    n.stepFrom = { x: n.x, y: n.y };
    n.stepT = 0;
    n.x += dx;
    n.y += dy;
    while (n.stepFrom) await nextFrame();
    return true;
  }

  async npcWalk(n: NPC, path: Dir[], ignoreCollision = true) {
    for (const d of path) await this.npcStep(n, d, ignoreCollision);
  }

  async playerStep(d: Dir) {
    const p = this.player;
    p.dir = d;
    const [dx, dy] = DIRV[d];
    this.moveFollowerTo(p.x, p.y);
    p.stepFrom = { x: p.x, y: p.y };
    p.stepT = 0;
    p.x += dx;
    p.y += dy;
    while (p.stepFrom) await nextFrame();
    S.x = p.x;
    S.y = p.y;
  }

  async playerWalk(path: Dir[]) {
    for (const d of path) await this.playerStep(d);
  }

  async showEmote(n: NPC, name = "shock", frames = 40) {
    n.emote = { name, t: frames };
    SFX.aButton();
    for (let i = 0; i < frames; i++) await nextFrame();
  }

  facePlayer(n: NPC) {
    const ddx = this.player.x - n.x;
    const ddy = this.player.y - n.y;
    n.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "RIGHT" : "LEFT") : ddy > 0 ? "DOWN" : "UP";
  }
  faceNpc(n: NPC) {
    const p = this.player;
    const ddx = n.x - p.x;
    const ddy = n.y - p.y;
    p.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "RIGHT" : "LEFT") : ddy > 0 ? "DOWN" : "UP";
  }
  npcByTextId(textId: string): NPC | null {
    return this.npcs.find((n) => n.def.textId === textId) ?? null;
  }
  removeNpc(n: NPC) {
    this.npcs = this.npcs.filter((x) => x !== n);
  }

  // ---------- draw ----------
  private camera(): [number, number] {
    const p = this.player;
    let px = p.x * 16;
    let py = p.y * 16;
    if (p.stepFrom) {
      const dur = p.jumping ? STEP_FRAMES * 2 : STEP_FRAMES;
      const t = p.stepT / dur;
      px = (p.stepFrom.x + (p.x - p.stepFrom.x) * t) * 16;
      py = (p.stepFrom.y + (p.y - p.stepFrom.y) * t) * 16;
    }
    return [Math.round(px) - 72, Math.round(py) - 64];
  }

  private tilesheet(): HTMLCanvasElement {
    const pal = (D.palettes[this.paletteName] as RGB[]) || GRAYS;
    return tinted(`/assets/tilesets/${this.tileset.gfx}.png`, pal);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const [camX, camY] = this.camera();
    const sheet = this.tilesheet();
    const tilesPerRow = sheet.width / 8;
    const t0x = Math.floor(camX / 8) - 1;
    const t0y = Math.floor(camY / 8) - 1;
    for (let ty = t0y; ty < t0y + 21; ty++) {
      for (let tx = t0x; tx < t0x + 22; tx++) {
        let tile = this.tileAt(tx, ty);
        const dx = tx * 8 - camX;
        const dy = ty * 8 - camY;
        if (this.isWaterAnimated(tile)) {
          this.drawWater(ctx, sheet, tilesPerRow, tile, dx, dy);
          continue;
        }
        ctx.drawImage(sheet, (tile % tilesPerRow) * 8, Math.floor(tile / tilesPerRow) * 8, 8, 8, dx, dy, 8, 8);
      }
    }
    // sprites sorted by y
    const drawables: { py: number; fn: () => void }[] = [];
    for (const n of this.npcs) {
      if (n.hidden) continue;
      const [px, py] = this.spritePixelPos(n.x, n.y, n.stepFrom, n.stepT, false);
      drawables.push({ py, fn: () => this.drawCharacter(ctx, n.spriteFile, n.dir, px - camX, py - camY, n.stepFrom !== null, n.stepT, n.frames, n.x, n.y) });
    }
    if (this.follower.active) {
      const f = this.follower;
      const [px, py] = this.spritePixelPos(f.x, f.y, f.stepFrom, f.stepT, false);
      drawables.push({ py, fn: () => this.drawCharacter(ctx, "pikachu", f.dir, px - camX, py - camY, f.stepFrom !== null, f.stepT, 6, f.x, f.y) });
    }
    {
      const p = this.player;
      const [px, py] = this.spritePixelPos(p.x, p.y, p.stepFrom, p.stepT, p.jumping);
      drawables.push({ py: py + 0.1, fn: () => this.drawCharacter(ctx, "red", p.dir, px - camX, py - camY, p.stepFrom !== null, p.stepT, 6, p.x, p.y) });
    }
    drawables.sort((a, b) => a.py - b.py);
    for (const d of drawables) d.fn();
    // emotes last
    for (const n of this.npcs) {
      if (n.emote && !n.hidden) {
        const [px, py] = this.spritePixelPos(n.x, n.y, n.stepFrom, n.stepT, false);
        this.drawEmote(ctx, n.emote.name, px - camX, py - camY - 18);
      }
    }
  }

  private isWaterAnimated(tile: number): boolean {
    return tile === 0x14 && (this.tileset.anim === "TILEANIM_WATER" || this.tileset.anim === "TILEANIM_WATER_FLOWER");
  }

  private drawWater(ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, tpr: number, tile: number, dx: number, dy: number) {
    const sx = (tile % tpr) * 8;
    const sy = Math.floor(tile / tpr) * 8;
    const shift = Math.floor(this.animT / 8) % 8;
    // horizontal scroll wrap
    ctx.drawImage(sheet, sx + 8 - shift, sy, shift, 8, dx, dy, shift, 8);
    ctx.drawImage(sheet, sx, sy, 8 - shift, 8, dx + shift, dy, 8 - shift, 8);
  }

  private spritePixelPos(x: number, y: number, stepFrom: { x: number; y: number } | null, stepT: number, jumping: boolean): [number, number] {
    let px = x * 16;
    let py = y * 16;
    if (stepFrom) {
      const dur = jumping ? STEP_FRAMES * 2 : STEP_FRAMES;
      const t = stepT / dur;
      px = (stepFrom.x + (x - stepFrom.x) * t) * 16;
      py = (stepFrom.y + (y - stepFrom.y) * t) * 16;
      if (jumping) py -= Math.sin(t * Math.PI) * 10;
    }
    return [Math.round(px), Math.round(py)];
  }

  drawCharacter(ctx: CanvasRenderingContext2D, file: string, dir: Dir, sx: number, sy: number, stepping: boolean, stepT: number, frames: number, sqX = -999, sqY = -999) {
    const url = `/assets/sprites/${file}.png`;
    if (!hasImage(url)) return;
    const palName = SPRITE_PAL[file] ?? "BROWN";
    const img = tinted(url, OBJ_PALS[palName], { transparentShade0: true });
    let frame = 0;
    let flip = false;
    if (frames >= 6) {
      const walkPhase = stepping ? Math.floor(stepT / 8) % 2 === 1 : false;
      const altPhase = Math.floor((sqX + sqY + (stepping ? 1 : 0)) % 2) === 0;
      switch (dir) {
        case "DOWN":
          frame = walkPhase ? 3 : 0;
          flip = walkPhase && altPhase;
          break;
        case "UP":
          frame = walkPhase ? 4 : 1;
          flip = walkPhase && altPhase;
          break;
        case "LEFT":
          frame = walkPhase ? 5 : 2;
          break;
        case "RIGHT":
          frame = walkPhase ? 5 : 2;
          flip = true;
          break;
      }
    }
    const dy = sy - 4;
    ctx.save();
    if (flip) {
      ctx.translate(sx + 16, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, frame * 16, 16, 16, 0, 0, 16, 16);
    } else {
      ctx.drawImage(img, 0, frame * 16, 16, 16, sx, dy, 16, 16);
    }
    ctx.restore();
    // grass overlay on feet
    const grassTile = this.tileset.grassTile;
    if (grassTile >= 0 && sqX > -999 && this.standTile(sqX, sqY) === grassTile && !stepping) {
      const sheet = this.tilesheet();
      const tpr = sheet.width / 8;
      const [camX, camY] = this.camera();
      const gx = sqX * 2;
      const gy = sqY * 2 + 1;
      for (let i = 0; i < 2; i++) {
        const tile = this.tileAt(gx + i, gy);
        ctx.drawImage(sheet, (tile % tpr) * 8, Math.floor(tile / tpr) * 8, 8, 4, gx * 8 + i * 8 - camX, gy * 8 + 4 - camY, 8, 4);
      }
    }
  }

  private drawEmote(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
    const url = `/assets/emotes/${name}.png`;
    if (!hasImage(url)) {
      drawText(ctx, "!", x + 4, y + 4);
      return;
    }
    const img = tinted(url, OBJ_PALS.GRAY, { transparentShade0: false });
    ctx.drawImage(img, 0, 0, 16, 16, x, y, 16, 16);
  }
}

export const OW = new Overworld();
