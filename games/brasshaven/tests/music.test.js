import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusic } from "../src/music.js";

// A controllable audio clock verifies transport and ownership without speakers.
function audioHarness(t) {
  let wall = 0;
  let id = 0;
  const timers = new Map();
  const contexts = [];
  class Param {
    value = 0;
    events = [];
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push([value, time]);
    }
    linearRampToValueAtTime(value, time) {
      this.setValueAtTime(value, time);
    }
    exponentialRampToValueAtTime(value, time) {
      assert.ok(value > 0);
      this.setValueAtTime(value, time);
    }
    cancelAndHoldAtTime() {}
    cancelScheduledValues() {}
  }
  class Node {
    constructor(context, kind) {
      this.kind = kind;
      this.context = context;
      this.connections = [];
      this.gain = new Param();
      this.frequency = new Param();
      this.Q = new Param();
      this.pan = new Param();
      this.delayTime = new Param();
      for (const name of ["threshold", "knee", "ratio", "attack", "release"])
        this[name] = new Param();
      context.nodes.push(this);
    }
    connect(node) {
      this.connections.push(node);
      return node;
    }
    disconnect() {
      this.connections = [];
    }
    start(time) {
      this.startTime = time;
      this.context.sources.push(this);
    }
    stop(time) {
      this.endTime = time;
    }
  }
  class Context extends EventTarget {
    state = "suspended";
    currentTime = 0;
    sampleRate = 8000;
    nodes = [];
    sources = [];
    resumeCount = 0;
    destination = {};
    constructor() {
      super();
      contexts.push(this);
    }
    async resume() {
      this.resumeCount++;
      if (this.resumeGate) await this.resumeGate;
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
    }
    async suspend() {
      this.state = "suspended";
      this.dispatchEvent(new Event("statechange"));
    }
    async close() {
      this.state = "closed";
      this.dispatchEvent(new Event("statechange"));
    }
    createGain() {
      return new Node(this, "gain");
    }
    createBiquadFilter() {
      return new Node(this, "filter");
    }
    createDynamicsCompressor() {
      return new Node(this, "compressor");
    }
    createStereoPanner() {
      return new Node(this, "pan");
    }
    createConvolver() {
      return new Node(this, "room");
    }
    createDelay() {
      return new Node(this, "delay");
    }
    createOscillator() {
      return new Node(this, "oscillator");
    }
    createBufferSource() {
      return new Node(this, "noise");
    }
    createBuffer(channels, length) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return { getChannelData: (index) => data[index] };
    }
  }
  const doc = new EventTarget();
  doc.hidden = false;
  const replacements = {
    AudioContext: Context,
    document: doc,
    setInterval: (fn, delay) => {
      timers.set(++id, { fn, delay, due: wall + delay, repeat: true });
      return id;
    },
    setTimeout: (fn, delay) => {
      timers.set(++id, { fn, delay, due: wall + delay });
      return id;
    },
    clearInterval: (key) => timers.delete(key),
    clearTimeout: (key) => timers.delete(key),
  };
  for (const [key, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() =>
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete globalThis[key],
    );
  }
  return {
    contexts,
    timers,
    doc,
    advance(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += 10) {
        wall += 10;
        for (const context of contexts) {
          if (context.state !== "running") continue;
          context.currentTime += 0.01;
          for (const source of context.sources) {
            if (!source.ended && source.endTime <= context.currentTime) {
              source.ended = true;
              source.onended?.();
            }
          }
        }
        for (const [key, timer] of [...timers]) {
          if (timer.due > wall) continue;
          if (timer.repeat) timer.due += timer.delay;
          else timers.delete(key);
          timer.fn();
        }
      }
    },
    hide(hidden) {
      doc.hidden = hidden;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("lazy initialization, user settings, mute including cues, visibility and disposal", async (t) => {
  const h = audioHarness(t);
  const music = createMusic();
  music.setScene(4);
  music.setVolume(0.4);
  music.cue("collect");
  music.setEnabled(false);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(music.getState(), {
    enabled: false,
    volume: 0.4,
    scene: 4,
    contextState: "uninitialized",
    activeVoices: 0,
    isPlaying: false,
  });
  assert.ok(Object.isFrozen(music.getState()));
  await music.start();
  h.advance(100);
  assert.equal(music.getState().contextState, "suspended");
  music.setEnabled(true);
  await Promise.resolve();
  h.advance(1000);
  const context = h.contexts[0];
  assert.equal(music.getState().isPlaying, true);
  const count = context.sources.length;
  music.cue("restore");
  assert.equal(context.sources.length, count + 8);
  music.cue("collect");
  music.cue("toString");
  assert.equal(
    context.sources.length,
    count + 8,
    "repeated and invalid cues do not spawn voices",
  );
  music.setEnabled(false);
  music.cue("win");
  h.advance(100);
  assert.equal(context.sources.length, count + 8);
  assert.equal(music.getState().activeVoices, 0);
  assert.equal(context.state, "suspended");
  h.hide(false);
  assert.equal(
    music.getState().enabled,
    false,
    "visibility cannot override the user mute",
  );
  music.setEnabled(true);
  await Promise.resolve();
  h.advance(100);
  h.hide(true);
  h.advance(100);
  assert.equal(music.getState().activeVoices, 0);
  assert.equal(music.getState().isPlaying, false);
  h.hide(false);
  await Promise.resolve();
  assert.equal(music.getState().isPlaying, true);
  await music.start();
  assert.ok(context.resumeCount >= 4, "start always retries context resume");
  assert.equal(
    [...h.timers.values()].filter((timer) => timer.repeat).length,
    1,
  );
  music.setVolume(2);
  music.setVolume(NaN);
  music.setScene(99);
  assert.equal(music.getState().volume, 1);
  assert.equal(music.getState().scene, 4);
  music.dispose();
  music.dispose();
  h.advance(100);
  assert.equal(context.state, "closed");
  assert.equal(music.getState().activeVoices, 0);
  assert.equal(h.timers.size, 0);
  assert.ok(context.nodes.every((node) => node.connections.length === 0));
  await music.start();
  assert.equal(h.contexts.length, 1);
});

test("all six arrangements complete 32 bars, loop, and reclaim every voice", async (t) => {
  const h = audioHarness(t);
  const music = createMusic();
  await music.start();
  const context = h.contexts[0];
  const signatures = [];
  const loopSeconds = (32 * 3 * 60) / 88;
  for (let scene = 0; scene < 6; scene++) {
    music.setEnabled(false);
    h.advance(100);
    music.setScene(scene);
    music.setEnabled(true);
    await Promise.resolve();
    const start = context.currentTime;
    const first =
      context.sources.length -
      (scene === 4 || scene === 1 || scene === 5 ? 10 : 4);
    let peak = 0;
    for (let i = 0; i < 700; i++) {
      h.advance(100);
      peak = Math.max(peak, music.getState().activeVoices);
      assert.ok(music.getState().activeVoices <= 48);
    }
    assert.ok(
      peak > 4 && peak < 48,
      `scene ${scene} has accompaniment without hitting its voice cap`,
    );
    const pitches = context.sources
      .slice(Math.max(0, first))
      .filter(
        (source) =>
          source.kind === "oscillator" &&
          source.startTime >= start &&
          source.startTime < start + loopSeconds,
      );
    assert.ok(pitches.length > 350);
    assert.ok(
      new Set(pitches.map((source) => source.frequency.value.toFixed(2))).size >
        15,
    );
    assert.ok(
      context.sources.some((source) => source.startTime > start + loopSeconds),
      "score continues beyond 32 bars",
    );
    signatures.push(
      pitches
        .slice(0, 40)
        .map((source) => `${source.type}:${source.frequency.value.toFixed(2)}`)
        .join(","),
    );
  }
  assert.equal(new Set(signatures).size, 6);
  music.dispose();
  h.advance(100);
  assert.ok(context.sources.every((source) => source.ended));
  assert.ok(context.nodes.every((node) => node.connections.length === 0));
});

test("scene changes wait for a bar, timer stalls do not spam, and mute wins a pending resume", async (t) => {
  const h = audioHarness(t);
  const music = createMusic();
  await music.start();
  const context = h.contexts[0];
  h.advance(300);
  const existing = context.sources.length;
  music.setScene(4);
  assert.equal(context.sources.length, existing);
  assert.equal(music.getState().scene, 4);
  h.advance(2000);
  assert.ok(
    context.nodes.some(
      (node) => node.kind === "filter" && node.frequency.value === 1100,
    ),
    "new region pad starts at the next bar",
  );
  const beforeStall = context.sources.length;
  context.currentTime += 25;
  h.advance(100);
  assert.ok(
    context.sources.length - beforeStall < 24,
    "missed notes are skipped",
  );
  music.setEnabled(false);
  h.advance(100);
  let release;
  context.resumeGate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = music.start();
  // Enable begins a genuinely pending resume; a subsequent mute must win.
  music.setEnabled(true);
  music.setEnabled(false);
  release();
  await pending;
  await Promise.resolve();
  h.advance(200);
  assert.equal(music.getState().isPlaying, false);
  assert.equal(music.getState().activeVoices, 0);
  assert.equal(context.state, "suspended");
  music.dispose();
  h.advance(100);
});
