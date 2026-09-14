export function createSoundscape() {
  let context,
    master,
    enabled = true,
    volume = 0.35,
    noiseSource,
    ambientFilter,
    ambientGain,
    lastPlace,
    lastPlaceBeat = -1,
    lastNote = -1,
    lastBeat = -1;
  function note(frequency, duration = 0.3, gain = 0.12, type = "triangle", delay = 0) {
    if (!context || !enabled) return;
    const now = context.currentTime + delay,
      osc = context.createOscillator(),
      amp = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }
  return {
    async start() {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = enabled ? volume : 0;
        master.connect(context.destination);
        const buffer = context.createBuffer(
            1,
            context.sampleRate * 3,
            context.sampleRate,
          ),
          data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < data.length; i++) {
          previous = (previous + (Math.random() - 0.5) * 0.035) / 1.025;
          data[i] = previous;
        }
        noiseSource = context.createBufferSource();
        noiseSource.buffer = buffer;
        noiseSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 450;
        const gain = context.createGain();
        gain.gain.value = 0.17;
        ambientFilter = filter;
        ambientGain = gain;
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        noiseSource.start();
      }
      await context.resume();
    },
    setEnabled(value) {
      enabled = value;
      if (master)
        master.gain.setTargetAtTime(
          enabled ? volume : 0,
          context.currentTime,
          0.1,
        );
    },
    setVolume(value) {
      volume = value;
      if (master)
        master.gain.setTargetAtTime(
          enabled ? volume : 0,
          context.currentTime,
          0.1,
        );
    },
    cue(kind) {
      if (kind === "transit-bell") {
        note(784, 0.6, 0.08, "sine"); note(784, 0.6, 0.08, "sine", 0.32);
        return;
      }
      if (kind === "steam-whistle" || kind === "airship-horn") {
        const base = kind === "steam-whistle" ? 330 : 146.8;
        note(base, 1.2, 0.055, "triangle"); note(base * 1.5, 1, 0.035, "sine");
        return;
      }
      if (kind === "success") {
        note(523.25, 0.45, 0.13);
        setTimeout(() => note(659.25, 0.5, 0.11), 120);
        setTimeout(() => note(783.99, 0.65, 0.1), 250);
      } else if (kind === "page") note(220, 0.09, 0.035, "sine");
      else note(440, 0.12, 0.05);
    },
    update(time, state, place = {}) {
      if (context && place.scene?.startsWith("scene")) {
        const quiet =
          place.interior &&
          ["scene01", "scene02", "scene10"].includes(place.scene);
        const key = place.scene + Boolean(place.interior);
        if (key !== lastPlace) {
          lastPlace = key;
          ambientFilter.frequency.setTargetAtTime(
            quiet ? 180 : place.interior ? 320 : 550,
            context.currentTime,
            0.5,
          );
          ambientGain.gain.setTargetAtTime(
            quiet ? 0.035 : 0.12,
            context.currentTime,
            0.5,
          );
        }
        const beat = Math.floor(time * (place.traffic ? 3 : 0.22));
        if (beat !== lastPlaceBeat) {
          lastPlaceBeat = beat;
          if (place.traffic)
            note(115 + (beat % 2) * 22, 0.055, 0.035, "triangle");
          else if (place.scene === "scene01" && beat % 5 === 0) {
            note(392, 2.8, 0.025, "sine");
            note(784, 1.3, 0.008, "sine");
          } else if (
            ["scene07", "scene08"].includes(place.scene) &&
            place.interior
          )
            note(150, 0.06, 0.015, "triangle");
        }
      }
      if (!context || !enabled) return;
      const step = Math.floor(time / 2.4);
      if (step !== lastNote) {
        lastNote = step;
        const tune = [
          261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 392, 261.63, 329.63,
          392, 523.25,
        ];
        note(tune[step % tune.length], 1.8, 0.04, "sine");
        note(tune[step % tune.length] / 2, 2.1, 0.025, "sine");
      }
      const beat = Math.floor(time * 1.5);
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (
          !state.delivered ||
          state.pumpRestored ||
          !(time % 8.6 > 5.7 && time % 8.6 < 6.6)
        )
          note(90, 0.04, 0.03, "triangle");
      }
    },
    suspend() {
      context?.suspend();
    },
    resume() {
      if (context && enabled) void context.resume();
    },
  };
}
