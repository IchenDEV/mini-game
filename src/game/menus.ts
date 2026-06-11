// Start menu and all sub-screens: Pokédex, party, bag, trainer card, save,
// options, shop, PC storage.
import { D, type Species } from "./data";
import { S, BADGES } from "./state";
import { Game, type Scene } from "./game";
import { Input } from "../core/input";
import { drawText, textWidth } from "../core/font";
import { tinted, UI_PAL, monPal, type RGB } from "../core/gfx";
import { SFX, playCry } from "../core/audio";
import { say, menu, yesNo, drawBox, nameInput } from "./ui";
import { type Mon, speciesOf, displayName, maxHpOf, statsOf, healMon, expForLevel, evolutionWithItem, levelForExp } from "./pokemon";
import { runEvolution } from "./battle";
import { OW } from "./overworld";

// ---------------- start menu ----------------
export async function openStartMenu() {
  OW.lock();
  SFX.aButton();
  try {
    for (;;) {
      const items: string[] = [];
      if (S.hasFlag("GOT_POKEDEX")) items.push("POKéDEX");
      if (S.party.length) items.push("POKéMON");
      items.push("ITEM", S.playerName, "SAVE", "OPTION", "EXIT");
      const i = await menu(items, { x: 72, y: 0 });
      if (i < 0) return;
      const sel = items[i];
      if (sel === "POKéDEX") await openPokedex();
      else if (sel === "POKéMON") await openParty("overworld");
      else if (sel === "ITEM") await openBag();
      else if (sel === S.playerName) await openTrainerCard();
      else if (sel === "SAVE") {
        await say(`Would you like to\nSAVE the game?`);
        if (await yesNo()) {
          S.save();
          SFX.save();
          await say(`${S.playerName} saved\nthe game!`);
        }
        return;
      } else if (sel === "OPTION") await openOptions();
      else return;
    }
  } finally {
    OW.unlock();
  }
}

