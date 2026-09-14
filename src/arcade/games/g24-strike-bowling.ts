import * as THREE from "three";
import { LogicBase, clamp, makeRng } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, ball, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const FRAMES = 5;
export const PINS: [number, number][] = [
  [0, -12.6],
  [-0.55, -13.5], [0.55, -13.5],
  [-1.1, -14.4], [0, -14.4], [1.1, -14.4],
  [-1.65, -15.3], [-0.55, -15.3], [0.55, -15.3], [1.65, -15.3],
];
export const KNOCK_R = 0.62;
export const CHAIN_R = 1.15;

export interface Pin {
  x: number;
  z: number;
  up: boolean;
}

export interface GView {
  ballX: number;
  power: number;
  phase: "aim" | "charge" | "roll";
  rolling: { x: number; z: number; vx: number } | null;
  pins: Pin[];
  frame: number;
  rollInFrame: number;
  knocks: number;
  strikes: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右选位 → 蓄力松手 → 一球全倒" });
  const v: GView = {
    ballX: 0,
    power: 0,
    phase: "aim",
    rolling: null,
    pins: [],
    frame: 1,
    rollInFrame: 1,
    knocks: 0,
    strikes: 0,
    fx: [],
    alive: true,
  };
  let phaseT = 0;
  let totalDown = 0;

  const rackPins = () => {
    v.pins = PINS.map(([x, z]) => ({ x, z, up: true }));
  };

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.power = 0;
    v.phase = "aim";
    v.rolling = null;
    v.frame = 1;
    v.rollInFrame = 1;
    v.knocks = 0;
    v.strikes = 0;
    v.fx = [];
    v.alive = true;
    totalDown = 0;
    rackPins();
    phaseT = 0;
  };
  reset();

  const finishRoll = () => {
    const down = v.pins.filter((p) => !p.up).length;
    totalDown += down;
    base.score += down * 5;
    if (v.rollInFrame === 1 && down === PINS.length) {
      v.strikes += 1;
      base.score += 50;
      base.say("全中！+50", 1.2);
      ctx.audio.play("win");
    } else {
      ctx.audio.play("hit");
    }
    v.knocks = down;
    v.rollInFrame += 1;
    if (v.rollInFrame > 2 || down === PINS.length) {
      if (v.frame >= FRAMES) {
        base.detail = `${FRAMES} 局共击倒 ${totalDown} 瓶 · 全中 ×${v.strikes}`;
        base.finish("win");
        return;
      }
      v.frame += 1;
      v.rollInFrame = 1;
      rackPins();
    } else {
      // Second roll: only standing pins remain, ball restarts.
      v.pins = v.pins.map((p) => p);
    }
    v.phase = "aim";
    v.rolling = null;
  };

  return {
    view: v,
    start: () => base.start(),
    pause: () => base.pause(),
    resume: () => base.resume(),
    restart: () => {
      base.restart();
      reset();
    },
    step(dt, input) {
      base.tick(dt);
      if (!v.alive) return;

      if (v.phase === "aim") {
        v.ballX = clamp(v.ballX + input.axisX * 4.2 * dt, -2.6, 2.6);
        if (input.pointerActive && input.actionPressed) {
          v.ballX = clamp(input.pointerX * 3.4, -2.6, 2.6);
        }
        if (input.actionPressed) {
          v.phase = "charge";
          phaseT = 0;
          ctx.audio.play("tick");
        }
      } else if (v.phase === "charge") {
        phaseT += dt * 2.2;
        v.power = Math.abs(Math.sin(phaseT));
        base.setMeter(v.power);
        if (input.actionPressed) {
          v.phase = "roll";
          v.rolling = { x: v.ballX, z: -1, vx: 0 };
          ctx.audio.play("shoot");
        }
      } else if (v.phase === "roll" && v.rolling) {
        const speed = 13 + v.power * 8;
        const r = v.rolling;
        r.x += r.vx * dt;
        r.z -= speed * dt;
        // Hook: the ball drifts with the aim wobble; keep it simple & straight.
        for (const pin of v.pins) {
          if (!pin.up) continue;
          if (Math.abs(r.z - pin.z) < 0.6 && Math.abs(r.x - pin.x) < KNOCK_R) {
            pin.up = false;
            v.fx.push({ x: pin.x, y: 0.6, z: pin.z, color: 0xffffff, count: 6 });
            // Chain reaction to nearby pins.
            const queue = [pin];
            while (queue.length > 0) {
              const p = queue.pop()!;
              for (const other of v.pins) {
                if (!other.up) continue;
                if (Math.hypot(other.x - p.x, other.z - p.z) < CHAIN_R) {
                  other.up = false;
                  v.fx.push({ x: other.x, y: 0.6, z: other.z, color: 0xffffff, count: 6 });
                  queue.push(other);
                }
              }
            }
          }
        }
        if (r.z < -17.5) finishRoll();
      }

      base.setFields([
        { label: "局数", value: `${v.frame}/${FRAMES}` },
        { label: "本投", value: String(v.rollInFrame) },
        { label: "全中", value: `×${v.strikes}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x120a1e, 0x2e1a4d);
    addLights(ctx.scene, ctx.accent);

    const lane = box(5.6, 0.5, 26, 0x8a5a33, { metalness: 0.2 });
    lane.position.set(0, -0.25, -9);
    root.add(lane);
    for (const side of [-1, 1]) {
      const gutter = box(0.8, 0.3, 26, 0x2a1c3f, { metalness: 0.4 });
      gutter.position.set(side * 3.2, -0.2, -9);
      root.add(gutter);
    }

    const sphere = ball(0.42, 0x3b82f6, 0x1d4ed8);
    root.add(sphere);

    const pinGeo = new THREE.CapsuleGeometry(0.16, 0.34, 4, 8);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xfff4e8, roughness: 0.5 });
    const pinMatDown = new THREE.MeshStandardMaterial({ color: 0x776655, roughness: 0.7 });
    const pinMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < PINS.length; i += 1) {
      const mesh = new THREE.Mesh(pinGeo, pinMat);
      root.add(mesh);
      pinMeshes.push(mesh);
    }
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const bx = v.rolling ? v.rolling.x : v.ballX;
      const bz = v.rolling ? v.rolling.z : -1;
      sphere.position.set(bx, 0.45, bz);

      v.pins.forEach((pin, i) => {
        const mesh = pinMeshes[i];
        mesh.position.set(pin.x, pin.up ? 0.45 : 0.1, pin.z);
        mesh.material = pin.up ? pinMat : pinMatDown;
        mesh.rotation.z = pin.up ? 0 : Math.PI / 2;
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 6);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(bx * 0.4, 3.4, 2.5);
      ctx.camera.lookAt(0, 0.4, -12);
    };

    return {
      paint,
      onDispose: () => {
        pinGeo.dispose();
        pinMat.dispose();
        pinMatDown.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g24-strike-bowling",
  no: 24,
  name: "保龄全倒",
  tagline: "选位、蓄力、掷出，十个瓶一次全倒是最大的爽。",
  category: "体育",
  controls: "←→ 选位 · 空格两段：蓄力→掷出",
  hint: "链式撞瓶会连锁倒 · 全中 +50 · 5 局",
  accent: "#60a5fa",
  createLogic,
  createStage,
};

export default def;
