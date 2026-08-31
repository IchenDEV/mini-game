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

export const MAX_LIVES = 3;
export const COOLDOWN = 0.24;

export interface Meteor {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface GView {
  aimX: number;
  aimY: number;
  meteors: Meteor[];
  shots: Shot[];
  lives: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "瞄准坠落陨石 · 别让城市挨太多下" });
  const rng = makeRng(51577);
  const v: GView = { aimX: 0, aimY: 4, meteors: [], shots: [], lives: MAX_LIVES, fx: [], alive: true };
  let nextId = 1;
  let cooldown = 0;
  let meteorTimer = 0.8;
  let destroyed = 0;
  let leaks = 0;

  const reset = () => {
    base.clearHud();
    v.aimX = 0;
    v.aimY = 4;
    v.meteors = [];
    v.shots = [];
    v.lives = MAX_LIVES;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    cooldown = 0;
    meteorTimer = 0.8;
    destroyed = 0;
    leaks = 0;
  };
  reset();

  const fire = () => {
    const dx = v.aimX;
    const dy = Math.max(0.8, v.aimY) - 0.6;
    const len = Math.hypot(dx, dy) || 1;
    v.shots.push({
      id: nextId++,
      x: 0,
      y: 0.6,
      vx: (dx / len) * 24,
      vy: (dy / len) * 24,
      life: 1.7,
    });
    cooldown = COOLDOWN;
    ctx.audio.play("shoot");
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

      if (input.pointerActive) {
        v.aimX = clamp(input.pointerX * 6.5, -6.5, 6.5);
        v.aimY = clamp(input.pointerY * 4.2 + 1.2, 0.8, 6.4);
      }
      if (input.action && cooldown <= 0) fire();
      cooldown -= dt;

      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        meteorTimer = Math.max(0.42, 1.15 - base.elapsed * 0.012);
        const x = -6 + rng() * 12;
        const speed = 2.1 + base.elapsed * 0.07 + rng() * 0.8;
        v.meteors.push({
          id: nextId++,
          x,
          y: 11.5,
          vx: (0 - x) * 0.05 * (0.5 + rng()),
          vy: -speed,
          r: 0.5 + rng() * 0.5,
        });
      }

      for (let i = v.shots.length - 1; i >= 0; i -= 1) {
        const s = v.shots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0 || Math.abs(s.x) > 8 || s.y > 12) {
          v.shots.splice(i, 1);
        }
      }

      for (let i = v.meteors.length - 1; i >= 0; i -= 1) {
        const m = v.meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        let hit = false;
        for (let j = v.shots.length - 1; j >= 0; j -= 1) {
          const s = v.shots[j];
          if (Math.hypot(s.x - m.x, s.y - m.y) < m.r + 0.32) {
            v.shots.splice(j, 1);
            hit = true;
            break;
          }
        }
        if (hit) {
          v.meteors.splice(i, 1);
          destroyed += 1;
          base.score += 10 + Math.round(m.r * 10);
          ctx.audio.play("pickup", 0.5);
          v.fx.push({ x: m.x, y: m.y, z: 0, color: 0xffb45e, count: 14 });
          continue;
        }
        if (m.y <= m.r * 0.6) {
          v.meteors.splice(i, 1);
          leaks += 1;
          v.lives -= 1;
          ctx.audio.play("hit");
          v.fx.push({ x: m.x, y: 0.4, z: 0, color: 0xff5d5d, count: 18 });
          if (v.lives <= 0) {
            v.alive = false;
            base.detail = `拦截 ${destroyed} 颗陨石 · 漏过 ${leaks} 颗`;
            base.finish("lose");
            return;
          }
        }
      }

      base.setFields([
        { label: "拦截", value: String(destroyed) },
        { label: "护盾", value: "❤".repeat(Math.max(0, v.lives)) || "—" },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x050914, 0x101c3f);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 220, 55);

    const city = box(13, 1, 2.4, 0x1c2c52, { metalness: 0.35 });
    city.position.set(0, 0.1, 0);
    root.add(city);
    for (let i = 0; i < 6; i += 1) {
      const tower = box(0.9, 1.2 + (i % 3) * 0.7, 1.2, 0x2a3d6b, { emissive: ctx.accent });
      tower.position.set(-4.5 + i * 1.8, 0.8 + (i % 3) * 0.35, 0);
      root.add(tower);
    }

    const turret = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 }),
    );
    turret.position.set(0, 0.85, 0);
    root.add(turret);

    const meteorGeo = new THREE.IcosahedronGeometry(1, 0);
    const meteorMat = new THREE.MeshStandardMaterial({ color: 0x9c6b53, emissive: 0xff5a2a, emissiveIntensity: 0.35, roughness: 0.85, metalness: 0.15, flatShading: true });
    const shotGeo = ball(0.16, 0xfff3b0, 0xffd24a).geometry as THREE.SphereGeometry;
    const shotMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 80);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      turret.rotation.z = Math.atan2(v.aimX, Math.max(0.8, v.aimY - 0.6)) * -1;

      const seen = new Set<number>();
      const sync = (id: number, x: number, y: number, geo: THREE.BufferGeometry, mat: THREE.Material, scale = 1) => {
        seen.add(id);
        let mesh = meshes.get(id);
        if (!mesh) {
          mesh = new THREE.Mesh(geo, mat);
          meshes.set(id, mesh);
          root.add(mesh);
        }
        mesh.position.set(x, y, 0);
        mesh.scale.setScalar(scale);
      };
      for (const m of v.meteors) {
        sync(m.id, m.x, m.y, meteorGeo, meteorMat, m.r);
        const mesh = meshes.get(m.id)!;
        mesh.rotation.x += dt * 1.4;
        mesh.rotation.y += dt * 0.9;
      }
      for (const s of v.shots) sync(s.id, s.x, s.y, shotGeo, shotMat);
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 6.4, 12.2);
      ctx.camera.lookAt(0, 4.4, 0);
      void time;
    };

    return {
      paint,
      onDispose: () => {
        meteorGeo.dispose();
        meteorMat.dispose();
        shotGeo.dispose();
        shotMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g09-meteor-gunner",
  no: 9,
  name: "陨石炮手",
  tagline: "城市上空的陨石雨，炮口指哪打哪。",
  category: "射击",
  controls: "移动瞄准 · 空格 / 点击 开火",
  hint: "陨石落进城市掉护盾 · 护盾耗尽结束",
  accent: "#fb923c",
  createLogic,
  createStage,
};

export default def;
