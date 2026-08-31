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
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const PILLARS = 4;
export const WIN_ROUNDS = 8;
export const SHOW_STEP = 0.55;
export const LIT_TIME = 0.4;

export interface GView {
  phase: "idle" | "show" | "input";
  sequence: number[];
  showIndex: number;
  showTimer: number;
  litIndex: number;
  litTimer: number;
  round: number;
  inputIndex: number;
  fx: FxEvent[];
  alive: boolean;
}

export function pillarX(p: number): number {
  return (p - (PILLARS - 1) / 2) * 2.1;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "记住灯柱闪的顺序 · 用 1-4 或点击复述" });
  const rng = makeRng(50301);
  const v: GView = {
    phase: "idle",
    sequence: [],
    showIndex: 0,
    showTimer: 0,
    litIndex: -1,
    litTimer: 0,
    round: 0,
    inputIndex: 0,
    fx: [],
    alive: true,
  };

  const reset = () => {
    base.clearHud();
    v.phase = "idle";
    v.sequence = [];
    v.showIndex = 0;
    v.showTimer = 0;
    v.litIndex = -1;
    v.litTimer = 0;
    v.round = 0;
    v.inputIndex = 0;
    v.fx = [];
    v.alive = true;
  };
  reset();

  const light = (i: number, dur: number) => {
    v.litIndex = i;
    v.litTimer = dur;
    ctx.audio.play("pickup", i / PILLARS);
  };

  const beginRound = () => {
    v.round += 1;
    v.sequence.push(Math.floor(rng() * PILLARS));
    v.phase = "show";
    v.showIndex = 0;
    v.showTimer = v.round === 1 ? 0.35 : SHOW_STEP;
  };

  const press = (pillar: number) => {
    if (v.phase !== "input") return;
    light(pillar, 0.24);
    if (v.sequence[v.inputIndex] === pillar) {
      v.inputIndex += 1;
      if (v.inputIndex >= v.sequence.length) {
        base.score += 25 + v.round * 2;
        base.say(`第 ${v.round} 轮通过`, 0.9);
        v.fx.push({ x: pillarX(pillar), y: 1.4, z: 1.6, color: 0x9df2a0, count: 10 });
        if (v.round >= WIN_ROUNDS) {
          base.detail = `${WIN_ROUNDS} 轮全部复述成功`;
          base.finish("win");
          return;
        }
        beginRound();
      }
    } else {
      v.alive = false;
      v.fx.push({ x: pillarX(pillar), y: 1.2, z: 1.6, color: 0xff6b7a, count: 18 });
      base.detail = `复述到第 ${v.round} 轮出错`;
      base.finish("lose");
    }
  };

  return {
    view: v,
    start: () => {
      base.start();
      if (v.phase === "idle") beginRound();
    },
    pause: () => base.pause(),
    resume: () => base.resume(),
    restart: () => {
      base.restart();
      reset();
      beginRound();
    },
    step(dt, input) {
      base.tick(dt);
      if (!v.alive) return;
      if (v.litTimer > 0) {
        v.litTimer -= dt;
        if (v.litTimer <= 0) v.litIndex = -1;
      }

      if (v.phase === "show") {
        v.showTimer -= dt;
        if (v.showTimer <= 0) {
          if (v.showIndex < v.sequence.length) {
            light(v.sequence[v.showIndex], LIT_TIME);
            v.showIndex += 1;
            v.showTimer = SHOW_STEP;
          } else {
            v.phase = "input";
            v.inputIndex = 0;
            base.say(`第 ${v.round} 轮 · 请复述`, 1);
          }
        }
      } else if (v.phase === "input") {
        for (const pad of input.padPressed) {
          if (pad >= 0 && pad < PILLARS) press(pad);
        }
        if (input.pointerActive && input.actionPressed) {
          const px = input.pointerX * 5.2;
          let best = -1;
          let bestD = Infinity;
          for (let p = 0; p < PILLARS; p += 1) {
            const d = Math.abs(pillarX(p) - px);
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          if (bestD < 1.3) press(best);
        }
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x12081e, 0x301451);
    addLights(ctx.scene, ctx.accent);

    const floor = box(14, 0.4, 8, 0x241640, { metalness: 0.35 });
    floor.position.set(0, -0.2, 1);
    root.add(floor);

    const pillarGeo = new THREE.BoxGeometry(1.5, 2.2, 1.5);
    const pillarMats = Array.from({ length: PILLARS }, (_, i) => {
      const hue = (i * 90) / PILLARS;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.6, 0.32),
        emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.5),
        emissiveIntensity: 0.12,
        metalness: 0.35,
        roughness: 0.45,
      });
    });
    const pillars: THREE.Mesh[] = [];
    for (let p = 0; p < PILLARS; p += 1) {
      const mesh = new THREE.Mesh(pillarGeo, pillarMats[p]);
      mesh.position.set(pillarX(p), 1.1, 1.6);
      root.add(mesh);
      pillars.push(mesh);
    }
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      pillars.forEach((mesh, p) => {
        pillarMats[p].emissiveIntensity = v.litIndex === p ? 1.2 : 0.12 + Math.sin(time * 2 + p) * 0.05;
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(Math.sin(time * 0.2) * 1.4, 3.4, 7.6);
      ctx.camera.lookAt(0, 1, 1.2);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        pillarGeo.dispose();
        pillarMats.forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g33-echo-tones",
  no: 33,
  name: "回声音阶",
  tagline: "四根灯柱轮流发光，复述得越长记得越牢。",
  category: "益智",
  controls: "数字键 1-4 / 点击灯柱",
  hint: "看闪灯顺序再复述 · 每轮多一拍 · 8 轮通关",
  accent: "#c084fc",
  createLogic,
  createStage,
};

export default def;
