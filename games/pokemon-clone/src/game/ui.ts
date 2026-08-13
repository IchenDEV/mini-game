// UI primitives: GB-style window box, dialog textbox, list menus, naming screen.
import { drawText, textWidth, tokenize } from "../core/font";
import { Input } from "../core/input";
import { nextFrame } from "../core/frame";
import { SFX } from "../core/audio";
import { Game, type Scene } from "./game";
import { S } from "./state";

export function processText(s: string): string {
  return s
    .replaceAll("<PLAYER>", S.playerName)
    .replaceAll("<RIVAL>", S.rivalName)
    .replaceAll("<PKMN>", "<PK><MN>")
    .replaceAll("<……>", "……")
    .replaceAll("<TARGET>", "enemy")
    .replaceAll("<USER>", "it");
}

export function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // w/h in pixels; classic white window with black frame
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#101018";
  // frame inset by 2px, 1px thick, with notched corners like GB UI
  ctx.fillRect(x + 3, y + 2, w - 6, 1);
  ctx.fillRect(x + 3, y + h - 3, w - 6, 1);
  ctx.fillRect(x + 2, y + 3, 1, h - 6);
  ctx.fillRect(x + w - 3, y + 3, 1, h - 6);
  ctx.fillRect(x + 3, y + 3, 1, 1);
  ctx.fillRect(x + w - 4, y + 3, 1, 1);
  ctx.fillRect(x + 3, y + h - 4, 1, 1);
  ctx.fillRect(x + w - 4, y + h - 4, 1, 1);
}

// ---------------- Textbox ----------------

class TextScene implements Scene {
  transparent = true;
  lines: string[] = [];
  shown: string[] = ["", ""]; // two visible rows
  queue: string[] = [];
  charDelay = 0;
  done = false;
  waitingAdvance = false;
  waitingFinal = false;
  arrowBlink = 0;
  resolve!: () => void;
  promise: Promise<void>;
  private curLine = 0; // 0 or 1: row being typed
  private pos = 0;
  private noWaitEnd: boolean;

  constructor(paras: string[], noWaitEnd = false) {
    this.noWaitEnd = noWaitEnd;
    const lines: string[] = [];
    paras.forEach((p, i) => {
      const ls = processText(p).split("\n");
      if (i > 0) lines.push("\f"); // paragraph break marker
      lines.push(...ls);
    });
    this.queue = lines;
    this.promise = new Promise((r) => (this.resolve = r));
    this.nextLine();
  }

  private nextLine() {
    if (this.queue.length === 0) {
      this.done = true;
      if (this.noWaitEnd) this.finish();
      else this.waitingFinal = true;
      return;
    }
    const next = this.queue.shift()!;
    if (next === "\f") {
      // paragraph: wait, then clear box
      this.waitingAdvance = true;
      this.shown[0] = this.shown[0] || "";
      this.parClear = true;
      return;
    }
    if (this.curLine === 0 && this.shown[0] === "") {
      this.typing = next;
      this.pos = 0;
    } else if (this.curLine === 0) {
      this.curLine = 1;
      this.typing = next;
      this.pos = 0;
    } else {
      // need scroll: wait for input first (Gen 1 waits with arrow on cont lines)
      this.waitingAdvance = true;
      this.pendingLine = next;
    }
  }

  private typing: string | null = null;
  private pendingLine: string | null = null;
  private parClear = false;

  finish() {
    Game.pop(this);
    this.resolve();
  }

