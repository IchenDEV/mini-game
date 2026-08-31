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
import { addLights, box, createStageShell, cylinder, Particles, setBackdrop } from "../kit/world";

export const ARROWS = 8;
export const G = 9.8;
export const LAUNCH_ANGLE = Math.PI / 4;

export interface Target {
  id: number;
  z: number;
  x: number;
}

export interface GView {
  power: number;
  wind: number;
  targets: Target[];
  arrowsLeft: number;
  hits: number;
  bulls: number;
  lastArrow: { z: number; x: number } | null;
  fx: FxEvent[];
  alive: boolean;
}

/** Range of a projectile launched at 45° with speed v. */
export function range45(v: number): number {
  return (v * v) / G;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "力度条回弹到绿区松手 · 留意风向" });
  const rng = makeRng(64007);
  const v: GView = {
    power: 0,
    wind: 0,
    targets: [],
    arrowsLeft: ARROWS,
    hits: 0,
    bulls: 0,
    lastArrow: null,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let phase = -Math.PI / 2;

  const makeTarget = (): Target => ({ id: nextId++, z: -(8 + rng() * 14), x: -1.5 + rng() * 3 });

  const reset = () => {
    base.clearHud();
    nextId = 1;
    v.targets = [makeTarget(), makeTarget(), makeTarget()];
    v.power = 0;
    v.wind = 0;
    v.arrowsLeft = ARROWS;
    v.hits = 0;
    v.bulls = 0;
    v.lastArrow = null;
    v.fx = [];
    v.alive = true;
    phase = -Math.PI / 2;
  };
  reset();

  const loose = () => {
    const speed = 8 + v.power * 11;
    const dist = range45(speed);
    const t = (2 * speed * Math.sin(LAUNCH_ANGLE)) / G;
    const x = v.wind * t;
    v.lastArrow = { z: -dist, x };
    v.arrowsLeft -= 1;
    const target = v.targets.shift()!;
    v.targets.push(makeTarget());
    const dz = Math.abs(v.lastArrow.z - target.z);
    const dx = Math.abs(x - target.x);
    const off = Math.hypot(dz, dx);
    if (off < 0.4) {
      v.bulls += 1;
      v.hits += 1;
      base.score += 50;
      ctx.audio.play("pickup", 1);
      base.say("正中靶心 +50", 1);
      v.fx.push({ x: target.x, y: 1.2, z: target.z, color: 0xffd166, count: 16 });
    } else if (off < 1.1) {
      v.hits += 1;
      base.score += 20;
      ctx.audio.play("swap", 0.4);
      v.fx.push({ x: target.x, y: 1.2, z: target.z, color: 0xfff3b0, count: 10 });
    } else {
      ctx.audio.play("tick");
    }
    v.wind = (rng() - 0.5) * 2.4;
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

      phase += dt * 2.1;
      v.power = Math.abs(Math.sin(phase));

      if (input.actionReleased && v.arrowsLeft > 0) {
        loose();
      }

      if (v.arrowsLeft === 0) {
        const win = v.hits >= 4;
        base.detail = `上靶 ${v.hits} / ${ARROWS} · 正中 ×${v.bulls}`;
        base.finish(win ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "风力", value: `${v.wind >= 0 ? "→" : "←"} ${Math.abs(v.wind).toFixed(1)}` },
        { label: "上靶", value: `${v.hits}/${ARROWS}` },
        { label: "正中", value: String(v.bulls) },
      ]);
      base.setMeter(v.power);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x101a12, 0x28402a);
    addLights(ctx.scene, ctx.accent);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 60),
      new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -22);
    root.add(ground);

    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.06, 8, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x7c5a33, metalness: 0.3, roughness: 0.5 }),
    );
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(0, 1.2, 0);
    root.add(bow);

    const targetMeshes = new Map<number, THREE.Group>();
    const ringGeos = [1.1, 0.75, 0.4].map((r) => cylinder(r, r, 0.22, 24));
    const ringMats = [
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xff5d73, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.5, roughness: 0.6 }),
    ];
    const arrowMesh: THREE.Mesh | null = null;
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      bow.scale.setScalar(0.8 + v.power * 0.35);

      const seen = new Set<number>();
      v.targets.forEach((target, i) => {
        seen.add(target.id);
        let group = targetMeshes.get(target.id);
        if (!group) {
          group = new THREE.Group();
          ringGeos.forEach((geo, j) => {
            const ring = new THREE.Mesh(geo, ringMats[j]);
            ring.rotation.x = Math.PI / 2;
            ring.position.z = j * 0.02;
            group!.add(ring);
          });
          targetMeshes.set(target.id, group);
          root.add(group);
        }
        group.position.set(target.x, 1.2, target.z);
        group.rotation.z = Math.sin(time * (0.4 + i * 0.13)) * 0.06;
      });
      for (const [id, group] of targetMeshes) {
        if (!seen.has(id)) {
          root.remove(group);
          targetMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(2.6, 2.6, 6.2);
      ctx.camera.lookAt(0, 1.2, -10);
      void dt;
      void arrowMesh;
    };

    return {
      paint,
      onDispose: () => {
        ringGeos.forEach((g) => g.dispose());
        ringMats.forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g22-archer-range",
  no: 22,
  name: "靶心射击",
  tagline: "力度、风向、距离，一箭上靶不容易。",
  category: "射击",
  controls: "按住蓄力 · 松手放箭",
  hint: "力度条来回摆 · 距离越远力度要越足 · 8 支箭",
  accent: "#84cc16",
  createLogic,
  createStage,
};

export default def;
