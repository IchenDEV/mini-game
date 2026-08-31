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

export const GOAL = 15;
export const MAGNET_R = 4.2;

export interface Orb {
  id: number;
  kind: "orb" | "drone";
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
  orbs: Orb[];
  magnetOn: boolean;
  collected: number;
  drones: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "按住磁力把灵珠吸过来 · 吸铁也会吸来追猎者" });
  const rng = makeRng(16180);
  const v: GView = {
    x: 0,
    y: 0,
    orbs: [],
    magnetOn: false,
    collected: 0,
    drones: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.4;
  let droneTimer = 5;

  const reset = () => {
    base.clearHud();
    nextId = 1;
    spawnTimer = 0.4;
    droneTimer = 5;
    v.x = 0;
    v.y = 0;
    v.orbs = [];
    v.magnetOn = false;
    v.collected = 0;
    v.drones = 0;
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
      v.magnetOn = input.action;
      base.setFields([]);

      if (input.pointerActive && Math.abs(input.pointerX) > 0.05) {
        const tx = clamp(input.pointerX * 6.4, -6.4, 6.4);
        const ty = clamp(input.pointerY * 4.4, -4.4, 4.4);
        v.x += (tx - v.x) * Math.min(1, dt * 6);
        v.y += (ty - v.y) * Math.min(1, dt * 6);
      }
      v.x = clamp(v.x + input.axisX * 7 * dt, -6.4, 6.4);
      v.y = clamp(v.y + input.axisY * 7 * dt, -4.4, 4.4);

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.7 - base.elapsed * 0.008, 0.34, 0.7);
        const edge = Math.floor(rng() * 4);
        const x = edge === 0 ? -7.5 : edge === 1 ? 7.5 : -7 + rng() * 14;
        const y = edge === 2 ? -5.2 : edge === 3 ? 5.2 : -4.5 + rng() * 9;
        v.orbs.push({ id: nextId++, kind: "orb", x, y, z: 0, vx: 0, vy: 0, spin: 2 });
      }
      droneTimer -= dt;
      if (droneTimer <= 0) {
        droneTimer = Math.max(2.6, 7 - base.elapsed * 0.05);
        v.drones += 1;
        v.orbs.push({
          id: nextId++,
          kind: "drone",
          x: -7.5 + rng() * 15,
          y: 5.2,
          z: 0,
          vx: 0,
          vy: 0,
          spin: 3,
        });
      }

      for (let i = v.orbs.length - 1; i >= 0; i -= 1) {
        const orb = v.orbs[i];
        if (orb.kind === "drone") {
          // Drones home slowly toward the player.
          const dx = v.x - orb.x;
          const dy = v.y - orb.y;
          const d = Math.hypot(dx, dy) || 1;
          const speed = 1.1 + v.drones * 0.12;
          orb.x += (dx / d) * speed * dt;
          orb.y += (dy / d) * speed * dt;
        } else if (v.magnetOn) {
          const dx = v.x - orb.x;
          const dy = v.y - orb.y;
          const d = Math.hypot(dx, dy);
          if (d < MAGNET_R && d > 0.01) {
            orb.x += (dx / d) * 7.5 * dt;
            orb.y += (dy / d) * 7.5 * dt;
          }
        }
        const d = Math.hypot(orb.x - v.x, orb.y - v.y);
        if (d < 0.8) {
          v.orbs.splice(i, 1);
          if (orb.kind === "drone") {
            v.alive = false;
            v.fx.push({ x: orb.x, y: orb.y, z: 0, color: 0xff5d5d, count: 24 });
            base.detail = `收集 ${v.collected} 颗灵珠 · 吸来了 ${v.drones} 台追猎者`;
            base.finish("lose");
            return;
          }
          v.collected += 1;
          base.score += 10;
          ctx.audio.play("pickup", Math.min(1, v.collected / GOAL));
          v.fx.push({ x: orb.x, y: orb.y, z: 0, color: 0x8ef0ff, count: 8 });
          if (v.collected >= GOAL) {
            base.detail = `收集满 ${GOAL} 颗灵珠`;
            base.finish("win");
            return;
          }
        }
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x060b18, 0x14264a);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 260, 55);

    const core = ball(0.44, ctx.accent, ctx.accent);
    root.add(core);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(MAGNET_R * 0.35, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: ctx.accent, transparent: true, opacity: 0.5 }),
    );
    root.add(halo);

    const orbGeo = ball(0.3, 0x8ef0ff, 0x38e1ff).geometry as THREE.SphereGeometry;
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x38e1ff, emissiveIntensity: 0.85 });
    const droneGeo = new THREE.OctahedronGeometry(0.42, 0);
    const droneMat = new THREE.MeshStandardMaterial({ color: 0xff5d5d, emissive: 0xff3b30, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.35, flatShading: true });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      core.position.set(v.x, v.y, 0);
      halo.position.set(v.x, v.y, 0);
      halo.scale.setScalar(v.magnetOn ? 2.6 + Math.sin(time * 10) * 0.3 : 0.8);
      halo.rotation.z = time * 2.4;
      (halo.material as THREE.MeshBasicMaterial).opacity = v.magnetOn ? 0.65 : 0.18;

      const seen = new Set<number>();
      for (const orb of v.orbs) {
        seen.add(orb.id);
        let mesh = meshes.get(orb.id);
        if (!mesh) {
          mesh = new THREE.Mesh(orb.kind === "drone" ? droneGeo : orbGeo, orb.kind === "drone" ? droneMat : orbMat);
          meshes.set(orb.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(orb.x, orb.y, orb.z);
        mesh.rotation.x += orb.spin * dt;
        mesh.rotation.y += orb.spin * dt;
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

      ctx.camera.position.set(0, 0.5, 13);
      ctx.camera.lookAt(0, 0, 0);
    };

    return {
      paint,
      onDispose: () => {
        (halo.material as THREE.Material).dispose();
        orbGeo.dispose();
        orbMat.dispose();
        droneGeo.dispose();
        droneMat.dispose();
        void box;
      },
    };
  });
}

const def: GameDefinition = {
  id: "g42-magnet-hoard",
  no: 42,
  name: "磁力收集",
  tagline: "按住磁力吸附灵珠——但追猎者也会被吸过来。",
  category: "动作",
  controls: "方向键移动 · 按住空格开启磁力",
  hint: "磁场半径内灵珠飞来 · 追猎者会越聚越多",
  accent: "#22d3ee",
  createLogic,
  createStage,
};

export default def;
