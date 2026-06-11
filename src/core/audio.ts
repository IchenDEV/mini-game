// Tiny GB-flavored synthesizer for SFX and Pokémon cries.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let muted = false;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

function pulse(freq: number, t0: number, dur: number, vol = 0.5, duty = 0.5, sweepTo?: number) {
  const a = ac();
  const osc = a.createOscillator();
  // approximate duty cycles with different waveforms
  osc.type = duty === 0.5 ? "square" : "sawtooth";
  osc.frequency.setValueAtTime(freq, a.currentTime + t0);
  if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), a.currentTime + t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0, a.currentTime + t0);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + t0 + 0.005);
  g.gain.setValueAtTime(vol, a.currentTime + t0 + dur * 0.6);
  g.gain.linearRampToValueAtTime(0, a.currentTime + t0 + dur);
  osc.connect(g).connect(master!);
  osc.start(a.currentTime + t0);
  osc.stop(a.currentTime + t0 + dur + 0.02);
}

function noise(t0: number, dur: number, vol = 0.3, rate = 1) {
  const a = ac();
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) {
    if (i % Math.max(1, Math.floor(8 / rate)) === 0) v = Math.random() * 2 - 1;
    d[i] = v * (1 - i / len);
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master!);
  src.start(a.currentTime + t0);
}

export const SFX = {
  aButton: () => pulse(1024, 0, 0.045, 0.35),
  bump: () => pulse(110, 0, 0.1, 0.4, 0.5, 70),
  warp: () => {
    pulse(520, 0, 0.08, 0.3, 0.5, 880);
    pulse(880, 0.08, 0.08, 0.3, 0.5, 1320);
  },
  door: () => pulse(740, 0, 0.09, 0.32, 0.5, 980),
  ledge: () => pulse(300, 0, 0.12, 0.3, 0.5, 600),
  save: () => {
    [660, 880, 990, 1320].forEach((f, i) => pulse(f, i * 0.09, 0.08, 0.3));
  },
  heal: () => {
    [988, 1319, 1568, 1976].forEach((f, i) => pulse(f, i * 0.12, 0.1, 0.3));
  },
  hitNormal: () => noise(0, 0.12, 0.4, 2),
  hitSuper: () => {
    noise(0, 0.2, 0.5, 1);
    pulse(150, 0, 0.18, 0.3, 0.5, 60);
  },
  hitWeak: () => noise(0, 0.09, 0.25, 4),
  ballThrow: () => pulse(440, 0, 0.12, 0.3, 0.5, 880),
  ballShake: () => pulse(220, 0, 0.07, 0.4, 0.5, 180),
  ballClick: () => pulse(1200, 0, 0.05, 0.35),
  catch: () => {
    [523, 659, 784, 1047].forEach((f, i) => pulse(f, i * 0.1, 0.09, 0.3));
  },
  run: () => pulse(900, 0, 0.18, 0.3, 0.5, 200),
  expTick: () => pulse(1500, 0, 0.02, 0.2),
  levelUp: () => {
    [523, 659, 784, 1046, 1318].forEach((f, i) => pulse(f, i * 0.07, 0.07, 0.3));
  },
  buy: () => {
    pulse(1320, 0, 0.06, 0.3);
    pulse(990, 0.07, 0.08, 0.3);
  },
  denied: () => pulse(180, 0, 0.15, 0.35),
  pcOn: () => pulse(660, 0, 0.1, 0.3, 0.5, 1320),
  badge: () => {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => pulse(f, i * 0.08, 0.08, 0.32));
  },
  thunder: () => {
    noise(0, 0.35, 0.5, 0.6);
    pulse(80, 0.05, 0.3, 0.3, 0.5, 50);
  },
};

// Gen 1-style cry: derived from base cry id + pitch/length params
export function playCry(base: number, pitch: number, length: number) {
  const f0 = 220 + ((base * 53) % 29) * 26 + (pitch - 128) * 0.9;
  const dur = 0.28 + (length / 255) * 0.55;
  const shape = base % 4;
  if (shape === 0) {
    pulse(f0 * 1.2, 0, dur * 0.7, 0.4, 0.5, f0 * 0.7);
    pulse(f0 * 1.21, 0.02, dur * 0.7, 0.25, 0.5, f0 * 0.68);
    noise(0, dur * 0.25, 0.2, 1.5);
  } else if (shape === 1) {
    pulse(f0 * 0.8, 0, dur * 0.4, 0.4, 0.5, f0 * 1.3);
    pulse(f0 * 1.3, dur * 0.4, dur * 0.5, 0.35, 0.5, f0 * 0.6);
  } else if (shape === 2) {
    pulse(f0, 0, dur * 0.3, 0.4, 0.5, f0 * 1.05);
    pulse(f0 * 1.06, dur * 0.33, dur * 0.3, 0.4, 0.5, f0 * 1.1);
    pulse(f0 * 0.95, dur * 0.66, dur * 0.34, 0.35, 0.5, f0 * 0.5);
  } else {
    pulse(f0 * 1.4, 0, dur, 0.4, 0.5, f0 * 0.45);
    noise(dur * 0.5, dur * 0.4, 0.18, 0.8);
  }
}

export function unlockAudio() {
  ac();
}
