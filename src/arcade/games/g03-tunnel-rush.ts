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
import { addLights, ball, createStageShell, Particles, setBackdrop } from "../kit/world";

export const TUNNEL_R = 3.4;
export const PLAYER_PLANE = 2;

export interface Ring {
  id: number;
  z: number;
  /** Center angle of the gap. */
  gap: number;
  /** Half-width of the gap in radians. */
  half: number;
  scored: boolean;
}

export interface GView {
  angle: number;
  rings: Ring[];
  dist: number;
  fx: FxEvent[];
  alive: boolean;
}

export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右旋转 · 把船对准环上的缺口" });
  const rng = makeRng(55103);
  const v: GView = { angle: Math.PI / 2, rings: [], dist: 0, fx: [], alive: true };
  let nextId = 1;
  let ringTimer = 0.5;
  let bonus = 0;
  let passed = 0;
  let bullseye = 0;

  const reset = () => {
    base.clearHud();
    v.angle = Math.PI / 2;
    v.rings = [];
    v.dist = 0;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    ringTimer = 0.5;
    bonus = 0;
    passed = 0;
    bullseye = 0;
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
      const speed = Math.min(34, 15 + base.elapsed * 0.5);
      v.dist += speed * dt;

      if (input.pointerActive && Math.abs(input.pointerX) > 0.05) {
        const target = input.pointerX * Math.PI * 0.85 + Math.PI / 2;
        let diff = target - v.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.angle += diff * Math.min(1, dt * 10);
      }
      v.angle = wrapAngle(v.angle + input.axisX * 3.4 * dt);

      ringTimer -= dt;
      if (ringTimer <= 0) {
        ringTimer = clamp(0.62 - base.elapsed * 0.006, 0.34, 0.62);
        const half = Math.max(0.42, 0.95 - base.elapsed * 0.008);
        // Keep the gap reachable: at most ~140° from the current angle.
        const drift = (rng() - 0.5) * 2 * 2.4;
        v.rings.push({
          id: nextId++,
          z: -80,
          gap: wrapAngle(v.angle + drift),
          half,
          scored: false,
        });
      }

      for (let i = v.rings.length - 1; i >= 0; i -= 1) {
        const ring = v.rings[i];
        const pz = ring.z;
        ring.z += speed * dt;
        if (pz <= PLAYER_PLANE + 0.5 && ring.z >= PLAYER_PLANE - 0.5 && !ring.scored) {
          ring.scored = true;
          let diff = wrapAngle(v.angle - ring.gap);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff > ring.half) {
            v.alive = false;
            v.fx.push({ x: Math.cos(v.angle) * TUNNEL_R, y: Math.sin(v.angle) * TUNNEL_R, z: PLAYER_PLANE, color: 0xff6b7a, count: 26 });
            base.detail = `穿过 ${passed} 道光环 · 正中 ×${bullseye}`;
            base.finish("lose");
            return;
          }
          passed += 1;
          if (diff < ring.half * 0.35) {
            bullseye += 1;
            bonus += 15;
            base.say("正中 +15", 0.8);
            ctx.audio.play("pickup", 0.6);
          } else {
            bonus += 5;
            ctx.audio.play("swap");
          }
        }
        if (ring.z > 8) v.rings.splice(i, 1);
      }

      base.score = Math.floor(v.dist) + bonus;
      base.setFields([
        { label: "光环", value: `×${passed}` },
        { label: "正中", value: `×${bullseye}` },
        { label: "速度", value: speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x050814, 0x141b3c);
    addLights(ctx.scene, ctx.accent);

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.9, 5),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 }),
    );
    ship.add(hull);
    root.add(ship);

    const ringMeshes = new Map<number, { a: THREE.Mesh; b: THREE.Mesh }>();
    const tube = 0.16;
    const arcLen = Math.PI * 2;
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x6f86d8,
      emissive: ctx.accent,
      emissiveIntensity: 0.28,
      metalness: 0.55,
      roughness: 0.35,
    });
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const px = Math.cos(v.angle) * (TUNNEL_R - 0.6);
      const py = Math.sin(v.angle) * (TUNNEL_R - 0.6);
      ship.position.set(px, py, PLAYER_PLANE);
      ship.rotation.z = v.angle + Math.PI / 2;

      const seen = new Set<number>();
      for (const ring of v.rings) {
        seen.add(ring.id);
        let pair = ringMeshes.get(ring.id);
        if (!pair) {
          const mk = (start: number, len: number) => {
            const geo = new THREE.TorusGeometry(TUNNEL_R, tube, 10, 40, len);
            const mesh = new THREE.Mesh(geo, ringMat);
            mesh.rotation.z = start;
            return mesh;
          };
          const gapStart = ring.gap + ring.half;
          const gapEnd = ring.gap - ring.half + Math.PI * 2;
          pair = {
            a: mk(gapStart, Math.max(0.02, gapEnd - gapStart)),
            b: mk(0, Math.max(0.02, ring.gap - ring.half)),
          };
          ringMeshes.set(ring.id, pair);
          root.add(pair.a, pair.b);
        }
        pair.a.position.z = ring.z;
        pair.b.position.z = ring.z;
        pair.a.rotation.x = pair.b.rotation.x = time * 0.35;
      }
      for (const [id, pair] of ringMeshes) {
        if (!seen.has(id)) {
          root.remove(pair.a, pair.b);
          pair.a.geometry.dispose();
          pair.b.geometry.dispose();
          ringMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 0, 6.4);
      ctx.camera.lookAt(px * 0.4, py * 0.4, -12);
    };

    return {
      paint,
      onDispose: () => {
        ringMat.dispose();
        for (const pair of ringMeshes.values()) {
          pair.a.geometry.dispose();
          pair.b.geometry.dispose();
        }
      },
    };
  });
}

const def: GameDefinition = {
  id: "g03-tunnel-rush",
  no: 3,
  name: "隧道疾驰",
  tagline: "在光环隧道里飞驰，把船身对准每一道缺口。",
  category: "竞速",
  controls: "← → 旋转 / 左右拖动",
  hint: "对准缺口穿过 · 越靠近正中分越高",
  accent: "#60a5fa",
  createLogic,
  createStage,
};

export default def;
