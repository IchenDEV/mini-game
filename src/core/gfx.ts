// GB-style rendering helpers: 4-shade palettes + tinting of grayscale assets.
import { getImageData } from "./loader";

export type Palette = [string, string, string, string]; // light -> dark css colors
export type RGB = [number, number, number];

export const SCREEN_W = 160;
export const SCREEN_H = 144;

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r},${g},${b})`;
}

export function paletteFromSGB(cols: RGB[]): Palette {
  return [rgbCss(cols[0]), rgbCss(cols[1]), rgbCss(cols[2]), rgbCss(cols[3])];
}

// classify a grayscale pixel into shade 0..3
function shadeOf(r: number, g: number, b: number): number {
  const lum = (r + g + b) / 3;
  if (lum >= 204) return 0;
  if (lum >= 120) return 1;
  if (lum >= 50) return 2;
  return 3;
}

export interface TintOptions {
  transparentShade0?: boolean; // for OBJ sprites: shade 0 = transparent
}

const tintCache = new Map<string, HTMLCanvasElement>();

// Build a colored canvas from a grayscale source image
export function tinted(url: string, pal: RGB[], opts: TintOptions = {}): HTMLCanvasElement {
  const key = `${url}|${pal.map((c) => c.join(".")).join("/")}|${opts.transparentShade0 ? "t" : "o"}`;
  let c = tintCache.get(key);
  if (c) return c;
  const src = getImageData(url);
  c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(src.width, src.height);
  const sd = src.data;
  const od = out.data;
  for (let i = 0; i < sd.length; i += 4) {
    const a = sd[i + 3];
    const s = shadeOf(sd[i], sd[i + 1], sd[i + 2]);
    if (a < 128 || (opts.transparentShade0 && s === 0)) {
      od[i + 3] = 0;
      continue;
    }
    const col = pal[s];
    od[i] = col[0];
    od[i + 1] = col[1];
    od[i + 2] = col[2];
    od[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  tintCache.set(key, c);
  return c;
}

export const GRAYS: RGB[] = [
  [248, 248, 248],
  [168, 168, 168],
  [88, 88, 88],
  [16, 16, 24],
];

// classic paper-white UI palette (menus, battle bg)
export const UI_PAL: RGB[] = [
  [255, 255, 255],
  [169, 169, 169],
  [84, 84, 84],
  [8, 8, 8],
];

// pokemon pic palette on white screens: force shade 0 to pure white
export function monPal(pal: RGB[] | undefined): RGB[] {
  if (!pal) return UI_PAL;
  return [[255, 255, 255], pal[1], pal[2], pal[3]];
}
