// Glue layer: registers overworld hooks and provides battle entry points.
import { D } from "./data";
import { S } from "./state";
import { Hooks } from "./hooks";
import { OW, type NPC, type Overworld, DIRV } from "./overworld";
import { BattleScene, type TrainerInfo, type BattleResult } from "./battle";
import { makeMon, healMon, displayName, speciesOf } from "./pokemon";
import { say, yesNo } from "./ui";
import { SFX, playCry } from "../core/audio";
import { waitFrames } from "../core/frame";
import { openStartMenu, openShop, openPC } from "./menus";
import { MapScripts, GYMS, gymLeaderBattle, giveItem } from "./events";

// ---------------- trainer construction ----------------
export function buildTrainerInfo(classConst: string, id: number, nameOverride?: string): TrainerInfo | null {
  const party = D.trainerParty(classConst, id);
  if (!party) return null;
  const mons = party.mons.map((pm) => makeMon(pm.species, pm.level, { ot: "TRAINER", otId: 9999, dvs: [9, 8, 8, 8] }));
  // Yellow's custom trainer movesets
  const special = D.trainerSpecialMoves.find((sm) => sm.class === classConst && sm.trainerId === id);
  if (special) {
    for (const ov of special.moves) {
      const mon = mons[ov.mon - 1];
      if (!mon) continue;
      const mv = D.move(ov.move);
      const slot = ov.slot - 1;
      while (mon.moves.length <= slot && mon.moves.length < 4) mon.moves.push({ id: mv.id, pp: mv.pp, maxPp: mv.pp });
      mon.moves[Math.min(slot, mon.moves.length - 1)] = { id: mv.id, pp: mv.pp, maxPp: mv.pp };
    }
  }
  const pic = D.trainerPics[classConst];
  const smartClasses = ["BROCK", "MISTY", "LT_SURGE", "ERIKA", "KOGA", "BLAINE", "SABRINA", "GIOVANNI", "LORELEI", "BRUNO", "AGATHA", "LANCE", "RIVAL1", "RIVAL2", "RIVAL3", "COOLTRAINER_M", "COOLTRAINER_F"];
  return {
    classConst,
    name: nameOverride ?? (classConst.startsWith("RIVAL") ? S.rivalName : D.trainerName(classConst)),
    party: mons,
    baseMoney: pic?.money ?? 100,
    picFile: pic?.file ?? null,
    smart: smartClasses.includes(classConst),
  };
}

export async function startTrainerBattle(info: TrainerInfo): Promise<BattleResult> {
  OW.lock();
  const b = new BattleScene();
  b.trainer = info;
  b.enemyParty = info.party;
  b.isWild = false;
  const res = await b.start();
  OW.unlock();
  if (res === "lose") await blackout();
  return res;
}

export async function startWildBattleScripted(dex: number, level: number): Promise<BattleResult> {
  OW.lock();
  const b = new BattleScene();
  b.isWild = true;
  b.enemyParty = [makeMon(dex, level)];
  const res = await b.start();
  OW.unlock();
  if (res === "lose") await blackout();
  return res;
}

export async function blackout() {
  for (const m of S.party) healMon(m);
  S.doorStack = [];
  SFX.denied();
  await OW.fadeWarpTo(S.lastHeal.map, S.lastHeal.x, S.lastHeal.y, "DOWN");
}

// ---------------- trainer engagement ----------------
async function engageTrainer(ow: Overworld, npc: NPC, approach: boolean) {
  const def = npc.def;
  const th = ow.trainerHeaderFor(npc);
  const flag = th?.event ?? `BEAT_TR_${ow.map.name}_${npc.idx}`;
  if (S.hasFlag(flag)) {
    ow.facePlayer(npc);
    if (th?.after) await say(...th.after);
    else await say("I like shorts!\nThey're comfy and\neasy to wear!");
    return;
  }
  ow.lock();
  try {
    if (approach) {
      await ow.showEmote(npc, "shock");
      // walk up to player
      for (let guard = 0; guard < 8; guard++) {
        const dx = ow.player.x - npc.x;
        const dy = ow.player.y - npc.y;
        if (Math.abs(dx) + Math.abs(dy) <= 1) break;
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "RIGHT" : "LEFT") : dy > 0 ? "DOWN" : "UP";
        await ow.npcStep(npc, d, true);
      }
    }
    ow.facePlayer(npc);
    ow.faceNpc(npc);
    if (th?.battle) await say(...th.battle);
    const info = buildTrainerInfo(def.trainerClass!, def.trainerId!);
    if (!info) return;
    if (th?.end) info.endText = th.end;
    const res = await startTrainerBattle(info);
    if (res === "win") {
      S.setFlag(flag);
      if (th?.after) await say(...th.after);
    }
  } finally {
    ow.unlock();
  }
}

