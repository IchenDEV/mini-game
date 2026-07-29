let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext;
  if (!Context) return null;
  audioContext ??= new Context();
  return audioContext;
}

function tone(
  frequency: number,
  startOffset: number,
  duration: number,
  volume: number,
): void {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + startOffset;

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playSaleChime(): void {
  tone(660, 0, 0.09, 0.045);
  tone(880, 0.075, 0.11, 0.04);
}

export function playUiTick(): void {
  tone(420, 0, 0.045, 0.025);
}

export function playWarningTone(): void {
  tone(240, 0, 0.08, 0.025);
}
