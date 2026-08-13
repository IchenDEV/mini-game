// Story scripts & map event handlers (Yellow storyline).
import { D } from "./data";
import { S } from "./state";
import { Game, type Scene } from "./game";
import { nextFrame, waitFrames, waitButton } from "../core/frame";
import { drawText } from "../core/font";
import { tinted, UI_PAL, monPal, type RGB } from "../core/gfx";
import { SFX, playCry } from "../core/audio";
import { say, sayNoWait, menu, yesNo, nameInput, drawBox } from "./ui";
import { OW, type NPC } from "./overworld";
import { makeMon, displayName, healMon, speciesOf } from "./pokemon";
import { startTrainerBattle, startWildBattleScripted, blackout, buildTrainerInfo } from "./wiring";

// ---------------- intro ----------------
class IntroScene implements Scene {
  pic: "oak" | "nidorino" | "player" = "oak";
  update() {}
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    let img: HTMLCanvasElement | null = null;
    if (this.pic === "oak") img = tinted("/assets/trainers/prof.oak.png", UI_PAL);
    else if (this.pic === "nidorino") {
      const sp = D.species("NIDORINO");
      img = tinted(`/assets/pokemon/front/${sp.sprite}.png`, monPal(D.palettes[sp.palette] as RGB[]));
    } else img = tinted("/assets/trainers/red.png", UI_PAL);
    if (img) ctx.drawImage(img, 80 - Math.floor(img.width / 2), 88 - img.height);
  }
}

export async function runIntro() {
  const sc = new IntroScene();
  Game.replace(sc);
  await say("Hello there!\nWelcome to the\nworld of POKéMON!", "My name is OAK!\nPeople call me\nthe POKéMON PROF!");
  sc.pic = "nidorino";
  playCry(...D.species("NIDORINO").cry);
  await say("This world is\ninhabited by\ncreatures called\nPOKéMON!", "For some people,\nPOKéMON are pets.\nOthers use them\nfor fights.", "Myself...", "I study POKéMON\nas a profession.");
  sc.pic = "player";
  await say("First, what is\nyour name?");
  const presets = ["NEW NAME", "ASH", "RED", "JACK"];
  const pi = await menu(presets, { x: 8, y: 8 });
  S.playerName = presets[pi] === "NEW NAME" || pi < 0 ? await nameInput("YOUR NAME?") : presets[pi];
  await say(`Right! So your\nname is ${S.playerName}!`);
  await say("This is my grand-\nson. He's been\nyour rival since\nyou were a baby.", "...Erm, what is\nhis name again?");
  const rPresets = ["NEW NAME", "GARY", "BLUE", "JOHN"];
  const ri = await menu(rPresets, { x: 8, y: 8 });
  S.rivalName = rPresets[ri] === "NEW NAME" || ri < 0 ? await nameInput("RIVAL's NAME?") : rPresets[ri];
  await say(`That's right! I\nremember now! His\nname is ${S.rivalName}!`);
  await say(`${S.playerName}!`, "Your very own\nPOKéMON legend is\nabout to unfold!", "A world of dreams\nand adventures\nwith POKéMON\nawaits! Let's go!");
  Game.replace(OW);
  await OW.enter("REDS_HOUSE_2F", 3, 6, "UP");
}

// ---------------- helpers ----------------
async function givePokemon(speciesConst: string, level: number, fromText: string) {
  const mon = makeMon(speciesConst, level, { ot: S.playerName, otId: S.playerId });
  const sp = D.species(speciesConst);
  S.dexSeen.add(sp.dex);
  S.dexCaught.add(sp.dex);
  playCry(...sp.cry);
  SFX.catch();
  await say(`${S.playerName} received\na ${sp.name}${fromText}!`);
  await say(`Do you want to\ngive a nickname to\n${sp.name}?`);
  if (await yesNo(false)) mon.nickname = await nameInput(`${sp.name}'s nickname?`, 10);
  if (S.party.length < 6) S.party.push(mon);
  else {
    S.boxes[S.currentBox].push(mon);
    await say(`${sp.name} was sent\nto BILL's PC!`);
  }
}

