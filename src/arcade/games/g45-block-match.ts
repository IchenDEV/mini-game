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

export const COLS = 6;
export const ROWS = 6;
export const COLORS = 4;

export interface GView {
  cells: number[];
  moves: number;
  cleared: number;
  fx: FxEvent[];
  alive: boolean;
}

export function idx(x: number, y: number): number {
  return y * COLS + x;
}

export function findGroup(cells: number[], x: number, y: number): number[] {
  const color = cells[idx(x, y)];
  if (color < 0) return [];
  const seen = new Set<number>([idx(x, y)]);
  const stack = [[x, y]];
  const group: number[] = [];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    group.push(idx(cx, cy));
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const ni = idx(nx, ny);
      if (seen.has(ni)) continue;
      if (cells[ni] === color) {
        seen.add(ni);
        stack.push([nx, ny]);
      }
    }
  }
  return group;
}

/** Removes the group, applies gravity; returns the new grid. */
export function collapse(cells: number[], group: number[]): number[] {
  const next = [...cells];
  for (const i of group) next[i] = -1;
  for (let x = 0; x < COLS; x += 1) {
    let writeY = ROWS - 1;
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      const v = next[idx(x, y)];
      if (v >= 0) {
        next[idx(x, writeY)] = v;
        if (writeY !== y) next[idx(x, y)] = -1;
        writeY -= 1;
      }
    }
    for (let y = writeY; y >= 0; y -= 1) next[idx(x, y)] = -1;
  }
  return next;
}

export function hasMoves(cells: number[]): boolean {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const c = cells[idx(x, y)];
      if (c < 0) continue;
      if (x + 1 < COLS && cells[idx(x + 1, y)] === c) return true;
      if (y + 1 < ROWS && cells[idx(x, y + 1)] === c) return true;
    }
  }
  return false;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击成片的同色方块消除 · 清空棋盘大加分" });
  const rng = makeRng(44721);
  const v: GView = { cells: [], moves: 0, cleared: 0, fx: [], alive: true };

  const reset = () => {
    base.clearHud();
    v.cells = [];
    for (let i = 0; i < COLS * ROWS; i += 1) {
      v.cells.push(Math.floor(rng() * COLORS));
    }
    if (!hasMoves(v.cells)) {
      // Guarantee at least one pair.
      v.cells[0] = v.cells[1];
    }
    v.moves = 0;
    v.cleared = 0;
    v.fx = [];
    v.alive = true;
  };
  reset();

  const tap = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const group = findGroup(v.cells, x, y);
    if (group.length < 2) {
      ctx.audio.play("tick");
      return;
    }
    base.score += group.length * group.length * 2;
    v.cleared += group.length;
    v.moves += 1;
    for (const i of group) {
      const gx = i % COLS;
      const gy = Math.floor(i / COLS);
      v.fx.push({ x: gx - (COLS - 1) / 2, y: (ROWS - 1) / 2 - gy, z: 0.6, color: 0xffd166, count: 4 });
    }
    ctx.audio.play("pickup", Math.min(1, group.length / 10));
    v.cells = collapse(v.cells, group);
    if (v.cells.every((c) => c < 0)) {
      base.score += 300;
      base.detail = `${v.moves} 手清空整盘`;
      base.finish("win");
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
      if (input.pointerActive && input.actionPressed) {
        const px = Math.round(input.pointerX * (COLS / 2) + (COLS - 1) / 2);
        const py = Math.round(-input.pointerY * (ROWS / 2) + (ROWS - 1) / 2);
        tap(clamp(px, 0, COLS - 1), clamp(py, 0, ROWS - 1));
      }
      for (const pad of input.padPressed) {
        if (pad >= 0 && pad < COLS * ROWS) {
          tap(pad % COLS, Math.floor(pad / COLS));
        }
      }
      if (v.alive && !hasMoves(v.cells)) {
        base.detail = `消去 ${v.cleared} 块后无可消组合`;
        base.finish("lose");
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x140f22, 0x3c2a5e);
    addLights(ctx.scene, ctx.accent);

    const cellGeo = new THREE.BoxGeometry(0.92, 0.92, 0.6);
    const cellMats = Array.from({ length: COLORS }, (_, i) => {
      const hue = (i * 360) / COLORS;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.72, 0.58),
        emissive: new THREE.Color().setHSL(hue / 360, 0.8, 0.3),
        emissiveIntensity: 0.4,
        metalness: 0.35,
        roughness: 0.4,
      });
    });
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < COLS * ROWS; i += 1) {
      const mesh = new THREE.Mesh(cellGeo, cellMats[0]);
      root.add(mesh);
      meshes.push(mesh);
    }
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      v.cells.forEach((color, i) => {
        const mesh = meshes[i];
        if (color < 0) {
          mesh.visible = false;
          return;
        }
        mesh.visible = true;
        mesh.material = cellMats[color];
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        mesh.position.set(x - (COLS - 1) / 2, (ROWS - 1) / 2 - y, 0);
        mesh.rotation.z = Math.sin(time * 1.6 + i) * 0.02;
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 4);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -4.6, 8.2);
      ctx.camera.lookAt(0, 0.2, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        cellGeo.dispose();
        cellMats.forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g45-block-match",
  no: 45,
  name: "方块消消",
  tagline: "连成片的同色方块一次全消，清空棋盘有大奖。",
  category: "益智",
  controls: "点击同色相连的方块组",
  hint: "n 块同消 = n²×2 分 · 无可消即结算",
  accent: "#e879f9",
  createLogic,
  createStage,
};

export default def;
