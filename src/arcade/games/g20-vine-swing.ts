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
import { addLights, ball, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const ROPE_LEN = 3.4;
export const REACH = 4.6;
export const GRAVITY = 11;
export const FLOOR_Y = 0.4;

export interface Anchor {
  id: number;
  x: number;
  y: number;
}

export interface GView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  attached: number | null;
  theta: number;
  omega: number;
  anchors: Anchor[];
  maxX: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "按住抓藤蔓 · 荡到最低点松手飞出去" });
  const rng = makeRng(73939);
  const v: GView = {
    x: 0,
    y: 4.2,
    vx: 0,
    vy: 0,
    attached: 0,
    theta: -0.85,
    omega: 0,
    anchors: [],
    maxX: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;

  const makeAnchor = (x: number, y: number): Anchor => ({ id: nextId++, x, y });

  const reset = () => {
    base.clearHud();
    nextId = 1;
    v.anchors = [];
    let ax = 4;
    for (let i = 0; i < 40; i += 1) {
      v.anchors.push(makeAnchor(ax, 5.4 + (i % 2) * 0.7 + rng() * 0.4));
      ax += 6.2 + rng() * 2.4;
    }
    v.attached = v.anchors[0].id;
    v.theta = -0.85;
    v.omega = 0;
    v.vx = 0;
    v.vy = 0;
    v.x = v.anchors[0].x + Math.sin(v.theta) * ROPE_LEN;
    v.y = v.anchors[0].y - Math.cos(v.theta) * ROPE_LEN;
    v.maxX = 0;
    v.fx = [];
    v.alive = true;
  };
  reset();

  const syncPos = () => {
    const a = v.anchors.find((n) => n.id === v.attached);
    if (!a) return;
    v.x = a.x + Math.sin(v.theta) * ROPE_LEN;
    v.y = a.y - Math.cos(v.theta) * ROPE_LEN;
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

      const a = v.anchors.find((n) => n.id === v.attached);
      if (v.attached !== null && a) {
        v.omega += -(GRAVITY / ROPE_LEN) * Math.sin(v.theta) * dt;
        v.omega *= 1 - Math.min(1, dt * 0.14);
        v.theta += v.omega * dt;
        syncPos();
        // Release while pressing? No: press attaches, release detaches.
        if (input.actionReleased) {
          v.vx = Math.cos(v.theta) * v.omega * ROPE_LEN;
          v.vy = Math.sin(v.theta) * v.omega * ROPE_LEN;
          v.attached = null;
          ctx.audio.play("swap", 0.4);
        }
      } else {
        v.vy -= GRAVITY * dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        if (input.action) {
          // Grab the best anchor ahead of the flight direction.
          let best: Anchor | null = null;
          let bestScore = Infinity;
          for (const cand of v.anchors) {
            if (cand.x < v.x - 0.4) continue;
            const d = Math.hypot(cand.x - v.x, cand.y - v.y);
            if (d > REACH) continue;
            const ahead = cand.x - v.x;
            const score = d - ahead * 0.6;
            if (score < bestScore) {
              bestScore = score;
              best = cand;
            }
          }
          if (best) {
            v.attached = best.id;
            v.theta = clamp(Math.atan2(v.x - best.x, best.y - v.y), -1.25, 1.25);
            v.omega = clamp(v.vx * Math.cos(v.theta) / ROPE_LEN, -2.2, 2.2);
            syncPos();
            ctx.audio.play("tick", 0.7);
            v.fx.push({ x: best.x, y: best.y, z: 0, color: 0x9df2a0, count: 6 });
          }
        }
      }

      v.maxX = Math.max(v.maxX, v.x);
      base.score = Math.floor(v.maxX * 5);
      base.setFields([
        { label: "前进", value: `${Math.max(0, v.x).toFixed(1)} m` },
        { label: "高度", value: v.y.toFixed(1) },
      ]);

      if (v.y < FLOOR_Y || v.x < v.maxX - 14) {
        v.alive = false;
        v.fx.push({ x: v.x, y: Math.max(0.3, v.y), z: 0, color: 0xff6b7a, count: 22 });
        base.detail = `荡出 ${Math.floor(Math.max(0, v.maxX))} 米`;
        base.finish("lose");
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x08160c, 0x143a22);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 220, 55);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 30),
      new THREE.MeshStandardMaterial({ color: 0x1d5c36, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(100, 0, -4);
    root.add(ground);

    const sphere = ball(0.4, 0xffd76b, 0xff9d3c);
    root.add(sphere);
    const ropeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x9df2a0, emissive: ctx.accent, emissiveIntensity: 0.25 });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    root.add(rope);

    const anchorMeshes = new Map<number, THREE.Mesh>();
    const anchorGeo = new THREE.TorusGeometry(0.34, 0.09, 8, 20);
    const anchorMat = new THREE.MeshStandardMaterial({ color: 0x9df2a0, emissive: 0x4ade80, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.4 });
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.set(v.x, v.y, 0);

      const a = v.anchors.find((n) => n.id === v.attached);
      rope.visible = !!a;
      if (a) {
        const dx = v.x - a.x;
        const dy = v.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        rope.position.set((v.x + a.x) / 2, (v.y + a.y) / 2, 0);
        rope.scale.y = len;
        rope.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
      }

      const seen = new Set<number>();
      for (const anchor of v.anchors) {
        if (anchor.x < v.x - 14 || anchor.x > v.x + 26) continue;
        seen.add(anchor.id);
        let mesh = anchorMeshes.get(anchor.id);
        if (!mesh) {
          mesh = new THREE.Mesh(anchorGeo, anchorMat);
          anchorMeshes.set(anchor.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(anchor.x, anchor.y, 0);
        mesh.rotation.y = time * 1.4;
      }
      for (const [id, mesh] of anchorMeshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          anchorMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.x + 2.4, v.y + 2.6, 9.6);
      ctx.camera.lookAt(v.x + 3.2, v.y - 0.6, 0);
    };

    return {
      paint,
      onDispose: () => {
        ropeGeo.dispose();
        ropeMat.dispose();
        anchorGeo.dispose();
        anchorMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g20-vine-swing",
  no: 20,
  name: "藤蔓摆荡",
  tagline: "荡起、松手、飞出去，一路向前不落地。",
  category: "动作",
  controls: "按住空格/屏幕 抓藤 · 松手飞",
  hint: "在最低点松手最远 · 落地或倒退太远结束",
  accent: "#4ade80",
  createLogic,
  createStage,
};

export default def;
