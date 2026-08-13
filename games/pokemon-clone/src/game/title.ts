// Title screen + new game / continue.
import { Game, type Scene } from "./game";
import { Input } from "../core/input";
import { nextFrame, waitButton } from "../core/frame";
import { drawText } from "../core/font";
import { tinted, UI_PAL, type RGB } from "../core/gfx";
import { D } from "./data";
import { S, hasSave } from "./state";
import { menu } from "./ui";
import { OW } from "./overworld";
import { runIntro } from "./events";
import { playCry } from "../core/audio";

const YELLOW: RGB[] = [
  [255, 252, 220],
  [248, 216, 88],
  [180, 120, 24],
  [24, 24, 32],
];

class TitleScene implements Scene {
  t = 0;
  update() {
    this.t++;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgb(248,232,120)";
    ctx.fillRect(0, 0, 160, 144);
    ctx.fillStyle = "rgb(200,40,40)";
    ctx.fillRect(0, 20, 160, 36);
    drawText(ctx, "POKéMON", 24, 28, "white");
    drawText(ctx, "Yellow Version", 26, 42, "white");
    // pikachu front sprite
    const img = tinted("/assets/pokemon/front/pikachu.png", YELLOW);
    ctx.drawImage(img, 0, 0, img.width, img.height, 80 - img.width, 64, img.width * 2, img.height * 2);
    if (Math.floor(this.t / 30) % 2 === 0) drawText(ctx, "PRESS START", 36, 126);
    drawText(ctx, "web clone edition", 14, 4);
  }
}

export async function runTitle() {
  const title = new TitleScene();
  Game.replace(title);
  playCry(25, 0, 128);
  await waitButton("START", "A");
  for (;;) {
    const opts = hasSave() ? ["CONTINUE", "NEW GAME"] : ["NEW GAME"];
    const i = await menu(opts, { x: 8, y: 8, cancelable: true });
    if (i < 0) continue;
    const choice = opts[i];
    if (choice === "CONTINUE") {
      S.load();
      Game.replace(OW);
      await OW.enter(S.map, S.x, S.y, S.dir);
      OW.updateFollowerActive();
      return;
    }
    if (choice === "NEW GAME") {
      localStorage.removeItem("pyellow_save");
      await runIntro();
      return;
    }
  }
}
