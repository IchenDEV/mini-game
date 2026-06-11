// Scene stack + main loop.
import { Input } from "../core/input";
import { flushFrame } from "../core/frame";
import { SCREEN_W, SCREEN_H } from "../core/gfx";
import { S } from "./state";

export interface Scene {
  update(): void;
  draw(ctx: CanvasRenderingContext2D): void;
  transparent?: boolean;
}

class GameImpl {
  ctx!: CanvasRenderingContext2D;
  scenes: Scene[] = [];
  private timeAcc = 0;
  private last = 0;
  frame = 0;

  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    const loop = (t: number) => {
      const dt = Math.min(100, t - this.last);
      this.last = t;
      this.timeAcc += dt;
      const step = 1000 / 60;
      let updates = 0;
      const maxUpdates = Input.turbo ? 5 : 2;
      while (this.timeAcc >= step && updates < maxUpdates) {
        this.tick();
        this.timeAcc -= step;
        updates++;
      }
      if (this.timeAcc >= step) this.timeAcc = 0;
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setInterval(() => S.playSeconds++, 1000);
  }

  private tick() {
    this.frame++;
    Input.beginFrame();
    flushFrame();
    const top = this.scenes[this.scenes.length - 1];
    top?.update();
  }

  private draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].transparent) start--;
    for (let i = start; i < this.scenes.length; i++) this.scenes[i].draw(ctx);
  }

  push(s: Scene) {
    this.scenes.push(s);
  }
  pop(s?: Scene) {
    if (s) {
      const i = this.scenes.lastIndexOf(s);
      if (i >= 0) this.scenes.splice(i, 1);
    } else this.scenes.pop();
  }
  replace(s: Scene) {
    this.scenes = [s];
  }
  top(): Scene | undefined {
    return this.scenes[this.scenes.length - 1];
  }
}

export const Game = new GameImpl();