// ---------------- Pokédex ----------------
class PokedexList implements Scene {
  cursor = 0;
  top = 0;
  done!: () => void;
  promise = new Promise<void>((r) => (this.done = r));
  update() {
    if (Input.pressed("DOWN")) this.cursor = Math.min(150, this.cursor + 1);
    if (Input.pressed("UP")) this.cursor = Math.max(0, this.cursor - 1);
    if (Input.held("RIGHT")) this.cursor = Math.min(150, this.cursor + 10);
    if (Input.held("LEFT")) this.cursor = Math.max(0, this.cursor - 10);
    if (this.cursor < this.top) this.top = this.cursor;
    if (this.cursor > this.top + 6) this.top = this.cursor - 6;
    if (Input.pressed("B")) {
      Game.pop(this);
      this.done();
    }
    if (Input.pressed("A")) {
      const dex = this.cursor + 1;
      if (S.dexSeen.has(dex)) {
        SFX.aButton();
        void openDexEntry(D.pokemon[dex]);
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    drawBox(ctx, 0, 0, 160, 144);
    drawText(ctx, "CONTENTS", 96, 8);
    drawText(ctx, `SEEN ${S.dexSeen.size}`, 96, 100);
    drawText(ctx, `OWN  ${S.dexCaught.size}`, 96, 116);
    for (let r = 0; r < 7; r++) {
      const dex = this.top + r + 1;
      if (dex > 151) break;
      const sp = D.pokemon[dex];
      const seen = S.dexSeen.has(dex);
      const own = S.dexCaught.has(dex);
      drawText(ctx, String(dex).padStart(3, "0"), 8, 12 + r * 16);
      drawText(ctx, own ? "●" : " ", 32, 12 + r * 16);
      drawText(ctx, seen ? sp.name : "-----", 40, 12 + r * 16);
    }
    drawText(ctx, "▶", 0, 12 + (this.cursor - this.top) * 16);
  }
}

export async function openPokedex() {
  const sc = new PokedexList();
  Game.push(sc);
  await sc.promise;
}

async function openDexEntry(sp: Species) {
  const sc: Scene & { t: number } = {
    t: 0,
    update() {},
    draw(ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 160, 144);
      drawBox(ctx, 0, 0, 160, 80);
      const pal = monPal(D.palettes[sp.palette] as RGB[]);
      const img = tinted(`/assets/pokemon/front/${sp.sprite}.png`, pal);
      ctx.drawImage(img, 8, 64 - img.height);
      drawText(ctx, sp.name, 72, 16);
      drawText(ctx, sp.genus + " <PK><MN>", 72, 28);
      drawText(ctx, `HT ${sp.heightFt}'${String(sp.heightIn).padStart(2, "0")}"`, 72, 40);
      drawText(ctx, `WT ${sp.weightLbs}lb`, 72, 52);
      drawText(ctx, String(sp.dex).padStart(3, "0"), 8, 70);
    },
  };
  Game.push(sc);
  playCry(...sp.cry);
  if (S.dexCaught.has(sp.dex) && sp.flavor.length) {
    await say(...sp.flavor.map((f) => f.replace(/\n/g, " ").replace(/(.{1,17}) /g, "$1\n")));
  } else {
    await say("No further data\navailable.");
  }
  Game.pop(sc);
}

// ---------------- party ----------------
class PartyScene implements Scene {
  cursor = 0;
  resolve!: (i: number) => void;
  promise: Promise<number>;
  constructor(public title = "Choose a POKéMON.") {
    this.promise = new Promise((r) => (this.resolve = r));
  }
  update() {
    const n = S.party.length;
    if (Input.pressed("DOWN")) this.cursor = (this.cursor + 1) % n;
    if (Input.pressed("UP")) this.cursor = (this.cursor + n - 1) % n;
    if (Input.pressed("A")) {
      SFX.aButton();
      Game.pop(this);
      this.resolve(this.cursor);
    }
    if (Input.pressed("B")) {
      Game.pop(this);
      this.resolve(-1);
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    S.party.forEach((m, i) => {
      const y = 4 + i * 18;
      drawText(ctx, displayName(m), 24, y);
      drawText(ctx, `<LV>${m.level}`, 96, y);
      const max = maxHpOf(m);
      const frac = m.hp / max;
      ctx.fillStyle = "#101018";
      ctx.fillRect(23, y + 9, 50, 6);
      ctx.fillStyle = "#fff";
      ctx.fillRect(24, y + 10, 48, 4);
      ctx.fillStyle = frac > 0.5 ? "rgb(48,160,80)" : frac > 0.21 ? "rgb(216,168,32)" : "rgb(200,56,40)";
      if (frac > 0) ctx.fillRect(24, y + 10, Math.max(1, Math.round(48 * frac)), 4);
      drawText(ctx, `${m.hp}/${max}`, 96, y + 8);
      if (m.status) drawText(ctx, m.status, 136, y);
      if (m.hp <= 0) drawText(ctx, "FNT", 136, y);
    });
    drawBox(ctx, 0, 126, 160, 18);
    drawText(ctx, this.title, 6, 131);
    drawText(ctx, "▶", 14, 4 + this.cursor * 18);
  }
}

export async function pickPartyMon(title?: string): Promise<number> {
  if (!S.party.length) return -1;
  const sc = new PartyScene(title);
  Game.push(sc);
  return sc.promise;
}

export async function openParty(context: "overworld" | "pc") {
  for (;;) {
    const i = await pickPartyMon();
    if (i < 0) return;
    const mon = S.party[i];
    const opts = ["STATS", "SWITCH"];
    const fieldMoves: string[] = [];
    const moveNames = mon.moves.map((mv) => D.move(mv.id).name);
    if (moveNames.includes("CUT") && S.hasBadge(1)) fieldMoves.push("CUT");
    if (moveNames.includes("SURF") && S.hasBadge(4)) fieldMoves.push("SURF");
    if (moveNames.includes("FLASH") && S.hasBadge(0)) fieldMoves.push("FLASH");
    if (moveNames.includes("DIG") || moveNames.includes("TELEPORT")) fieldMoves.push("DIG");
    const items = [...fieldMoves, ...opts, "CANCEL"];
    const c = await menu(items, { x: 88, y: 80 });
    if (c < 0 || items[c] === "CANCEL") continue;
    const sel = items[c];
    if (sel === "STATS") await openStats(mon);
    else if (sel === "SWITCH") {
      const j = await pickPartyMon("Move to where?");
      if (j >= 0 && j !== i) {
        const t = S.party[i];
        S.party[i] = S.party[j];
        S.party[j] = t;
      }
    } else if (sel === "SURF") {
      Game.pop;
      await tryFieldSurf();
      return;
    } else if (sel === "FLASH") {
      if (S.hasFlag("DARK_CAVE")) {
        S.setFlag("USED_FLASH");
        await say(`${displayName(mon)} used\nFLASH!`, "The cave lit up!");
      } else await say("No use here.");
      return;
    } else if (sel === "CUT") {
      await say("There's nothing to\nCUT here.");
    } else if (sel === "DIG") {
      await say(`${displayName(mon)} dug\na way out!`);
      SFX.warp();
      await OW.fadeWarpTo(S.lastOutdoor.map, S.lastOutdoor.x, S.lastOutdoor.y, "DOWN");
      return;
    }
  }
}

async function tryFieldSurf() {
  const p = OW.player;
  const [dx, dy] = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[p.dir] as [number, number];
  const t = OW.standTile(p.x + dx, p.y + dy);
  if (t === 0x14 && !p.surfing) {
    await say("Got on SURFBOARD... er,\nyour POKéMON's back!");
    p.surfing = true;
    await OW.playerStep(p.dir);
  } else {
    await say("No use here.");
  }
}

class StatsScene implements Scene {
  page = 0;
  done!: () => void;
  promise = new Promise<void>((r) => (this.done = r));
  constructor(public mon: Mon) {}
  update() {
    if (Input.pressed("A") || Input.pressed("RIGHT")) {
      if (this.page === 0) this.page = 1;
      else {
        Game.pop(this);
        this.done();
      }
    }
    if (Input.pressed("B")) {
      Game.pop(this);
      this.done();
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    const m = this.mon;
    const sp = speciesOf(m);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    const pal = monPal(D.palettes[sp.palette] as RGB[]);
    const img = tinted(`/assets/pokemon/front/${sp.sprite}.png`, pal);
    ctx.drawImage(img, 4, 8);
    drawText(ctx, displayName(m), 64, 8);
    drawText(ctx, `<LV>${m.level}`, 64, 18);
    drawText(ctx, `No.${String(sp.dex).padStart(3, "0")}`, 8, 66);
    const st = statsOf(m);
    if (this.page === 0) {
      drawText(ctx, `HP ${m.hp}/${st[0]}`, 64, 32);
      drawText(ctx, `ATTACK  ${st[1].toString().padStart(3, " ")}`, 64, 44);
      drawText(ctx, `DEFENSE ${st[2].toString().padStart(3, " ")}`, 64, 54);
      drawText(ctx, `SPEED   ${st[3].toString().padStart(3, " ")}`, 64, 64);
      drawText(ctx, `SPECIAL ${st[4].toString().padStart(3, " ")}`, 64, 74);
      drawText(ctx, `STATUS/${m.status || "OK"}`, 64, 86);
      drawText(ctx, "TYPE1/", 4, 100);
      drawText(ctx, sp.types[0], 12, 108);
      if (sp.types[1] !== sp.types[0]) {
        drawText(ctx, "TYPE2/", 4, 118);
        drawText(ctx, sp.types[1], 12, 126);
      }
      drawText(ctx, "OT/", 88, 100);
      drawText(ctx, m.otName.slice(0, 8), 96, 108);
      drawText(ctx, "IDNo/", 88, 118);
      drawText(ctx, String(m.otId % 100000).padStart(5, "0"), 96, 126);
    } else {
      drawText(ctx, "EXP POINTS", 64, 32);
      drawText(ctx, String(m.exp).padStart(10, " "), 72, 40);
      const next = m.level < 100 ? expForLevel(sp.growth, m.level + 1) - m.exp : 0;
      drawText(ctx, "LEVEL UP", 64, 50);
      drawText(ctx, `${String(next).padStart(5, " ")} to <LV>${m.level + 1}`, 64, 58);
      m.moves.forEach((mv, i) => {
        const move = D.move(mv.id);
        drawText(ctx, move.display, 8, 76 + i * 16);
        drawText(ctx, `PP ${String(mv.pp).padStart(2, " ")}/${String(mv.maxPp).padStart(2, " ")}`, 88, 84 + i * 16);
      });
    }
  }
}

export async function openStats(mon: Mon) {
  const sc = new StatsScene(mon);
  Game.push(sc);
  playCry(...speciesOf(mon).cry);
  await sc.promise;
}

// ---------------- bag ----------------
export async function openBag() {
  for (;;) {
    if (!S.bag.length) {
      await say("The BAG is empty.");
      return;
    }
    const labels = S.bag.map((s) => (D.item(s.item).key ? D.item(s.item).name : `${D.item(s.item).name} x${s.qty}`));
    const i = await menu([...labels, "CANCEL"], { x: 24, y: 8 });
    if (i < 0 || i >= S.bag.length) return;
    const slot = S.bag[i];
    const action = await menu(["USE", "TOSS"], { x: 96, y: 96 });
    if (action === 1) {
      if (D.item(slot.item).key) {
        await say("Too important to\ntoss out!");
        continue;
      }
      S.removeItem(slot.item, 1);
      await say(`Threw away\n${D.item(slot.item).name}.`);
      continue;
    }
    if (action !== 0) continue;
    if (await useItemFromBag(slot.item)) return;
  }
}

export async function useItemFromBag(c: string): Promise<boolean> {
  const item = D.item(c);
  const healMap: Record<string, number> = { POTION: 20, SUPER_POTION: 50, HYPER_POTION: 200, MAX_POTION: 9999, FRESH_WATER: 50, SODA_POP: 60, LEMONADE: 80 };
  const statusCure: Record<string, string[]> = {
    ANTIDOTE: ["PSN"], BURN_HEAL: ["BRN"], ICE_HEAL: ["FRZ"], AWAKENING: ["SLP"], PARLYZ_HEAL: ["PAR"], FULL_HEAL: ["PSN", "BRN", "FRZ", "SLP", "PAR"],
  };
  if (c in healMap || c in statusCure || c === "FULL_RESTORE" || c === "REVIVE" || c === "MAX_REVIVE" || c === "RARE_CANDY" || c.endsWith("_STONE") || c === "ETHER" || c === "MAX_ETHER" || c === "ELIXER" || c === "MAX_ELIXER" || c.startsWith("HP_UP") || c === "PROTEIN" || c === "IRON" || c === "CARBOS" || c === "CALCIUM") {
    const i = await pickPartyMon(`Use ${item.name} on?`);
    if (i < 0) return false;
    const mon = S.party[i];
    if (c === "RARE_CANDY") {
      if (mon.level >= 100) {
        await say("It won't have\nany effect.");
        return false;
      }
      const sp = speciesOf(mon);
      mon.level++;
      mon.exp = Math.max(mon.exp, expForLevel(sp.growth, mon.level));
      mon.hp = Math.min(maxHpOf(mon), mon.hp + 5);
      S.removeItem(c, 1);
      SFX.levelUp();
      await say(`${displayName(mon)} grew\nto level ${mon.level}!`);
      const evo = (await import("./pokemon")).evolutionAtLevel(mon);
      if (evo) await runEvolution(mon);
      return true;
    }
    if (c.endsWith("_STONE")) {
      const evo = evolutionWithItem(mon, c);
      if (!evo) {
        await say("It won't have\nany effect.");
        return false;
      }
      // Yellow: the starter Pikachu refuses the Thunder Stone
      if (speciesOf(mon).constName === "PIKACHU" && S.hasFlag("GOT_PIKACHU") && mon.otId === S.playerId) {
        playCry(25, 0, 128);
        await say(`${displayName(mon)} looks\nunhappy about it!`);
        return false;
      }
      S.removeItem(c, 1);
      await runEvolution(mon, evo);
      return true;
    }
    if (c === "REVIVE" || c === "MAX_REVIVE") {
      if (mon.hp > 0) {
        await say("It won't have\nany effect.");
        return false;
      }
      mon.hp = c === "REVIVE" ? Math.floor(maxHpOf(mon) / 2) : maxHpOf(mon);
      mon.status = "";
      S.removeItem(c, 1);
      SFX.heal();
      await say(`${displayName(mon)} is\nrevitalized!`);
      return true;
    }
    if (c === "ETHER" || c === "MAX_ETHER" || c === "ELIXER" || c === "MAX_ELIXER") {
      for (const mv of mon.moves) mv.pp = c.startsWith("MAX") ? mv.maxPp : Math.min(mv.maxPp, mv.pp + 10);
      S.removeItem(c, 1);
      SFX.heal();
      await say(`PP was restored.`);
      return true;
    }
    if (c in healMap) {
      if (mon.hp <= 0 || mon.hp >= maxHpOf(mon)) {
        await say("It won't have\nany effect.");
        return false;
      }
      mon.hp = Math.min(maxHpOf(mon), mon.hp + healMap[c]);
      S.removeItem(c, 1);
      SFX.heal();
      await say(`${displayName(mon)}\nrecovered HP!`);
      return true;
    }
    if (c in statusCure) {
      if (!mon.status || !statusCure[c].includes(mon.status)) {
        await say("It won't have\nany effect.");
        return false;
      }
      mon.status = "";
      S.removeItem(c, 1);
      SFX.heal();
      await say(`${displayName(mon)}\nis cured!`);
      return true;
    }
    if (c === "FULL_RESTORE") {
      if (mon.hp <= 0) {
        await say("It won't have\nany effect.");
        return false;
      }
      mon.hp = maxHpOf(mon);
      mon.status = "";
      S.removeItem(c, 1);
      SFX.heal();
      await say(`${displayName(mon)}\nrecovered fully!`);
      return true;
    }
    // vitamins
    const vit: Record<string, number> = { HP_UP: 0, PROTEIN: 1, IRON: 2, CARBOS: 3, CALCIUM: 4 };
    if (c in vit) {
      mon.statExp[vit[c]] = Math.min(65535, mon.statExp[vit[c]] + 2560);
      S.removeItem(c, 1);
      SFX.heal();
      await say(`${displayName(mon)}'s\nstats rose!`);
      return true;
    }
    return false;
  }
  if (c.match(/^TM\d+$/) || c.match(/^HM\d+$/)) {
    return teachTmHm(c);
  }
  if (c === "REPEL" || c === "SUPER_REPEL" || c === "MAX_REPEL") {
    S.repelSteps = c === "REPEL" ? 100 : c === "SUPER_REPEL" ? 200 : 250;
    S.removeItem(c, 1);
    await say("Used REPEL!\nWild POKéMON will\nstay away a while.");
    return true;
  }
  if (c === "ESCAPE_ROPE") {
    if (OW.isOutdoor(S.map)) {
      await say("No use here.");
      return false;
    }
    S.removeItem(c, 1);
    SFX.warp();
    await OW.fadeWarpTo(S.lastOutdoor.map, S.lastOutdoor.x, S.lastOutdoor.y, "DOWN");
    return true;
  }
  if (c === "TOWN_MAP") {
    await say(`${S.playerName} is in\n${S.map.replace(/_/g, " ")}.`);
    return false;
  }
  if (c === "POKE_FLUTE") {
    await say("Played the POKé\nFLUTE.", "Now, that's a\ncatchy tune!");
    return true;
  }
  if (c.endsWith("_BALL")) {
    await say("OAK: This isn't the\ntime to use that!");
    return false;
  }
  await say("OAK: This isn't the\ntime to use that!");
  return false;
}

async function teachTmHm(c: string): Promise<boolean> {
  const isHm = c.startsWith("HM");
  const num = parseInt(c.slice(2));
  const moveConst = isHm ? D.hmMoves[num - 1] : D.tmMoves[num - 1];
  const mv = D.move(moveConst);
  await say(`${c} contains\n${mv.display}!`, `Teach it to a\nPOKéMON?`);
  if (!(await yesNo())) return false;
  const i = await pickPartyMon(`Teach to whom?`);
  if (i < 0) return false;
  const mon = S.party[i];
  const sp = speciesOf(mon);
  if (!sp.tmhm.includes(moveConst)) {
    await say(`${displayName(mon)} can't\nlearn ${mv.display}.`);
    return false;
  }
  if (mon.moves.some((m) => m.id === mv.id)) {
    await say(`${displayName(mon)} knows\n${mv.display} already!`);
    return false;
  }
  if (mon.moves.length < 4) {
    mon.moves.push({ id: mv.id, pp: mv.pp, maxPp: mv.pp });
  } else {
    await say(`${displayName(mon)} wants\nto learn ${mv.display}!`, "Delete an older\nmove to make room?");
    if (!(await yesNo())) return false;
    const j = await menu([...mon.moves.map((m) => D.move(m.id).display), "CANCEL"], { x: 24, y: 24 });
    if (j < 0 || j >= 4) return false;
    mon.moves[j] = { id: mv.id, pp: mv.pp, maxPp: mv.pp };
  }
  SFX.levelUp();
  await say(`${displayName(mon)} learned\n${mv.display}!`);
  if (!isHm) S.removeItem(c, 1);
  return true;
}

// ---------------- trainer card / options ----------------
async function openTrainerCard() {
  const sc: Scene = {
    update() {
      if (Input.pressed("A") || Input.pressed("B")) {
        Game.pop(sc);
        (sc as any).done();
      }
    },
    draw(ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 160, 144);
      drawBox(ctx, 0, 0, 160, 144);
      drawText(ctx, "TRAINER CARD", 32, 8);
      drawText(ctx, `NAME/ ${S.playerName}`, 16, 28);
      drawText(ctx, `MONEY/ $${S.money}`, 16, 44);
      drawText(ctx, `TIME/ ${Math.floor(S.playSeconds / 3600)}:${String(Math.floor(S.playSeconds / 60) % 60).padStart(2, "0")}`, 16, 60);
      drawText(ctx, "BADGES:", 16, 80);
      BADGES.forEach((b, i) => {
        const x = 16 + (i % 4) * 34;
        const y = 92 + Math.floor(i / 4) * 12;
        drawText(ctx, S.hasBadge(i) ? b.slice(0, 4) : "----", x, y);
      });
    },
  };
  const p = new Promise<void>((r) => ((sc as any).done = r));
  Game.push(sc);
  await p;
}

async function openOptions() {
  for (;;) {
    const speedName = S.options.textSpeed <= 1 ? "FAST" : S.options.textSpeed <= 3 ? "MEDIUM" : "SLOW";
    const i = await menu(
      [`TEXT SPEED: ${speedName}`, `ANIMATION: ${S.options.battleAnims ? "ON" : "OFF"}`, `BATTLE STYLE: ${S.options.battleStyle}`, "EXIT"],
      { x: 0, y: 0, width: 160 }
    );
    if (i < 0 || i === 3) return;
    if (i === 0) S.options.textSpeed = S.options.textSpeed <= 1 ? 3 : S.options.textSpeed <= 3 ? 5 : 1;
    if (i === 1) S.options.battleAnims = !S.options.battleAnims;
    if (i === 2) S.options.battleStyle = S.options.battleStyle === "SHIFT" ? "SET" : "SHIFT";
  }
}

// ---------------- shop ----------------
export async function openShop(inventory: string[]) {
  OW.lock();
  try {
    await say("Hi there!\nMay I help you?");
    for (;;) {
      const i = await menu(["BUY", "SELL", "QUIT"], { x: 0, y: 0 });
      if (i === 0) {
        for (;;) {
          const labels = inventory.map((c) => D.item(c).name);
          const prices = inventory.map((c) => `$${D.item(c).price}`);
          const j = await menu([...labels, "CANCEL"], { x: 16, y: 8, right: [...prices, ""] });
          if (j < 0 || j >= inventory.length) break;
          const item = D.item(inventory[j]);
          let qty = 1;
          if (!item.key) {
            qty = await pickQuantity(item.price);
            if (qty <= 0) continue;
          }
          const cost = item.price * qty;
          await say(`${item.name}?\nThat will be\n$${cost}. OK?`);
          if (await yesNo()) {
            if (S.money < cost) {
              await say("You don't have\nenough money.");
              continue;
            }
            if (!S.addItem(item.constName, qty)) {
              await say("You have no more\nroom for items!");
              continue;
            }
            S.money -= cost;
            SFX.buy();
            await say("Here you are!\nThank you!");
          }
        }
      } else if (i === 1) {
        for (;;) {
          const sellable = S.bag.filter((s) => !D.item(s.item).key && D.item(s.item).price > 0);
          if (!sellable.length) {
            await say("You don't have\nanything to sell.");
            break;
          }
          const labels = sellable.map((s) => `${D.item(s.item).name} x${s.qty}`);
          const prices = sellable.map((s) => `$${Math.floor(D.item(s.item).price / 2)}`);
          const j = await menu([...labels, "CANCEL"], { x: 16, y: 8, right: [...prices, ""] });
          if (j < 0 || j >= sellable.length) break;
          const slot = sellable[j];
          const item = D.item(slot.item);
          const price = Math.floor(item.price / 2);
          await say(`${item.name}?\nI can pay you\n$${price}. OK?`);
          if (await yesNo()) {
            S.removeItem(slot.item, 1);
            S.money += price;
            SFX.buy();
            await say("Thank you!");
          }
        }
      } else {
        await say("Thank you!\nCome again!");
        return;
      }
    }
  } finally {
    OW.unlock();
  }
}

async function pickQuantity(unitPrice: number): Promise<number> {
  const sc: Scene & { qty: number; resolve?: (n: number) => void } = {
    transparent: true,
    qty: 1,
    update() {
      if (Input.pressed("UP")) this.qty = Math.min(99, this.qty + 1);
      if (Input.pressed("DOWN")) this.qty = Math.max(1, this.qty - 1);
      if (Input.pressed("RIGHT")) this.qty = Math.min(99, this.qty + 10);
      if (Input.pressed("LEFT")) this.qty = Math.max(1, this.qty - 10);
      if (Input.pressed("A")) {
        SFX.aButton();
        Game.pop(sc);
        this.resolve!(this.qty);
      }
      if (Input.pressed("B")) {
        Game.pop(sc);
        this.resolve!(0);
      }
    },
    draw(ctx) {
      drawBox(ctx, 96, 64, 64, 32);
      drawText(ctx, `x${String(this.qty).padStart(2, "0")}`, 104, 72);
      drawText(ctx, `$${unitPrice * this.qty}`, 104, 84);
    },
  };
  Game.push(sc);
  return new Promise<number>((r) => (sc.resolve = r));
}

// ---------------- PC ----------------
export async function openPC(billsPC = true) {
  OW.lock();
  SFX.pcOn();
  try {
    await say(`${S.playerName} turned on\nthe PC.`);
    for (;;) {
      const opts = ["BILL's PC", `${S.playerName}'s PC`, "LOG OFF"];
      const i = await menu(opts, { x: 0, y: 0 });
      if (i === 0) await billsPCMenu();
      else if (i === 1) await playersPCMenu();
      else return;
    }
  } finally {
    OW.unlock();
  }
}

async function billsPCMenu() {
  for (;;) {
    const box = S.boxes[S.currentBox];
    const i = await menu(["WITHDRAW <PK><MN>", "DEPOSIT <PK><MN>", "SEE YA!"], { x: 0, y: 0 });
    if (i === 0) {
      if (!box.length) {
        await say("The BOX is empty.");
        continue;
      }
      const j = await menu([...box.map((m) => `${displayName(m)} <LV>${m.level}`), "CANCEL"], { x: 16, y: 8 });
      if (j < 0 || j >= box.length) continue;
      if (S.party.length >= 6) {
        await say("The party is full!");
        continue;
      }
      const mon = box.splice(j, 1)[0];
      S.party.push(mon);
      await say(`${displayName(mon)} was\nwithdrawn.`);
    } else if (i === 1) {
      if (S.party.length <= 1) {
        await say("You can't deposit\nyour last POKéMON!");
        continue;
      }
      const j = await pickPartyMon("Deposit which one?");
      if (j < 0) continue;
      const mon = S.party[j];
      // Yellow flavor: your Pikachu hates the box
      if (speciesOf(mon).constName === "PIKACHU" && mon.otId === S.playerId && S.hasFlag("GOT_PIKACHU")) {
        playCry(25, 0, 200);
        await say("PIKACHU refused\nto go into the\nBOX!");
        continue;
      }
      S.party.splice(j, 1);
      S.boxes[S.currentBox].push(mon);
      await say(`${displayName(mon)} was\ndeposited.`);
    } else return;
  }
}

async function playersPCMenu() {
  for (;;) {
    const i = await menu(["WITHDRAW ITEM", "DEPOSIT ITEM", "LOG OFF"], { x: 0, y: 0 });
    if (i === 0) {
      if (!S.pcItems.length) {
        await say("There's nothing\nstored.");
        continue;
      }
      const j = await menu([...S.pcItems.map((s) => `${D.item(s.item).name} x${s.qty}`), "CANCEL"], { x: 16, y: 8 });
      if (j < 0 || j >= S.pcItems.length) continue;
      const slot = S.pcItems[j];
      if (S.addItem(slot.item, 1)) {
        slot.qty--;
        if (slot.qty <= 0) S.pcItems.splice(j, 1);
        await say(`Withdrew\n${D.item(slot.item).name}.`);
      } else await say("The BAG is full!");
    } else if (i === 1) {
      if (!S.bag.length) {
        await say("The BAG is empty.");
        continue;
      }
      const j = await menu([...S.bag.map((s) => `${D.item(s.item).name} x${s.qty}`), "CANCEL"], { x: 16, y: 8 });
      if (j < 0 || j >= S.bag.length) continue;
      const slot = S.bag[j];
      const pcSlot = S.pcItems.find((s) => s.item === slot.item);
      if (pcSlot) pcSlot.qty++;
      else S.pcItems.push({ item: slot.item, qty: 1 });
      S.removeItem(slot.item, 1);
      await say(`Deposited\n${D.item(slot.item).name}.`);
    } else return;
  }
}
