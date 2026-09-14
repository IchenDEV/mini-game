// Original score: "The Clockmaker's Paper Sky". 32 bars, 3/4, A–A′–B–A″.
// Scale degrees, rather than recorded assets, let each district share its theme.
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const A = [
  [4, null, 2, 1, 2, null],
  [5, null, 4, 2, 0, null],
  [3, null, 5, 4, 2, null],
  [4, null, 1, null, -1, null],
  [7, null, 6, 4, 2, null],
  [2, null, 4, 6, 4, null],
  [3, null, 1, 2, 3, null],
  [1, null, -1, null, 0, null],
];
const B = [
  [5, null, 7, 6, 5, null],
  [4, null, 6, null, 8, null],
  [7, null, 5, 4, 3, null],
  [2, null, 4, null, 6, null],
  [5, 4, 3, null, 1, null],
  [2, null, 0, 2, 4, null],
  [3, null, 5, 3, 1, null],
  [1, null, 4, null, 6, null],
];
const MELODY = [
  ...A,
  ...A.map((bar, i) =>
    i === 3
      ? [4, null, 6, 5, 4, null]
      : i === 7
        ? [1, null, -1, 1, 2, null]
        : [...bar],
  ),
  ...B,
  ...A.map((bar, i) =>
    i === 4
      ? [7, 6, 4, null, 2, null]
      : i === 7
        ? [1, null, 0, null, null, null]
        : [...bar],
  ),
];
const HARMONY = [
  0, 5, 3, 4, 0, 2, 1, 4, 0, 5, 3, 4, 5, 2, 1, 4, 5, 2, 3, 0, 1, 5, 3, 4, 0, 5,
  3, 4, 0, 2, 4, 0,
];
const REGIONS = [
  { root: 62, lead: "box", backing: "box", pan: -0.16 },
  { root: 67, lead: "flute", backing: "bell", pan: 0.16 },
  { root: 60, lead: "harp", backing: "harp", pan: -0.22 },
  { root: 57, lead: "pizz", backing: "pizz", pan: 0.12 },
  { root: 65, lead: "bell", backing: "pad", pan: -0.12 },
  { root: 62, lead: "flute", backing: "harp", pan: 0.18 },
];
// attack, decay, sustain, release, filter Hz, overtone ratio, overtone level
const TIMBRES = {
  box: [0.012, 0.16, 0.12, 0.45, 3400, 2, 0.13],
  bell: [0.022, 0.3, 0.12, 0.85, 4200, 3, 0.08],
  harp: [0.012, 0.18, 0.13, 0.45, 2400, 2, 0.13],
  pizz: [0.014, 0.1, 0.08, 0.19, 1600, 2, 0.1],
  flute: [0.09, 0.12, 0.65, 0.24, 2500, 2, 0.055],
  pad: [0.42, 0.3, 0.65, 0.9, 1100, 2, 0.07],
  bass: [0.035, 0.12, 0.48, 0.3, 550, 2, 0.12],
};
const EIGHTH = 60 / 88 / 2;
const MAX_VOICES = 48;
const midi = (root, degree) =>
  root + SCALE[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

export function createMusic() {
  let context = null;
  let master, musicBus, cueBus, noise;
  let graph = [];
  let enabled = true;
  let volume = 0.55;
  let scene = 0;
  let playingScene = 0;
  let started = false;
  let disposed = false;
  let timer = null;
  let suspendTimer = null;
  let generation = 0;
  let step = 0;
  let nextTime = 0;
  let lastCue = -Infinity;
  const voices = new Set();
  const doc = typeof document === "undefined" ? null : document;
  const shouldPlay = () => started && enabled && !disposed && !doc?.hidden;

  function ramp(param, value, time, duration = 0.05) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
    else {
      const current = param.value;
      param.cancelScheduledValues(time);
      param.setValueAtTime(current, time);
    }
    param.linearRampToValueAtTime(value, time + duration);
  }

  function initialize() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return false;
    context = new Audio();
    musicBus = context.createGain();
    cueBus = context.createGain();
    const mix = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 6500;
    filter.Q.value = 0.35;
    master = context.createGain();
    master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.25;
    musicBus.connect(mix);
    cueBus.connect(mix);
    mix.connect(filter);
    filter.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    // A quiet, locally generated stereo room. Determinism makes renders repeatable.
    let seed = 9147;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };
    const impulse = context.createBuffer(
      2,
      Math.floor(context.sampleRate * 1.7),
      context.sampleRate,
    );
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        smooth = smooth * 0.65 + random() * 0.35;
        data[i] =
          smooth *
          Math.exp((-6 * i) / data.length) *
          Math.min(1, i / (context.sampleRate * 0.018));
      }
    }
    const room = context.createConvolver();
    room.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0.17;
    mix.connect(room);
    room.connect(wet);
    wet.connect(filter);
    const delay = context.createDelay(1);
    delay.delayTime.value = EIGHTH * 1.5;
    const feedback = context.createGain();
    feedback.gain.value = 0.16;
    const echoFilter = context.createBiquadFilter();
    echoFilter.type = "lowpass";
    echoFilter.frequency.value = 1800;
    const echo = context.createGain();
    echo.gain.value = 0.1;
    const echoPan = context.createStereoPanner();
    echoPan.pan.value = 0.38;
    mix.connect(delay);
    delay.connect(echoFilter);
    echoFilter.connect(feedback);
    feedback.connect(delay);
    echoFilter.connect(echo);
    echo.connect(echoPan);
    echoPan.connect(filter);
    graph = [
      musicBus,
      cueBus,
      mix,
      filter,
      master,
      compressor,
      room,
      wet,
      delay,
      feedback,
      echoFilter,
      echo,
      echoPan,
    ];
    noise = context.createBuffer(
      1,
      Math.floor(context.sampleRate * 0.12),
      context.sampleRate,
    );
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random();
    context.addEventListener("statechange", onContextState);
    doc?.addEventListener("visibilitychange", onVisibility);
    return true;
  }

  function track(sources, nodes, end) {
    const voice = { sources, nodes, end };
    voices.add(voice);
    const cleanup = () => {
      if (!voices.delete(voice)) return;
      for (const node of nodes) node.disconnect();
      for (const source of sources) source.onended = null;
    };
    sources[0].onended = cleanup;
    for (const source of sources) source.stop(end);
  }

  function note(pitch, at, duration, kind, level, pan = 0, bus = musicBus) {
    if (voices.size >= MAX_VOICES) return;
    const [attack, decay, sustain, release, cutoff, ratio, partial] =
      TIMBRES[kind];
    const hold = Math.max(duration, attack + decay + 0.01);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + attack);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.00001, level * sustain),
      at + attack + decay,
    );
    envelope.gain.setValueAtTime(Math.max(0.00001, level * sustain), at + hold);
    envelope.gain.linearRampToValueAtTime(0, at + hold + release);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.value = 0.4;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    const fundamental = context.createOscillator();
    fundamental.type = ["pizz", "harp", "bass", "pad"].includes(kind)
      ? "triangle"
      : "sine";
    fundamental.frequency.setValueAtTime(hz(pitch), at);
    const overtone = context.createOscillator();
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(hz(pitch) * ratio, at);
    const overtoneGain = context.createGain();
    overtoneGain.gain.value = partial;
    fundamental.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(bus);
    fundamental.start(at);
    overtone.start(at);
    track(
      [fundamental, overtone],
      [fundamental, overtone, overtoneGain, filter, envelope, panner],
      at + hold + release + 0.01,
    );
  }

  function tick(at, industrial = false) {
    if (voices.size >= MAX_VOICES) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = industrial ? 1050 : 2200;
    filter.Q.value = industrial ? 1.4 : 0.65;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(
      industrial ? 0.023 : 0.012,
      at + 0.008,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.075);
    envelope.gain.linearRampToValueAtTime(0, at + 0.09);
    const pan = context.createStereoPanner();
    pan.pan.value = industrial ? -0.28 : 0.28;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(pan);
    pan.connect(musicBus);
    source.start(at);
    track([source], [source, filter, envelope, pan], at + 0.1);
  }

  function scheduleStep(at) {
    const bar = Math.floor(step / 6) % 32;
    const beat = step % 6;
    if (beat === 0) playingScene = scene;
    const region = REGIONS[playingScene];
    const root = region.root;
    const chord = HARMONY[bar];
    const phrase = MELODY[bar];
    const degree = phrase[beat];
    const expression = bar >= 16 && bar < 24 ? 0.88 : 1;
    if (degree !== null) {
      let length = 1;
      while (beat + length < 6 && phrase[beat + length] === null) length++;
      note(
        midi(root + 12, degree),
        at,
        length * EIGHTH * 0.84,
        region.lead,
        0.066 * expression,
        region.pan,
      );
    }
    if (beat === 0) {
      note(midi(root - 24, chord), at, EIGHTH * 3.4, "bass", 0.064, -0.06);
      // Seventh/ninth colours sit quietly inside a sustained, voiced triad.
      if ([1, 4, 5].includes(playingScene)) {
        for (const offset of [2, 4, bar % 4 === 2 ? 8 : 6]) {
          note(
            midi(root, chord + offset),
            at,
            EIGHTH * 5.5,
            "pad",
            playingScene === 4 ? 0.025 : 0.014,
            (offset - 4) * 0.1,
          );
        }
      }
    }
    if (beat === 4)
      note(midi(root - 24, chord + 4), at, EIGHTH * 1.3, "bass", 0.035, 0.06);
    if (playingScene === 0 || playingScene === 3) {
      if (beat === 2 || beat === 4) {
        for (const offset of [2, 4])
          note(
            midi(root, chord + offset),
            at + (offset === 4 ? 0.018 : 0),
            EIGHTH * 0.65,
            region.backing,
            0.024,
            offset === 2 ? -0.32 : 0.32,
          );
      }
    } else if (playingScene !== 4 && (playingScene === 2 || beat % 2 === 0)) {
      const arpeggio = [0, 4, 2, 7, 4, 2][beat];
      note(
        midi(root, chord + arpeggio),
        at,
        EIGHTH * 0.8,
        region.backing,
        0.031,
        ((beat % 3) - 1) * 0.32,
      );
    }
    if (playingScene === 5 && bar >= 24 && beat === 0) {
      note(midi(root + 12, degree - 2), at, EIGHTH * 1.5, "bell", 0.018, -0.3);
    }
    if (
      (playingScene === 3 && [0, 2, 3, 4].includes(beat)) ||
      ([0, 2, 5].includes(playingScene) && beat === 4) ||
      (playingScene === 1 && bar % 2 === 1 && beat === 4)
    )
      tick(at, playingScene === 3);
    step = (step + 1) % (32 * 6);
  }

  function schedule() {
    if (!shouldPlay() || context.state !== "running") return;
    const now = context.currentTime;
    // A throttled timer skips missed notes; it never emits a catch-up burst.
    if (nextTime < now) {
      step = (step + Math.ceil((now - nextTime) / EIGHTH)) % 192;
      nextTime = now + 0.035;
    }
    while (nextTime < now + 0.2) {
      scheduleStep(nextTime);
      nextTime += EIGHTH;
    }
  }

  function begin() {
    if (timer !== null || !shouldPlay() || context.state !== "running") return;
    playingScene = scene;
    step = Math.floor(step / 6) * 6;
    nextTime = context.currentTime + 0.06;
    ramp(master.gain, volume, context.currentTime, 0.18);
    schedule();
    timer = setInterval(schedule, 100);
  }

  function stopVoices(at) {
    for (const voice of voices) {
      for (const source of voice.sources) {
        try {
          source.stop(Math.min(at, voice.end));
        } catch {
          /* Already ended. */
        }
      }
    }
  }

  function pause() {
    generation++;
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (!context || context.state === "closed") return;
    ramp(master.gain, 0, context.currentTime, 0.04);
    stopVoices(context.currentTime + 0.045);
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (!shouldPlay() && context.state !== "closed")
        void context.suspend().catch(() => {});
    }, 60);
  }

  async function resume() {
    const token = ++generation;
    clearTimeout(suspendTimer);
    suspendTimer = null;
    if (!context || context.state === "closed") return;
    if (!shouldPlay()) {
      pause();
      return;
    }
    try {
      // Always invoked from start(), including when a browser interrupted audio.
      await context.resume();
      if (token === generation && shouldPlay()) begin();
    } catch {
      /* A later user gesture may retry a denied resume. */
    }
  }

  function onVisibility() {
    if (doc.hidden) pause();
    else if (shouldPlay()) void resume();
  }

  function onContextState() {
    if (context.state === "running") {
      if (shouldPlay()) begin();
      else pause();
    } else {
      if (timer !== null) clearInterval(timer);
      timer = null;
      stopVoices(context.currentTime);
      // Suspended contexts cannot advance to onended; release their silent nodes now.
      for (const voice of voices) {
        for (const source of voice.sources) source.onended = null;
        for (const node of voice.nodes) node.disconnect();
      }
      voices.clear();
    }
  }

  return {
    async start() {
      if (disposed) return;
      started = true;
      if (!context) {
        try {
          if (!initialize()) return;
        } catch {
          for (const node of graph) node.disconnect();
          if (context && context.state !== "closed")
            void context.close().catch(() => {});
          context = null;
          graph = [];
          return;
        }
      }
      await resume();
    },
    setScene(index) {
      if (
        !disposed &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < REGIONS.length
      )
        scene = index;
    },
    setEnabled(value) {
      if (disposed) return;
      enabled = Boolean(value);
      if (enabled) void resume();
      else pause();
    },
    setVolume(value) {
      if (disposed || typeof value !== "number" || !Number.isFinite(value))
        return;
      volume = Math.max(0, Math.min(1, value));
      if (context && shouldPlay() && context.state === "running")
        ramp(master.gain, volume, context.currentTime);
    },
    cue(type) {
      if (
        !context ||
        !shouldPlay() ||
        context.state !== "running" ||
        volume === 0
      )
        return;
      const cues = {
        collect: [4, 7],
        correct: [2, 4, 7],
        wrong: [1, 0],
        restore: [0, 2, 4, 7],
        travel: [4, 5, 7],
        win: [0, 2, 4, 7, 9, 7],
      };
      const notes = cues[type];
      const now = context.currentTime;
      if (!Array.isArray(notes) || now - lastCue < 0.28) return;
      lastCue = now;
      const spacing = type === "win" ? 0.17 : 0.12;
      ramp(musicBus.gain, 0.7, now, 0.045);
      musicBus.gain.setValueAtTime(0.7, now + notes.length * spacing);
      musicBus.gain.linearRampToValueAtTime(
        1,
        now + notes.length * spacing + 0.4,
      );
      notes.forEach((degree, index) =>
        note(
          midi(REGIONS[scene].root + 12, degree),
          now + 0.025 + index * spacing,
          0.17,
          type === "wrong" ? "flute" : "box",
          type === "wrong" ? 0.035 : 0.052,
          (index % 2 ? 1 : -1) * 0.12,
          cueBus,
        ),
      );
    },
    getState() {
      return Object.freeze({
        enabled,
        volume,
        scene,
        contextState: context?.state || "uninitialized",
        activeVoices: voices.size,
        isPlaying:
          timer !== null && shouldPlay() && context?.state === "running",
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      doc?.removeEventListener("visibilitychange", onVisibility);
      context?.removeEventListener("statechange", onContextState);
      clearTimeout(suspendTimer);
      suspendTimer = null;
      if (!context) return;
      // Let the output fade before detaching even when the caller does not await.
      setTimeout(() => {
        for (const voice of voices) {
          for (const source of voice.sources) source.onended = null;
          for (const node of voice.nodes) node.disconnect();
        }
        voices.clear();
        for (const node of graph) node.disconnect();
        graph = [];
        noise = null;
        if (context.state !== "closed") void context.close().catch(() => {});
      }, 60);
    },
  };
}
