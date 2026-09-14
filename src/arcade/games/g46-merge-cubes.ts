import * as THREE from "three";
import { LogicBase, makeRng } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const GRID = 4;
export const WIN_TILE = 2048;

export type Board = number[];

export function slideBoard(board: Board, dir: "left" | "right" | "up" | "down"): { board: Board; gained: number; moved: boolean } {
  let gained = 0;
  let moved = false;
  const next = [...board];
  const line = (i: number): number[] => {
    // Returns the four cells of line i in traversal order.
    const cells: number[] = [];
    for (let k = 0; k < GRID; k += 1) {
      if (dir === "left") cells.push(idx(k, i));
      else if (dir === "right") cells.push(idx(GRID - 1 - k, i));
      else if (dir === "up") cells.push(idx(i, k));
      else cells.push(idx(i, GRID - 1 - k));
    }
    return cells;
  };
  for (let li = 0; li < GRID; li += 1) {
    const cells = line(li);
    const values = cells.map((c) => next[c]).filter((v) => v > 0);
    const merged: number[] = [];
    for (let k = 0; k < values.length; k += 1) {
      if (k + 1 < values.length && values[k] === values[k + 1]) {
        merged.push(values[k] * 2);
        gained += values[k] * 2;
        k += 1;
      } else {
        merged.push(values[k]);
      }
    }
    while (merged.length < GRID) merged.push(0);
    cells.forEach((c, k) => {
      if (next[c] !== merged[k]) moved = true;
      next[c] = merged[k];
    });
  }
  return { board: next, gained, moved };
}

export function idx(x: number, y: number): number {
  return y * GRID + x;
}

export function hasMovesBoard(board: Board): boolean {
  if (board.some((v) => v === 0)) return true;
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const c = board[idx(x, y)];
      if (x + 1 < GRID && board[idx(x + 1, y)] === c) return true;
      if (y + 1 < GRID && board[idx(x, y + 1)] === c) return true;
    }
  }
  return false;
}

export interface GView {
  board: Board;
  moves: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "方向键滑动 · 相同方块合并翻倍 · 合成 2048 达成" });
  const rng = makeRng(20481);
  const v: GView = { board: [], moves: 0, fx: [], alive: true };
  let prevAxisX = 0;
  let prevAxisY = 0;

  const spawn = () => {
    const empty: number[] = [];
    v.board.forEach((val, i) => {
      if (val === 0) empty.push(i);
    });
    if (empty.length === 0) return;
    const cell = empty[Math.floor(rng() * empty.length)];
    v.board[cell] = rng() < 0.9 ? 2 : 4;
  };

  const reset = () => {
    base.clearHud();
    v.board = new Array(GRID * GRID).fill(0);
    v.moves = 0;
    v.fx = [];
    v.alive = true;
    spawn();
    spawn();
    prevAxisX = 0;
    prevAxisY = 0;
  };
  reset();

  const move = (dir: "left" | "right" | "up" | "down") => {
    const result = slideBoard(v.board, dir);
    if (!result.moved) return;
    v.board = result.board;
    v.moves += 1;
    base.score += result.gained;
    ctx.audio.play(result.gained > 0 ? "pickup" : "tick", 0.4);
    spawn();
    if (v.board.some((val) => val >= WIN_TILE)) {
      base.detail = `合成了 ${WIN_TILE}！`;
      base.finish("win");
      return;
    }
    if (!hasMovesBoard(v.board)) {
      base.detail = `盘面填满 · 合并 ${v.moves} 手`;
      base.finish("lose");
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
        const dirs: ("left" | "right" | "up" | "down")[] = ["up", "down", "left", "right"];
        if (pad < dirs.length) move(dirs[pad]);
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x1a1408, 0x4d3a14);
    addLights(ctx.scene, ctx.accent);

    const tray = box(GRID * 1.16, 0.3, GRID * 1.16, 0x2f2410, { metalness: 0.4 });
    tray.position.y = -0.15;
    root.add(tray);

    const tileGeo = new THREE.BoxGeometry(1.04, 0.5, 1.04);
    const meshes = new Map<number, { mesh: THREE.Mesh; value: number }>();
    const tileMat = (value: number) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(((value % 2048) / 2048) * 0.7, 0.75, 0.55),
        emissive: new THREE.Color().setHSL(((value % 2048) / 2048) * 0.7, 0.85, 0.28),
        emissiveIntensity: 0.4,
        metalness: 0.4,
        roughness: 0.35,
      });
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const seen = new Set<number>();
      v.board.forEach((value, i) => {
        if (value === 0) return;
        seen.add(i);
        const x = i % GRID;
        const y = Math.floor(i / GRID);
        let entry = meshes.get(i);
        if (!entry) {
          entry = { mesh: new THREE.Mesh(tileGeo, tileMat(value)), value };
          meshes.set(i, entry);
          root.add(entry.mesh);
        }
        if (entry.value !== value) {
          entry.value = value;
          entry.mesh.material = tileMat(value);
        }
        const scale = 0.8 + Math.min(0.5, Math.log2(value) * 0.07);
        entry.mesh.scale.setScalar(scale);
        entry.mesh.position.set(x - (GRID - 1) / 2, 0.3 + Math.sin(time * 3 + i) * 0.02, y - (GRID - 1) / 2);
      });
      for (const [i, entry] of meshes) {
        if (!seen.has(i)) {
          root.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          (entry.mesh.material as THREE.Material).dispose();
          meshes.delete(i);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -6.6, 7.4);
      ctx.camera.lookAt(0, 0.4, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        tileGeo.dispose();
        for (const entry of meshes.values()) {
          (entry.mesh.material as THREE.Material).dispose();
        }
      },
    };
  });
}

const def: GameDefinition = {
  id: "g46-merge-cubes",
  no: 46,
  name: "合并方块",
  tagline: "滑、撞、翻倍——2048 立方在桌面上等你。",
  category: "益智",
  controls: "方向键滑动 / 1-4 按序滑动",
  hint: "相同方块合并翻倍 · 盘面填满即结算",
  accent: "#fbbf24",
  createLogic,
  createStage,
};

export default def;
