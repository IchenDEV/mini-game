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

export const ROUND_SECONDS = 45;
export const PLAYER_MAX_Y = 2.4;

export interface Bullet {
  id: number;
  angle: number;
  dist: number;
  speed: number;
  spin: number;
}

export interface GView {
  x: number;
  y: number;
  bullets: Bullet[];
  seconds: number;
  emitterAngle: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "在花园里躲弹幕 · 撑满 45 秒",
    meterLabel: "剩余时间",
  });
  const rng = makeRng(50501);
  const v: GView = {
    x: 0,
    y: -2.4,
    bullets: [],
    seconds: ROUND_SECONDS,
    emitterAngle: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.6;

  const reset = () => {
    base.clearHud(1);
    nextId = 1;
    spawnTimer = 0.6;
    v.x = 0;
    v.y = -2.4;
    v.bullets = [];
    v.seconds = ROUND_SECONDS;
    v.emitterAngle = 0;
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
      v.seconds -= dt;
      base.setMeter(clamp(v.seconds / ROUND_SECONDS, 0, 1));

      if (input.pointerActive) {
        const tx = clamp(input.pointerX * 6.4, -6.4, 6.4);
        const ty = clamp(input.pointerY * 4.4 + 0.4, -4.2, PLAYER_MAX_Y);
        v.x += (tx - v.x) * Math.min(1, dt * 9);
        v.y += (ty - v.y) * Math.min(1, dt * 9);
      }
      v.x = clamp(v.x + input.axisX * 8.5 * dt, -6.4, 6.4);
      v.y = clamp(v.y + input.axisY * 8.5 * dt, -4.2, PLAYER_MAX_Y);

      v.emitterAngle += dt * (1.4 + base.elapsed * 0.03);
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.75 - base.elapsed * 0.008, 0.3, 0.75);
        const petals = 3 + Math.floor(base.elapsed / 12);
        for (let i = 0; i < petals; i += 1) {
          v.bullets.push({
            id: nextId++,
            angle: v.emitterAngle + (i * Math.PI * 2) / petals,
            dist: 0.6,
            speed: 2.6 + base.elapsed * 0.05,
            spin: 0.8,
          });
        }
        ctx.audio.play("tick", 0.8);
      }

      for (let i = v.bullets.length - 1; i >= 0; i -= 1) {
        const b = v.bullets[i];
        b.dist += b.speed * dt;
        b.angle += b.spin * dt * 0.3;
        const bx = Math.cos(b.angle) * b.dist;
        const by = Math.sin(b.angle) * b.dist * 0.7;
        const d = Math.hypot(bx - v.x, by - v.y);
        if (d < 0.42) {
          v.bullets.splice(i, 1);
          v.alive = false;
          v.fx.push({ x: v.x, y: v.y, z: 0, color: 0xff6b7a, count: 24 });
          base.detail = `在花丛中存活了 ${Math.round(ROUND_SECONDS - v.seconds)} 秒`;
          base.finish("lose");
          return;
        }
        if (b.dist > 16) v.bullets.splice(i, 1);
      }

      base.score = Math.round((ROUND_SECONDS - v.seconds) * 10);
      base.setFields([
        { label: "弹幕", value: String(v.bullets.length) },
        { label: "时间", value: `${Math.max(0, v.seconds).toFixed(0)}s` },
      ]);

      if (v.seconds <= 0) {
        base.setMeter(0);
        base.detail = "撑满 45 秒！花园属于你";
        base.finish("win");
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0d0618, 0x2a1450);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 200, 60);

    const player = ball(0.3, 0xffd76b, 0xff9d3c);
    root.add(player);

    const bulletGeo = ball(0.17, 0xff8adf, 0xff3bd4).geometry as THREE.SphereGeometry;
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xff8adf });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      player.position.set(v.x, v.y, 0);
      player.scale.setScalar(1 + Math.sin(time * 8) * 0.08);

      const seen = new Set<number>();
      for (const b of v.bullets) {
        seen.add(b.id);
        let mesh = meshes.get(b.id);
        if (!mesh) {
          mesh = new THREE.Mesh(bulletGeo, bulletMat);
          meshes.set(b.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(Math.cos(b.angle) * b.dist, Math.sin(b.angle) * b.dist * 0.7, 0);
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

      ctx.camera.position.set(0, 0.4, 12.8);
      ctx.camera.lookAt(0, 0, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        bulletGeo.dispose();
        bulletMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g50-bullet-bloom",
  no: 50,
  name: "弹幕花园",
  tagline: "旋转花芯吐出螺旋弹幕，撑住 45 秒就是赢家。",
  category: "动作",
  controls: "方向键 / 拖动 移动",
  hint: "弹幕越转越快 · 一碰即败 · 45 秒生存通关",
  accent: "#f472b6",
  createLogic,
  createStage,
};

export default def;
