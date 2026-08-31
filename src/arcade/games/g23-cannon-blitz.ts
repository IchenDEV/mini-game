import * as THREE from "three";
import { LogicBase, clamp } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const ROUND_SECONDS = 45;
export const MAX_ANGLE = 1.35;

export interface Ball {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  bounces: number;
}

export interface Target {
  id: number;
  x: number;
  y: number;
  drift: number;
}

export interface GView {
  angle: number;
  power: number;
  cannonballs: Ball[];
  targets: Target[];
  seconds: number;
  destroyed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "↑↓ 调角度 · 力度条自动摆 · 松手开炮",
    meterLabel: "剩余时间",
  });
  const v: GView = {
    angle: 0.8,
    power: 0,
    cannonballs: [],
    targets: [],
    seconds: ROUND_SECONDS,
    destroyed: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let phase = 0;

  const makeTarget = (id: number): Target => ({
    id,
    x: 6 + Math.random() * 9,
    y: 1.2 + Math.random() * 4.6,
    drift: Math.random() < 0.5 ? -0.5 : 0.5,
  });

  const reset = () => {
    base.clearHud(1);
    nextId = 1;
    v.targets = [makeTarget(nextId++), makeTarget(nextId++), makeTarget(nextId++)];
    v.cannonballs = [];
    v.angle = 0.8;
    v.power = 0;
    v.seconds = ROUND_SECONDS;
    v.destroyed = 0;
    v.fx = [];
    v.alive = true;
    phase = 0;
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
      v.seconds -= dt;
      base.setMeter(clamp(v.seconds / ROUND_SECONDS, 0, 1));

      v.angle = clamp(v.angle + input.axisY * 1.4 * dt, 0.18, MAX_ANGLE);
      phase += dt * 2.4;
      v.power = Math.abs(Math.sin(phase));

      if (input.actionReleased) {
        const speed = 9 + v.power * 12;
        v.cannonballs.push({
          id: nextId++,
          x: 0,
          y: 0.9,
          z: 0,
          vx: Math.cos(v.angle) * speed,
          vy: Math.sin(v.angle) * speed,
          bounces: 0,
        });
        ctx.audio.play("shoot");
      }

      for (let i = v.cannonballs.length - 1; i >= 0; i -= 1) {
        const b = v.cannonballs[i];
        b.vy -= 9.8 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += 0;
        if (b.y <= 0.25 && b.vy < 0) {
          if (b.bounces >= 2) {
            v.cannonballs.splice(i, 1);
            continue;
          }
          b.y = 0.25;
          b.vy = -b.vy * 0.45;
          b.vx *= 0.8;
          b.bounces += 1;
        }
        if (b.x > 22 || b.x < -2) v.cannonballs.splice(i, 1);
      }

      for (const t of v.targets) {
        t.x += t.drift * dt;
        if (t.x > 16.5 || t.x < 5.5) t.drift *= -1;
      }

      outer: for (let i = v.cannonballs.length - 1; i >= 0; i -= 1) {
        const b = v.cannonballs[i];
        for (let j = v.targets.length - 1; j >= 0; j -= 1) {
          const t = v.targets[j];
          if (Math.hypot(b.x - t.x, b.y - t.y) < 0.85) {
            v.cannonballs.splice(i, 1);
            v.targets.splice(j, 1);
            v.targets.push(makeTarget(nextId++));
            v.destroyed += 1;
            base.score += 25;
            ctx.audio.play("pickup", 0.6);
            v.fx.push({ x: t.x, y: t.y, z: 0, color: 0xffc46b, count: 14 });
            continue outer;
          }
        }
      }

      if (v.seconds <= 0) {
        base.setMeter(0);
        base.detail = `45 秒击毁 ${v.destroyed} 个标靶`;
        base.finish(v.destroyed >= 6 ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "角度", value: `${Math.round((v.angle * 180) / Math.PI)}°` },
        { label: "击毁", value: String(v.destroyed) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x1a1408, 0x4d3a14);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 150, 60);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 30),
      new THREE.MeshStandardMaterial({ color: 0x6b5a2f, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(12, 0, -6);
    root.add(ground);

    const barrel = box(1.6, 0.5, 0.5, 0x4a4a58, { metalness: 0.6 });
    barrel.position.set(0.7, 0.9, 0);
    root.add(barrel);
    const mount = box(1, 0.8, 1, 0x33333f, { metalness: 0.5 });
    mount.position.set(0, 0.4, 0);
    root.add(mount);

    const ballGeo = new THREE.SphereGeometry(0.28, 14, 10);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0x22222c, metalness: 0.7, roughness: 0.35 });
    const targetGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const targetMat = new THREE.MeshStandardMaterial({ color: 0xff8a5c, emissive: 0xff5a2a, emissiveIntensity: 0.35, roughness: 0.5 });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 70);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      barrel.rotation.z = v.angle;

      const seen = new Set<number>();
      for (const b of v.cannonballs) {
        seen.add(b.id);
        let mesh = meshes.get(b.id);
        if (!mesh) {
          mesh = new THREE.Mesh(ballGeo, ballMat);
          meshes.set(b.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(b.x, b.y, 0);
      }
      for (const t of v.targets) {
        seen.add(t.id);
        let mesh = meshes.get(t.id);
        if (!mesh) {
          mesh = new THREE.Mesh(targetGeo, targetMat);
          meshes.set(t.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(t.x, t.y, 0);
        mesh.rotation.y += dt * 1.2;
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(-4.5, 5.2, 11);
      ctx.camera.lookAt(7, 2.4, 0);
    };

    return {
      paint,
      onDispose: () => {
        ballGeo.dispose();
        ballMat.dispose();
        targetGeo.dispose();
        targetMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g23-cannon-blitz",
  no: 23,
  name: "加农打靶",
  tagline: "调角度、抓力度，把漂浮的标靶一个个轰掉。",
  category: "射击",
  controls: "↑↓ 角度 · 按住蓄力松手开炮",
  hint: "45 秒限时 · 弹球会弹跳一次 · 击毁 6 个达标",
  accent: "#fbbf24",
  createLogic,
  createStage,
};

export default def;
