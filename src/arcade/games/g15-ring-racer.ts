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

export const RING_GAP = 17;
export const SHIP_X_MAX = 4.6;
export const SHIP_Y_MAX = 4.8;

export interface Ring {
  id: number;
  x: number;
  y: number;
  z: number;
  r: number;
  done: boolean;
}

export interface GView {
  x: number;
  y: number;
  rings: Ring[];
  speed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "把飞船穿进下一道光圈 · 脱靶即碎" });
  const rng = makeRng(24601);
  const v: GView = { x: 0, y: 1.4, rings: [], speed: 14, fx: [], alive: true };
  let nextId = 1;
  let spawnZ = -26;
  let passed = 0;
  let combo = 0;
  let dist = 0;

  const reset = () => {
    base.clearHud();
    v.x = 0;
    v.y = 1.4;
    v.rings = [];
    v.speed = 14;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    spawnZ = -26;
    passed = 0;
    combo = 0;
    dist = 0;
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
      const speed = Math.min(26, 14 + base.elapsed * 0.3);
      v.speed = speed;
      dist += speed * dt;

      if (input.pointerActive) {
        const tx = clamp(input.pointerX * SHIP_X_MAX * 1.1, -SHIP_X_MAX, SHIP_X_MAX);
        const ty = clamp((input.pointerY + 0.5) * SHIP_Y_MAX, 0.4, SHIP_Y_MAX);
        v.x += (tx - v.x) * Math.min(1, dt * 8);
        v.y += (ty - v.y) * Math.min(1, dt * 8);
      }
      v.x = clamp(v.x + input.axisX * 9 * dt, -SHIP_X_MAX, SHIP_X_MAX);

      while (spawnZ > -90) {
        const r = Math.max(1.15, 1.75 - base.elapsed * 0.01);
        v.rings.push({
          id: nextId++,
          x: -3 + rng() * 6,
          y: 0.8 + rng() * 3.4,
          z: spawnZ,
          r,
          done: false,
        });
        spawnZ -= RING_GAP;
      }
      spawnZ += speed * dt;

      for (let i = v.rings.length - 1; i >= 0; i -= 1) {
        const ring = v.rings[i];
        const pz = ring.z;
        ring.z += speed * dt;
        if (!ring.done && pz <= 0.8 && ring.z >= -0.8) {
          ring.done = true;
          const d = Math.hypot(ring.x - v.x, (ring.y - v.y) * 1.1);
          if (d < ring.r) {
            passed += 1;
            combo += 1;
            base.score += 10 + combo * 2;
            ctx.audio.play("pickup", Math.min(1, combo / 8));
            v.fx.push({ x: ring.x, y: ring.y, z: 0, color: 0x7ef2c0, count: 12 });
            if (combo % 5 === 0) base.say(`连穿 ×${combo}`, 0.9);
          } else {
            v.alive = false;
            v.fx.push({ x: v.x, y: v.y, z: 0, color: 0xff6b7a, count: 24 });
            base.detail = `穿过 ${passed} 道光圈 · 最长连穿 ×${combo}`;
            base.finish("lose");
            return;
          }
        }
        if (ring.z > 6) v.rings.splice(i, 1);
      }

      base.setFields([
        { label: "连穿", value: `×${combo}` },
        { label: "光圈", value: `×${passed}` },
        { label: "速度", value: speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x04101c, 0x0f2f42);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 260, 60);

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.1, 5),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.3 }),
    );
    hull.rotation.x = -Math.PI / 2;
    ship.add(hull);
    const glow = ball(0.14, 0xfff2c8, 0xffc860);
    glow.position.y = -0.4;
    ship.add(glow);
    root.add(ship);

    const ringGeo = new THREE.TorusGeometry(1, 0.12, 10, 36);
    const ringMeshes = new Map<number, { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      ship.position.set(v.x, v.y, 0);
      ship.rotation.z = Math.sin(time * 6) * 0.05;

      const seen = new Set<number>();
      const nextRing = [...v.rings].sort((a, b) => b.z - a.z).find((r) => !r.done);
      for (const ring of v.rings) {
        seen.add(ring.id);
        let entry = ringMeshes.get(ring.id);
        if (!entry) {
          const mat = new THREE.MeshStandardMaterial({
            color: ctx.accent,
            emissive: ctx.accent,
            emissiveIntensity: 0.4,
            metalness: 0.5,
            roughness: 0.35,
          });
          entry = { mesh: new THREE.Mesh(ringGeo, mat), mat };
          ringMeshes.set(ring.id, entry);
          root.add(entry.mesh);
        }
        entry.mesh.position.set(ring.x, ring.y, ring.z);
        entry.mesh.scale.setScalar(ring.r);
        entry.mesh.rotation.z = time * (ring.done ? 0.4 : 1.4);
        entry.mat.emissiveIntensity = ring === nextRing ? 0.95 + Math.sin(time * 8) * 0.3 : ring.done ? 0.12 : 0.4;
      }
      for (const [id, entry] of ringMeshes) {
        if (!seen.has(id)) {
          root.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          entry.mat.dispose();
          ringMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.x * 0.5, v.y * 0.5 + 1.4, 7.6);
      ctx.camera.lookAt(v.x * 0.7, v.y * 0.7, -12);
    };

    return {
      paint,
      onDispose: () => {
        ringGeo.dispose();
        for (const entry of ringMeshes.values()) entry.mat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g15-ring-racer",
  no: 15,
  name: "穿圈竞速",
  tagline: "一道道光圈排成赛道，全穿过去才算本事。",
  category: "竞速",
  controls: "方向键 / 拖动 全向移动",
  hint: "亮圈是下一关目标 · 脱靶一次就结束",
  accent: "#2dd4bf",
  createLogic,
  createStage,
};

export default def;