export async function giveItem(itemConst: string, qty = 1): Promise<boolean> {
  const item = D.item(itemConst);
  if (!S.addItem(itemConst, qty)) {
    await say("But the BAG is\nfull!");
    return false;
  }
  SFX.catch();
  await say(`${S.playerName} got\n${item.name}${qty > 1 ? ` x${qty}` : ""}!`);
  return true;
}

// ---------------- gym leaders (generic table => all 8 gyms playable) ----------------
export const GYMS: Record<string, { leader: string; map: string; badge: number; tm: string | null; intro: string[]; win: string[] }> = {
  PEWTER_GYM: {
    leader: "BROCK", map: "PEWTER_GYM", badge: 0, tm: "TM34",
    intro: ["I'm BROCK!\nI'm PEWTER's GYM\nLEADER!", "My rock-hard\nwillpower is\nevident even in\nmy POKéMON!"],
    win: ["I took you for\ngranted.", "As proof of your\nvictory, here's\nthe BOULDERBADGE!"],
  },
  CERULEAN_GYM: {
    leader: "MISTY", map: "CERULEAN_GYM", badge: 1, tm: "TM11",
    intro: ["Hi, you're a new\nface!", "My policy is an\nall-out offensive\nwith water-type\nPOKéMON!"],
    win: ["Wow!\nYou're too much!", "All right!\nYou can have the\nCASCADEBADGE!"],
  },
  VERMILION_GYM: {
    leader: "LT_SURGE", map: "VERMILION_GYM", badge: 2, tm: "TM24",
    intro: ["Hey, kid! What do\nyou think you're\ndoing here?", "I tell you, kid,\nelectric POKéMON\nsaved me during\nthe war!"],
    win: ["Whoa!\nYou're the real\ndeal, kid!", "Take the\nTHUNDERBADGE!"],
  },
  CELADON_GYM: {
    leader: "ERIKA", map: "CELADON_GYM", badge: 3, tm: "TM21",
    intro: ["Hello. Lovely\nweather isn't it?", "I use grass-type\nPOKéMON. They're\nbeautiful!"],
    win: ["Oh! I concede\ndefeat.", "You are remark-\nable! Please take\nthe RAINBOWBADGE!"],
  },
  FUCHSIA_GYM: {
    leader: "KOGA", map: "FUCHSIA_GYM", badge: 4, tm: "TM06",
    intro: ["KOGA: Fwahahaha!\nA mere child like\nyou dares to\nchallenge me?", "I shall show you\ntrue terror as a\nninja master!"],
    win: ["Humph!\nYou have proven\nyour worth!", "Here! Take the\nSOULBADGE!"],
  },
  SAFFRON_GYM: {
    leader: "SABRINA", map: "SAFFRON_GYM", badge: 5, tm: "TM46",
    intro: ["I had a vision of\nyour arrival!", "I have had psychic\npowers since I\nwas a child."],
    win: ["I'm shocked!\nBut a loss is a\nloss.", "Take the\nMARSHBADGE!"],
  },
  CINNABAR_GYM: {
    leader: "BLAINE", map: "CINNABAR_GYM", badge: 6, tm: "TM38",
    intro: ["Hah! I'm BLAINE!\nI am the leader\nof CINNABAR GYM!", "My fire POKéMON\nwill incinerate\nall challengers!"],
    win: ["I have burned\ndown to nothing!", "Take the\nVOLCANOBADGE!"],
  },
  VIRIDIAN_GYM: {
    leader: "GIOVANNI", map: "VIRIDIAN_GYM", badge: 7, tm: "TM27",
    intro: ["So! I must say, I\nam impressed you\ngot here.", "For your\ninformation, I am\nthe GYM LEADER of\nVIRIDIAN CITY!"],
    win: ["Ha!\nThat was a truly\nintense fight!", "You have won!\nHere, take the\nEARTHBADGE!"],
  },
};
const BADGE_NAMES = ["BOULDERBADGE", "CASCADEBADGE", "THUNDERBADGE", "RAINBOWBADGE", "SOULBADGE", "MARSHBADGE", "VOLCANOBADGE", "EARTHBADGE"];

