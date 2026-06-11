// Gen 1 bitmap font rendering using gfx/font assets + charmap.
import { getImageData } from "./loader";

let charmap: Record<string, number> = {};
let tokens: string[] = [];
// per color cache of glyph sheets
const sheets = new Map<string, { font: HTMLCanvasElement; extra: HTMLCanvasElement }>();

export function initFont(cm: Record<string, number>) {
  charmap = cm;
  tokens = Object.keys(cm).sort((a, b) => b.length - a.length);
}

function buildSheet(url: string, color: string): HTMLCanvasElement {
  const src = getImageData(url);
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(src.width, src.height);
  // parse css rgb
  const m = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
  const [r, g, b] = m ? [+m[1], +m[2], +m[3]] : color === "white" ? [255, 255, 255] : [8, 8, 8];
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
    if (lum < 128 && src.data[i + 3] > 128) {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function getSheets(color: string) {
  let s = sheets.get(color);
  if (!s) {
    s = { font: buildSheet("/assets/font/font.png", color), extra: buildSheet("/assets/font/font_extra.png", color) };
    sheets.set(color, s);
  }
  return s;
}

export function tokenize(text: string): number[] {
  const out: number[] = [];
  let i = 0;
  outer: while (i < text.length) {
    if (text[i] === "\n") {
      out.push(-1);
      i++;
      continue;
    }
    for (const t of tokens) {
      if (t.length > 1 && text.startsWith(t, i)) {
        out.push(charmap[t]);
        i += t.length;
        continue outer;
      }
    }
    const ch = text[i];
    out.push(charmap[ch] ?? charmap[" "] ?? 0x7f);
    i++;
  }
  return out;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "rgb(8,8,8)") {
  const { font, extra } = getSheets(color);
  let cx = x,
    cy = y;
  for (const code of tokenize(text)) {
    if (code === -1) {
      cx = x;
      cy += 8;
      continue;
    }
    if (code >= 0x80) {
      const idx = code - 0x80;
      ctx.drawImage(font, (idx % 16) * 8, (idx >> 4) * 8, 8, 8, cx, cy, 8, 8);
    } else if (code >= 0x60) {
      const idx = code - 0x60;
      ctx.drawImage(extra, (idx % 16) * 8, (idx >> 4) * 8, 8, 8, cx, cy, 8, 8);
    }
    cx += 8;
  }
}

export function textWidth(text: string): number {
  let w = 0,
    max = 0;
  for (const code of tokenize(text)) {
    if (code === -1) {
      w = 0;
      continue;
    }
    w += 8;
    if (w > max) max = w;
  }
  return max;
}
