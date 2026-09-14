import * as THREE from "three";
import { LogicBase, clamp, makeRng, wrapAngle } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, ball, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const CORE_HP = 3;
export const SHIELD_HALF = 0.62;
export const ORBIT_R = 3.4;

export interface Bolt {
  id: number;
  angle: number;
  dist: number;
  speed: number;
}

export interface GView {
  shield: number;
  bolts: Bolt[];
  hp: number;
  blocked: number;
  speed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右旋转护盾 · 把来袭光弹挡在核心之外" });
  const rng = makeRng(38197);
  const v: GView = {
    shield: 0,
    bolts: [],
    hp: CORE_HP,
    blocked: 0,
    speed: 3.2,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.7;

  const reset = () => {
    base.clearHud();
    v.shield = 0;
    v.bolts = [];
    v.hp = CORE_HP;
    v.blocked = 0;
    v.speed = 3.2;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    spawnTimer = 0.7;
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
      v.speed = Math.min(8.5, 3.2 + base.elapsed * 0.14);
      v.shield = wrapAngle(v.shield + input.axisX * 3.6 * dt);
      if (input.pointerActive) {
        const target = (input.pointerX + 1.5) * 1.05;
        let diff = target - v.shield;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.shield = wrapAngle(v.shield + diff * Math.min(1, dt * 6));
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.85 - base.elapsed * 0.012, 0.32, 0.85);
        v.bolts.push({
          id: nextId++,
          angle: wrapAngle(v.shield + (rng() - 0.5) * 5.6),
          dist: 9.5,
          speed: v.speed * (0.85 + rng() * 0.4),
        });
      }

      for (let i = v.bolts.length - 1; i >= 0; i -= 1) {
        const bolt = v.bolts[i];
        const before = bolt.dist;
        bolt.dist -= bolt.speed * dt;
        if (before > ORBIT_R && bolt.dist <= ORBIT_R) {
          let diff = wrapAngle(bolt.angle - v.shield);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < SHIELD_HALF) {
            v.bolts.splice(i, 1);
            v.blocked += 1;
            base.score += 10;
            ctx.audio.play("swap", 0.6);
            v.fx.push({
              x: Math.cos(bolt.angle) * ORBIT_R,
              y: Math.sin(bolt.angle) * ORBIT_R,
              z: 0,
              color: 0x8ef0ff,
              count: 8,
            });
            continue;
          }
        }
        if (bolt.dist <= 0.5) {
          v.bolts.splice(i, 1);
          v.hp -= 1;
          ctx.audio.play("hit");
          v.fx.push({ x: 0, y: 0, z: 0, color: 0xff5d5d, count: 16 });
          if (v.hp <= 0) {
            v.alive = false;
            base.detail = `偏转 ${v.blocked} 发光弹`;
            base.finish("lose");
            return;
          }
        }
      }

      base.setFields([
        { label: "偏转", value: String(v.blocked) },
        { label: "核心", value: "▮".repeat(Math.max(0, v.hp)) + "▯".repeat(CORE_HP - Math.max(0, v.hp)) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x05081a, 0x131c44);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 240, 60);

    const core = ball(0.55, 0xffd166, 0xff9d3c);
    root.add(core);
    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(ORBIT_R, 0.22, 10, 30, SHIELD_HALF * 2),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.85, metalness: 0.5, roughness: 0.3 }),
    );
    root.add(shield);
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(ORBIT_R, 0.03, 6, 60),
      new THREE.MeshBasicMaterial({ color: 0x33406e, transparent: true, opacity: 0.7 }),
    );
    root.add(orbit);

    const boltGeo = ball(0.2, 0xff7b6b, 0xff3b30).geometry as THREE.SphereGeometry;
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xff8a7a });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      core.scale.setScalar(1 + Math.max(0, v.hp - 1) * 0.08 + Math.sin(time * 6) * 0.03);
      shield.rotation.z = v.shield - SHIELD_HALF;
      shield.rotation.x = Math.PI / 2 - 0.35;

      const seen = new Set<number>();
      for (const bolt of v.bolts) {
        seen.add(bolt.id);
        let mesh = meshes.get(bolt.id);
        if (!mesh) {
          mesh = new THREE.Mesh(boltGeo, boltMat);
          meshes.set(bolt.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(Math.cos(bolt.angle) * bolt.dist, Math.sin(bolt.angle) * bolt.dist, 0);
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 0.8, 12.4);
      ctx.camera.lookAt(0, 0, 0);
    };

    return {
      paint,
      onDispose: () => {
        boltGeo.dispose();
        boltMat.dispose();
        (orbit.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g43-deflect-shield",
  no: 43,
  name: "护盾偏转",
  tagline: "光弹来自四面八方，转护盾把它们挡在外面。",
  category: "动作",
  controls: "← → 旋转护盾 / 左右拖动",
  hint: "弧形护盾只护一面 · 核心被击中 3 次结束",
  accent: "#f97316",
  createLogic,
  createStage,
};

export default def;
