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
import { addLights, ball, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const ARENA_W = 12;
export const ARENA_H = 9;
export const BALL_R = 0.32;
export const PADDLE_Y = 0.45;

export interface GView {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  speed: number;
  paddleX: number;
  paddleW: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "接住每一颗光球 · 越打越快" });
  const rng = makeRng(60013);
  const v: GView = {
    ballX: 0,
    ballY: 4,
    vx: 0,
    vy: 0,
    speed: 7,
    paddleX: 0,
    paddleW: 2.4,
    fx: [],
    alive: true,
  };
  let hits = 0;

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.ballY = ARENA_H * 0.55;
    v.speed = 7;
    const angle = (rng() - 0.5) * 1.2;
    v.vx = Math.sin(angle) * v.speed;
    v.vy = -Math.cos(angle) * v.speed;
    v.paddleX = 0;
    v.paddleW = 2.4;
    v.fx = [];
    v.alive = true;
    hits = 0;
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

      if (input.pointerActive && Math.abs(input.pointerX) > 0.04) {
        const target = clamp(input.pointerX * (ARENA_W / 2) * 1.05, -ARENA_W / 2 + v.paddleW / 2, ARENA_W / 2 - v.paddleW / 2);
        v.paddleX += (target - v.paddleX) * Math.min(1, dt * 14);
      }
      v.paddleX = clamp(
        v.paddleX + input.axisX * 11 * dt,
        -ARENA_W / 2 + v.paddleW / 2,
        ARENA_W / 2 - v.paddleW / 2,
      );

      const prevY = v.ballY;
      v.ballX += v.vx * dt;
      v.ballY += v.vy * dt;

      if (v.ballX < -ARENA_W / 2 + BALL_R) {
        v.ballX = -ARENA_W / 2 + BALL_R;
        v.vx = Math.abs(v.vx);
        ctx.audio.play("tick");
      }
      if (v.ballX > ARENA_W / 2 - BALL_R) {
        v.ballX = ARENA_W / 2 - BALL_R;
        v.vx = -Math.abs(v.vx);
        ctx.audio.play("tick");
      }
      if (v.ballY > ARENA_H - BALL_R) {
        v.ballY = ARENA_H - BALL_R;
        v.vy = -Math.abs(v.vy);
        ctx.audio.play("tick");
      }

      const paddleTop = PADDLE_Y + 0.2;
      if (v.vy < 0 && prevY >= paddleTop && v.ballY <= paddleTop) {
        if (Math.abs(v.ballX - v.paddleX) < v.paddleW / 2 + BALL_R) {
          const rel = clamp((v.ballX - v.paddleX) / (v.paddleW / 2 + BALL_R), -1, 1);
          hits += 1;
          v.speed = Math.min(17, v.speed * 1.045);
          const angle = rel * (Math.PI / 3);
          v.vx = Math.sin(angle) * v.speed;
          v.vy = Math.abs(Math.cos(angle) * v.speed);
          v.ballY = paddleTop;
          base.score += 10;
          ctx.audio.play("swap", rel);
          if (hits % 5 === 0) {
            v.paddleW = Math.max(1, v.paddleW * 0.85);
            base.say(`加速！板宽 ${(v.paddleW).toFixed(1)}`, 0.9);
            ctx.audio.play("power");
          }
          v.fx.push({ x: v.ballX, y: paddleTop, z: 0, color: 0x9be8ff, count: 8 });
        }
      }

      if (v.ballY < -0.8) {
        v.alive = false;
        v.fx.push({ x: v.ballX, y: 0, z: 0, color: 0xff6b7a, count: 22 });
        base.detail = `连续接球 ${hits} 次`;
        base.finish("lose");
        return;
      }

      base.setFields([
        { label: "接球", value: `×${hits}` },
        { label: "球速", value: v.speed.toFixed(1) },
        { label: "板宽", value: v.paddleW.toFixed(1) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1420, 0x173a4d);
    addLights(ctx.scene, ctx.accent);

    const floor = box(ARENA_W + 1.6, 0.5, 4, 0x14283c, { metalness: 0.4 });
    floor.position.set(0, -0.4, 0);
    root.add(floor);
    const back = box(ARENA_W + 1.6, ARENA_H + 1, 0.4, 0x0e2033, { opacity: 0.55 });
    back.position.set(0, ARENA_H / 2, -1.2);
    root.add(back);
    const mkWall = (w: number, h: number, x: number, y: number) => {
      const wall = box(w, h, 1.2, ctx.accent, { emissive: ctx.accent, opacity: 0.35 });
      wall.position.set(x, y, 0);
      root.add(wall);
      return wall;
    };
    mkWall(0.4, ARENA_H, -ARENA_W / 2 - 0.2, ARENA_H / 2);
    mkWall(0.4, ARENA_H, ARENA_W / 2 + 0.2, ARENA_H / 2);
    mkWall(ARENA_W + 0.8, 0.4, 0, ARENA_H + 0.2);

    const paddle = box(1, 0.28, 0.9, ctx.accent, { emissive: ctx.accent });
    paddle.material = new THREE.MeshStandardMaterial({
      color: ctx.accent,
      emissive: ctx.accent,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
    });
    root.add(paddle);
    const sphere = ball(BALL_R, 0xffffff, 0xbfe3ff);
    root.add(sphere);

    const particles = new Particles(ctx.scene, 50);
    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      paddle.scale.x = v.paddleW;
      paddle.position.set(v.paddleX, PADDLE_Y, 0);
      sphere.position.set(v.ballX, v.ballY, 0);
      (sphere.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(time * 8) * 0.25;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.ballX * 0.18, 5.2, 10.5);
      ctx.camera.lookAt(0, ARENA_H * 0.42, 0);
    };

    return {
      paint,
      onDispose: () => {
        (paddle.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g07-lightwall-pong",
  no: 7,
  name: "光墙弹球",
  tagline: "球越来越快、板越来越窄，看你能接多少次。",
  category: "动作",
  controls: "← → / A D / 左右拖动",
  hint: "击球位置决定反弹角 · 每 5 次提速并缩板",
  accent: "#22d3ee",
  createLogic,
  createStage,
};

export default def;
