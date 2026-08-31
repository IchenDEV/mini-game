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

export const BALL_R = 0.36;
export const PADDLE_Y = 0.9;
export const GRAVITY = 9.4;

export interface GView {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  peak: number;
  paddleX: number;
  keepups: number;
  bestStreak: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "托住下落的球 · 打点越偏飞得越飘" });
  const rng = makeRng(47721);
  const v: GView = {
    ballX: 0,
    ballY: 5,
    vx: 0,
    vy: 0,
    peak: 0,
    paddleX: 0,
    keepups: 0,
    bestStreak: 0,
    fx: [],
    alive: true,
  };
  let gustTimer = 3;

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.ballY = 5;
    v.vx = 0;
    v.vy = 0;
    v.peak = 0;
    v.paddleX = 0;
    v.keepups = 0;
    v.bestStreak = 0;
    v.fx = [];
    v.alive = true;
    gustTimer = 3;
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
        const target = clamp(input.pointerX * 5.4, -5, 5);
        v.paddleX += (target - v.paddleX) * Math.min(1, dt * 12);
      }
      v.paddleX = clamp(v.paddleX + input.axisX * 9.5 * dt, -5, 5);

      gustTimer -= dt;
      if (gustTimer <= 0) {
        gustTimer = 2.2 + rng() * 2.2;
        v.vx += (rng() - 0.5) * 3.4;
        base.say("风来了！", 0.7);
      }

      const prevY = v.ballY;
      v.vy -= GRAVITY * dt;
      v.ballX += v.vx * dt;
      v.ballY += v.vy * dt;
      v.peak = Math.max(v.peak, v.ballY);

      if (v.ballX < -5.4 || v.ballX > 5.4) {
        v.ballX = clamp(v.ballX, -5.4, 5.4);
        v.vx = -v.vx * 0.6;
      }

      const paddleTop = PADDLE_Y + 0.16;
      if (v.vy < 0 && prevY >= paddleTop && v.ballY <= paddleTop && Math.abs(v.ballX - v.paddleX) < 1.05) {
        const rel = clamp((v.ballX - v.paddleX) / 1.05, -1, 1);
        v.vy = 7.6;
        v.vx = v.vx * 0.55 + rel * 3.4;
        v.ballY = paddleTop;
        v.keepups += 1;
        const heightBonus = Math.round(Math.max(0, v.peak - 3) * 2);
        base.score += 5 + heightBonus;
        v.peak = 0;
        ctx.audio.play("swap", rel * 0.5 + 0.5);
        v.fx.push({ x: v.ballX, y: paddleTop, z: 0, color: 0x8ef0ff, count: 6 });
        if (v.keepups % 5 === 0) base.say(`连续 ${v.keepups} 次！`, 0.9);
      }

      if (v.ballY < 0.15) {
        v.alive = false;
        v.fx.push({ x: v.ballX, y: 0.3, z: 0, color: 0xff6b7a, count: 22 });
        base.detail = `连续垫球 ${v.keepups} 次`;
        base.finish("lose");
        return;
      }

      base.setFields([
        { label: "垫球", value: String(v.keepups) },
        { label: "高度", value: v.ballY.toFixed(1) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x08131c, 0x143a4a);
    addLights(ctx.scene, ctx.accent);

    const floor = box(14, 0.4, 8, 0x1c3a4a, { metalness: 0.3 });
    floor.position.set(0, -0.2, -1);
    root.add(floor);

    const paddle = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 0.9, 0.16, 22),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.4 }),
    );
    paddle.position.set(0, PADDLE_Y, 0);
    root.add(paddle);
    const handle = box(0.12, 0.7, 0.12, 0x8a6b4a);
    handle.position.set(0, PADDLE_Y - 0.4, 0);
    root.add(handle);

    const sphere = ball(BALL_R, 0xffffff, 0x9be8ff);
    root.add(sphere);
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      paddle.position.x = v.paddleX;
      paddle.rotation.z = clamp((v.paddleX - v.ballX) * 0.12, -0.35, 0.35);
      sphere.position.set(v.ballX, v.ballY, 0);

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 6);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.ballX * 0.25, 3.4, 9.4);
      ctx.camera.lookAt(0, 2.6, 0);
      void dt;
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
  id: "g27-keepy-ups",
  no: 27,
  name: "弹跳保持",
  tagline: "球拍垫气球，风一来就全乱了。",
  category: "体育",
  controls: "← → / A D / 左右拖动",
  hint: "打点越偏飞得越远 · 垫得越高加分越多",
  accent: "#38bdf8",
  createLogic,
  createStage,
};

export default def;
