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

export const TUBE_R = 0.5;
export const WAYPOINTS: [number, number][] = [
  [-3.6, -2.6],
  [-1.4, -1.4],
  [0.6, -2.2],
  [2.2, -0.6],
  [1.2, 1.2],
  [-0.9, 1.8],
  [-0.2, 3.1],
];

export interface PathSample {
  dist: number;
  s: number;
}

/** Distance from a point to the polyline plus arc-length at the closest point. */
export function samplePath(x: number, y: number, pts: [number, number][]): PathSample {
  let best = { dist: Infinity, s: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-6;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.dist) {
      best = { dist: d, s: acc + Math.hypot(px - ax, py - ay) };
    }
    acc += Math.hypot(dx, dy);
  }
  return best;
}

export function pathLength(pts: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return total;
}

export interface GView {
  x: number;
  y: number;
  s: number;
  bestS: number;
  shakeT: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "拖动圆环沿导线走 · 碰线即毁 · 走完全程获胜" });
  const rng = makeRng(61803);
  const total = pathLength(WAYPOINTS);
  const v: GView = { x: WAYPOINTS[0][0], y: WAYPOINTS[0][1], s: 0, bestS: 0, shakeT: 0, fx: [], alive: true };

  const reset = () => {
    base.clearHud();
    v.x = WAYPOINTS[0][0];
    v.y = WAYPOINTS[0][1];
    v.s = 0;
    v.bestS = 0;
    v.shakeT = 0;
    v.fx = [];
    v.alive = true;
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
      if (v.shakeT > 0) v.shakeT -= dt;

      if (input.pointerActive) {
        v.x = clamp(input.pointerX * 5.5, -4.4, 4.4);
        v.y = clamp(input.pointerY * 4 + 0.5, -3.2, 3.6);
      }
      v.x = clamp(v.x + input.axisX * 5 * dt, -4.4, 4.4);
      v.y = clamp(v.y + input.axisY * 5 * dt, -3.2, 3.6);

      const { dist, s } = samplePath(v.x, v.y, WAYPOINTS);
      if (dist > TUBE_R) {
        v.alive = false;
        v.shakeT = 0.4;
        v.fx.push({ x: v.x, y: v.y, z: 0.4, color: 0xff6b7a, count: 22 });
        base.detail = `走了全程的 ${Math.round((v.bestS / total) * 100)}%`;
        base.finish("lose");
        return;
      }
      if (s > v.bestS) {
        // Score for forward progress only.
        const gained = Math.floor((s - Math.max(v.bestS, v.s)) * 40);
        if (gained > 0) {
          base.score += gained;
          if (rng() < 0.2) ctx.audio.play("tick", 0.3);
        }
        v.bestS = Math.max(v.bestS, s);
      }
      v.s = s;

      if (v.bestS >= total - 0.15) {
        base.score += 200;
        base.detail = "全程无碰通过！";
        base.finish("win");
        return;
      }

      base.setFields([
        { label: "进度", value: `${Math.round((v.bestS / total) * 100)}%` },
        { label: "偏距", value: dist.toFixed(2) },
      ]);
      base.setMeter(clamp(v.bestS / total, 0, 1));
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x101a14, 0x27402e);
    addLights(ctx.scene, ctx.accent);

    const board = box(10.4, 7.6, 0.4, 0x18281e, { metalness: 0.4 });
    board.position.z = -0.6;
    root.add(board);

    const wireMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.35 });
    const wireGroup = new THREE.Group();
    for (let i = 0; i < WAYPOINTS.length - 1; i += 1) {
      const [ax, ay] = WAYPOINTS[i];
      const [bx, by] = WAYPOINTS[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 8), wireMat);
      seg.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      seg.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
      wireGroup.add(seg);
    }
    root.add(wireGroup);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(TUBE_R, 0.09, 10, 28),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }),
    );
    root.add(ring);

    const goal = ball(0.3, 0x9df2a0, 0x4ade80);
    goal.position.set(WAYPOINTS[WAYPOINTS.length - 1][0], WAYPOINTS[WAYPOINTS.length - 1][1], 0);
    root.add(goal);

    const particles = new Particles(ctx.scene, 40);
    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      ring.position.set(v.x, v.y, 0.1);
      ring.rotation.y = time * 1.8;
      wireMat.emissiveIntensity = 0.55 + Math.sin(time * 4) * 0.2;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(Math.sin(time * 0.15) * 0.8 + (v.alive ? 0 : Math.sin(time * 30) * 0.2), 0.4, 8.6);
      ctx.camera.lookAt(0, 0.2, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        wireMat.dispose();
        wireGroup.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
        (ring.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g35-wire-loop",
  no: 35,
  name: "穿线走珠",
  tagline: "稳住手，让圆环贴着导线走完全程。",
  category: "动作",
  controls: "拖动指针 / 方向键移动圆环",
  hint: "碰线即毁 · 前进越远分越高 · 终点绿灯见",
  accent: "#4ade80",
  createLogic,
  createStage,
};

export default def;
