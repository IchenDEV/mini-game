let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext;
  if (!Context) return null;
  audioContext ??= new Context();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

function tone(
  frequency: number,
  startOffset: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  endFrequency = frequency,
): void {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + startOffset;
  const end = start + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, endFrequency),
    end,
  );
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function noise(
  startOffset: number,
  duration: number,
  volume: number,
  highpassFrequency: number,
): void {
  const context = getAudioContext();
  if (!context) return;

  const frameCount = Math.max(1, Math.round(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const fade = 1 - index / frameCount;
    channel[index] = (Math.random() * 2 - 1) * fade;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime + startOffset;
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = highpassFrequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

export function playUiTap(): void {
  tone(390, 0, 0.045, 0.022, "triangle", 330);
}

export function playCastSplash(): void {
  noise(0, 0.13, 0.035, 800);
  tone(210, 0, 0.12, 0.018, "sine", 120);
}

export function playBiteWhistle(): void {
  tone(520, 0, 0.08, 0.032, "triangle", 760);
  tone(760, 0.075, 0.1, 0.035, "triangle", 980);
}

export function playCatchChime(): void {
  tone(523, 0, 0.1, 0.04, "triangle");
  tone(659, 0.085, 0.11, 0.04, "triangle");
  tone(784, 0.17, 0.16, 0.04, "triangle");
}

export function playCoinChime(): void {
  tone(740, 0, 0.07, 0.032, "sine");
  tone(990, 0.055, 0.1, 0.03, "sine");
}

export function playUpgradeStamp(): void {
  tone(170, 0, 0.07, 0.035, "square", 120);
  tone(440, 0.09, 0.14, 0.032, "triangle", 660);
}

export function playWarningTone(): void {
  tone(260, 0, 0.12, 0.027, "sawtooth", 185);
}

// Compatibility aliases for older imports during the theme migration.
export const playUiTick = playUiTap;
export const playSaleChime = playCoinChime;