// ---------------- hook registrations ----------------
Hooks.openStartMenu = () => void openStartMenu();

Hooks.onMapEnter = async (map, ow) => {
  await MapScripts[map]?.onEnter?.(ow);
};

Hooks.onPlayerStep = (ow) => {
  const ms = MapScripts[ow.map.name];
  if (ms?.step) void ms.step(ow);
};

Hooks.startWildBattle = async (dex, level) => {
  await startWildBattleScripted(dex, level);
};

Hooks.trainerSpotted = async (ow, npc) => {
  const gym = GYMS[ow.map.name];
  if (gym && npc.def.trainerClass === gym.leader) {
    ow.lock();
    try {
      ow.facePlayer(npc);
      await gymLeaderBattle(ow.map.name);
    } finally {
      ow.unlock();
    }
    return;
  }
  await engageTrainer(ow, npc, true);
};

Hooks.talkToNpc = async (ow, npc) => {
  const def = npc.def;
  ow.lock();
  try {
    // custom story handler first
    const custom = MapScripts[ow.map.name]?.talk?.[def.textId];
    if (custom) {
      ow.facePlayer(npc);
      if (await custom(ow, npc)) return;
    }
    // gym leader?
    const gym = GYMS[ow.map.name];
    if (gym && def.trainerClass === gym.leader) {
      ow.facePlayer(npc);
      await gymLeaderBattle(ow.map.name);
      return;
    }
    // regular trainer
    if (def.trainerClass) {
      ow.unlock(); // engageTrainer locks itself
      await engageTrainer(ow, npc, false);
      ow.lock();
      return;
    }
    // item ball
    if (def.item) {
      const flag = `GOT_${ow.map.name}_${npc.idx}`;
      if (!S.hasFlag(flag)) {
        S.setFlag(flag);
        ow.removeNpc(npc);
        await giveItem(def.item);
      }
      return;
    }
    // static pokemon (Snorlax, legendary birds, etc.)
    if (def.pokemon && def.level) {
      const sp = D.species(def.pokemon);
      ow.facePlayer(npc);
      playCry(...sp.cry);
      if (sp.constName === "SNORLAX") {
        if (!S.bag.some((b) => b.item === "POKE_FLUTE")) {
          await say("A sleeping POKéMON\nblocks the way!", "SNORLAX is out\ncold. Wake it with\na POKé FLUTE!");
          return;
        }
        await say(`${S.playerName} played\nthe POKé FLUTE.`, "SNORLAX woke up!", "It attacked in a\ngrumpy rage!");
      } else {
        await say(`It's a ${sp.name}!`);
      }
      const res = await startWildBattleScripted(sp.dex, def.level);
      if (res === "win" || res === "caught" || res === "run") {
        S.setFlag(`HIDE_${ow.map.name}_${npc.idx}`);
        ow.removeNpc(npc);
      }
      return;
    }
    // nurse
    if (def.sprite === "SPRITE_NURSE") {
      ow.facePlayer(npc);
      await say("Welcome to our\nPOKéMON CENTER!", "We can heal your\nPOKéMON to perfect\nhealth!", "Shall we heal your\nPOKéMON?");
      if (await yesNo()) {
        await say("OK, I'll take your\nPOKéMON for a few\nseconds.");
        SFX.heal();
        await waitFrames(60);
        for (const m of S.party) healMon(m);
        S.lastHeal = { map: ow.map.name, x: ow.player.x, y: ow.player.y };
        playCry(25, 0, 100);
        await say("Thank you!\nYour POKéMON are\nfighting fit!", "We hope to see\nyou again!");
      } else {
        await say("We hope to see\nyou again!");
      }
      return;
    }
    // data-driven texts
    const t = ow.map.texts[def.textId];
    ow.facePlayer(npc);
    if (t?.mart) {
      ow.unlock();
      await openShop(D.marts[t.mart]);
      ow.lock();
      return;
    }
    if (t?.paras && t.paras.length) {
      await say(...t.paras);
      return;
    }
    // guards wanting drinks (Saffron gates)
    if (def.sprite === "SPRITE_GUARD") {
      const drink = ["FRESH_WATER", "SODA_POP", "LEMONADE"].find((d) => S.bag.some((b) => b.item === d));
      if (drink && !S.hasFlag("GAVE_GUARD_DRINK")) {
        await say("Guard: Whoa, I'm\ndying of thirst!", `${S.playerName} gave the\nguard a ${D.item(drink).name}!`, "Guard: Gulp gulp...\nThanks! Go right\nthrough!");
        S.removeItem(drink, 1);
        S.setFlag("GAVE_GUARD_DRINK");
        return;
      }
      if (S.hasFlag("GAVE_GUARD_DRINK")) {
        await say("Guard: Go right\nahead!");
        return;
      }
      await say("Guard: The road's\nclosed... I'm\ndying of thirst\nhere...");
      return;
    }
    await say("...");
  } finally {
    ow.unlock();
  }
};

