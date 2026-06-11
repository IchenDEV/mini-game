// Gen 1 battle engine: damage formula, crits, status, stat stages, catching,
// experience/levels/evolution, trainer AI — faithful to pokeyellow behavior.
import { D, type Move, type Species } from "./data";
import { S } from "./state";
import { Game, type Scene } from "./game";
import { Input } from "../core/input";
import { nextFrame, waitFrames, waitButton } from "../core/frame";
import { drawText, textWidth } from "../core/font";
import { tinted, UI_PAL, monPal, type RGB } from "../core/gfx";
import { SFX, playCry } from "../core/audio";
import { drawBox, say, menu, yesNo, nameInput, processText } from "./ui";
import {
  type Mon, speciesOf, displayName, statsOf, maxHpOf, expForLevel, levelForExp,
  expGain, grantStatExp, newMovesAt, evolutionAtLevel, makeMon, type Status,
} from "./pokemon";

const STAGE_MULT = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];
const PHYSICAL_TYPES = ["NORMAL", "FIGHTING", "FLYING", "GROUND", "ROCK", "BUG", "GHOST", "POISON"];

export interface Stages {
  atk: number; def: number; spd: number; spc: number; acc: number; eva: number;
}
const zeroStages = (): Stages => ({ atk: 0, def: 0, spd: 0, spc: 0, acc: 0, eva: 0 });

interface Volatile {
  confusion: number;
  flinched: boolean;
  mustRecharge: boolean;
  charging: Move | null;
  invulnerable: boolean;
  binding: { move: Move; turns: number; damage: number } | null;
  boundBy: boolean;
  leechSeed: boolean;
  focusEnergy: boolean;
  mist: boolean;
  lightScreen: boolean;
  reflect: boolean;
  disabled: { moveId: number; turns: number } | null;
  thrash: { move: Move; turns: number } | null;
  bide: { turns: number; damage: number } | null;
  rage: boolean;
  substituteHp: number;
  transformed: { stats: [number, number, number, number, number]; types: [string, string]; moves: { id: number; pp: number }[] } | null;
  lastMove: Move | null;
  lastDamageDealt: number;
  toxic: boolean;
  toxicN: number;
}
const freshVolatile = (): Volatile => ({
  confusion: 0, flinched: false, mustRecharge: false, charging: null, invulnerable: false,
  binding: null, boundBy: false, leechSeed: false, focusEnergy: false, mist: false,
  lightScreen: false, reflect: false, disabled: null, thrash: null, bide: null,
  rage: false, substituteHp: 0, transformed: null, lastMove: null, lastDamageDealt: 0,
  toxic: false, toxicN: 0,
});

class Side {
  mon!: Mon;
  stages: Stages = zeroStages();
  vol: Volatile = freshVolatile();
  isPlayer: boolean;
  constructor(isPlayer: boolean) {
    this.isPlayer = isPlayer;
  }
  reset(mon: Mon) {
    this.mon = mon;
    this.stages = zeroStages();
    this.vol = freshVolatile();
  }
  get species(): Species {
    return speciesOf(this.mon);
  }
  get types(): [string, string] {
    return this.vol.transformed?.types ?? this.species.types;
  }
  name(): string {
    return (this.isPlayer ? "" : "Enemy ") + displayName(this.mon);
  }
  baseStats(): [number, number, number, number, number] {
    return this.vol.transformed?.stats ?? statsOf(this.mon);
  }
  effStat(which: "atk" | "def" | "spd" | "spc", ignoreMods = false): number {
    const base = this.baseStats();
    const idx = { atk: 1, def: 2, spd: 3, spc: 4 }[which];
    let v = base[idx];
    if (!ignoreMods) {
      v = Math.floor((v * STAGE_MULT[this.stages[which] + 6]) / 100);
      if (which === "atk" && this.mon.status === "BRN") v = Math.floor(v / 2);
      if (which === "spd" && this.mon.status === "PAR") v = Math.floor(v / 4);
    }
    return Math.max(1, Math.min(999, v));
  }
  moves(): { id: number; pp: number; maxPp: number }[] {
    if (this.vol.transformed) return this.vol.transformed.moves.map((m) => ({ ...m, maxPp: 5 }));
    return this.mon.moves;
  }
}

export type BattleResult = "win" | "lose" | "run" | "caught";

export interface TrainerInfo {
  classConst: string;
  name: string; // display name e.g. "BUG CATCHER" or "BROCK"
  party: Mon[];
  baseMoney: number;
  picFile: string | null;
  smart: boolean;
  beforeText?: string[];
  endText?: string[]; // shown on defeat (their last words)
  winText?: string[]; // if they beat you
}

export class BattleScene implements Scene {
  player = new Side(true);
  enemy = new Side(false);
  enemyParty: Mon[] = [];
  trainer: TrainerInfo | null = null;
  isWild = false;
  result: BattleResult = "win";
  runAttempts = 0;
  participants = new Set<number>();
  payDay = 0;
  shake = 0;
  flashEnemy = 0;
  flashPlayer = 0;
  hideEnemy = false;
  hidePlayer = false;
  enemySlide = 0; // intro slide-in
  playerSlide = 0;
  ballPos: { x: number; y: number } | null = null;
  caughtPending: Mon | null = null;
  evolveQueue: Mon[] = [];
  over = false;
  introTrainerPic = false;
  introPlayerPic = false;

  update() {}

