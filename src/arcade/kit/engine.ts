import * as THREE from "three";
import { ArcadeAudio } from "./audio";
import {
  emptyInput,
  type GameDefinition,
  type GameStage,
  type InputState,
  type LogicSnapshot,
  type StageContext,
} from "./types";

const MAX_DT = 0.05;

type ActionKey = "left" | "right" | "up" | "down" | "action";

const KEY_MAP: Record<string, ActionKey> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "action",
  Enter: "action",
};

const PAD_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
];

/**
 * Owns the renderer + rAF loop + unified input for one game, and bridges
 * HUD snapshots to the React layer via a callback.
 */
export class GameShell {
  readonly logic: ReturnType<GameDefinition["createLogic"]>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 240);
  private readonly stage: GameStage;
  private readonly audio = new ArcadeAudio();
  private readonly canvas: HTMLCanvasElement;
  private readonly onHud: (hud: LogicSnapshot | null) => void;
  private readonly onSoundChange: (on: boolean) => void;
  private readonly keys = new Set<ActionKey>();
  private readonly padQueue: number[] = [];
  private readonly pointer = { x: 0, y: 0, active: false, down: false };
  private lastHudKey = "";
  private raf = 0;
  private lastTime = 0;
  private prevAction = false;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    def: GameDefinition,
    onHud: (hud: LogicSnapshot | null) => void,
    onSoundChange: (on: boolean) => void,
  ) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.onSoundChange = onSoundChange;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const accent = Number.parseInt(def.accent.replace("#", ""), 16) || 0x38bdf8;
    const stageCtx: StageContext = {
      scene: this.scene,
      camera: this.camera,
      audio: this.audio,
      accent,
    };
    this.stage = def.createStage(stageCtx);
    this.logic = def.createLogic({ audio: this.audio, bestKey: def.id });
    this.resize();

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  start(): void {
    this.audio.unlock();
    this.logic.start();
  }

  restart(): void {
    this.audio.unlock();
    this.logic.restart();
  }

  togglePause(): void {
    const status = this.logic.snapshot().status;
    if (status === "playing") {
      this.logic.pause();
      this.audio.play("tick");
    } else if (status === "paused") {
      this.logic.resume();
      this.audio.play("tick");
    }
  }

  toggleSound(): void {
    this.audio.setEnabled(!this.audio.enabled);
    if (this.audio.enabled) {
      this.audio.unlock();
      this.audio.play("tick");
    }
    this.onSoundChange(this.audio.enabled);
  }

  get soundEnabled(): boolean {
    return this.audio.enabled;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.resizeObserver?.disconnect();
    this.stage.dispose();
    this.renderer.dispose();
    this.onHud(null);
  }

  private resize(): void {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.stage.resize(width, height);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const code = event.code;
    if (code === "KeyP") {
      this.togglePause();
      return;
    }
    if (code === "KeyM") {
      this.toggleSound();
      return;
    }
    if (code === "KeyR") {
      this.restart();
      return;
    }
    const padIndex = PAD_CODES.indexOf(code);
    if (padIndex >= 0) {
      this.padQueue.push(padIndex);
      event.preventDefault();
      return;
    }
    const mapped = KEY_MAP[code];
    if (mapped) {
      event.preventDefault();
      this.keys.add(mapped);
      if (mapped === "action") {
        const status = this.logic.snapshot().status;
        if (status === "ready") this.start();
        else if (status === "over") this.restart();
      }
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const mapped = KEY_MAP[event.code];
    if (mapped) this.keys.delete(mapped);
  };

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 2 - 1 : 0;
    const y = rect.height > 0 ? -(((event.clientY - rect.top) / rect.height) * 2 - 1) : 0;
    return { x, y };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.audio.unlock();
    const p = this.canvasPoint(event);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.active = true;
    this.pointer.down = true;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const p = this.canvasPoint(event);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.active = true;
  };

  private handlePointerUp = (): void => {
    this.pointer.down = false;
  };

  private handlePointerLeave = (): void => {
    this.pointer.down = false;
    this.pointer.active = false;
  };

  private pollInput(): InputState {
    const input = emptyInput();
    input.axisX = (this.keys.has("right") ? 1 : 0) - (this.keys.has("left") ? 1 : 0);
    input.axisY = (this.keys.has("up") ? 1 : 0) - (this.keys.has("down") ? 1 : 0);
    input.action = this.keys.has("action") || this.pointer.down;
    input.actionPressed = input.action && !this.prevAction;
    input.actionReleased = !input.action && this.prevAction;
    this.prevAction = input.action;
    input.pointerX = this.pointer.x;
    input.pointerY = this.pointer.y;
    input.pointerActive = this.pointer.active;
    input.padPressed = this.padQueue.splice(0, this.padQueue.length);
    return input;
  }

  private publishHud(): void {
    const snap = this.logic.snapshot();
    const key = [
      snap.status,
      snap.score,
      snap.best,
      snap.meter === null ? "-" : snap.meter.toFixed(3),
      snap.callout?.key ?? 0,
      snap.detail,
      snap.fields.map((f) => `${f.label}:${f.value}`).join("|"),
    ].join("#");
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      this.onHud(snap);
    }
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(MAX_DT, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const input = this.pollInput();
    if (this.logic.snapshot().status === "playing") {
      this.logic.step(dt, input);
    }
    this.stage.update(dt, input, this.logic);
    this.publishHud();
    this.renderer.render(this.scene, this.camera);
  };
}
