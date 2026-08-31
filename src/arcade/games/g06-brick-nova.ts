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
export const ARENA_H = 10;
export const BALL_R = 0.3;
export const COLS = 7;
export const ROWS = 4;
export const BRICK_W = 1.5;
export const BRICK_H = 0.55;
export const PADDLE_Y = 0.5;

export interface Brick {
  id: number;
  x: number;
  y: number;
  hp: number;
}

export interface GView {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  speed: number;
  paddleX: number;
  paddleW: number;
  bricks: Brick[];
  wave: number;
  fx: FxEvent[];
  alive: boolean;
}

export const BRICK_TOP = ARENA_H - 1.6;

function buildBricks(rng: () => number, wave: number): Brick[] {
  const bricks: Brick[] = [];
  const gapX = (ARENA_W - COLS * BRICK_W) / (COLS + 1);
  let id = 1;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      // Occasional empty cell keeps layouts fresh.
      if (wave > 1 && rng() < 0.08) continue;
      bricks.push({
        id: id++,
        x: -ARENA_W / 2 + gapX + col * (BRICK_W + gapX) + BRICK_W / 2,
        y: BRICK_TOP - row * (BRICK_H + 0.16),
        hp: 1 + Math.floor((row + wave - 1) / 3),
      });
    }
  }
  return bricks;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "清空砖墙 · 别让球落地" });
  const rng = makeRng(71003);
  const v: GView = {
    ballX: 0,
    ballY: 3,
    vx: 0,
    vy: 0,
    speed: 8,
    paddleX: 0,
    paddleW: 2.2,
    bricks: [],
    wave: 1,
    fx: [],
    alive: true,
  };
  let combo = 0;

  const launch = () => {
    const angle = (rng() - 0.5) * 0.9;
    v.vx = Math.sin(angle) * v.speed;
    v.vy = Math.abs(Math.cos(angle) * v.speed);
  };

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.ballY = 3;
    v.speed = 8;
    v.paddleX = 0;
    v.paddleW = 2.2;
    v.wave = 1;
    v.bricks = buildBricks(rng, 1);
    v.fx = [];
    v.alive = true;
    combo = 0;
    launch();
  };
  reset();

  const loseBall = () => {
    v.alive = false;
    v.fx.push({ x: v.ballX, y: 0.4, z: 0, color: 0xff6b7a, count: 22 });
    base.detail = `打到第 ${v.wave} 波 · 剩余砖块 ${v.bricks.length}`;
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
      const prevX = v.ballX;
      v.ballX += v.vx * dt;
      v.ballY += v.vy * dt;

      if (v.ballX < -ARENA_W / 2 + BALL_R) {
        v.ballX = -ARENA_W / 2 + BALL_R;
        v.vx = Math.abs(v.vx);
      }
      if (v.ballX > ARENA_W / 2 - BALL_R) {
        v.ballX = ARENA_W / 2 - BALL_R;
        v.vx = -Math.abs(v.vx);
      }
      if (v.ballY > ARENA_H - BALL_R) {
        v.ballY = ARENA_H - BALL_R;
        v.vy = -Math.abs(v.vy);
      }

      // Bricks: circle-vs-expanded-AABB, reflect on the shallower axis.
      for (let i = v.bricks.length - 1; i >= 0; i -= 1) {
        const b = v.bricks[i];
        const hx = BRICK_W / 2 + BALL_R;
        const hy = BRICK_H / 2 + BALL_R;
        const dx = Math.abs(v.ballX - b.x);
        const dy = Math.abs(v.ballY - b.y);
        if (dx < hx && dy < hy) {
          if (hy - dy < hx - dx) v.vy = -v.vy;
          else v.vx = -v.vx;
          v.ballX = prevX;
          v.ballY = prevY;
          b.hp -= 1;
          combo += 1;
          base.score += 20 + Math.min(combo, 10) * 2;
          ctx.audio.play("swap", Math.min(1, combo / 10));
          v.fx.push({ x: b.x, y: b.y, z: 0, color: 0xffd166, count: 8 });
          if (b.hp <= 0) v.bricks.splice(i, 1);
          if (v.bricks.length === 0) {
            base.score += 200;
            v.wave += 1;
            v.speed = Math.min(15, v.speed * 1.12);
            v.bricks = buildBricks(rng, v.wave);
            v.ballY = 3;
            launch();
            base.say(`第 ${v.wave} 波 +200`, 1.1);
            ctx.audio.play("power");
          }
          break;
        }
      }

      // Paddle.
      const paddleTop = PADDLE_Y + 0.2;
      if (v.vy < 0 && prevY >= paddleTop && v.ballY <= paddleTop && Math.abs(v.ballX - v.paddleX) < v.paddleW / 2 + BALL_R) {
        const rel = clamp((v.ballX - v.paddleX) / (v.paddleW / 2 + BALL_R), -1, 1);
        const angle = rel * (Math.PI / 3);
        v.vx = Math.sin(angle) * v.speed;
        v.vy = Math.abs(Math.cos(angle) * v.speed);
        v.ballY = paddleTop;
        combo = 0;
        ctx.audio.play("tick");
      }

      if (v.ballY < -0.8) {
        loseBall();
        return;
      }

      base.setFields([
        { label: "波次", value: `×${v.wave}` },
        { label: "砖块", value: `×${v.bricks.length}` },
        { label: "连破", value: `×${combo}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x14081e, 0x33124a);
    addLights(ctx.scene, ctx.accent);

    const paddle = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.3, 1),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.3 }),
    );
    paddle.position.set(0, PADDLE_Y, 0);
    root.add(paddle);
    const sphere = ball(BALL_R, 0xffffff, 0xffd9f0);
    root.add(sphere);

    const brickMeshes = new Map<number, THREE.Mesh>();
    const brickGeo = new THREE.BoxGeometry(BRICK_W, BRICK_H, 0.9);
    const particles = new Particles(ctx.scene, 70);
    const hueFor = (y: number) => 0.62 - (BRICK_TOP - y) * 0.07;

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      paddle.scale.x = v.paddleW;
      paddle.position.x = v.paddleX;
      sphere.position.set(v.ballX, v.ballY, 0);

      const seen = new Set<number>();
      for (const b of v.bricks) {
        seen.add(b.id);
        let mesh = brickMeshes.get(b.id);
        if (!mesh) {
          mesh = new THREE.Mesh(
            brickGeo,
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(hueFor(b.y), 0.72, 0.6),
              emissive: new THREE.Color().setHSL(hueFor(b.y), 0.8, 0.3),
              emissiveIntensity: 0.4,
              metalness: 0.35,
              roughness: 0.4,
            }),
          );
          brickMeshes.set(b.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(b.x, b.y, 0);
        mesh.scale.z = 1 + b.hp * 0.18;
      }
      for (const [id, mesh] of brickMeshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          brickMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.ballX * 0.15, 4.6 + Math.sin(time * 0.4) * 0.2, 11.4);
      ctx.camera.lookAt(0, ARENA_H * 0.42, 0);
    };

    return {
      paint,
      onDispose: () => {
        brickGeo.dispose();
        (paddle.material as THREE.Material).dispose();
        for (const mesh of brickMeshes.values()) {
          (mesh.material as THREE.Material).dispose();
        }
      },
    };
  });
}

const def: GameDefinition = {
  id: "g06-brick-nova",
  no: 6,
  name: "砖块风暴",
  tagline: "清空砖墙进入下一波，连破越高分越多。",
  category: "动作",
  controls: "← → / A D / 左右拖动",
  hint: "清波 +200 · 连破有加成 · 弹球角度看击点",
  accent: "#e879f9",
  createLogic,
  createStage,
};

export default def;