  update() {
    this.arrowBlink++;
    if (this.waitingFinal) {
      if (Input.pressed("A") || Input.pressed("B")) {
        SFX.aButton();
        this.finish();
      }
      return;
    }
    if (this.waitingAdvance) {
      if (Input.pressed("A") || Input.pressed("B")) {
        SFX.aButton();
        this.waitingAdvance = false;
        if (this.parClear) {
          this.shown = ["", ""];
          this.curLine = 0;
          this.parClear = false;
          this.nextLine();
        } else if (this.pendingLine !== null) {
          this.shown[0] = this.shown[1];
          this.shown[1] = "";
          this.typing = this.pendingLine;
          this.pendingLine = null;
          this.pos = 0;
        }
      }
      return;
    }
    if (this.typing !== null) {
      const speed = Input.held("A") || Input.held("B") ? 0 : S.options.textSpeed;
      if (this.charDelay > 0) {
        this.charDelay--;
        return;
      }
      // reveal next char (may reveal multiple when speed 0)
      const reveal = speed === 0 ? 3 : 1;
      for (let i = 0; i < reveal && this.typing !== null; i++) {
        this.pos++;
        const row = this.curLine;
        this.shown[row] = this.typing.slice(0, this.pos);
        if (this.pos >= this.typing.length) {
          this.typing = null;
          this.nextLine();
          break;
        }
      }
      this.charDelay = speed;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawBox(ctx, 0, 96, 160, 48);
    drawText(ctx, this.shown[0], 8, 112);
    drawText(ctx, this.shown[1], 8, 128);
    if ((this.waitingAdvance || this.waitingFinal) && Math.floor(this.arrowBlink / 16) % 2 === 0) {
      drawText(ctx, "▼", 144, 132);
    }
  }
}

export function say(...paras: string[]): Promise<void> {
  const sc = new TextScene(paras.filter((p) => p && p.length));
  Game.push(sc);
  return sc.promise;
}

export function sayNoWait(...paras: string[]): Promise<void> {
  const sc = new TextScene(paras, true);
  Game.push(sc);
  return sc.promise;
}

// keeps the box on screen, resolves immediately after text typed out fully
export class StickyText implements Scene {
  transparent = true;
  text: string[] = ["", ""];
  constructor(...lines: string[]) {
    this.setText(...lines);
  }
  setText(...lines: string[]) {
    const all = processText(lines.join("\n")).split("\n");
    this.text = [all[0] || "", all[1] || ""];
  }
  update() {}
  draw(ctx: CanvasRenderingContext2D) {
    drawBox(ctx, 0, 96, 160, 48);
    drawText(ctx, this.text[0], 8, 112);
    drawText(ctx, this.text[1], 8, 128);
  }
}

// ---------------- Menus ----------------

export interface MenuOpts {
  x?: number;
  y?: number;
  width?: number; // pixels; auto if omitted
  cancelable?: boolean;
  right?: string[]; // right-aligned secondary text per item
  title?: string;
  startIndex?: number;
  rowH?: number;
  silent?: boolean;
}

export class MenuScene implements Scene {
  transparent = true;
  idx = 0;
  resolve!: (i: number) => void;
  promise: Promise<number>;
  x: number;
  y: number;
  w: number;
  h: number;
  rowH: number;

  constructor(public items: string[], public opts: MenuOpts = {}) {
    this.promise = new Promise((r) => (this.resolve = r));
    this.idx = opts.startIndex ?? 0;
    this.rowH = opts.rowH ?? 16;
    const wText = Math.max(...items.map((t) => textWidth(processText(t))), opts.title ? textWidth(opts.title) : 0);
    const wRight = opts.right ? Math.max(...opts.right.map((t) => textWidth(t))) + 8 : 0;
    this.w = opts.width ?? Math.min(160, wText + wRight + 24);
    this.h = items.length * this.rowH + 16;
    this.x = opts.x ?? 160 - this.w;
    this.y = opts.y ?? 0;
  }