async function oakLabTalk(): Promise<boolean> {
  if (!S.hasFlag("GOT_PIKACHU")) {
    await say("OAK: Hmm? How did\nyou get here?");
    return true;
  }
  if (S.hasFlag("GOT_PARCEL") && !S.hasFlag("GOT_POKEDEX")) {
    await say("OAK: Oh, the\nparcel for me?", "What? A custom\nPOKé BALL I\nordered! Thanks!");
    S.removeItem("OAKS_PARCEL", 1);
    S.setFlag("GOT_POKEDEX");
    await say("OAK: Now then...", "Here! A POKéDEX!\nIt records data\non POKéMON you've\nseen or caught!", "To make a complete\nguide on all the\nPOKéMON... That\nwas my dream!", "Go! My dream is\nnow yours to\nfulfill!");
    await giveItem("POKE_BALL", 5);
    return true;
  }
  if (!S.hasFlag("GOT_POKEDEX")) {
    await say("OAK: Visit the\nPOKéMON MART in\nVIRIDIAN CITY.", "They have an item\nwaiting for me.\nCould you get it?");
    return true;
  }
  await say("OAK: How is your\nPOKéDEX coming\nalong?", "Catch many\nPOKéMON to fill\nits pages!");
  return true;
}

export async function gymLeaderBattle(mapName: string): Promise<void> {
  const gym = GYMS[mapName];
  if (!gym) return;
  if (S.hasFlag(`BEAT_GYM_${gym.badge}`)) {
    await say(`${gym.leader.replace(/_/g, " ")}: You're\na great trainer!\nKeep it up!`);
    return;
  }
  await say(...gym.intro);
  const info = buildTrainerInfo(gym.leader, 1, gym.leader.replace(/_/g, "."));
  if (!info) return;
  info.smart = true;
  const res = await startTrainerBattle(info);
  if (res !== "win") return;
  S.setFlag(`BEAT_GYM_${gym.badge}`);
  S.giveBadge(gym.badge);
  SFX.badge();
  await say(...gym.win);
  await say(`${S.playerName} received\nthe ${BADGE_NAMES[gym.badge]}!`);
  if (gym.tm) await giveItem(gym.tm);
}

// ---------------- map event scripts ----------------
type TalkHandler = (ow: typeof OW, npc: NPC | null) => Promise<boolean>; // true = handled
type StepHandler = (ow: typeof OW) => Promise<void>;

export interface MapScript {
  onEnter?: (ow: typeof OW) => Promise<void> | void;
  talk?: Record<string, TalkHandler>; // by TEXT id
  step?: StepHandler;
}

