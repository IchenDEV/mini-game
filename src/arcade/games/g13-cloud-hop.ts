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

export const WORLD_HALF = 5;
export const CLOUD_R = 1.5;
const GRAVITY = 14;
const BOUNCE_VY = 8.4;

export interface Cloud {
  id: number;
  x: number;
  y: number;
  kind: "static" | "moving" | "fragile";
  dir: number;
  used: boolean;
}

export interface GView {
  ballX: number;
  ballY: number;
  vy: number;
  clouds: Cloud[];
  camY: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右飘 · 踩云而上 · 别掉出画面" });
  const rng = makeRng(12055);
  const v: GView = {
    ballX: 0,
    ballY: 1,
    vy: BOUNCE_VY,
    clouds: [],
    camY: 3,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let nextCloudY = 0;
  let peak = 0;
  let bounces = 0;

  const makeCloud = (y: number): Cloud => {
    const roll = rng();
    const kind: Cloud["kind"] = roll < 0.6 ? "static" : roll < 0.85 ? "moving" : "fragile";
    return {
      id: nextId++,
      x: -WORLD_HALF + 1 + rng() * (WORLD_HALF * 2 - 2),
      y,
      kind,
      dir: rng() < 0.5 ? -1 : 1,
      used: false,
    };
  };

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.ballY = 1;
    v.vy = BOUNCE_VY;
    v.camY = 3;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    nextCloudY = 0;
    peak = 0;
    bounces = 0;
    v.clouds = [makeCloud(0)];
    while (nextCloudY < 30) {
      nextCloudY += 1.7 + rng() * 0.9;
      v.clouds.push(makeCloud(nextCloudY));
    }
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
      v.ballX += input.axisX * 6.2 * dt;
      if (v.ballX < -WORLD_HALF) v.ballX = WORLD_HALF;
      if (v.ballX > WORLD_HALF) v.ballX = -WORLD_HALF;

      const prevY = v.ballY;
      v.vy -= GRAVITY * dt;
      v.ballY += v.vy * dt;

      while (nextCloudY < v.ballY + 24) {
        nextCloudY += 1.7 + rng() * 0.9;
        v.clouds.push(makeCloud(nextCloudY));
      }
      for (const cloud of v.clouds) {
        if (cloud.kind === "moving") {
          cloud.x += cloud.dir * 1.6 * dt;
          if (cloud.x > WORLD_HALF - 0.6 || cloud.x < -WORLD_HALF + 0.6) cloud.dir *= -1;
        }
      }

      if (v.vy < 0) {
        for (const cloud of v.clouds) {
          if (cloud.used) continue;
          const top = cloud.y + 0.3;
          if (prevY >= top && v.ballY <= top && Math.abs(v.ballX - cloud.x) < CLOUD_R) {
            v.ballY = top;
            v.vy = BOUNCE_VY;
            bounces += 1;
            ctx.audio.play("swap", Math.min(1, cloud.y / 40));
            if (cloud.kind === "fragile") {
              cloud.used = true;
              v.fx.push({ x: cloud.x, y: cloud.y, z: 0, color: 0xcfb2ff, count: 10 });
            }
            break;
          }
        }
      }

      peak = Math.max(peak, v.ballY);
      v.camY += (Math.max(v.ballY + 1.4, v.camY) - v.camY) * Math.min(1, dt * 3.4);
      v.clouds = v.clouds.filter((c) => c.y > v.camY - 12);

      if (v.ballY < v.camY - 7.5) {
        v.alive = false;
        v.fx.push({ x: v.ballX, y: v.ballY, z: 0, color: 0xff6b7a, count: 20 });
        base.detail = `跳到 ${Math.floor(peak)} 米 · 弹跳 ×${bounces}`;
        base.finish("lose");
        return;
      }

      base.score = Math.floor(peak * 10);
      base.setFields([
        { label: "高度", value: `${peak.toFixed(1)} m` },
        { label: "弹跳", value: `×${bounces}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x101a3a, 0x3c5a8c);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 200, 45);

    const sphere = ball(0.4, 0xffd76b, 0xff9d3c);
    sphere.position.z = 2.4;
    root.add(sphere);

    const cloudMeshes = new Map<number, THREE.Group>();
    const puffGeo = ball(0.5, 0xffffff).geometry as THREE.SphereGeometry;
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xdfe9ff, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.92 });
    const fragileMat = new THREE.MeshStandardMaterial({ color: 0xc9b2ff, emissive: 0x8a5cff, emissiveIntensity: 0.35, roughness: 0.8, transparent: true, opacity: 0.9 });
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.set(v.ballX, v.ballY, 2.4);

      const seen = new Set<number>();
      for (const cloud of v.clouds) {
        seen.add(cloud.id);
        let group = cloudMeshes.get(cloud.id);
        if (!group) {
          group = new THREE.Group();
          const puffs = cloud.kind === "fragile" ? 2 : 3;
          for (let i = 0; i < puffs; i += 1) {
            const puff = new THREE.Mesh(puffGeo, cloud.kind === "fragile" ? fragileMat : cloudMat);
            puff.position.set((i - (puffs - 1) / 2) * 0.62, (i % 2) * 0.18, (i % 2) * 0.14);
            puff.scale.setScalar(cloud.kind === "fragile" ? 0.85 : 0.9 + (i % 2) * 0.35);
            group.add(puff);
          }
          cloudMeshes.set(cloud.id, group);
          root.add(group);
        }
        group.position.set(cloud.x, cloud.y, 0);
        group.visible = !cloud.used;
      }
      for (const [id, group] of cloudMeshes) {
        if (!seen.has(id)) {
          root.remove(group);
          cloudMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(Math.sin(time * 0.3) * 0.6, v.camY + 2.6, 9.4);
      ctx.camera.lookAt(0, v.camY + 0.4, 0);
    };

    return {
      paint,
      onDispose: () => {
        puffGeo.dispose();
        cloudMat.dispose();
        fragileMat.dispose();
        for (const group of cloudMeshes.values()) {
          for (const puff of group.children) (puff as THREE.Mesh).geometry.dispose?.();
        }
      },
    };
  });
}

const def: GameDefinition = {
  id: "g13-cloud-hop",
  no: 13,
  name: "云端跳跳",
  tagline: "踩着云朵一路向上，紫云只能踩一次。",
  category: "休闲",
  controls: "← → / A D / 左右拖动",
  hint: "左右穿边会绕回 · 紫云易碎 · 掉出画面结束",
  accent: "#818cf8",
  createLogic,
  createStage,
};

export default def;
