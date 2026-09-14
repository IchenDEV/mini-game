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
import { addLights, ball, box, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const PAD_BOOST = 11;
export const SUPER_BOOST = 16.5;
export const CAM_LEAD = 7.5;

export interface Pad {
  id: number;
  x: number;
  y: number;
  kind: "normal" | "super";
  used: boolean;
}

export interface GView {
  ballX: number;
  ballY: number;
  vy: number;
  pads: Pad[];
  camY: number;
  peak: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右移动 · 踩上弹床向上飞 · 绿色超弹床更高" });
  const rng = makeRng(14142);
  const v: GView = {
    ballX: 0,
    ballY: 0.6,
    vy: PAD_BOOST,
    pads: [],
    camY: 4,
    peak: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let nextPadY = 0;

  const makePad = (y: number): Pad => ({
    id: nextId++,
    x: -3.6 + rng() * 7.2,
    y,
    kind: rng() < 0.16 ? "super" : "normal",
    used: false,
  });

  const reset = () => {
    base.clearHud();
    nextId = 1;
    nextPadY = 0;
    v.ballX = 0;
    v.ballY = 0.6;
    v.vy = PAD_BOOST;
    v.camY = 4;
    v.peak = 0;
    v.fx = [];
    v.alive = true;
    v.pads = [makePad(0)];
    while (nextPadY < 26) {
      nextPadY += 2 + rng() * 1.4;
      v.pads.push(makePad(nextPadY));
    }
  };
  reset();

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
      v.ballX += input.axisX * 7.5 * dt;
      if (v.ballX < -4.4) v.ballX = -4.4;
      if (v.ballX > 4.4) v.ballX = 4.4;

      const prevY = v.ballY;
      v.vy -= 15.5 * dt;
      v.ballY += v.vy * dt;

      while (nextPadY < v.ballY + 26) {
        nextPadY += 2 + rng() * 1.4;
        v.pads.push(makePad(nextPadY));
      }

      if (v.vy < 0) {
        for (const pad of v.pads) {
          if (pad.used) continue;
          if (prevY >= pad.y && v.ballY <= pad.y && Math.abs(v.ballX - pad.x) < 1.15) {
            v.ballY = pad.y;
            v.vy = pad.kind === "super" ? SUPER_BOOST : PAD_BOOST;
            pad.used = true;
            ctx.audio.play("swap", pad.kind === "super" ? 1 : 0.45);
            v.fx.push({ x: pad.x, y: pad.y, z: 0, color: pad.kind === "super" ? 0x9df2a0 : 0x8ef0ff, count: pad.kind === "super" ? 14 : 8 });
            if (pad.kind === "super") base.say("超弹！+15", 0.8);
            base.score += pad.kind === "super" ? 15 : 5;
            break;
          }
        }
      }

      v.peak = Math.max(v.peak, v.ballY);
      v.camY += (Math.max(v.ballY + 1.6, v.camY) - v.camY) * Math.min(1, dt * 3.2);
      v.pads = v.pads.filter((p) => p.y > v.camY - 12);

      if (v.ballY < v.camY - CAM_LEAD) {
        v.alive = false;
        v.fx.push({ x: v.ballX, y: v.ballY, z: 0, color: 0xff6b7a, count: 20 });
        base.detail = `弹到 ${Math.floor(v.peak)} 米`;
        base.finish("lose");
        return;
      }

      base.score = Math.max(base.score, Math.floor(v.peak * 4));
      base.setFields([
        { label: "高度", value: `${v.peak.toFixed(0)} m` },
        { label: "上升", value: `${v.vy > 0 ? "↑" : "↓"}${Math.abs(v.vy).toFixed(1)}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1424, 0x1f3c60);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 220, 55);

    const sphere = ball(0.36, 0xffd76b, 0xff9d3c);
    sphere.position.z = 2.2;
    root.add(sphere);

    const padGeo = new THREE.CylinderGeometry(1.1, 0.8, 0.28, 18);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: ctx.accent, emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.4 });
    const superMat = new THREE.MeshStandardMaterial({ color: 0x9df2a0, emissive: 0x4ade80, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.35 });
    const padMeshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.set(v.ballX, v.ballY, 2.2);

      const seen = new Set<number>();
      for (const pad of v.pads) {
        seen.add(pad.id);
        let mesh = padMeshes.get(pad.id);
        if (!mesh) {
          mesh = new THREE.Mesh(padGeo, pad.kind === "super" ? superMat : padMat);
          padMeshes.set(pad.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(pad.x, pad.y, 0);
        mesh.scale.y = pad.used ? 0.4 : 1 + Math.sin(time * 6 + pad.id) * 0.08;
      }
      for (const [id, mesh] of padMeshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          padMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(Math.sin(time * 0.25) * 0.7, v.camY + 2.4, 9.2);
      ctx.camera.lookAt(0, v.camY + 0.2, 0);
    };

    return {
      paint,
      onDispose: () => {
        padGeo.dispose();
        padMat.dispose();
        superMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g41-bounce-ascent",
  no: 41,
  name: "弹射登塔",
  tagline: "弹床把你越抛越高，绿色超弹床直上云霄。",
  category: "动作",
  controls: "← → / A D 移动",
  hint: "每张弹床一跳 · 普通床 +5 超弹床 +15 · 掉出画面结束",
  accent: "#38bdf8",
  createLogic,
  createStage,
};

export default def;