export const MapScripts: Record<string, MapScript> = {
  // ===== PALLET TOWN: Oak intro -> lab -> Pikachu -> rival =====
  PALLET_TOWN: {
    onEnter(ow) {
      const oak = ow.npcByTextId("PALLETTOWN_OAK");
      if (oak) oak.hidden = true;
    },
    async step(ow) {
      if (S.hasFlag("GOT_PIKACHU") || S.hasFlag("INTRO_RUNNING")) return;
      if (ow.player.y !== 0) return;
      S.setFlag("INTRO_RUNNING");
      ow.lock();
      const oak = ow.npcByTextId("PALLETTOWN_OAK");
      await say("OAK: Hey! Wait!\nDon't go out!");
      if (oak) {
        oak.hidden = false;
        oak.x = ow.player.x;
        oak.y = 6;
        oak.dir = "UP";
        // oak walks up to the player
        while (oak.y > ow.player.y + 1) await ow.npcStep(oak, "UP", true);
      }
      await say("OAK: A wild POKéMON!", "Wait! Don't move!");
      // wild Pikachu cinematic catch
      const pika = D.species("PIKACHU");
      playCry(...pika.cry);
      await say("A wild PIKACHU\nappeared!");
      SFX.ballThrow();
      await waitFrames(30);
      SFX.ballClick();
      await say("OAK: Whew...", "OAK: A POKéMON can\nappear anytime in\ntall grass.", "You need your own\nPOKéMON for your\nprotection.", "I know! Come with\nme to my LAB!");
      // walk to lab together
      if (oak) ow.removeNpc(oak);
      await OW.fadeWarpTo("OAKS_LAB", 5, 11, "UP");
      ow.unlock();
      S.clearFlag("INTRO_RUNNING");
      await runLabSequence();
    },
  },

  OAKS_LAB: {
    async onEnter(ow) {
      // rival stays until first battle done
      if (S.hasFlag("LAB_DONE")) {
        const blue = ow.npcs.find((n) => n.def.sprite === "SPRITE_BLUE");
        if (blue) blue.hidden = true;
      }
      // the second Oak object is only used during the intro cinematic
      const oak2 = ow.npcs.find((n) => n.def.textId === "OAKSLAB_OAK2");
      if (oak2) oak2.hidden = true;
    },
    talk: {
      OAKSLAB_OAK1: oakLabTalk,
      OAKSLAB_OAK2: oakLabTalk,
      OAKSLAB_RIVAL: async () => {
        if (S.hasFlag("LAB_DONE")) return false;
        await say(`${S.rivalName}: Gramps\nisn't around...`);
        return true;
      },
    },
  },

  VIRIDIAN_CITY: {
    async step(ow) {
      // old man blocks the north path until the parcel quest is done
      if (S.hasFlag("GOT_POKEDEX")) return;
      if (ow.player.y === 8 && ow.player.x >= 17 && ow.player.x <= 20) {
        ow.lock();
        await say("Old man: Hold on!\nYou can't go\nthrough here yet!", "I haven't had my\ncoffee... Come\nback after running\nOAK's errand!");
        await ow.playerStep("DOWN");
        ow.unlock();
      }
    },
  },

  VIRIDIAN_MART: {
    talk: {
      VIRIDIANMART_CLERK: async () => {
        if (!S.hasFlag("GOT_PARCEL")) {
          await say("Hey! You came from\nPALLET TOWN?", "You know PROF.\nOAK, right?", "His order came in.\nWill you take it\nto him?");
          S.setFlag("GOT_PARCEL");
          await giveItem("OAKS_PARCEL");
          return true;
        }
        return false; // fall through to normal mart
      },
    },
  },

  ROUTE_22: {
    async step(ow) {
      if (!S.hasFlag("GOT_POKEDEX") || S.hasFlag("BEAT_RIVAL_R22")) return;
      if (ow.player.x >= 23 && ow.player.x <= 26 && ow.player.y >= 9 && ow.player.y <= 11) {
        S.setFlag("BEAT_RIVAL_R22"); // mark so it only triggers once
        ow.lock();
        const rival = ow.spawnExtraNpc({ x: ow.player.x + 4, y: ow.player.y, sprite: "SPRITE_BLUE", movement: "STAY", dir: "LEFT", textId: "RIVAL_EXTRA" }, "blue");
        await ow.showEmote(rival, "shock");
        while (rival.x > ow.player.x + 1) await ow.npcStep(rival, "LEFT", true);
        ow.faceNpc(rival);
        await say(`${S.rivalName}: Hey!\n${S.playerName}!`, "You're going to\nthe POKéMON\nLEAGUE?", "Forget it! You\nprobably don't\nhave any BADGES!", "The guard won't\nlet you through!", "By the way, did\nyour POKéMON get\nany stronger?");
        const info = buildTrainerInfo("RIVAL1", 2, S.rivalName);
        if (info) {
          info.smart = true;
          const res = await startTrainerBattle(info);
          if (res !== "win") {
            S.rivalWins++;
            ow.removeNpc(rival);
            ow.unlock();
            return;
          }
          S.rivalLosses++;
          await say(`${S.rivalName}: Awww!\nYou just lucked\nout!`);
        }
        await say(`${S.rivalName}: Anyway,\nthe POKéMON LEAGUE\nis the ultimate\ngoal!`, `You need BADGES.\nI'm going to the\nPOKéMON LEAGUE HQ.`, "Get stronger,\nloser!");
        while (rival.x < ow.player.x + 8) await ow.npcStep(rival, "RIGHT", true);
        ow.removeNpc(rival);
        ow.unlock();
      }
    },
  },

  PEWTER_GYM: {
    talk: {
      PEWTERGYM_BROCK: async () => {
        await gymLeaderBattle("PEWTER_GYM");
        return true;
      },
    },
  },
  CERULEAN_GYM: {
    talk: {
      CERULEANGYM_MISTY: async () => {
        await gymLeaderBattle("CERULEAN_GYM");
        return true;
      },
    },
  },

  ROUTE_24: {
    async step(ow) {
      // rival ambush at the south end of Nugget Bridge
      if (!S.hasBadge(0) || S.hasFlag("BEAT_RIVAL_BRIDGE")) return;
      if (ow.player.y <= 31 && ow.player.y >= 29 && ow.player.x >= 9 && ow.player.x <= 12) {
        S.setFlag("BEAT_RIVAL_BRIDGE");
        ow.lock();
        const rival = ow.spawnExtraNpc({ x: ow.player.x, y: ow.player.y - 4, sprite: "SPRITE_BLUE", movement: "STAY", dir: "DOWN", textId: "RIVAL_EXTRA" }, "blue");
        await ow.showEmote(rival, "shock");
        while (rival.y < ow.player.y - 1) await ow.npcStep(rival, "DOWN", true);
        await say(`${S.rivalName}: ${S.playerName}!\nYou're here too?`, "I bet you're\nsurprised to see\nme again!", "My POKéMON have\ngotten stronger!\nLet's see how\ngood you are!");
        const info = buildTrainerInfo("RIVAL1", 3, S.rivalName);
        if (info) {
          info.smart = true;
          const res = await startTrainerBattle(info);
          if (res !== "win") {
            S.rivalWins++;
            ow.removeNpc(rival);
            ow.unlock();
            return;
          }
          S.rivalLosses++;
          await say(`${S.rivalName}: Humph!\nAt least you're\nraising them OK.`);
        }
        await say(`${S.rivalName}: Go to\nthe end of NUGGET\nBRIDGE. You get a\nprize there!`, "Smell ya later!");
        while (rival.y > ow.player.y - 6) await ow.npcStep(rival, "UP", true);
        ow.removeNpc(rival);
        ow.unlock();
      }
    },
  },
};

