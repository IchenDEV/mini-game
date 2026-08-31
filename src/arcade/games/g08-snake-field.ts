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
import { addLights, box, createStageShell, groundGrid, Particles, setBackdrop } from "../kit/world";

export const GRID = 13;
export const START_INTERVAL = 0.26;
export const MIN_INTERVAL = 0.12;

export type Dir = "up" | "down" | "left" | "right";
export const DIR_VECTORS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Cell {
  x: number;
  y: number;
}

export interface GView {
  snake: Cell[];
  food: Cell;
  dir: Dir;
  /** Queued direction, applied on the next step. */
  want: Dir;
  moving: boolean;
  fx: FxEvent[];
  alive: boolean;
}

export function gridToWorld(c: Cell): [number, number] {
  return [c.x - (GRID - 1) / 2, c.y - (GRID - 1) / 2];
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "方向键转向 · 吃光点变长 · 撞墙撞自己结束" });
  const rng = makeRng(88011);
  const v: GView = {
    snake: [],
    food: { x: 0, y: 0 },
    dir: "up",
    want: "up",
    moving: false,
    fx: [],
    alive: true,
  };
  let interval = START_INTERVAL;
  let acc = 0;
  let eaten = 0;

  const spawnFood = () => {
    for (let tries = 0; tries < 400; tries += 1) {
      const cell = { x: Math.floor(rng() * GRID), y: Math.floor(rng() * GRID) };
      if (!v.snake.some((s) => s.x === cell.x && s.y === cell.y)) {
        v.food = cell;
        return;
      }
    }
  };

  const reset = () => {
    base.clearHud();
    const mid = Math.floor(GRID / 2);
    v.snake = [
      { x: mid, y: mid },
      { x: mid, y: mid + 1 },
      { x: mid, y: mid + 2 },
    ];
    v.dir = "up";
    v.want = "up";
    v.moving = false;
    v.fx = [];
    v.alive = true;
    interval = START_INTERVAL;
    acc = 0;
    eaten = 0;
    spawnFood();
  };
  reset();

  const turn = (want: Dir) => {
    const opposites: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    if (want === opposites[v.dir] || want === v.dir) return;
    v.want = want;
  };

  return {
    view: v,
    start: () => {
      base.start();
      v.moving = true;
    },
    pause: () => base.pause(),
    resume: () => base.resume(),
    restart: () => {
      base.restart();
      reset();
      v.moving = true;
    },
    step(dt, input) {
      base.tick(dt);
      if (!v.alive) return;

      if (input.axisX >= 0.5) turn("right");
      else if (input.axisX <= -0.5) turn("left");
      else if (input.axisY >= 0.5) turn("up");
      else if (input.axisY <= -0.5) turn("down");
      if (input.pointerActive && input.actionPressed) {
        if (Math.abs(input.pointerX) > Math.abs(input.pointerY)) {
          turn(input.pointerX > 0 ? "right" : "left");
        } else {
          turn(input.pointerY > 0 ? "up" : "down");
        }
      }

      acc += dt;
      if (acc < interval) return;
      acc = 0;
      v.dir = v.want;

      const [dx, dy] = DIR_VECTORS[v.dir];
      const head = v.snake[0];
      const next = { x: head.x + dx, y: head.y + dy };
      if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
        v.alive = false;
        v.fx.push({ ...worldFx(next), color: 0xff6b7a, count: 20 });
        base.detail = `吃到 ${eaten} 枚光点 · 长度 ${v.snake.length}`;
        base.finish("lose");
        return;
      }
      const ate = next.x === v.food.x && next.y === v.food.y;
      const body = ate ? v.snake : v.snake.slice(0, -1);
      if (body.some((s) => s.x === next.x && s.y === next.y)) {
        v.alive = false;
        v.fx.push({ ...worldFx(next), color: 0xff6b7a, count: 20 });
        base.detail = `吃到 ${eaten} 枚光点 · 长度 ${v.snake.length}`;
        base.finish("lose");
        return;
      }
      v.snake.unshift(next);
      if (ate) {
        eaten += 1;
        base.score += 20 + eaten;
        interval = Math.max(MIN_INTERVAL, START_INTERVAL - eaten * 0.008);
        ctx.audio.play("pickup", Math.min(1, eaten / 15));
        v.fx.push({ ...worldFx(v.food), color: 0x9cf0b8, count: 10 });
        if (eaten % 5 === 0) base.say(`长度 ${v.snake.length}！`, 0.8);
        spawnFood();
      } else {
        v.snake.pop();
      }

      base.setFields([
        { label: "长度", value: String(v.snake.length) },
        { label: "光点", value: String(eaten) },
        { label: "步频", value: `${(1 / interval).toFixed(1)}/s` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function worldFx(cell: Cell): { x: number; y: number; z: number } {
  const [wx, wz] = gridToWorld(cell);
  return { x: wx, y: 0.5, z: wz };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x071810, 0x143524);
    addLights(ctx.scene, ctx.accent);
    groundGrid(ctx.scene, GRID, GRID, 0x1d4a33).position.y = 0.01;

    const segGeo = new THREE.BoxGeometry(0.82, 0.55, 0.82);
    const segMat = new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.4 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd9ffe9, emissive: ctx.accent, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.35 });
    const food = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.25 }),
    );
    root.add(food);

    const segMeshes: THREE.Mesh[] = [];
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;

      while (segMeshes.length < v.snake.length) {
        const mesh = new THREE.Mesh(segGeo, segMat);
        segMeshes.push(mesh);
        root.add(mesh);
      }
      v.snake.forEach((cell, i) => {
        const [wx, wz] = gridToWorld(cell);
        const mesh = segMeshes[i];
        mesh.material = i === 0 ? headMat : segMat;
        mesh.position.set(wx, 0.28, wz);
        mesh.scale.setScalar(i === 0 ? 1.08 : 1 - Math.min(0.35, i * 0.012));
      });
      const [fx2, fz2] = gridToWorld(v.food);
      food.position.set(fx2, 0.55 + Math.sin(time * 4) * 0.12, fz2);
      food.rotation.y = time * 2.4;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      const head = v.snake[0] ?? { x: 0, y: 0 };
      const [hx, hz] = gridToWorld(head);
      ctx.camera.position.set(hx * 0.55 + 4.2, 10.5, hz * 0.55 + 7.6);
      ctx.camera.lookAt(hx * 0.3, 0, hz * 0.3);
    };

    return {
      paint,
      onDispose: () => {
        segGeo.dispose();
        segMat.dispose();
        headMat.dispose();
        food.geometry.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g08-snake-field",
  no: 8,
  name: "贪吃蛇域",
  tagline: "经典贪吃蛇搬进 3D 谷地，吃得越多走得越快。",
  category: "益智",
  controls: "方向键 / WASD / 点击相对方向",
  hint: "不能 180° 掉头 · 光点 +20 · 撞墙撞身即终",
  accent: "#34d399",
  createLogic,
  createStage,
};

export default def;
