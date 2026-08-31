import type { AudioCue, AudioCueName } from "./types";
import { loadSoundEnabled, saveSoundEnabled } from "./storage";

type WindowWithAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Tiny procedural synth shared by every arcade game. Cues map to short
 * envelopes; no audio assets needed anywhere.
 */
export class ArcadeAudio implements AudioCue {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor() {
    this.enabled = loadSoundEnabled();
  }

  /** Create/resume the AudioContext from a user gesture. */
  unlock(): void {
    const w = window as WindowWithAudio;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    saveSoundEnabled(enabled);
  }

  play(name: AudioCueName, variation = 0): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const v = Math.max(-1, Math.min(1, variation));
    switch (name) {
      case "pickup":
        this.tone(now, 620 + v * 90, 940 + v * 120, 0.12, "sine", 0.8);
        break;
      case "tick":
        this.tone(now, 520, 520, 0.05, "triangle", 0.5);
        break;
      case "swap":
        this.tone(now, 340, 500, 0.08, "triangle", 0.6);
        break;
      case "shoot":
        this.tone(now, 880, 240, 0.14, "square", 0.5);
        break;
      case "power":
        this.tone(now, 180, 720, 0.22, "sawtooth", 0.5);
        break;
      case "hit":
        this.noise(now, 0.16, 0.9);
        this.tone(now, 220, 70, 0.18, "sawtooth", 0.7);
        break;
      case "win":
        this.tone(now, 523, 523, 0.12, "sine", 0.7);
        this.tone(now + 0.11, 659, 659, 0.12, "sine", 0.7);
        this.tone(now + 0.22, 784, 784, 0.2, "sine", 0.8);
        break;
      case "lose":
        this.tone(now, 330, 160, 0.3, "sawtooth", 0.6);
        this.tone(now + 0.18, 220, 90, 0.4, "sawtooth", 0.5);
        break;
    }
  }

  private tone(
    at: number,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, Math.max(1, frames), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    env.gain.value = gain * 0.5;
    src.buffer = buffer;
    src.connect(env).connect(master);
    src.start(at);
  }
}