  update() {
    if (Input.pressed("DOWN")) {
      this.idx = (this.idx + 1) % this.items.length;
      if (!this.opts.silent) SFX.aButton();
    } else if (Input.pressed("UP")) {
      this.idx = (this.idx + this.items.length - 1) % this.items.length;
      if (!this.opts.silent) SFX.aButton();
    } else if (Input.pressed("A")) {
      SFX.aButton();
      Game.pop(this);
      this.resolve(this.idx);
    } else if (Input.pressed("B") && this.opts.cancelable !== false) {
      Game.pop(this);
      this.resolve(-1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawBox(ctx, this.x, this.y, this.w, this.h);
    this.items.forEach((it, i) => {
      const ty = this.y + 8 + i * this.rowH;
      drawText(ctx, processText(it), this.x + 14, ty);
      const r = this.opts.right?.[i];
      if (r) drawText(ctx, r, this.x + this.w - 6 - textWidth(r), ty);
    });
    drawText(ctx, "▶", this.x + 5, this.y + 8 + this.idx * this.rowH);
  }
}

export function menu(items: string[], opts: MenuOpts = {}): Promise<number> {
  const m = new MenuScene(items, opts);
  Game.push(m);
  return m.promise;
}

export async function yesNo(defaultYes = true): Promise<boolean> {
  const i = await menu(["YES", "NO"], { x: 0, y: 56, startIndex: defaultYes ? 0 : 1 });
  return i === 0;
}

// ---------------- Naming screen ----------------

const NAME_GRID = [
  "ABCDEFGHI",
  "JKLMNOPQR",
  "STUVWXYZ ",
  "abcdefghi",
  "jklmnopqr",
  "stuvwxyz ",
  "0123456789",
];

export class NamingScene implements Scene {
  cx = 0;
  cy = 0;
  name = "";
  resolve!: (n: string) => void;
  promise: Promise<string>;
  constructor(public title: string, public maxLen = 7, public initial = "") {
    this.promise = new Promise((r) => (this.resolve = r));
    this.name = initial;
  }
  update() {
    const rows = NAME_GRID.length + 1; // +1 = END row
    if (Input.pressed("UP")) this.cy = (this.cy + rows - 1) % rows;
    if (Input.pressed("DOWN")) this.cy = (this.cy + 1) % rows;
    if (this.cy < NAME_GRID.length) {
      const row = NAME_GRID[this.cy];
      if (Input.pressed("LEFT")) this.cx = (this.cx + row.length - 1) % row.length;
      if (Input.pressed("RIGHT")) this.cx = (this.cx + 1) % row.length;
      if (this.cx >= row.length) this.cx = row.length - 1;
    }
    if (Input.pressed("A")) {
      SFX.aButton();
      if (this.cy === NAME_GRID.length) {
        if (this.name.length > 0) {
          Game.pop(this);
          this.resolve(this.name);
        }
      } else {
        const ch = NAME_GRID[this.cy][this.cx];
        if (ch !== " " && this.name.length < this.maxLen) this.name += ch;
      }
    }
    if (Input.pressed("B")) {
      this.name = this.name.slice(0, -1);
    }
    if (Input.pressed("START")) {
      if (this.name.length > 0) {
        Game.pop(this);
        this.resolve(this.name);
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 160, 144);
    drawText(ctx, this.title, 8, 4);
    drawText(ctx, this.name + (this.name.length < this.maxLen ? "_" : ""), 80, 16);
    NAME_GRID.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        drawText(ctx, row[rx], 12 + rx * 16, 32 + ry * 12);
      }
    });
    drawText(ctx, "END", 12, 32 + NAME_GRID.length * 12);
    // cursor
    if (this.cy < NAME_GRID.length) drawText(ctx, "▶", 4 + this.cx * 16, 32 + this.cy * 12);
    else drawText(ctx, "▶", 4, 32 + NAME_GRID.length * 12);
  }
}

export function nameInput(title: string, maxLen = 7, initial = ""): Promise<string> {
  const s = new NamingScene(title, maxLen, initial);
  Game.push(s);
  return s.promise;
}

// small fade helper
export async function fade(out = true, frames = 12) {
  const sc: Scene & { t: number } = {
    transparent: true,
    t: 0,
    update() {},
    draw(ctx) {
      const a = out ? this.t / frames : 1 - this.t / frames;
      ctx.fillStyle = `rgba(8,8,16,${a})`;
      ctx.fillRect(0, 0, 160, 144);
    },
  };
  Game.push(sc);
  for (let i = 0; i <= frames; i++) {
    sc.t = i;
    await nextFrame();
  }
  if (!out) Game.pop(sc);
  return sc; // caller pops when out=true after swapping scenes
}
