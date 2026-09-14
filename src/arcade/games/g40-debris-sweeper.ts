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

export const OXYGEN_MAX = 26;
export const GOAL_DEBRIS = 20;
export const ARENA_HALF = 7;

export interface Chunk {
  id: number;
  kind: "debris" | "hazard";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  spin: number;
}

export interface GView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  chunks: Chunk[];
  oxygen: number;
  collected: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "方向键推进（有惯性）· 收碎片补氧 · 避开红色卫星",
    meterLabel: "氧气",
  });
  const rng = makeRng(27182);
  const v: GView = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    chunks: [],
    oxygen: OXYGEN_MAX,
    collected: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.5;

  const reset = () => {
    base.clearHud(OXYGEN_MAX / OXYGEN_MAX);
    nextId = 1;
    spawnTimer = 0.5;
    v.x = 0;
    v.y = 0;
    v.vx = 0;
    v.vy = 0;
    v.chunks = [];
    v.oxygen = OXYGEN_MAX;
    v.collected = 0;
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
      v.oxygen -= dt;
      if (v.oxygen <= 0) {
        v.alive = false;
        base.setMeter(0);
        base.detail = `收集 ${v.collected} 块碎片后氧气耗尽`;
        base.finish("lose");
        return;
      }
      base.setMeter(clamp(v.oxygen / OXYGEN_MAX, 0, 1));

      // Inertial thrusters.
      v.vx += input.axisX * 9 * dt;
      v.vy += input.axisY * 9 * dt;
      v.vx *= 1 - Math.min(1, dt * 0.9);
      v.vy *= 1 - Math.min(1, dt * 0.9);
      v.x = clamp(v.x + v.vx * dt, -ARENA_HALF, ARENA_HALF);
      v.y = clamp(v.y + v.vy * dt, -4.4, 4.4);
      if (Math.abs(v.x) === ARENA_HALF) v.vx = 0;
      if (Math.abs(v.y) === 4.4) v.vy = 0;

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.55 - base.elapsed * 0.006, 0.26, 0.55);
        const hazard = rng() < 0.22;
        v.chunks.push({
          id: nextId++,
          kind: hazard ? "hazard" : "debris",
          x: -ARENA_HALF + rng() * ARENA_HALF * 2,
          y: -4.4 + rng() * 8.8,
          z: (rng() - 0.5) * 2.4,
          vx: (rng() - 0.5) * 1.4,
          vy: (rng() - 0.5) * 1.4,
          spin: 1 + rng() * 2.5,
        });
      }

      for (let i = v.chunks.length - 1; i >= 0; i -= 1) {
        const c = v.chunks[i];
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (Math.abs(c.x) > ARENA_HALF + 0.6) c.vx *= -1;
        if (Math.abs(c.y) > 4.8) c.vy *= -1;
        const d = Math.hypot(c.x - v.x, c.y - v.y);
        if (d < 0.85) {
          v.chunks.splice(i, 1);
          if (c.kind === "hazard") {
            v.oxygen = Math.max(0, v.oxygen - 5);
            ctx.audio.play("hit");
            v.fx.push({ x: c.x, y: c.y, z: c.z, color: 0xff5d5d, count: 14 });
            if (v.oxygen <= 0) {
              v.alive = false;
              base.detail = `收集 ${v.collected} 块碎片后氧气耗尽`;
              base.finish("lose");
              return;
            }
          } else {
            v.collected += 1;
            v.oxygen = Math.min(OXYGEN_MAX, v.oxygen + 2.4);
            base.score += 10;
            ctx.audio.play("pickup", Math.min(1, v.collected / GOAL_DEBRIS));
            v.fx.push({ x: c.x, y: c.y, z: c.z, color: 0x9be8ff, count: 8 });
            if (v.collected >= GOAL_DEBRIS) {
              base.detail = `收集满 ${GOAL_DEBRIS} 块碎片`;
              base.finish("win");
              return;
            }
          }
        }
      }

      base.setFields([
        { label: "碎片", value: `${v.collected}/${GOAL_DEBRIS}` },
        { label: "氧气", value: `${Math.max(0, v.oxygen).toFixed(0)}s` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x030711, 0x0f1c3a);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 320, 60);

    const frame = box(15.4, 0.3, 0.3, ctx.accent, { emissive: ctx.accent });
    frame.position.set(0, 5, 0);
    root.add(frame);
    const frame2 = frame.clone();
    frame2.position.y = -5;
    root.add(frame2);

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.36, 1.05, 5),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 }),
    );
    ship.add(hull);
    root.add(ship);

    const debrisGeo = new THREE.DodecahedronGeometry(0.32, 0);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x38bdf8, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 });
    const hazardGeo = new THREE.OctahedronGeometry(0.42, 0);
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xff5d5d, emissive: 0xff3b30, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.4, flatShading: true });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      ship.position.set(v.x, v.y, 0);
      ship.rotation.z = clamp(-v.vx * 0.12, -0.6, 0.6);
      hull.rotation.y = time * 2;

      const seen = new Set<number>();
      for (const c of v.chunks) {
        seen.add(c.id);
        let mesh = meshes.get(c.id);
        if (!mesh) {
          mesh = new THREE.Mesh(c.kind === "hazard" ? hazardGeo : debrisGeo, c.kind === "hazard" ? hazardMat : debrisMat);
          meshes.set(c.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(c.x, c.y, c.z);
        mesh.rotation.x += c.spin * dt;
        mesh.rotation.y += c.spin * dt * 0.7;
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.x * 0.3, v.y * 0.3, 11.5);
      ctx.camera.lookAt(0, 0, 0);
    };

    return {
      paint,
      onDispose: () => {
        debrisGeo.dispose();
        debrisMat.dispose();
        hazardGeo.dispose();
        hazardMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g40-debris-sweeper",
  no: 40,
  name: "太空清道夫",
  tagline: "氧气倒计时里收碎片，蓝色救你红色炸你。",
  category: "动作",
  controls: "方向键 / WASD 推进",
  hint: "碎片 +10 并补氧 · 卫星 -5 秒氧 · 集 20 块达标",
  accent: "#7dd3fc",
  createLogic,
  createStage,
};

export default def;