Hooks.readSign = async (ow, textId) => {
  ow.lock();
  try {
    const custom = MapScripts[ow.map.name]?.talk?.[textId];
    if (custom && (await custom(ow, null))) return;
    const t = ow.map.texts[textId];
    if (t?.paras && t.paras.length) {
      await say(...t.paras);
      return;
    }
    // common fallbacks by name
    if (textId.includes("POKECENTER_SIGN")) return void (await say("Heal Your POKéMON!\nPOKéMON CENTER"));
    if (textId.includes("MART_SIGN")) return void (await say("For All Your\nPOKéMON Needs\nPOKéMON MART"));
    await say("...");
  } finally {
    ow.unlock();
  }
};

Hooks.interactTile = async (ow, x, y, tile) => {
  const he = ow.map.hidden.find((h) => h.x === x && h.y === y);
  if (!he) {
    console.log(`[interact] map=${ow.map.name} sq=(${x},${y}) tile=0x${tile.toString(16)}`);
    return;
  }
  ow.lock();
  try {
    switch (he.routine) {
      case "OpenPokemonCenterPC":
      case "OpenRedsPC":
      case "BillsHousePC": {
        ow.unlock();
        SFX.aButton();
        await openPC();
        ow.lock();
        return;
      }
      case "HiddenItems": {
        const flag = `HIDDEN_${ow.map.name}_${x}_${y}`;
        if (S.hasFlag(flag) || !he.arg) return;
        S.setFlag(flag);
        await giveItem(he.arg);
        return;
      }
      case "HiddenCoins": {
        const flag = `HIDDEN_${ow.map.name}_${x}_${y}`;
        if (S.hasFlag(flag)) return;
        S.setFlag(flag);
        S.coins = Math.min(9999, S.coins + 10);
        await say(`${S.playerName} found\n10 coins!`);
        return;
      }
      case "GymStatues": {
        const gym = GYMS[ow.map.name];
        const beaten = gym && S.hasFlag(`BEAT_GYM_${gym.badge}`);
        await say("POKéMON GYM", beaten ? `${gym ? gym.leader : "LEADER"}'s\nwinning trainers:\n${S.playerName}` : "Wanted: highly\nmotivated POKéMON\ntrainers!");
        return;
      }
      case "PrintBenchGuyText":
        await say("It's a cozy bench.");
        return;
      case "PrintNotebookText":
        await say("Looked at the\nnotebook...", "There's writing\nall over it.");
        return;
      case "PrintBookcaseText":
      case "PrintMagazinesText":
        await say("Crammed full of\nPOKéMON books!");
        return;
      case "PrintTrashText":
        await say("There's nothing\nin here...");
        return;
      case "GymTrashScript":
        await say("There's nothing\nin here...");
        return;
      default:
        await say("...");
        return;
    }
  } finally {
    ow.unlock();
  }
};
