export type StarweaverSoundEffect =
  | "tether"
  | "release"
  | "stitch"
  | "near-miss"
  | "hazard"
  | "spark"
  | "gameover";

type BrowserWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface TonePart {
  frequency: number;
  endFrequency?: number;
  offset?: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
}

/** WebAudio effects with gesture-safe lazy initialization and silent failure. */
class StarweaverSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): boolean {
    this.enabled = enabled;
    if (this.master && this.context) {
      try {
        this.master.gain.setTargetAtTime(
          enabled ? 0.72 : 0.0001,
          this.context.currentTime,
          0.012,
        );
      } catch {
        // Audio output is optional and must never interrupt the game loop.
      }
    }
    return this.enabled;
  }

  toggle(): boolean {
    return this.setEnabled(!this.enabled);
  }

  /** Call directly from a pointer/key gesture. Rejections are swallowed. */
  async unlock(): Promise<void> {
    if (!this.enabled || typeof window === "undefined") return;

    try {
      if (!this.context) {
        const browserWindow = window as BrowserWindow;
        const AudioContextConstructor =
          browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
        if (!AudioContextConstructor) return;

        this.context = new AudioContextConstructor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.72;
        this.master.connect(this.context.destination);
      }

      if (this.context.state === "suspended") await this.context.resume();
    } catch {
      // Autoplay policy, privacy mode, or missing output device: stay silent.
    }
  }

  play(effect: StarweaverSoundEffect): void {
    if (!this.enabled) return;

    void this.unlock()
      .then(() => {
        if (!this.enabled || !this.context || !this.master) return;
        this.scheduleEffect(effect);
      })
      .catch(() => undefined);
  }

  private scheduleEffect(effect: StarweaverSoundEffect): void {
    try {
      switch (effect) {
        case "tether":
          this.tone({
            frequency: 280,
            endFrequency: 520,
            duration: 0.11,
            volume: 0.035,
            type: "triangle",
          });
          break;
        case "release":
          this.noise(0, 0.075, 0.025, 1_400);
          this.tone({
            frequency: 610,
            endFrequency: 250,
            duration: 0.13,
            volume: 0.03,
            type: "sawtooth",
          });
          break;
        case "stitch":
          this.chord([
            { frequency: 523, duration: 0.14, volume: 0.035 },
            { frequency: 659, offset: 0.07, duration: 0.17, volume: 0.035 },
            { frequency: 988, offset: 0.14, duration: 0.23, volume: 0.03 },
          ]);
          break;
        case "near-miss":
          this.chord([
            {
              frequency: 880,
              endFrequency: 1_320,
              duration: 0.09,
              volume: 0.025,
              type: "triangle",
            },
            {
              frequency: 1_320,
              endFrequency: 1_760,
              offset: 0.065,
              duration: 0.1,
              volume: 0.022,
              type: "sine",
            },
          ]);
          break;
        case "hazard":
          this.noise(0, 0.22, 0.055, 180);
          this.chord([
            {
              frequency: 150,
              endFrequency: 62,
              duration: 0.28,
              volume: 0.055,
              type: "sawtooth",
            },
            {
              frequency: 92,
              endFrequency: 48,
              offset: 0.04,
              duration: 0.3,
              volume: 0.04,
              type: "square",
            },
          ]);
          break;
        case "spark":
          this.chord([
            { frequency: 740, duration: 0.08, volume: 0.025 },
            { frequency: 1_110, offset: 0.055, duration: 0.13, volume: 0.024 },
          ]);
          break;
        case "gameover":
          this.chord([
            {
              frequency: 392,
              endFrequency: 330,
              duration: 0.24,
              volume: 0.035,
              type: "triangle",
            },
            {
              frequency: 294,
              endFrequency: 196,
              offset: 0.19,
              duration: 0.42,
              volume: 0.035,
              type: "triangle",
            },
          ]);
          break;
      }
    } catch {
      // Nodes can fail during device changes; gameplay remains authoritative.
    }
  }

  private chord(parts: readonly TonePart[]): void {
    for (const part of parts) this.tone(part);
  }

  private tone(part: TonePart): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + (part.offset ?? 0);
    const end = start + part.duration;
    oscillator.type = part.type ?? "sine";
    oscillator.frequency.setValueAtTime(Math.max(40, part.frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, part.endFrequency ?? part.frequency),
      end,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(part.volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.025);
  }

  private noise(
    offset: number,
    duration: number,
    volume: number,
    highpass: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const sampleCount = Math.max(1, Math.round(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      const fade = 1 - index / sampleCount;
      channel[index] = (Math.random() * 2 - 1) * fade;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + offset;
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.025);
  }
}

export const starweaverSound = new StarweaverSound();
