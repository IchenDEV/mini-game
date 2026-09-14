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

export const ROUND_SECONDS = 60;
export const MAX_LIVES = 3;

export interface Balloon {
  id: number;
  kind: "balloon" | "bomb";
  x: number;
  y: number;
  vy: number;
  r: number;
  colorIdx: number;
}

export interface GView {
  items: Balloon[];
  seconds: number;
  lives: number;
  popped: number;
  streak: number;
  fx: FxEvent[];
  alive: boolean;
}

const COLORS = [0xff5d73, 0xffd166, 0x4ade80, 0x60a5fa, 0xc084fc];
const COLOR_POINTS = [15, 10, 10, 10, 20];

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "点气球得分 · 炸弹点不得 · 漂走的气球会断连击",
    meterLabel: "剩余时间",
  });
  const rng = makeRng(21559);
  const v: GView = {
    items: [],
    seconds: ROUND_SECONDS,
    lives: MAX_LIVES,
    popped: 0,
    streak: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.4;
  let bombTimer = 4;

  const reset = () => {
    base.clearHud(1);
    nextId = 1;
    v.items = [];
    v.seconds = ROUND_SECONDS;
    v.lives = MAX_LIVES;
    v.popped = 0;
    v.streak = 0;
    v.fx = [];
    v.alive = true;
    spawnTimer = 0.4;
    bombTimer = 4;
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

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.5 - base.elapsed * 0.004, 0.24, 0.5);
        const small = rng() < 0.3;
        v.items.push({
          id: nextId++,
          kind: "balloon",
          x: -5.5 + rng() * 11,
          y: -0.8,
          vy: 1.7 + rng() * 1.3,
          r: small ? 0.34 : 0.46,
          colorIdx: Math.floor(rng() * COLORS.length),
        });
      }
      bombTimer -= dt;
      if (bombTimer <= 0) {
        bombTimer = 3 + rng() * 3;
        v.items.push({
          id: nextId++,
          kind: "bomb",
          x: -5.5 + rng() * 11,
          y: -0.8,
          vy: 2 + rng() * 1.2,
          r: 0.36,
          colorIdx: 0,
        });
      }

      const clickX = input.pointerX * 6.2;
      const clickY = input.pointerY * 4.4 + 0.6;
      let clicked = false;
      if (input.pointerActive && input.actionPressed) clicked = true;

      for (let i = v.items.length - 1; i >= 0; i -= 1) {
        const item = v.items[i];
        item.y += item.vy * dt;
        if (clicked) {
          const d = Math.hypot(item.x - clickX, (item.y - clickY) * 0.85);
          if (d < item.r + 0.3) {
            v.items.splice(i, 1);
            clicked = false;
            if (item.kind === "bomb") {
              v.lives -= 1;
              v.streak = 0;
              ctx.audio.play("hit");
              v.fx.push({ x: item.x, y: item.y, z: 0, color: 0xff5d5d, count: 18 });
              if (v.lives <= 0) {
                v.alive = false;
                base.detail = `戳破 ${v.popped} 只气球`;
                base.finish("lose");
                return;
              }
              base.say("是炸弹！", 0.8);
            } else {
              v.popped += 1;
              v.streak += 1;
              const pts = Math.round(COLOR_POINTS[item.colorIdx] * (item.r < 0.4 ? 1.6 : 1) * (1 + Math.min(4, v.streak / 6) * 0.4));
              base.score += pts;
              ctx.audio.play("pickup", Math.min(1, v.streak / 10));
              v.fx.push({ x: item.x, y: item.y, z: 0, color: COLORS[item.colorIdx], count: 10 });
            }
            continue;
          }
        }
        if (item.y > 7.4) {
          v.items.splice(i, 1);
          if (item.kind === "balloon" && v.streak > 0) {
            v.streak = 0;
            ctx.audio.play("tick");
          }
        }
      }

      if (v.seconds <= 0) {
        base.setMeter(0);
        base.detail = `60 秒戳破 ${v.popped} 只气球`;
        base.finish(v.popped >= 30 ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "连击", value: `×${v.streak}` },
        { label: "气球", value: String(v.popped) },
        { label: "生命", value: "♥".repeat(Math.max(0, v.lives)) || "—" },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x141028, 0x3c2a5e);
    addLights(ctx.scene, ctx.accent);

    const ground = box(30, 0.4, 12, 0x2a2440, { metalness: 0.25 });
    ground.position.set(0, -1, -3);
    root.add(ground);

    const balloonGeo = ball(1, 0xffffff).geometry as THREE.SphereGeometry;
    const balloonMats = COLORS.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.28, roughness: 0.4, metalness: 0.1 }),
    );
    const bombGeo = ball(1, 0).geometry as THREE.SphereGeometry;
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x2c2f3a, emissive: 0xff3b30, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.4 });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 70);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const seen = new Set<number>();
      for (const item of v.items) {
        seen.add(item.id);
        let mesh = meshes.get(item.id);
        if (!mesh) {
          if (item.kind === "bomb") mesh = new THREE.Mesh(bombGeo, bombMat);
          else mesh = new THREE.Mesh(balloonGeo, balloonMats[item.colorIdx]);
          meshes.set(item.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(item.x, item.y, 0);
        mesh.scale.setScalar(item.r);
        mesh.rotation.z = Math.sin(item.id + item.y) * 0.12;
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 2.8, 11);
      ctx.camera.lookAt(0, 2.6, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        balloonGeo.dispose();
        balloonMats.forEach((m) => m.dispose());
        bombGeo.dispose();
        bombMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g28-balloon-pop",
  no: 28,
  name: "气球爆破",
  tagline: "五彩气球往上飘，手快有手慢无，炸弹别碰。",
  category: "休闲",
  controls: "移动准星 · 点击/空格 戳破",
  hint: "小气球分高 · 连击有倍率 · 炸弹扣一条命",
  accent: "#e879f9",
  createLogic,
  createStage,
};

export default def;
