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
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const GRID = 3;
export const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0];
const SHUFFLE_MOVES = 60;

export interface GView {
  tiles: number[];
  moves: number;
  fx: FxEvent[];
  alive: boolean;
}

export function isSolved(tiles: number[]): boolean {
  return tiles.every((t, i) => t === SOLVED[i]);
}

/** Slides one tile into the blank; returns true when a move happened. */
export function slide(tiles: number[], dir: "up" | "down" | "left" | "right"): boolean {
  const blank = tiles.indexOf(0);
  const row = Math.floor(blank / GRID);
  const col = blank % GRID;
  let from = -1;
  if (dir === "up" && row < GRID - 1) from = blank + GRID;
  if (dir === "down" && row > 0) from = blank - GRID;
  if (dir === "left" && col < GRID - 1) from = blank + 1;
  if (dir === "right" && col > 0) from = blank - 1;
  if (from < 0) return false;
  tiles[blank] = tiles[from];
  tiles[from] = 0;
  return true;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "方向键把方块滑进空位 · 1-9 也可以点选" });
  const rng = makeRng(55701);
  const v: GView = { tiles: [], moves: 0, fx: [], alive: true };
  let prevAxis = 0;
  let prevY = 0;

  const reset = () => {
    base.clearHud();
    v.tiles = [...SOLVED];
    v.moves = 0;
    v.fx = [];
    v.alive = true;
    // Shuffle with valid moves so the puzzle stays solvable.
    let guard = 0;
    while (guard < 500 && v.moves < SHUFFLE_MOVES) {
      guard += 1;
      const dirs = ["up", "down", "left", "right"] as const;
      const dir = dirs[Math.floor(rng() * 4)];
      if (slide(v.tiles, dir)) v.moves += 1;
    }
    v.moves = 0;
    prevAxis = 0;
    prevY = 0;
  };
  reset();

  const move = (dir: "up" | "down" | "left" | "right") => {
    if (slide(v.tiles, dir)) {
      v.moves += 1;
      ctx.audio.play("tick");
      if (isSolved(v.tiles)) {
        base.score = Math.max(100, 500 - v.moves * 8);
        base.detail = `${v.moves} 步复原`;
        base.finish("win");
        v.alive = true;
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
      if (input.axisX >= 0.5 && prevAxis < 0.5) move("right");
      if (input.axisX <= -0.5 && prevAxis > -0.5) move("left");
      if (input.axisY >= 0.5 && prevY < 0.5) move("up");
      if (input.axisY <= -0.5 && prevY > -0.5) move("down");
      prevAxis = input.axisX;
      prevY = input.axisY;

      if (input.pointerActive && input.actionPressed) {
        // Click a tile: convert pointer to the closest cell and slide it
        // toward the blank if adjacent.
        const px = input.pointerX * 4.2;
        const py = input.pointerY * 3.6;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < GRID * GRID; i += 1) {
          const [cx, cy] = cellCenter(i);
          const d = Math.hypot(cx - px, cy - py);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0 && bestD < 1.2 && v.tiles[best] !== 0) {
          const blank = v.tiles.indexOf(0);
          const br = Math.floor(blank / GRID);
          const bc = blank % GRID;
          const tr = Math.floor(best / GRID);
          const tc = best % GRID;
          if (Math.abs(br - tr) + Math.abs(bc - tc) === 1) {
            const dir = tr < br ? "up" : tr > br ? "down" : tc < bc ? "left" : "right";
            // Sliding `best` into the blank equals moving the blank opposite.
            const opposite = dir === "up" ? "down" : dir === "down" ? "up" : dir === "left" ? "right" : "left";
            move(opposite as "up" | "down" | "left" | "right");
          }
        }
      }
      for (const pad of input.padPressed) {
        if (pad >= 0 && pad < GRID * GRID) {
          const blank = v.tiles.indexOf(0);
          const row = Math.floor(pad / GRID);
          const col = pad % GRID;
          const blankRow = Math.floor(blank / GRID);
          const blankCol = blank % GRID;
          if (Math.abs(row - blankRow) + Math.abs(col - blankCol) === 1) {
            const dir = row < blankRow ? "up" : row > blankRow ? "down" : col < blankCol ? "left" : "right";
            const opposite = dir === "up" ? "down" : dir === "down" ? "up" : dir === "left" ? "right" : "left";
            move(opposite as "up" | "down" | "left" | "right");
          }
        }
      }

      base.setFields([
        { label: "步数", value: String(v.moves) },
        { label: "归位", value: `${v.tiles.filter((t, i) => t === SOLVED[i] && t !== 0).length}/8` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function cellCenter(i: number): [number, number] {
  const row = Math.floor(i / GRID);
  const col = i % GRID;
  return [(col - 1) * 1.7, (1 - row) * 1.7];
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a0f22, 0x1f2c5e);
    addLights(ctx.scene, ctx.accent);

    const board = box(GRID * 1.62, GRID * 1.62, 0.3, 0x141c3a, { metalness: 0.4 });
    board.position.z = -0.3;
    root.add(board);

    const tileGeo = new THREE.BoxGeometry(1.5, 1.5, 0.3);
    const tileMats = Array.from({ length: 8 }, (_, i) => {
      const hue = (i * 40) % 360;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.7, 0.58),
        emissive: new THREE.Color().setHSL(hue / 360, 0.8, 0.28),
        emissiveIntensity: 0.35,
        metalness: 0.35,
        roughness: 0.4,
      });
    });
    const tileMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < GRID * GRID; i += 1) {
      const mesh = new THREE.Mesh(tileGeo, tileMats[0]);
      root.add(mesh);
      tileMeshes.push(mesh);
    }
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      v.tiles.forEach((tile, i) => {
        const mesh = tileMeshes[i];
        if (tile === 0) {
          mesh.visible = false;
          return;
        }
        mesh.visible = true;
        mesh.material = tileMats[tile - 1];
        const [x, y] = cellCenter(i);
        mesh.position.set(x, y, 0);
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -2.6, 6.6);
      ctx.camera.lookAt(0, 0, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        tileGeo.dispose();
        tileMats.forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g31-slide-puzzle",
  no: 31,
  name: "滑块谜阵",
  tagline: "打乱的九宫滑块，多少步能把它们复原？",
  category: "益智",
  controls: "方向键滑动 / 点击空位旁的方块",
  hint: "步数越少结算越高 · 打乱保证有解",
  accent: "#60a5fa",
  createLogic,
  createStage,
};

export default def;
