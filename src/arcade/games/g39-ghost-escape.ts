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
import { addLights, box, createStageShell, ball, Particles, setBackdrop, starfield } from "../kit/world";

export const TOTAL_ORBS = 6;
export const GHOST_STEP = 0.5;

export interface Orbs {
  [key: string]: boolean;
}

export interface GView {
  levelIndex: number;
  walls: Set<string>;
  orbs: Orbs;
  px: number;
  pz: number;
  gx: number;
  gz: number;
  ghostTimer: number;
  orbsLeft: number;
  fx: FxEvent[];
  alive: boolean;
}

type Dir = "up" | "down" | "left" | "right";
const DELTA: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const MAZE_W = 9;
export const MAZE_H = 7;

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "方向键拾灵珠 · 幽灵每步逼近 · 集齐进入下一层" });
  const rng = makeRng(93701);
  const v: GView = {
    levelIndex: 0,
    walls: new Set(),
    orbs: {},
    px: 1,
    pz: 1,
    gx: MAZE_W - 2,
    gz: MAZE_H - 2,
    ghostTimer: GHOST_STEP,
    orbsLeft: TOTAL_ORBS,
    fx: [],
    alive: true,
  };
  let prevAxisX = 0;
  let prevAxisY = 0;
  let totalOrbs = 0;

  const bfsReachable = (walls: Set<string>, sx: number, sz: number): Map<string, number> => {
    const dist = new Map<string, number>();
    const queue: [number, number][] = [[sx, sz]];
    dist.set(`${sx},${sz}`, 0);
    while (queue.length > 0) {
      const [x, z] = queue.shift()!;
      const d = dist.get(`${x},${z}`)!;
      for (const dir of Object.keys(DELTA) as Dir[]) {
        const [dx, dz] = DELTA[dir];
        const nx = x + dx;
        const nz = z + dz;
        const key = `${nx},${nz}`;
        if (nx < 0 || nx >= MAZE_W || nz < 0 || nz >= MAZE_H) continue;
        if (walls.has(key) || dist.has(key)) continue;
        dist.set(key, d + 1);
        queue.push([nx, nz]);
      }
    }
    return dist;
  };

  const generate = () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const walls = new Set<string>();
      for (let x = 0; x < MAZE_W; x += 1) {
        walls.add(`${x},0`);
        walls.add(`${x},${MAZE_H - 1}`);
      }
      for (let z = 0; z < MAZE_H; z += 1) {
        walls.add(`0,${z}`);
        walls.add(`${MAZE_W - 1},${z}`);
      }
      for (let z = 1; z < MAZE_H - 1; z += 1) {
        for (let x = 1; x < MAZE_W - 1; x += 1) {
          if (rng() < 0.18) walls.add(`${x},${z}`);
        }
      }
      const px = 1;
      const pz = 1;
      walls.delete(`${px},${pz}`);
      const reach = bfsReachable(walls, px, pz);
      if (reach.size < (MAZE_W - 2) * (MAZE_H - 2) * 0.55) continue;
      const cells = [...reach.keys()].filter((k) => k !== `${px},${pz}`);
      if (cells.length < TOTAL_ORBS + 1) continue;
      // Place orbs on far-flung reachable cells.
      cells.sort((a, b) => (reach.get(b) ?? 0) - (reach.get(a) ?? 0));
      const orbs: Orbs = {};
      let placed = 0;
      for (const key of cells) {
        if (placed >= TOTAL_ORBS) break;
        const [x, z] = key.split(",").map(Number);
        if (Math.abs(x - px) + Math.abs(z - pz) < 3) continue;
        orbs[key] = true;
        placed += 1;
      }
      if (placed < TOTAL_ORBS) continue;
      v.walls = walls;
      v.orbs = orbs;
      v.px = px;
      v.pz = pz;
      v.orbsLeft = TOTAL_ORBS;
      return;
    }
    // Fallback: empty room.
    v.walls = new Set<string>();
    for (let x = 0; x < MAZE_W; x += 1) {
      v.walls.add(`${x},0`);
      v.walls.add(`${x},${MAZE_H - 1}`);
    }
    for (let z = 0; z < MAZE_H; z += 1) {
      v.walls.add(`0,${z}`);
      v.walls.add(`${MAZE_W - 1},${z}`);
    }
    v.orbs = {};
    v.px = 1;
    v.pz = 1;
    for (let i = 0; i < TOTAL_ORBS; i += 1) {
      v.orbs[`${2 + i},${MAZE_H - 2}`] = true;
    }
    v.orbsLeft = TOTAL_ORBS;
  };

  const reset = () => {
    base.clearHud();
    v.levelIndex = 0;
    totalOrbs = 0;
    generate();
    v.gx = MAZE_W - 2;
    v.gz = MAZE_H - 2;
    v.ghostTimer = GHOST_STEP;
    v.fx = [];
    v.alive = true;
    prevAxisX = 0;
    prevAxisY = 0;
  };
  reset();

  const ghostStep = () => {
    const dist = bfsReachable(v.walls, v.px, v.pz);
    let best = { x: v.gx, z: v.gz, d: dist.get(`${v.gx},${v.gz}`) ?? Infinity };
    for (const dir of Object.keys(DELTA) as Dir[]) {
      const [dx, dz] = DELTA[dir];
      const nx = v.gx + dx;
      const nz = v.gz + dz;
      const d = dist.get(`${nx},${nz}`);
      if (d !== undefined && d < best.d) best = { x: nx, z: nz, d };
    }
    v.gx = best.x;
    v.gz = best.z;
    if (v.gx === v.px && v.gz === v.pz) {
      v.alive = false;
      v.fx.push({ x: v.px - 4, y: 0.6, z: v.pz - 3, color: 0xff6b7a, count: 24 });
      base.detail = `第 ${v.levelIndex + 1} 层被幽灵抓住`;
      base.finish("lose");
    }
  };

  const move = (dir: Dir) => {
    const [dx, dz] = DELTA[dir];
    const nx = v.px + dx;
    const nz = v.pz + dz;
    if (v.walls.has(`${nx},${nz}`)) return;
    v.px = nx;
    v.pz = nz;
    ctx.audio.play("tick", 0.4);
    const key = `${nx},${nz}`;
    if (v.orbs[key]) {
      delete v.orbs[key];
      v.orbsLeft -= 1;
      totalOrbs += 1;
      base.score += 20;
      ctx.audio.play("pickup", Math.min(1, totalOrbs / 20));
      v.fx.push({ x: nx - 4, y: 0.6, z: nz - 3, color: 0x8ef0ff, count: 10 });
      if (v.orbsLeft === 0) {
        if (v.levelIndex >= 2) {
          base.detail = `三层迷宫全部清空`;
          base.finish("win");
          return;
        }
        v.levelIndex += 1;
        base.say(`进入第 ${v.levelIndex + 1} 层`, 1.1);
        generate();
        v.gx = MAZE_W - 2;
        v.gz = MAZE_H - 2;
        v.ghostTimer = GHOST_STEP;
      }
    }
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

      if (input.axisX >= 0.5 && prevAxisX < 0.5) move("right");
      else if (input.axisX <= -0.5 && prevAxisX > -0.5) move("left");
      else if (input.axisY >= 0.5 && prevAxisY < 0.5) move("up");
      else if (input.axisY <= -0.5 && prevAxisY > -0.5) move("down");
      prevAxisX = input.axisX;
      prevAxisY = input.axisY;
      for (const pad of input.padPressed) {
        const dirs: Dir[] = ["up", "down", "left", "right"];
        if (pad < dirs.length) move(dirs[pad]);
      }

      v.ghostTimer -= dt;
      if (v.ghostTimer <= 0) {
        v.ghostTimer = GHOST_STEP;
        ghostStep();
      }

      base.setFields([
        { label: "层数", value: `${v.levelIndex + 1}/3` },
        { label: "灵珠", value: `${v.orbsLeft}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a0a1e, 0x231a4a);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 120, 40);

    const floor = box(MAZE_W, 0.3, MAZE_H, 0x1d1d40, { metalness: 0.3 });
    floor.position.set(0, -0.15, 0);
    root.add(floor);

    const wallGeo = box(1, 1.1, 1, 0x3a3a6e, { metalness: 0.35 }).geometry as THREE.BoxGeometry;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a6e, metalness: 0.35, roughness: 0.5 });
    const orbGeo = ball(0.28, 0x8ef0ff, 0x38e1ff).geometry as THREE.SphereGeometry;
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x38e1ff, emissiveIntensity: 0.9 });
    const playerMesh = box(0.7, 0.7, 0.7, ctx.accent, { emissive: ctx.accent });
    root.add(playerMesh);
    const ghost = ball(0.42, 0xd8d8ff, 0x9a9aff);
    root.add(ghost);
    const particles = new Particles(ctx.scene, 50);

    const wallMeshes = new Map<string, THREE.Mesh>();
    const orbMeshes = new Map<string, THREE.Mesh>();

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const wx = (x: number) => x - (MAZE_W - 1) / 2;
      const wz = (z: number) => z - (MAZE_H - 1) / 2;

      for (const key of v.walls) {
        if (!wallMeshes.has(key)) {
          const mesh = new THREE.Mesh(wallGeo, wallMat);
          wallMeshes.set(key, mesh);
          root.add(mesh);
        }
        const [x, z] = key.split(",").map(Number);
        wallMeshes.get(key)!.position.set(wx(x), 0.55, wz(z));
      }
      for (const key of Object.keys(v.orbs)) {
        if (!orbMeshes.has(key)) {
          const mesh = new THREE.Mesh(orbGeo, orbMat);
          orbMeshes.set(key, mesh);
          root.add(mesh);
        }
        const [x, z] = key.split(",").map(Number);
        orbMeshes.get(key)!.position.set(wx(x), 0.55 + Math.sin(time * 4 + x) * 0.08, wz(z));
      }
      for (const [key, mesh] of [...orbMeshes]) {
        if (!v.orbs[key]) {
          root.remove(mesh);
          orbMeshes.delete(key);
        }
      }

      playerMesh.position.set(wx(v.px), 0.5, wz(v.pz));
      ghost.position.set(wx(v.gx), 0.6 + Math.sin(time * 5) * 0.1, wz(v.gz));

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(wx(v.px) * 0.7, 9.2, wz(v.pz) * 0.5 + 7);
      ctx.camera.lookAt(wx(v.px) * 0.6, 0, wz(v.pz) * 0.6 - 1);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        wallGeo.dispose();
        wallMat.dispose();
        orbGeo.dispose();
        orbMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g39-ghost-escape",
  no: 39,
  name: "幽灵迷宫",
  tagline: "拾灵珠、躲幽灵，幽灵永远走最短路。",
  category: "益智",
  controls: "方向键 / WASD 移动",
  hint: "集齐 6 颗灵珠下楼 · 幽灵每 0.5 秒追一步",
  accent: "#818cf8",
  createLogic,
  createStage,
};

export default def;
