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

export const SECTORS = 12;
export const PLATFORM_GAP_Y = 2.4;
export const DEATH_DROP = 6;

export interface Platform {
  id: number;
  y: number;
  /** true = solid segment (blocks the ball). */
  solid: boolean[];
  broken: boolean;
}

export interface GView {
  ballY: number;
  vy: number;
  rotation: number;
  platforms: Platform[];
  depth: number;
  lavaY: number;
  fx: FxEvent[];
  alive: boolean;
}

export function sectorOfAngle(rotation: number): number {
  const step = (Math.PI * 2) / SECTORS;
  // Ball sits at the front (angle 0); the tower rotation decides which
  // sector is currently in front of it.
  const a = ((-rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(a / step) % SECTORS;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右旋转高塔 · 让球从缺口坠落" });
  const rng = makeRng(40917);
  const v: GView = {
    ballY: 2,
    vy: 0,
    rotation: 0,
    platforms: [],
    depth: 0,
    lavaY: -14,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let streak = 0;
  let passedCount = 0;
  let smashes = 0;

  const makePlatform = (y: number): Platform => {
    const solid: boolean[] = new Array(SECTORS).fill(true);
    const gapStart = Math.floor(rng() * SECTORS);
    const gapLen = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < gapLen; i += 1) {
      solid[(gapStart + i) % SECTORS] = false;
    }
    return { id: nextId++, y, solid, broken: false };
  };

  const reset = () => {
    base.clearHud();
    v.ballY = 2;
    v.vy = 0;
    v.rotation = 0;
    v.depth = 0;
    v.lavaY = -14;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    streak = 0;
    passedCount = 0;
    smashes = 0;
    v.platforms = [];
    for (let i = 0; i < 14; i += 1) {
      v.platforms.push(makePlatform(-i * PLATFORM_GAP_Y));
    }
  };
  reset();

  const die = (why: string) => {
    if (!v.alive) return;
    v.alive = false;
    v.fx.push({ x: 0, y: v.ballY, z: 2.2, color: 0xff6b7a, count: 24 });
    base.detail = `坠落 ${Math.floor(v.depth)} 层 · 连穿 ×${passedCount} · 粉碎 ×${smashes} · ${why}`;
    base.finish("lose");
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
      v.rotation += input.axisX * 2.7 * dt;
      const prevY = v.ballY;
      v.vy -= 13.5 * dt;
      v.ballY += v.vy * dt;
      v.lavaY += dt * 0.55;
      if (v.ballY > 3.2) v.ballY = 3.2;
      if (v.lavaY > v.ballY - 0.5) {
        die("被岩浆追上了");
        return;
      }

      // Platforms the ball has well passed are pruned from the top of the
      // stack; fresh ones are appended below to keep a window of runway.
      while (v.platforms.length > 0 && v.platforms[0].y > v.ballY + 12) {
        v.platforms.shift();
      }
      while (v.platforms.length === 0 || v.platforms[v.platforms.length - 1].y > v.ballY - 30) {
        const lowest = v.platforms[v.platforms.length - 1];
        v.platforms.push(makePlatform(lowest ? lowest.y - PLATFORM_GAP_Y : v.ballY - 30));
      }

      const sector = sectorOfAngle(v.rotation);
      for (const plat of v.platforms) {
        if (plat.broken) continue;
        // Swept crossing of the platform plane while falling.
        const topSurface = plat.y + 0.22;
        if (!(v.vy < 0 && prevY >= topSurface && v.ballY <= topSurface)) continue;
        if (!plat.solid[sector]) {
          plat.broken = true;
          passedCount += 1;
          streak += 1;
          base.score += 10 + streak * 2;
          ctx.audio.play("swap", Math.min(1, streak / 8));
          base.setFields([
            { label: "坠落", value: `${Math.floor(v.depth + 1)} 层` },
            { label: "连穿", value: `×${streak}` },
          ]);
        } else if (streak >= 2) {
          // Smash through solid platforms after a streak.
          plat.solid[sector] = false;
          plat.broken = true;
          smashes += 1;
          base.score += 15;
          ctx.audio.play("power");
          base.say("粉碎 +15", 0.8);
          v.fx.push({ x: 0, y: plat.y, z: 2.2, color: 0xffc46b, count: 14 });
        } else {
          v.ballY = topSurface;
          v.vy = 6.8;
          streak = 0;
          ctx.audio.play("tick");
        }
        break;
      }
      v.depth = Math.max(v.depth, Math.max(0, -v.ballY / PLATFORM_GAP_Y));

      base.setFields([
        { label: "坠落", value: `${Math.floor(v.depth)} 层` },
        { label: "连穿", value: `×${streak}` },
        { label: "粉碎", value: `×${smashes}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x150d24, 0x2c1a4e);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 160, 50);

    const sphere = ball(0.42, 0xff8f5c, 0xff5c2a);
    sphere.position.z = 2.2;
    root.add(sphere);

    const platformMeshes = new Map<number, THREE.Group>();
    const segGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.44, 10, 1, false, 0, (Math.PI * 2) / SECTORS);
    const solidMat = new THREE.MeshStandardMaterial({ color: 0x7c6cf0, emissive: 0x4c3fd0, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.4 });
    const lava = box(30, 1.2, 30, 0xff5a3c, { emissive: 0xff3b1f });
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.y = v.ballY;

      const seen = new Set<number>();
      for (const plat of v.platforms) {
        seen.add(plat.id);
        let group = platformMeshes.get(plat.id);
        if (!group) {
          group = new THREE.Group();
          for (let i = 0; i < SECTORS; i += 1) {
            const seg = new THREE.Mesh(segGeo, solidMat);
            seg.userData.sector = i;
            group.add(seg);
          }
          platformMeshes.set(plat.id, group);
          root.add(group);
        }
        group.position.y = plat.y;
        group.rotation.y = v.rotation;
        for (const seg of group.children) {
          seg.visible = plat.solid[seg.userData.sector as number];
        }
      }
      for (const [id, group] of platformMeshes) {
        if (!seen.has(id)) {
          root.remove(group);
          platformMeshes.delete(id);
        }
      }

      lava.position.y = v.lavaY;
      lava.rotation.y = time * 0.1;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      const camY = clamp(v.ballY + 3.4, v.lavaY + 4, 40);
      ctx.camera.position.set(0, camY, 8.6);
      ctx.camera.lookAt(0, camY - 2.6, 0);
    };

    return {
      paint,
      onDispose: () => {
        segGeo.dispose();
        solidMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g04-helix-drop",
  no: 4,
  name: "螺旋跳塔",
  tagline: "旋转高塔让小球一路坠落，岩浆在下面追。",
  category: "休闲",
  controls: "← → 旋转塔身",
  hint: "从缺口坠落 +分 · 连穿 2 层后可粉碎平台",
  accent: "#a78bfa",
  createLogic,
  createStage,
};

export default def;
