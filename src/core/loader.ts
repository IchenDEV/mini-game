// Asset loading: JSON data + PNG images (decoded to ImageData for palette work).

const imageCache = new Map<string, HTMLImageElement>();
const imageDataCache = new Map<string, ImageData>();

function resolveAssetUrl(url: string): string {
  if (!url.startsWith("/assets/")) return url;
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${url}`;
}

export async function loadJSON<T>(url: string): Promise<T> {
  const res = await fetch(resolveAssetUrl(url));
  if (!res.ok) throw new Error(`failed to load ${url}`);
  return res.json();
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`failed image ${url}`));
    img.src = resolveAssetUrl(url);
  });
}

export function getImage(url: string): HTMLImageElement {
  const img = imageCache.get(url);
  if (!img) throw new Error(`image not preloaded: ${url}`);
  return img;
}

export function hasImage(url: string): boolean {
  return imageCache.has(url);
}

export function getImageData(url: string): ImageData {
  let d = imageDataCache.get(url);
  if (!d) {
    const img = getImage(url);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    d = ctx.getImageData(0, 0, img.width, img.height);
    imageDataCache.set(url, d);
  }
  return d;
}

export async function preloadImages(urls: string[], onProgress?: (done: number, total: number) => void) {
  let done = 0;
  await Promise.all(
    urls.map(async (u) => {
      try {
        await loadImage(u);
      } catch {
        // tolerate missing optional assets
      }
      done++;
      onProgress?.(done, urls.length);
    })
  );
}
