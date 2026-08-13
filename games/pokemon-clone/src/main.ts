// Boot: load data + assets, then hand off to the title screen.
import { D } from "./game/data";
import { Game } from "./game/game";
import { Input } from "./core/input";
import { initFont, drawText } from "./core/font";
import { loadJSON, preloadImages } from "./core/loader";
import { unlockAudio } from "./core/audio";
import { runTitle } from "./game/title";
import { S } from "./game/state";
import { OW } from "./game/overworld";
import { makeMon } from "./game/pokemon";
import { startWildBattleScripted } from "./game/wiring";

async function boot() {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 160, 144);
  ctx.fillStyle = "#222";
  ctx.font = "8px monospace";
  ctx.fillText("LOADING...", 56, 70);

  Input.init();
  Input.onAnyInput = () => unlockAudio();

  await D.load();
  initFont(D.charmap);

  const manifest = await loadJSON<Record<string, string[]>>("/assets/data/manifest.json");
  const urls: string[] = [];
  for (const [dir, files] of Object.entries(manifest)) {
    for (const f of files) urls.push(`/assets/${dir}/${f}`);
  }
  let lastPct = -1;
  await preloadImages(urls, (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 80, 160, 16);
      ctx.fillStyle = "#222";
      ctx.fillRect(16, 84, Math.floor(128 * (done / total)), 6);
      ctx.strokeStyle = "#222";
      ctx.strokeRect(15.5, 83.5, 129, 7);
    }
  });

  Game.init(canvas);

  // dev helpers (also used by automated playtesting)
  const params = new URLSearchParams(location.search);
  const w = window as unknown as Record<string, unknown>;
  w.__dbg = {
    S,
    D,
    OW,
    Game,
    warp: (map: string, x: number, y: number) => OW.fadeWarpTo(map, x, y, "DOWN"),
    give: (item: string, qty = 1) => S.addItem(item, qty),
    mon: (species: string, level: number) => {
      const m = makeMon(species, level, { ot: S.playerName, otId: S.playerId });
      if (S.party.length < 6) S.party.push(m);
      OW.updateFollowerActive();
    },
    wild: (species: string, level: number) => void startWildBattleScripted(D.species(species).dex, level),
  };

  if (params.has("skip")) {
    S.playerName = params.get("name") ?? "ASH";
    S.rivalName = params.get("rival") ?? "GARY";
    if (params.has("pika")) {
      S.party.push(makeMon("PIKACHU", parseInt(params.get("pika") ?? "5"), { ot: S.playerName, otId: S.playerId }));
      S.setFlag("GOT_PIKACHU");
      S.dexCaught.add(25);
      S.dexSeen.add(25);
    }
    Game.replace(OW);
    const map = params.get("map") ?? "REDS_HOUSE_2F";
    const x = parseInt(params.get("x") ?? "3");
    const y = parseInt(params.get("y") ?? "6");
    OW.updateFollowerActive();
    void OW.enter(map, x, y, "DOWN");
    return;
  }
  void runTitle();
}

void boot();
