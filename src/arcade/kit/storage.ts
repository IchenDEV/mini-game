const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return raw;
  } catch {
    // localStorage unavailable (private mode); fall through to memory.
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory copy only.
  }
}

export function loadBest(key: string): number {
  const raw = readRaw(`arcade3d:best:${key}`);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function saveBest(key: string, value: number): void {
  writeRaw(`arcade3d:best:${key}`, String(Math.max(0, Math.round(value))));
}

export function loadSoundEnabled(): boolean {
  return readRaw("arcade3d:sound") !== "off";
}

export function saveSoundEnabled(enabled: boolean): void {
  writeRaw("arcade3d:sound", enabled ? "on" : "off");
}
