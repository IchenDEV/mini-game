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

export const BALLS = 3;
export const BUMPER_R = 0.62;
export const FLIP_HALF = 1.6;

export interface Bumper {
  x: number;
  y: number;
  hit: number;
}

export interface GView {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  flipL: boolean;
  flipR: boolean;
  bumpers: Bumper[];
  ballsLeft: number;
  launched: boolean;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "←→ 控制两个弹板 · 弹撞圆垫得分 · 掉进洞少一球" });
  const rng = makeRng(31416);
  const v: GView = {
    ballX: 0,
    ballY: 8.6,
    vx: 0,
    vy: 0,
    flipL: false,
    flipR: false,
    bumpers: [
      { x: -1.7, y: 4.4, hit: 0 },
      { x: 1.7, y: 4.4, hit: 0 },
      { x: 0, y: 6, hit: 0 },
    ],
    ballsLeft: BALLS,
    launched: false,
    fx: [],
    alive: true,
  };
  const WALL_HALF = 3.2;
  const DRAIN_Y = -0.6;

  const reset = () => {
    base.clearHud();
    v.ballsLeft = BALLS;
    v.bumpers = v.bumpers.map((b) => ({ ...b, hit: 0 }));
    v.launched = false;
    v.ballX = 0;
    v.ballY = 8.6;
    v.vx = 0;
    v.vy = 0;
    v.fx = [];
    v.alive = true;
    void rng;
  };
  reset();

  const drain = () => {
    v.ballsLeft -= 1;
    ctx.audio.play("hit");
    if (v.ballsLeft <= 0) {
      v.alive = false;
      base.detail = `三颗球共得 ${base.score} 分`;
      base.finish("lose");
      return;
    }
    v.launched = false;
    v.ballX = 0;
    v.ballY = 8.6;
    v.vx = 0;
    v.vy = 0;
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

      v.flipL = input.axisX <= -0.5 || input.padPressed.includes(0);
      v.flipR = input.axisX >= 0.5 || input.padPressed.includes(1);
      // Space/enter launches a held ball.
      if (!v.launched && input.actionPressed) {
        v.launched = true;
        v.vx = (rng() - 0.5) * 3;
        v.vy = -2;
        ctx.audio.play("shoot");
      }

      if (!v.launched) return;
      const prevY = v.ballY;
      v.vy -= 9.8 * dt;
      v.ballX += v.vx * dt;
      v.ballY += v.vy * dt;

      if (v.ballX < -WALL_HALF + 0.2) {
        v.ballX = -WALL_HALF + 0.2;
        v.vx = Math.abs(v.vx) * 0.9;
        ctx.audio.play("tick");
      }
      if (v.ballX > WALL_HALF - 0.2) {
        v.ballX = WALL_HALF - 0.2;
        v.vx = -Math.abs(v.vx) * 0.9;
        ctx.audio.play("tick");
      }
      if (v.ballY > 9.4) {
        v.ballY = 9.4;
        v.vy = -Math.abs(v.vy) * 0.7;
      }

      for (const b of v.bumpers) {
        const dx = v.ballX - b.x;
        const dy = v.ballY - b.y;
        const d = Math.hypot(dx, dy);
        if (d < BUMPER_R + 0.24) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          const dot = v.vx * nx + v.vy * ny;
          if (dot < 0) {
            v.vx = (v.vx - 2 * dot * nx) * 1.05;
            v.vy = (v.vy - 2 * dot * ny) * 1.05;
          }
          v.ballX = b.x + nx * (BUMPER_R + 0.26);
          v.ballY = b.y + ny * (BUMPER_R + 0.26);
          base.score += 10;
          b.hit = 0.25;
          ctx.audio.play("pickup", 0.5);
          v.fx.push({ x: b.x, y: b.y, z: 0, color: 0xffd166, count: 8 });
        }
        if (b.hit > 0) b.hit -= dt;
      }

      // Flippers: two pads near the bottom with a gap between them.
      const flipY = 0.6;
      if (prevY >= flipY && v.ballY <= flipY && v.vy < 0) {
        const leftZone = v.ballX < 0 && Math.abs(v.ballX - -1.1) < FLIP_HALF;
        const rightZone = v.ballX >= 0 && Math.abs(v.ballX - 1.1) < FLIP_HALF;
        const flip = (leftZone && v.flipL) || (rightZone && v.flipR);
        if (flip) {
          v.vy = Math.abs(v.vy) * 0.9 + 7.4;
          v.vx += (v.ballX < 0 ? -1 : 1) * -0.4 + (v.ballX < -1.1 ? -2 : v.ballX > 1.1 ? 2 : 0) * 0;
          v.vx = clamp(v.vx + (v.ballX < 0 ? 2.4 : -2.4), -6, 6);
          v.ballY = flipY;
          ctx.audio.play("swap", 0.7);
        } else if (v.ballY < DRAIN_Y + 0.2) {
          drain();
          return;
        }
      }
      if (v.ballY < DRAIN_Y) {
        drain();
        return;
      }

      base.setFields([
        { label: "球数", value: `${v.ballsLeft}` },
        { label: "得分", value: String(base.score) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x100816, 0x33204a);
    addLights(ctx.scene, ctx.accent);

    const board = box(7, 11, 0.5, 0x1d1228, { metalness: 0.4 });
    board.position.set(0, 4.4, -0.5);
    root.add(board);
    for (const side of [-1, 1]) {
      const rail = box(0.24, 11, 0.8, ctx.accent, { emissive: ctx.accent });
      rail.position.set(side * 3.32, 4.4, 0);
      root.add(rail);
    }

    const bumperGeo = new THREE.CylinderGeometry(BUMPER_R, BUMPER_R, 0.5, 18);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 });
    const bumperMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(bumperGeo, bumperMat);
      bumperMeshes.push(mesh);
      root.add(mesh);
    }

    const flipL = box(1.5, 0.2, 0.6, ctx.accent, { emissive: ctx.accent });
    const flipR = box(1.5, 0.2, 0.6, ctx.accent, { emissive: ctx.accent });
    root.add(flipL, flipR);
    const sphere = ball(0.24, 0xffffff, 0xbfe3ff);
    root.add(sphere);
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.set(v.ballX, v.ballY, 0);
      v.bumpers.forEach((b, i) => {
        bumperMeshes[i].position.set(b.x, b.y, 0);
        bumperMat.emissiveIntensity = b.hit > 0 ? 1.4 : 0.6;
      });
      flipL.position.set(-1.1, v.flipL ? 0.75 : 0.55, 0);
      flipL.rotation.z = v.flipL ? 0.5 : 0.18;
      flipR.position.set(1.1, v.flipR ? 0.75 : 0.55, 0);
      flipR.rotation.z = v.flipR ? -0.5 : -0.18;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 5.4, 10.2);
      ctx.camera.lookAt(0, 4.2, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        bumperGeo.dispose();
        bumperMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g49-pinch-pinball",
  no: 49,
  name: "弹珠台",
  tagline: "三颗钢球，两块弹板，撞垫越多分越高。",
  category: "体育",
  controls: "← → 拍弹板 · 空格发球",
  hint: "圆垫 +10 · 弹板要把球救回来 · 掉洞扣一球",
  accent: "#c084fc",
  createLogic,
  createStage,
};

export default def;