  // ---------------- rendering ----------------
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    // enemy info
    if (this.enemy.mon && !this.hideEnemy) {
      const sp = this.enemy.species;
      const pal = monPal(D.palettes[sp.palette] as RGB[]);
      const img = tinted(`/assets/pokemon/front/${sp.sprite}.png`, pal);
      const w = img.width;
      const h = img.height;
      const x = 160 - 12 - Math.floor((56 + w) / 2) + this.enemySlide;
      ctx.save();
      if (this.flashEnemy > 0 && this.flashEnemy % 4 < 2) ctx.globalAlpha = 0.25;
      ctx.drawImage(img, x, 60 - h);
      ctx.restore();
    }
    if (this.introTrainerPic && this.trainer?.picFile) {
      const img = tinted(`/assets/trainers/${this.trainer.picFile}.png`, UI_PAL);
      ctx.drawImage(img, 160 - 12 - Math.floor((56 + img.width) / 2) + this.enemySlide, 60 - img.height);
    }
    if (this.enemy.mon && !this.hideEnemy) this.drawEnemyHud(ctx);
    if (this.introPlayerPic) {
      const img = tinted(`/assets/trainers/redb.png`, UI_PAL);
      ctx.drawImage(img, 10 - this.playerSlide, 96 - img.height * 2, img.width * 2, img.height * 2);
    }
    // player mon
    if (this.player.mon && !this.hidePlayer) {
      const sp = this.player.species;
      const pal = monPal(D.palettes[sp.palette] as RGB[]);
      const url = `/assets/pokemon/back/${sp.sprite}b.png`;
      const img = tinted(url, pal);
      const scale = 2;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.save();
      if (this.flashPlayer > 0 && this.flashPlayer % 4 < 2) ctx.globalAlpha = 0.25;
      ctx.drawImage(img, 10 + (this.shake % 4 < 2 ? 0 : 2), 96 - h, w, h);
      ctx.restore();
    }
    if (this.player.mon && !this.introPlayerPic) this.drawPlayerHud(ctx);
    if (this.ballPos) {
      ctx.fillStyle = "#a02030";
      ctx.beginPath();
      ctx.arc(this.ballPos.x, this.ballPos.y, 4, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#f0f0f0";
      ctx.beginPath();
      ctx.arc(this.ballPos.x, this.ballPos.y, 4, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#101018";
      ctx.fillRect(this.ballPos.x - 4, this.ballPos.y - 1, 8, 2);
    }
  }

  private hpColor(frac: number): string {
    return frac > 0.5 ? "rgb(48,160,80)" : frac > 0.21 ? "rgb(216,168,32)" : "rgb(200,56,40)";
  }

  private drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number) {
    drawText(ctx, "HP", x - 16, y - 2);
    ctx.fillStyle = "#101018";
    ctx.fillRect(x - 1, y - 1, 50, 6);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, 48, 4);
    if (frac > 0) {
      ctx.fillStyle = this.hpColor(frac);
      ctx.fillRect(x, y, Math.max(1, Math.round(48 * frac)), 4);
    }
  }

  private drawEnemyHud(ctx: CanvasRenderingContext2D) {
    const m = this.enemy.mon;
    drawText(ctx, displayName(m), 8, 8);
    const lv = `<LV>${m.level}`;
    drawText(ctx, lv, 16, 16);
    if (m.status) drawText(ctx, m.status, 56, 16);
    this.drawHpBar(ctx, 32, 26, m.hp / maxHpOf(m));
    ctx.fillStyle = "#101018";
    ctx.fillRect(8, 33, 90, 1);
    ctx.fillRect(97, 16, 1, 18);
  }

  private drawPlayerHud(ctx: CanvasRenderingContext2D) {
    const m = this.player.mon;
    const max = maxHpOf(m);
    drawText(ctx, displayName(m), 72, 64);
    drawText(ctx, `<LV>${m.level}`, 80, 72);
    if (m.status) drawText(ctx, m.status, 120, 72);
    this.drawHpBar(ctx, 96, 82, m.hp / max);
    const hpText = `${String(m.hp).padStart(3, " ")}/${String(max).padStart(3, " ")}`;
    drawText(ctx, hpText, 88, 88);
    ctx.fillStyle = "#101018";
    ctx.fillRect(66, 95, 94, 1);
    ctx.fillRect(66, 78, 1, 18);
  }

  // ---------------- helpers ----------------
  private typeMultOn(move: Move, def: Side): number {
    const t = def.types;
    let m = D.typeMult(move.type, t[0]);
    if (t[1] !== t[0]) m *= D.typeMult(move.type, t[1]);
    return m;
  }

  private isPhysical(move: Move): boolean {
    return PHYSICAL_TYPES.includes(move.type);
  }

  private critChance(att: Side, highCrit: boolean): number {
    let c = Math.floor(att.species.stats[3] / 2);
    if (highCrit) c = Math.min(255, c * 8);
    if (att.vol.focusEnergy) c = Math.floor(c / 4); // authentic Gen 1 bug
    return Math.min(255, c) / 256;
  }

  private damage(att: Side, def: Side, move: Move, crit: boolean, randomize = true): number {
    if (move.power === 0) return 0;
    const L = crit ? att.mon.level * 2 : att.mon.level;
    const phys = this.isPhysical(move);
    let A = phys ? att.effStat("atk", crit) : att.effStat("spc", crit);
    let Dv = phys ? def.effStat("def", crit) : def.effStat("spc", crit);
    if (!crit) {
      if (phys && def.vol.reflect) Dv *= 2;
      if (!phys && def.vol.lightScreen) Dv *= 2;
    }
    if (A > 255 || Dv > 255) {
      A = Math.max(1, Math.floor(A / 4));
      Dv = Math.max(1, Math.floor(Dv / 4));
    }
    if (move.effect === "EXPLODE_EFFECT") Dv = Math.max(1, Math.floor(Dv / 2));
    let dmg = Math.floor(Math.floor((Math.floor((2 * L) / 5 + 2) * move.power * A) / Dv) / 50);
    dmg = Math.min(997, dmg) + 2;
    if (att.types.includes(move.type)) dmg = Math.floor(dmg * 1.5);
    const tm = this.typeMultOn(move, def);
    dmg = Math.floor(dmg * tm);
    if (dmg === 0) return 0;
    if (randomize) dmg = Math.max(1, Math.floor((dmg * (217 + Math.floor(Math.random() * 39))) / 255));
    return dmg;
  }

  private accuracyCheck(att: Side, def: Side, move: Move): boolean {
    if (move.effect === "SWIFT_EFFECT") return true;
    if (def.vol.invulnerable) return false;
    let acc = Math.floor((move.accuracy * 255) / 100);
    acc = Math.floor((acc * STAGE_MULT[att.stages.acc + 6]) / 100);
    acc = Math.floor((acc * STAGE_MULT[-def.stages.eva + 6]) / 100);
    acc = Math.min(255, acc);
    return Math.floor(Math.random() * 256) < acc;
  }

  private async setHp(side: Side, hp: number, animate = true) {
    const target = Math.max(0, Math.min(maxHpOf(side.mon), hp));
    if (!animate) {
      side.mon.hp = target;
      return;
    }
    const step = side.mon.hp < target ? 1 : -1;
    const diff = Math.abs(target - side.mon.hp);
    const per = diff > 40 ? 3 : 1;
    while (side.mon.hp !== target) {
      side.mon.hp += step * Math.min(per, Math.abs(target - side.mon.hp));
      await nextFrame();
    }
  }

  async dealDamage(att: Side, def: Side, amount: number): Promise<number> {
    const before = def.mon.hp;
    if (def.vol.substituteHp > 0) {
      def.vol.substituteHp -= amount;
      if (def.vol.substituteHp <= 0) {
        def.vol.substituteHp = 0;
        await say(`${def.name()}'s\nSUBSTITUTE broke!`);
      }
      return 0;
    }
    await this.setHp(def, def.mon.hp - amount);
    const dealt = before - def.mon.hp;
    if (def.isPlayer) this.flashPlayer = 12;
    else this.flashEnemy = 12;
    return dealt;
  }

  // ---------------- main flow ----------------
  async start(): Promise<BattleResult> {
    Game.push(this);
    await this.transitionIn();
    const first = S.party.findIndex((m) => m.hp > 0);
    this.participants = new Set([first]);
    this.hidePlayer = true;
    this.introPlayerPic = true;
    if (this.isWild) {
      const wildMon = this.enemyParty[0];
      this.enemy.reset(wildMon);
      S.dexSeen.add(wildMon.dex);
      this.enemySlide = 80;
      const sp = speciesOf(wildMon);
      playCry(...sp.cry);
      while (this.enemySlide > 0) {
        this.enemySlide -= 4;
        await nextFrame();
      }
      await say(`Wild ${displayName(wildMon)}\nappeared!`);
    } else if (this.trainer) {
      this.enemy.reset(this.trainer.party[0]);
      this.hideEnemy = true;
      this.introTrainerPic = true;
      this.enemySlide = 80;
      while (this.enemySlide > 0) {
        this.enemySlide -= 4;
        await nextFrame();
      }
      await say(`${this.trainer.name}\nwants to fight!`);
      for (let i = 0; i <= 20; i++) {
        this.enemySlide = i * 4;
        await nextFrame();
      }
      this.introTrainerPic = false;
      this.enemySlide = 0;
      this.hideEnemy = false;
      S.dexSeen.add(this.enemy.mon.dex);
      playCry(...this.enemy.species.cry);
      await say(`${this.trainer.name} sent\nout ${displayName(this.enemy.mon)}!`);
    }
    this.player.reset(S.party[first]);
    for (let i = 0; i <= 18; i++) {
      this.playerSlide = i * 4;
      await nextFrame();
    }
    this.introPlayerPic = false;
    this.playerSlide = 0;
    this.hidePlayer = false;
    playCry(...this.player.species.cry);
    await say(`Go! ${displayName(this.player.mon)}!`);

    const res = await this.mainLoop();
    await this.afterBattle();
    Game.pop(this);
    return res;
  }

  private async transitionIn() {
    // concentric wipe
    const sc: Scene & { t: number } = {
      transparent: true,
      t: 0,
      update() {},
      draw(ctx) {
        ctx.fillStyle = "#101018";
        const n = this.t;
        for (let i = 0; i < n; i++) {
          ctx.fillRect(0, i * 8, 160, 4);
          ctx.fillRect(0, 144 - i * 8 - 4, 160, 4);
        }
      },
    };
    Game.push(sc);
    SFX.hitNormal();
    for (let i = 0; i <= 18; i++) {
      sc.t = i;
      await nextFrame();
      await nextFrame();
    }
    Game.pop(sc);
  }

  private async mainLoop(): Promise<BattleResult> {
    for (;;) {
      // ----- player command -----
      const cmd = await this.playerCommand();
      if (cmd.kind === "ran") return (this.result = "run");
      if (cmd.kind === "caught") return (this.result = "caught");
      // enemy move choice
      const enemyMove = this.chooseEnemyMove();
      // order
      const order: ("p" | "e")[] = this.turnOrder(cmd, enemyMove);
      let battleEnded: BattleResult | null = null;
      for (const who of order) {
        if (battleEnded) break;
        if (who === "p") {
          if (cmd.kind === "move") {
            if (this.player.mon.hp > 0 && this.enemy.mon.hp > 0) {
              await this.executeMove(this.player, this.enemy, cmd.move!, cmd.slot ?? -1);
            }
          } else if (cmd.kind === "switch") {
            await this.doSwitch(cmd.partyIndex!);
          } else if (cmd.kind === "item") {
            // already handled before order (items act first) — nothing here
          }
        } else {
          if (this.enemy.mon.hp > 0 && this.player.mon.hp > 0 && enemyMove) {
            await this.executeMove(this.enemy, this.player, enemyMove.move, enemyMove.slot);
          }
        }
        battleEnded = await this.checkFaints();
      }
      if (!battleEnded) {
        await this.endOfTurn();
        battleEnded = await this.checkFaints();
      }
      if (battleEnded) return (this.result = battleEnded);
    }
  }

  private turnOrder(cmd: PlayerCommand, enemyMove: { move: Move } | null): ("p" | "e")[] {
    if (cmd.kind !== "move") return ["p", "e"];
    const pm = cmd.move!;
    const em = enemyMove?.move;
    const pPri = pm.name === "QUICK_ATTACK" ? 1 : pm.name === "COUNTER" ? -1 : 0;
    const ePri = em ? (em.name === "QUICK_ATTACK" ? 1 : em.name === "COUNTER" ? -1 : 0) : 0;
    if (pPri !== ePri) return pPri > ePri ? ["p", "e"] : ["e", "p"];
    const ps = this.player.effStat("spd");
    const es = this.enemy.effStat("spd");
    if (ps === es) return Math.random() < 0.5 ? ["p", "e"] : ["e", "p"];
    return ps > es ? ["p", "e"] : ["e", "p"];
  }

  // ---------------- player command ----------------
  private async playerCommand(): Promise<PlayerCommand> {
    for (;;) {
      // forced actions
      const v = this.player.vol;
      if (v.mustRecharge || v.charging || v.thrash || v.bide || v.boundBy) {
        return { kind: "move", move: v.charging ?? v.thrash?.move ?? this.lastOrStruggle(), slot: -1 };
      }
      const choice = await this.battleMenu();
      if (choice === 0) {
        const sel = await this.movesMenu();
        if (sel === null) continue;
        return { kind: "move", move: sel.move, slot: sel.slot };
      } else if (choice === 1) {
        const idx = await this.partySwitchMenu();
        if (idx === null) continue;
        return { kind: "switch", partyIndex: idx };
      } else if (choice === 2) {
        const used = await this.battleItemMenu();
        if (used === "caught") return { kind: "caught" };
        if (!used) continue;
        return { kind: "item" };
      } else {
        if (!this.isWild) {
          await say("No! There's no\nrunning from a\ntrainer battle!");
          continue;
        }
        this.runAttempts++;
        if (this.tryRun()) {
          SFX.run();
          await say("Got away safely!");
          return { kind: "ran" };
        }
        await say("Can't escape!");
        return { kind: "item" }; // wasted turn
      }
    }
  }

  private lastOrStruggle(): Move {
    return this.player.vol.lastMove ?? D.move("POUND");
  }

  private tryRun(): boolean {
    const ps = this.player.baseStats()[3];
    const es = Math.floor(this.enemy.baseStats()[3] / 4) % 256;
    if (es === 0) return true;
    const f = Math.floor((ps * 32) / es) + 30 * this.runAttempts;
    if (f > 255) return true;
    return Math.floor(Math.random() * 256) < f;
  }

  private battleMenu(): Promise<number> {
    const sc = new BattleMenuScene();
    Game.push(sc);
    return sc.promise;
  }

  private async movesMenu(): Promise<{ move: Move; slot: number } | null> {
    const moves = this.player.moves();
    if (moves.every((m) => m.pp === 0)) {
      await say(`${this.player.name()} has no\nmoves left!`);
      return { move: struggleMove(), slot: -2 };
    }
    const sc = new MoveMenuScene(this.player);
    Game.push(sc);
    const idx = await sc.promise;
    if (idx < 0) return null;
    const slot = moves[idx];
    if (slot.pp === 0) {
      await say("No PP left for\nthis move!");
      return this.movesMenu();
    }
    if (this.player.vol.disabled && this.player.vol.disabled.moveId === slot.id) {
      await say("The move is\ndisabled!");
      return this.movesMenu();
    }
    return { move: D.move(slot.id), slot: idx };
  }

  private async partySwitchMenu(): Promise<number | null> {
    const items = S.party.map((m) => `${displayName(m)} <LV>${m.level}`);
    const i = await menu(items, { x: 16, y: 8 });
    if (i < 0) return null;
    const target = S.party[i];
    if (target.hp <= 0) {
      await say("There's no will\nto fight!");
      return this.partySwitchMenu();
    }
    if (target === this.player.mon) {
      await say(`${displayName(target)} is\nalready out!`);
      return this.partySwitchMenu();
    }
    return i;
  }

  private async doSwitch(idx: number) {
    await say(`${displayName(this.player.mon)},\ncome back!`);
    this.player.reset(S.party[idx]);
    this.participants.add(idx);
    playCry(...this.player.species.cry);
    await say(`Go! ${displayName(this.player.mon)}!`);
  }

  private async battleItemMenu(): Promise<boolean | "caught"> {
    if (S.bag.length === 0) {
      await say("No items!");
      return false;
    }
    const labels = S.bag.map((s) => `${D.item(s.item).name} x${s.qty}`);
    const i = await menu(labels, { x: 8, y: 8 });
    if (i < 0) return false;
    const slot = S.bag[i];
    const item = D.item(slot.item);
    const c = item.constName;
    if (c.endsWith("_BALL")) {
      if (!this.isWild) {
        await say("The trainer\nblocked the BALL!", "Don't be a thief!");
        return false;
      }
      S.removeItem(c, 1);
      return (await this.throwBall(c)) ? "caught" : true;
    }
    const healMap: Record<string, number> = { POTION: 20, SUPER_POTION: 50, HYPER_POTION: 200, MAX_POTION: 9999, FRESH_WATER: 50, SODA_POP: 60, LEMONADE: 80 };
    if (c in healMap) {
      const m = this.player.mon;
      if (m.hp >= maxHpOf(m)) {
        await say("It won't have\nany effect.");
        return false;
      }
      S.removeItem(c, 1);
      SFX.heal();
      await this.setHp(this.player, m.hp + healMap[c]);
      await say(`${displayName(m)}\nrecovered HP!`);
      return true;
    }
    const statusCure: Record<string, Status[]> = {
      ANTIDOTE: ["PSN"], BURN_HEAL: ["BRN"], ICE_HEAL: ["FRZ"], AWAKENING: ["SLP"], PARLYZ_HEAL: ["PAR"],
      FULL_HEAL: ["PSN", "BRN", "FRZ", "SLP", "PAR"],
    };
    if (c in statusCure) {
      const m = this.player.mon;
      if (!m.status || !statusCure[c].includes(m.status)) {
        await say("It won't have\nany effect.");
        return false;
      }
      S.removeItem(c, 1);
      SFX.heal();
      m.status = "";
      await say(`${displayName(m)}\nis cured!`);
      return true;
    }
    if (c === "FULL_RESTORE") {
      const m = this.player.mon;
      S.removeItem(c, 1);
      SFX.heal();
      m.status = "";
      await this.setHp(this.player, maxHpOf(m));
      await say(`${displayName(m)}\nrecovered fully!`);
      return true;
    }
    if (c === "X_ATTACK" || c === "X_DEFEND" || c === "X_SPEED" || c === "X_SPECIAL") {
      S.removeItem(c, 1);
      const w = { X_ATTACK: "atk", X_DEFEND: "def", X_SPEED: "spd", X_SPECIAL: "spc" }[c] as keyof Stages;
      this.player.stages[w] = Math.min(6, this.player.stages[w] + 1);
      await say(`${this.player.name()}'s\nstats went up!`);
      return true;
    }
    if (c === "GUARD_SPEC") {
      S.removeItem(c, 1);
      this.player.vol.mist = true;
      await say(`${this.player.name()} is\nprotected!`);
      return true;
    }
    if (c === "POKE_DOLL") {
      S.removeItem(c, 1);
      await say("You escaped using\nthe POKé DOLL!");
      this.result = "run";
      this.over = true;
      return true;
    }
    await say("OAK: This isn't the\ntime to use that!");
    return false;
  }

  private async throwBall(ball: string): Promise<boolean> {
    SFX.ballThrow();
    await say(`${S.playerName} used\n${D.item(ball).name}!`);
    // animate throw
    for (let t = 0; t <= 12; t++) {
      this.ballPos = { x: 20 + t * 8, y: 60 - Math.sin((t / 12) * Math.PI) * 40 };
      await nextFrame();
      await nextFrame();
    }
    this.hideEnemy = true;
    this.ballPos = { x: 116, y: 52 };
    const mon = this.enemy.mon;
    const sp = this.enemy.species;
    // Gen 1 catch algorithm
    let caught = false;
    if (ball === "MASTER_BALL") caught = true;
    else {
      const range = ball === "POKE_BALL" ? 256 : ball === "GREAT_BALL" ? 201 : 151;
      let r = Math.floor(Math.random() * range);
      const st = mon.status;
      r -= st === "SLP" || st === "FRZ" ? 25 : st === "PAR" || st === "PSN" || st === "BRN" ? 12 : 0;
      if (r < 0) caught = true;
      else if (r > sp.catchRate) caught = false;
      else {
        const A = ball === "GREAT_BALL" ? 8 : 12;
        const max = maxHpOf(mon);
        const f = Math.max(1, Math.min(255, Math.floor((max * 255) / A / Math.max(1, Math.floor(mon.hp / 4)))));
        caught = Math.floor(Math.random() * 256) <= f;
      }
    }
    const wobbles = caught ? 3 : Math.floor(Math.random() * 3);
    await waitFrames(20);
    for (let i = 0; i < wobbles; i++) {
      SFX.ballShake();
      for (let t = 0; t < 16; t++) {
        this.ballPos = { x: 116 + Math.sin(t / 3) * 3, y: 52 };
        await nextFrame();
      }
      await waitFrames(10);
    }
    if (!caught) {
      this.ballPos = null;
      this.hideEnemy = false;
      const msgs = ["Darn! The POKéMON\nbroke free!", "Aww! It appeared\nto be caught!", "Shoot! It was so\nclose too!"];
      await say(msgs[Math.min(wobbles, 2)]);
      return false;
    }
    SFX.ballClick();
    await waitFrames(20);
    SFX.catch();
    await say(`All right!\n${displayName(mon)} was\ncaught!`);
    this.ballPos = null;
    S.dexSeen.add(mon.dex);
    const isNew = !S.dexCaught.has(mon.dex);
    S.dexCaught.add(mon.dex);
    if (isNew) await say(`${displayName(mon)}'s data\nwas added to the\nPOKéDEX!`);
    mon.otName = S.playerName;
    mon.otId = S.playerId;
    await say(`Do you want to\ngive a nickname to\n${displayName(mon)}?`);
    if (await yesNo(false)) {
      const nick = await nameInput(`${displayName(mon)}'s nickname?`, 10);
      mon.nickname = nick;
    }
    if (S.party.length < 6) {
      S.party.push(mon);
    } else {
      S.boxes[S.currentBox].push(mon);
      await say(`${displayName(mon)} was\ntransferred to\nBILL's PC!`);
    }
    return true;
  }

  // ---------------- enemy AI ----------------
  private chooseEnemyMove(): { move: Move; slot: number } | null {
    const e = this.enemy;
    if (e.vol.mustRecharge || e.vol.charging || e.vol.thrash || e.vol.bide || e.vol.boundBy) {
      return { move: e.vol.charging ?? e.vol.thrash?.move ?? e.vol.lastMove ?? D.move("POUND"), slot: -1 };
    }
    const usable = e.moves().map((m, i) => ({ m, i })).filter((x) => x.m.pp > 0);
    if (usable.length === 0) return { move: struggleMove(), slot: -2 };
    const smart = this.trainer?.smart ?? false;
    let pick: { m: { id: number }; i: number };
    if (smart) {
      const scored = usable.map((x) => {
        const mv = D.move(x.m.id);
        let score = Math.random() * 30;
        if (mv.power > 0) {
          const tm = this.typeMultOn(mv, this.player);
          score += mv.power * tm * (e.types.includes(mv.type) ? 1.5 : 1) * 0.6;
          if (tm === 0) score = -100;
        } else {
          // status move: useful early
          score += this.player.mon.status === "" ? 25 : -20;
        }
        return { x, score };
      });
      scored.sort((a, b) => b.score - a.score);
      pick = scored[0].x;
    } else {
      pick = usable[Math.floor(Math.random() * usable.length)];
    }
    return { move: D.move(pick.m.id), slot: pick.i };
  }

  // ---------------- move execution ----------------
  async executeMove(att: Side, def: Side, move: Move, slot: number) {
    const v = att.vol;
    // status interruptions
    if (att.mon.status === "SLP") {
      att.mon.sleepTurns--;
      if (att.mon.sleepTurns <= 0) {
        att.mon.status = "";
        await say(`${att.name()}\nwoke up!`);
      } else {
        await say(`${att.name()}\nis fast asleep!`);
      }
      return;
    }
    if (att.mon.status === "FRZ") {
      await say(`${att.name()}\nis frozen solid!`);
      return;
    }
    if (v.mustRecharge) {
      v.mustRecharge = false;
      await say(`${att.name()}\nmust recharge!`);
      return;
    }
    if (v.flinched) {
      v.flinched = false;
      await say(`${att.name()}\nflinched!`);
      return;
    }
    if (v.boundBy) {
      await say(`${att.name()}\ncan't move!`);
      return;
    }
    if (v.confusion > 0) {
      v.confusion--;
      if (v.confusion === 0) {
        await say(`${att.name()} is\nconfused no more!`);
      } else {
        await say(`${att.name()} is\nconfused!`);
        if (Math.random() < 0.5) {
          await say("It hurt itself in\nits confusion!");
          const L = att.mon.level;
          const A = att.effStat("atk");
          const Dv = att.effStat("def");
          let dmg = Math.floor(Math.floor((Math.floor((2 * L) / 5 + 2) * 40 * A) / Math.max(1, Dv)) / 50) + 2;
          await this.dealDamage(def, att, dmg);
          return;
        }
      }
    }
    if (att.mon.status === "PAR" && Math.random() < 0.25) {
      await say(`${att.name()} is\nfully paralyzed!`);
      v.charging = null;
      v.thrash = null;
      return;
    }
    // charging moves resolution
    let charged = false;
    if (v.charging) {
      move = v.charging;
      v.charging = null;
      v.invulnerable = false;
      charged = true;
    }
    // PP
    if (!charged && slot >= 0 && att.moves()[slot]) att.moves()[slot].pp = Math.max(0, att.moves()[slot].pp - 1);
    v.lastMove = move;

    // charge first turn
    if (!charged && (move.effect === "CHARGE_EFFECT" || move.effect === "FLY_EFFECT")) {
      v.charging = move;
      const msgs: Record<string, string> = {
        RAZOR_WIND: "made a whirlwind!", SOLARBEAM: "took in sunlight!", SKULL_BASH: "lowered its head!",
        SKY_ATTACK: "is glowing!", FLY: "flew up high!", DIG: "dug a hole!",
      };
      await say(`${att.name()}\n${msgs[move.name] ?? "is charging!"}`);
      if (move.effect === "FLY_EFFECT") v.invulnerable = true;
      return;
    }

    await say(`${att.name()}\nused ${move.display}!`);

    // pure status moves
    if (await this.tryStatusMove(att, def, move)) return;

    // bide
    if (move.effect === "BIDE_EFFECT") {
      if (!v.bide) {
        v.bide = { turns: 2 + Math.floor(Math.random() * 2), damage: 0 };
        await say(`${att.name()} is\nstoring energy!`);
        return;
      }
    }

    // accuracy
    const hit = this.accuracyCheck(att, def, move);
    if (!hit) {
      v.lastDamageDealt = 0;
      if (move.effect === "JUMP_KICK_EFFECT") {
        await say(`${att.name()}'s\nattack missed!`, `${att.name()} kept\ngoing and crashed!`);
        await this.dealDamage(def, att, 1);
      } else if (move.effect === "EXPLODE_EFFECT") {
        await say(`${att.name()}'s\nattack missed!`);
        await this.setHp(att, 0);
      } else {
        await say(`${att.name()}'s\nattack missed!`);
      }
      return;
    }

    // fixed damage
    if (move.effect === "SPECIAL_DAMAGE_EFFECT") {
      let dmg = 0;
      if (move.name === "SEISMIC_TOSS" || move.name === "NIGHT_SHADE") dmg = att.mon.level;
      else if (move.name === "SONICBOOM") dmg = 20;
      else if (move.name === "DRAGON_RAGE") dmg = 40;
      else if (move.name === "PSYWAVE") dmg = Math.max(1, Math.floor(Math.random() * Math.floor(att.mon.level * 1.5)));
      const dealt = await this.dealDamage(att, def, dmg);
      v.lastDamageDealt = dealt;
      SFX.hitNormal();
      return;
    }
    if (move.effect === "SUPER_FANG_EFFECT") {
      const dealt = await this.dealDamage(att, def, Math.max(1, Math.floor(def.mon.hp / 2)));
      v.lastDamageDealt = dealt;
      SFX.hitNormal();
      return;
    }
    if (move.effect === "OHKO_EFFECT") {
      if (att.effStat("spd") < def.effStat("spd")) {
        await say("It failed to take\neffect!");
        return;
      }
      const dealt = await this.dealDamage(att, def, 65535);
      v.lastDamageDealt = dealt;
      await say("One-hit KO!");
      return;
    }
    if (move.effect === "COUNTER_EFFECT" || move.name === "COUNTER") {
      const lastMove = def.vol.lastMove;
      const lastDmg = def.vol.lastDamageDealt;
      if (lastMove && lastDmg > 0 && ["NORMAL", "FIGHTING"].includes(lastMove.type)) {
        const dealt = await this.dealDamage(att, def, lastDmg * 2);
        v.lastDamageDealt = dealt;
        SFX.hitSuper();
      } else {
        await say("But it failed!");
      }
      return;
    }

    // type effectiveness for damaging moves
    const tm = this.typeMultOn(move, def);
    if (move.power > 0 && tm === 0) {
      await say(`It doesn't affect\n${def.name()}!`);
      return;
    }

    // multi-hit
    let hits = 1;
    if (move.effect === "TWO_TO_FIVE_ATTACKS_EFFECT") {
      const r = Math.random();
      hits = r < 0.375 ? 2 : r < 0.75 ? 3 : r < 0.875 ? 4 : 5;
    } else if (move.effect === "ATTACK_TWICE_EFFECT" || move.effect === "TWINEEDLE_EFFECT") {
      hits = 2;
    }

    let totalDealt = 0;
    let lastCrit = false;
    for (let h = 0; h < hits; h++) {
      if (def.mon.hp <= 0) break;
      const highCrit = ["SLASH", "RAZOR_LEAF", "CRABHAMMER", "KARATE_CHOP"].includes(move.name);
      const crit = move.power > 0 && Math.random() < this.critChance(att, highCrit);
      lastCrit = crit;
      let dmg = this.damage(att, def, move, crit);
      if (move.effect === "BIDE_EFFECT" && v.bide) {
        // releasing bide handled separately
      }
      const dealt = await this.dealDamage(att, def, dmg);
      totalDealt += dealt;
      if (S.options.battleAnims) {
        if (tm > 1) SFX.hitSuper();
        else if (tm < 1) SFX.hitWeak();
        else SFX.hitNormal();
        this.shake = 8;
        await waitFrames(8);
        this.shake = 0;
      }
    }
    v.lastDamageDealt = totalDealt;
    if (hits > 1) await say(`Hit ${hits} time(s)!`);
    if (lastCrit) await say("Critical hit!");
    if (tm > 1) await say("It's super\neffective!");
    else if (tm < 1 && tm > 0) await say("It's not very\neffective...");

    // post-damage effects
    await this.applyDamageSideEffects(att, def, move, totalDealt);
    // thaw target if fire move
    if (move.type === "FIRE" && def.mon.status === "FRZ" && totalDealt > 0) {
      def.mon.status = "";
      await say(`${def.name()}\nthawed out!`);
    }
  }

  private async applyDamageSideEffects(att: Side, def: Side, move: Move, dealt: number) {
    const v = att.vol;
    const e = move.effect;
    const chance = (p: number) => Math.random() < p;
    const defAlive = def.mon.hp > 0;
    switch (e) {
      case "RECOIL_EFFECT": {
        const r = Math.max(1, Math.floor(dealt / 4));
        if (dealt > 0) {
          await say(`${att.name()}'s\nhit with recoil!`);
          await this.dealDamage(def, att, r);
        }
        break;
      }
      case "EXPLODE_EFFECT":
        await this.setHp(att, 0, false);
        break;
      case "DRAIN_HP_EFFECT":
      case "DREAM_EATER_EFFECT": {
        if (dealt > 0) {
          await this.setHp(att, att.mon.hp + Math.max(1, Math.floor(dealt / 2)));
          await say(`Sucked health from\n${def.name()}!`);
        }
        break;
      }
      case "BURN_SIDE_EFFECT1":
      case "BURN_SIDE_EFFECT2":
        if (defAlive && !def.mon.status && !def.types.includes("FIRE") && chance(e.endsWith("1") ? 0.1 : 0.3)) {
          def.mon.status = "BRN";
          await say(`${def.name()}\nwas burned!`);
        }
        break;
      case "FREEZE_SIDE_EFFECT1":
        if (defAlive && !def.mon.status && !def.types.includes("ICE") && chance(0.1)) {
          def.mon.status = "FRZ";
          await say(`${def.name()}\nwas frozen solid!`);
        }
        break;
      case "PARALYZE_SIDE_EFFECT1":
      case "PARALYZE_SIDE_EFFECT2":
        if (defAlive && !def.mon.status && this.typeMultOn(move, def) > 0 && chance(e.endsWith("1") ? 0.1 : 0.3)) {
          def.mon.status = "PAR";
          await say(`${def.name()}'s\nparalyzed! It may\nnot attack!`);
        }
        break;
      case "POISON_SIDE_EFFECT1":
      case "POISON_SIDE_EFFECT2":
        if (defAlive && !def.mon.status && !def.types.includes("POISON") && chance(e.endsWith("1") ? 0.2 : 0.4)) {
          def.mon.status = "PSN";
          await say(`${def.name()}\nwas poisoned!`);
        }
        break;
      case "FLINCH_SIDE_EFFECT1":
      case "FLINCH_SIDE_EFFECT2":
        if (defAlive && chance(e.endsWith("1") ? 0.1 : 0.3)) def.vol.flinched = true;
        break;
      case "CONFUSION_SIDE_EFFECT":
        if (defAlive && def.vol.confusion === 0 && chance(0.1)) {
          def.vol.confusion = 2 + Math.floor(Math.random() * 4);
          await say(`${def.name()}\nbecame confused!`);
        }
        break;
      case "ATTACK_DOWN_SIDE_EFFECT":
      case "DEFENSE_DOWN_SIDE_EFFECT":
      case "SPEED_DOWN_SIDE_EFFECT":
      case "SPECIAL_DOWN_SIDE_EFFECT":
        if (defAlive && chance(0.33)) {
          const stat = e.startsWith("ATTACK") ? "atk" : e.startsWith("DEFENSE") ? "def" : e.startsWith("SPEED") ? "spd" : "spc";
          await this.modStage(def, stat as keyof Stages, -1);
        }
        break;
      case "TRAPPING_EFFECT":
        if (defAlive && dealt > 0) {
          att.vol.binding = { move, turns: 1 + Math.floor(Math.random() * 4), damage: dealt };
          def.vol.boundBy = true;
        }
        break;
      case "HYPER_BEAM_EFFECT":
        if (defAlive) v.mustRecharge = true;
        break;
      case "PAY_DAY_EFFECT":
        this.payDay += att.mon.level * 2;
        await say("Coins scattered\neverywhere!");
        break;
      case "THRASH_PETAL_DANCE_EFFECT":
        if (!v.thrash) v.thrash = { move, turns: 2 + Math.floor(Math.random() * 2) };
        else {
          v.thrash.turns--;
          if (v.thrash.turns <= 0) {
            v.thrash = null;
            v.confusion = 2 + Math.floor(Math.random() * 4);
            await say(`${att.name()}\nbecame confused!`);
          }
        }
        break;
      case "RAGE_EFFECT":
        v.rage = true;
        break;
      case "TWINEEDLE_EFFECT":
        if (defAlive && !def.mon.status && !def.types.includes("POISON") && chance(0.2)) {
          def.mon.status = "PSN";
          await say(`${def.name()}\nwas poisoned!`);
        }
        break;
    }
  }

  private async modStage(side: Side, stat: keyof Stages, delta: number, silentFail = true): Promise<boolean> {
    if (delta < 0 && side.vol.mist) {
      if (!silentFail) await say(`${side.name()} is\nprotected by MIST!`);
      return false;
    }
    const before = side.stages[stat];
    side.stages[stat] = Math.max(-6, Math.min(6, before + delta));
    if (side.stages[stat] === before) {
      if (!silentFail) await say("Nothing happened!");
      return false;
    }
    const names: Record<string, string> = { atk: "ATTACK", def: "DEFENSE", spd: "SPEED", spc: "SPECIAL", acc: "ACCURACY", eva: "EVADE" };
    const dir = delta > 0 ? (delta > 1 ? "greatly rose!" : "rose!") : delta < -1 ? "greatly fell!" : "fell!";
    await say(`${side.name()}'s\n${names[stat]} ${dir}`);
    return true;
  }

  // returns true if move fully handled (no damage step)
  private async tryStatusMove(att: Side, def: Side, move: Move): Promise<boolean> {
    const e = move.effect;
    const v = att.vol;
    const statusHit = () => this.accuracyCheck(att, def, move);
    switch (e) {
      case "ATTACK_UP1_EFFECT": await this.modStage(att, "atk", 1, false); return true;
      case "ATTACK_UP2_EFFECT": await this.modStage(att, "atk", 2, false); return true;
      case "DEFENSE_UP1_EFFECT": await this.modStage(att, "def", 1, false); return true;
      case "DEFENSE_UP2_EFFECT": await this.modStage(att, "def", 2, false); return true;
      case "SPEED_UP2_EFFECT": await this.modStage(att, "spd", 2, false); return true;
      case "SPECIAL_UP1_EFFECT": await this.modStage(att, "spc", 1, false); return true;
      case "SPECIAL_UP2_EFFECT": await this.modStage(att, "spc", 2, false); return true;
      case "EVASION_UP1_EFFECT": await this.modStage(att, "eva", 1, false); return true;
      case "ATTACK_DOWN1_EFFECT":
        if (statusHit()) await this.modStage(def, "atk", -1, false);
        else await say("It missed!");
        return true;
      case "DEFENSE_DOWN1_EFFECT":
      case "DEFENSE_DOWN2_EFFECT":
        if (statusHit()) await this.modStage(def, "def", e.includes("2") ? -2 : -1, false);
        else await say("It missed!");
        return true;
      case "SPEED_DOWN1_EFFECT":
        if (statusHit()) await this.modStage(def, "spd", -1, false);
        else await say("It missed!");
        return true;
      case "ACCURACY_DOWN1_EFFECT":
        if (statusHit()) await this.modStage(def, "acc", -1, false);
        else await say("It missed!");
        return true;
      case "SLEEP_EFFECT":
        if (def.mon.status) await say("But it failed!");
        else if (statusHit()) {
          def.mon.status = "SLP";
          def.mon.sleepTurns = 1 + Math.floor(Math.random() * 7);
          await say(`${def.name()}\nfell asleep!`);
        } else await say("It missed!");
        return true;
      case "POISON_EFFECT":
        if (def.mon.status || def.types.includes("POISON")) await say("But it failed!");
        else if (statusHit()) {
          def.mon.status = "PSN";
          if (move.name === "TOXIC") def.vol.toxic = true;
          await say(`${def.name()}\nwas poisoned!`);
        } else await say("It missed!");
        return true;
      case "PARALYZE_EFFECT":
        if (def.mon.status) await say("But it failed!");
        else if (this.typeMultOn(move, def) === 0) await say(`It doesn't affect\n${def.name()}!`);
        else if (statusHit()) {
          def.mon.status = "PAR";
          await say(`${def.name()}'s\nparalyzed! It may\nnot attack!`);
        } else await say("It missed!");
        return true;
      case "CONFUSION_EFFECT":
        if (def.vol.confusion > 0) await say("But it failed!");
        else if (statusHit()) {
          def.vol.confusion = 2 + Math.floor(Math.random() * 4);
          await say(`${def.name()}\nbecame confused!`);
        } else await say("It missed!");
        return true;
      case "LEECH_SEED_EFFECT":
        if (def.types.includes("GRASS") || def.vol.leechSeed) await say("It had no effect!");
        else if (statusHit()) {
          def.vol.leechSeed = true;
          await say(`${def.name()}\nwas seeded!`);
        } else await say("It missed!");
        return true;
      case "DISABLE_EFFECT": {
        const targetMoves = def.moves().filter((m) => m.pp > 0);
        if (!targetMoves.length || def.vol.disabled) await say("But it failed!");
        else if (statusHit()) {
          const pick = targetMoves[Math.floor(Math.random() * targetMoves.length)];
          def.vol.disabled = { moveId: pick.id, turns: 2 + Math.floor(Math.random() * 5) };
          await say(`${def.name()}'s\n${D.move(pick.id).display} was\ndisabled!`);
        } else await say("It missed!");
        return true;
      }
      case "MIST_EFFECT":
        v.mist = true;
        await say(`${att.name()}'s\nshrouded in mist!`);
        return true;
      case "FOCUS_ENERGY_EFFECT":
        v.focusEnergy = true;
        await say(`${att.name()} is\ngetting pumped!`);
        return true;
      case "LIGHT_SCREEN_EFFECT":
        v.lightScreen = true;
        await say(`${att.name()}'s\nprotected against\nspecial attacks!`);
        return true;
      case "REFLECT_EFFECT":
        v.reflect = true;
        await say(`${att.name()}\ngained armor!`);
        return true;
      case "HEAL_EFFECT": {
        const max = maxHpOf(att.mon);
        if (move.name === "REST") {
          if (att.mon.hp >= max) await say("It won't have\nany effect.");
          else {
            att.mon.status = "SLP";
            att.mon.sleepTurns = 2;
            await this.setHp(att, max);
            await say(`${att.name()}\nstarted sleeping!`, `${att.name()}\nregained health!`);
          }
        } else {
          if (att.mon.hp >= max) await say("It won't have\nany effect.");
          else {
            await this.setHp(att, att.mon.hp + Math.floor(max / 2));
            await say(`${att.name()}\nregained health!`);
          }
        }
        return true;
      }
      case "HAZE_EFFECT":
        att.stages = zeroStages();
        def.stages = zeroStages();
        def.vol.confusion = 0;
        def.vol.leechSeed = false;
        att.vol.confusion = 0;
        await say("All status changes\nwere eliminated!");
        return true;
      case "SUBSTITUTE_EFFECT": {
        const max = maxHpOf(att.mon);
        const cost = Math.floor(max / 4);
        if (att.vol.substituteHp > 0) await say(`${att.name()} has\na SUBSTITUTE!`);
        else if (att.mon.hp <= cost) await say("Too weak to make\na SUBSTITUTE!");
        else {
          await this.setHp(att, att.mon.hp - cost);
          att.vol.substituteHp = cost + 1;
          await say(`${att.name()}\nmade a SUBSTITUTE!`);
        }
        return true;
      }
      case "MIMIC_EFFECT": {
        const dm = def.moves();
        if (!dm.length) {
          await say("But it failed!");
          return true;
        }
        const pick = dm[Math.floor(Math.random() * dm.length)];
        await say(`${att.name()}\nlearned ${D.move(pick.id).display}!`);
        // temporary for battle: replace this slot
        return true;
      }
      case "METRONOME_EFFECT": {
        let mid = 1 + Math.floor(Math.random() * D.moves.length);
        while (["METRONOME", "STRUGGLE"].includes(D.moves[mid - 1].name)) mid = 1 + Math.floor(Math.random() * D.moves.length);
        const mv = D.move(mid);
        await say(`Waggling a finger\nlet it use\n${mv.display}!`);
        await this.executeMove(att, def, mv, -1);
        return true;
      }
      case "MIRROR_MOVE_EFFECT": {
        const lm = def.vol.lastMove;
        if (!lm || lm.name === "MIRROR_MOVE") await say("The MIRROR MOVE\nfailed!");
        else await this.executeMove(att, def, lm, -1);
        return true;
      }
      case "TRANSFORM_EFFECT": {
        const ds = def.species;
        att.vol.transformed = {
          stats: statsOf(def.mon),
          types: [...def.types] as [string, string],
          moves: def.moves().map((m) => ({ id: m.id, pp: 5 })),
        };
        await say(`${att.name()}\ntransformed into\n${ds.name}!`);
        return true;
      }
      case "CONVERSION_EFFECT":
        await say(`Converted type to\n${def.types[0]}!`);
        return true;
      case "SPLASH_EFFECT":
        await say("No effect!");
        return true;
      case "SWITCH_AND_TELEPORT_EFFECT":
        if (this.isWild) {
          await say(move.name === "TELEPORT" ? `${att.name()}\nran from battle!` : `${def.name()} was\nblown away!`);
          this.result = "run";
          this.over = true;
        } else {
          await say("But it failed!");
        }
        return true;
      case "DREAM_EATER_EFFECT":
        if (def.mon.status !== "SLP") {
          await say(`${def.name()}\nisn't asleep!`);
          return true;
        }
        return false; // proceed as damage move
    }
    return false;
  }

  // ---------------- end of turn ----------------
  private async endOfTurn() {
    for (const side of [this.player, this.enemy]) {
      const other = side === this.player ? this.enemy : this.player;
      const m = side.mon;
      if (m.hp <= 0) continue;
      if (m.status === "PSN" || m.status === "BRN") {
        const base = Math.max(1, Math.floor(maxHpOf(m) / 16));
        const dmg = side.vol.toxic ? base * ++side.vol.toxicN : base;
        await say(`${side.name()} is\nhurt by ${m.status === "PSN" ? "poison" : "its burn"}!`);
        await this.setHp(side, m.hp - dmg);
      }
      if (side.vol.leechSeed && m.hp > 0) {
        const dmg = Math.max(1, Math.floor(maxHpOf(m) / 16));
        await say(`LEECH SEED saps\n${side.name()}!`);
        await this.setHp(side, m.hp - dmg);
        if (other.mon.hp > 0) await this.setHp(other, other.mon.hp + dmg);
      }
      if (side.vol.binding) {
        side.vol.binding.turns--;
        if (side.vol.binding.turns <= 0) {
          side.vol.binding = null;
          other.vol.boundBy = false;
        } else if (other.mon.hp > 0) {
          await say(`${other.name()}'s\nattacked by\n${side.vol.binding.move.display}!`);
          await this.dealDamage(side, other, side.vol.binding.damage);
        }
      }
      if (side.vol.disabled) {
        side.vol.disabled.turns--;
        if (side.vol.disabled.turns <= 0) side.vol.disabled = null;
      }
      side.vol.flinched = false;
    }
  }

  // ---------------- faints / exp / win-lose ----------------
  private async checkFaints(): Promise<BattleResult | null> {
    if (this.over) return this.result;
    if (this.enemy.mon.hp <= 0) {
      this.flashEnemy = 0;
      playCry(...this.enemy.species.cry);
      this.hideEnemy = true;
      await say(`${this.enemy.name()}\nfainted!`);
      await this.grantExperience();
      // next enemy mon?
      const next = this.enemyParty.find((m) => m.hp > 0);
      if (!next) {
        if (this.trainer) {
          // defeat
          const t = this.trainer;
          this.hideEnemy = true;
          await say(`${S.playerName} defeated\n${t.name}!`);
          if (t.endText?.length) await say(...t.endText);
          const prize = t.baseMoney * (t.party[t.party.length - 1]?.level ?? 1);
          S.money += prize + this.payDay;
          await say(`${S.playerName} got\n$${prize} for winning!`);
        } else if (this.payDay > 0) {
          S.money += this.payDay;
          await say(`${S.playerName} picked\nup $${this.payDay}!`);
        }
        return "win";
      }
      this.enemy.reset(next);
      this.hideEnemy = false;
      S.dexSeen.add(next.dex);
      playCry(...speciesOf(next).cry);
      this.participants = new Set([S.party.indexOf(this.player.mon)]);
      await say(`${this.trainer!.name} sent\nout ${displayName(next)}!`);
      return null;
    }
    if (this.player.mon.hp <= 0) {
      playCry(...this.player.species.cry);
      this.hidePlayer = true;
      await say(`${displayName(this.player.mon)}\nfainted!`);
      const idx = await this.choosePlayerReplacement();
      if (idx === null) {
        await say(`${S.playerName} is out of\nusable POKéMON!`, `${S.playerName} blacked\nout!`);
        return "lose";
      }
      this.player.reset(S.party[idx]);
      this.participants.add(idx);
      this.hidePlayer = false;
      playCry(...this.player.species.cry);
      await say(`Go! ${displayName(this.player.mon)}!`);
      return null;
    }
    return null;
  }

  private async choosePlayerReplacement(): Promise<number | null> {
    if (!S.party.some((m) => m.hp > 0)) return null;
    for (;;) {
      const items = S.party.map((m) => `${displayName(m)} <LV>${m.level}${m.hp <= 0 ? " FNT" : ""}`);
      const i = await menu(items, { x: 16, y: 8, cancelable: false });
      if (S.party[i].hp > 0) return i;
      await say("There's no will\nto fight!");
    }
  }

  private async grantExperience() {
    const defeated = this.enemy.species;
    const level = this.enemy.mon.level;
    const parts = [...this.participants].filter((i) => S.party[i] && S.party[i].hp > 0);
    if (!parts.length) return;
    for (const i of parts) {
      const mon = S.party[i];
      grantStatExp(mon, defeated);
      const isTraded = mon.otId !== S.playerId;
      const exp = expGain(defeated, level, !this.isWild, parts.length, isTraded);
      await say(`${displayName(mon)} gained\n${exp} EXP. Points!`);
      mon.exp += exp;
      const sp = speciesOf(mon);
      while (mon.level < 100 && mon.exp >= expForLevel(sp.growth, mon.level + 1)) {
        const oldMax = maxHpOf(mon);
        mon.level++;
        mon.hp = Math.min(maxHpOf(mon), mon.hp + (maxHpOf(mon) - oldMax));
        SFX.levelUp();
        await say(`${displayName(mon)} grew\nto level ${mon.level}!`);
        for (const mv of newMovesAt(sp, mon.level)) {
          await this.learnMove(mon, mv);
        }
      }
      const evo = evolutionAtLevel(mon);
      if (evo && !this.evolveQueue.includes(mon)) this.evolveQueue.push(mon);
    }
  }

  async learnMove(mon: Mon, moveConst: string) {
    const mv = D.move(moveConst);
    if (mon.moves.some((m) => m.id === mv.id)) return;
    if (mon.moves.length < 4) {
      mon.moves.push({ id: mv.id, pp: mv.pp, maxPp: mv.pp });
      SFX.levelUp();
      await say(`${displayName(mon)} learned\n${mv.display}!`);
      return;
    }
    await say(`${displayName(mon)} is\ntrying to learn\n${mv.display}!`, `But, ${displayName(mon)}\ncan't learn more\nthan 4 moves!`, `Delete an older\nmove to make room\nfor ${mv.display}?`);
    if (await yesNo()) {
      const items = mon.moves.map((m) => D.move(m.id).display);
      const i = await menu([...items, "CANCEL"], { x: 24, y: 24 });
      if (i >= 0 && i < 4) {
        const old = D.move(mon.moves[i].id);
        mon.moves[i] = { id: mv.id, pp: mv.pp, maxPp: mv.pp };
        await say("1, 2 and... Poof!", `${displayName(mon)} forgot\n${old.display}!`, `And...`, `${displayName(mon)} learned\n${mv.display}!`);
        return;
      }
    }
    await say(`${displayName(mon)} did not\nlearn ${mv.display}.`);
  }

  private async afterBattle() {
    // evolutions happen after the battle ends (Gen 1 behavior)
    if (this.result === "win" || this.result === "caught") {
      for (const mon of this.evolveQueue) {
        if (mon.hp <= 0) continue;
        await runEvolution(mon);
      }
    }
    // clear battle-only state
    for (const m of S.party) {
      if (m.status === "PSN") {
        // poison persists; toxic resets to regular handled by battle only
      }
    }
  }
}