// run the Oak's lab gift sequence (entered from Pallet intro)
async function runLabSequence() {
  const ow = OW;
  ow.lock();
  const blue = ow.npcs.find((n) => n.def.sprite === "SPRITE_BLUE");
  await say(`${S.rivalName}: Gramps!\nI'm fed up with\nwaiting!`);
  await say("OAK: Hmm? Oh, you\nhave good timing.", "There on the\ntable!", "That's my old\ncatch, PIKACHU!", "I caught it just\nnow in the wild!", `Go on, ${S.playerName}!\nTake it!`);
  S.setFlag("GOT_PIKACHU");
  const pika = makeMon("PIKACHU", 5, { ot: S.playerName, otId: S.playerId });
  S.dexSeen.add(25);
  S.dexCaught.add(25);
  playCry(25, 0, 128);
  SFX.catch();
  await say(`${S.playerName} received\na PIKACHU!`);
  S.party.push(pika);
  ow.updateFollowerActive();
  await say(`${S.rivalName}: What about\nme? What do I\nget?!`, "OAK: Be patient!\nHere, take this\nEEVEE then!", `${S.rivalName}: Heh, this\nlooks way better\nthan your PIKACHU!`);
  await say(`${S.rivalName}: Wait,\n${S.playerName}!\nLet's check out\nour POKéMON!`, "Come on, I'll take\nyou on!");
  const info = buildTrainerInfo("RIVAL1", 1, S.rivalName);
  let res: "win" | "lose" | "run" | "caught" = "win";
  if (info) {
    res = await startTrainerBattle(info);
    if (res === "win") {
      S.rivalLosses++;
      await say(`${S.rivalName}: WHAT?\nUnbelievable! I\npicked the wrong\nPOKéMON!`);
    } else {
      S.rivalWins++;
    }
    if (S.party[0].hp <= 0) S.party[0].hp = 1;
  }
  S.setFlag("LAB_DONE");
  if (res !== "win") {
    // we blacked out and are now at home; the rival has already left the lab
    ow.unlock();
    return;
  }
  await say(`${S.rivalName}: ${S.playerName}!\nGramps! Smell you\nlater!`);
  if (blue) {
    blue.hidden = false;
    // rival walks out
    blue.dir = "DOWN";
    while (blue.y < 10) await ow.npcStep(blue, "DOWN", true);
    blue.hidden = true;
  }
  await say("OAK: Raise your\nyoung PIKACHU by\nmaking it fight!", "Visit the POKéMON\nMART in VIRIDIAN.\nThey hold an item\nI ordered.");
  ow.unlock();
}

export { givePokemon };