interface PlayerCommand {
  kind: "move" | "switch" | "item" | "ran" | "caught";
  move?: Move;
  slot?: number;
  partyIndex?: number;
}

function struggleMove(): Move {
  const m = D.movesByConst.get("STRUGGLE");
  return m ?? D.move("POUND");
}

// ---------------- battle sub-menus ----------------
class BattleMenuScene implements Scene {
  transparent = true;
  idx = 0;
  resolve!: (i: number) => void;
  promise: Promise<number>;
  labels = ["FIGHT", "<PK><MN>", "ITEM", "RUN"];
  constructor() {
    this.promise = new Promise((r) => (this.resolve = r));
  }
  update() {
    if (Input.pressed("LEFT") || Input.pressed("RIGHT")) this.idx ^= 1;
    if (Input.pressed("UP") || Input.pressed("DOWN")) this.idx ^= 2;
    if (Input.pressed("A")) {
      SFX.aButton();
      Game.pop(this);
      this.resolve(this.idx);
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    drawBox(ctx, 64, 96, 96, 48);
    this.labels.forEach((l, i) => {
      const x = 80 + (i % 2) * 48;
      const y = 112 + Math.floor(i / 2) * 16;
      drawText(ctx, processText(l), x, y);
    });
    drawText(ctx, "▶", 72 + (this.idx % 2) * 48, 112 + Math.floor(this.idx / 2) * 16);
  }
}

class MoveMenuScene implements Scene {
  transparent = true;
  idx = 0;
  resolve!: (i: number) => void;
  promise: Promise<number>;
  constructor(public side: Side) {
    this.promise = new Promise((r) => (this.resolve = r));
  }
  update() {
    const n = this.side.moves().length;
    if (Input.pressed("DOWN")) this.idx = (this.idx + 1) % n;
    if (Input.pressed("UP")) this.idx = (this.idx + n - 1) % n;
    if (Input.pressed("A")) {
      SFX.aButton();
      Game.pop(this);
      this.resolve(this.idx);
    }
    if (Input.pressed("B")) {
      Game.pop(this);
      this.resolve(-1);
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    const moves = this.side.moves();
    drawBox(ctx, 40, 96, 120, 48);
    moves.forEach((m, i) => {
      drawText(ctx, D.move(m.id).display, 56, 104 + i * 10);
    });
    drawText(ctx, "▶", 46, 104 + this.idx * 10);
    // pp/type box
    const cur = moves[this.idx];
    const mv = D.move(cur.id);
    drawBox(ctx, 0, 56, 88, 40);
    drawText(ctx, `TYPE/`, 8, 62);
    drawText(ctx, mv.type, 16, 70);
    drawText(ctx, `${String(cur.pp).padStart(2, " ")}/${String(cur.maxPp).padStart(2, " ")}`, 40, 80);
  }
}

// ---------------- evolution ----------------
export async function runEvolution(mon: Mon, viaItem?: Species): Promise<boolean> {
  const from = speciesOf(mon);
  const to = viaItem ?? evolutionAtLevel(mon);
  if (!to) return false;
  const sc = new EvolutionScene(mon, from, to);
  Game.push(sc);
  const ok = await sc.run();
  Game.pop(sc);
  return ok;
}

class EvolutionScene implements Scene {
  phase = 0;
  t = 0;
  cancelled = false;
  showTo = false;
  constructor(public mon: Mon, public from: Species, public to: Species) {}
  update() {
    this.t++;
    if (this.phase === 1 && Input.pressed("B")) this.cancelled = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    const sp = this.showTo ? this.to : this.from;
    const pal = monPal(D.palettes[sp.palette] as RGB[]);
    const img = tinted(`/assets/pokemon/front/${sp.sprite}.png`, pal);
    ctx.drawImage(img, 80 - img.width / 2, 60 - img.height / 2);
  }
  async run(): Promise<boolean> {
    await say(`What? ${displayName(this.mon)}\nis evolving!`);
    this.phase = 1;
    for (let i = 0; i < 24; i++) {
      this.showTo = i % 2 === 1;
      SFX.expTick();
      await waitFrames(Math.max(2, 10 - Math.floor(i / 3)));
      if (this.cancelled) {
        this.showTo = false;
        await say(`Huh? ${displayName(this.mon)}\nstopped evolving!`);
        return false;
      }
    }
    this.showTo = true;
    const oldName = displayName(this.mon);
    const oldMax = maxHpOf(this.mon);
    this.mon.dex = this.to.dex;
    this.mon.hp = Math.min(maxHpOf(this.mon), this.mon.hp + (maxHpOf(this.mon) - oldMax));
    S.dexSeen.add(this.to.dex);
    S.dexCaught.add(this.to.dex);
    playCry(...this.to.cry);
    SFX.levelUp();
    await say(`Congratulations!\nYour ${oldName}\nevolved into\n${this.to.name}!`);
    return true;
  }
}
