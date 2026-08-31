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
import { addLights, ball, box, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const SIZE = 6;
export const MINES = 5;

export interface GView {
  mines: Set<string>;
  revealed: Set<string>;
  firstDone: boolean;
  level: number;
  moves: number;
  fx: FxEvent[];
  alive: boolean;
}

export function neighbors(x: number, z: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dz === 0) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= SIZE || nz < 0 || nz >= SIZE) continue;
      out.push([nx, nz]);
    }
  }
  return out;
}

export function mineCount(mines: Set<string>, x: number, z: number): number {
  return neighbors(x, z).filter(([nx, nz]) => mines.has(`${nx},${nz}`)).length;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击浮标探测 · 首次必安全 · 数字 = 周围星雷数" });
  const rng = makeRng(66569);
  const v: GView = {
    mines: new Set(),
    revealed: new Set(),
    firstDone: false,
    level: 1,
    moves: 0,
    fx: [],
    alive: true,
  };
  let safeTotal = SIZE * SIZE - MINES;

  const placeMines = (safeX: number, safeZ: number) => {
    v.mines = new Set();
    const forbidden = new Set<string>([`${safeX},${safeZ}`]);
    for (const [nx, nz] of neighbors(safeX, safeZ)) forbidden.add(`${nx},${nz}`);
    let guard = 0;
    while (v.mines.size < MINES && guard < 500) {
      guard += 1;
      const x = Math.floor(rng() * SIZE);
      const z = Math.floor(rng() * SIZE);
      const key = `${x},${z}`;
      if (forbidden.has(key) || v.mines.has(key)) continue;
      v.mines.add(key);
    }
    safeTotal = SIZE * SIZE - v.mines.size;
  };

  const floodReveal = (x: number, z: number) => {
    const queue: [number, number][] = [[x, z]];
    while (queue.length > 0) {
      const [cx, cz] = queue.pop()!;
      const key = `${cx},${cz}`;
      if (v.revealed.has(key) || v.mines.has(key)) continue;
      if (cx < 0 || cx >= SIZE || cz < 0 || cz >= SIZE) continue;
      v.revealed.add(key);
      if (mineCount(v.mines, cx, cz) === 0) {
        for (const [nx, nz] of neighbors(cx, cz)) queue.push([nx, nz]);
      }
    }
  };

  const reset = () => {
    base.clearHud();
    v.revealed = new Set();
    v.firstDone = false;
    v.level = 1;
    v.moves = 0;
    v.fx = [];
    v.alive = true;
    v.mines = new Set();
    void safeTotal;
  };
  reset();

  const probe = (x: number, z: number) => {
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) return;
    const key = `${x},${z}`;
    if (v.revealed.has(key)) return;
    if (!v.firstDone) {
      placeMines(x, z);
      v.firstDone = true;
    }
    v.moves += 1;
    if (v.mines.has(key)) {
      v.revealed.add(key);
      v.alive = false;
      v.fx.push({ x: x - (SIZE - 1) / 2, y: 0.5, z: z - (SIZE - 1) / 2, color: 0xff5d5d, count: 22 });
      base.detail = `第 ${v.level} 关排雷失败`;
      base.finish("lose");
      return;
    }
    floodReveal(x, z);
    ctx.audio.play("swap", 0.4);
    if (v.revealed.size >= safeTotal) {
      base.score += 100 + Math.max(0, 60 - v.moves * 4);
      if (v.level >= 2) {
        base.detail = `两片星域全部排净`;
        base.finish("win");
        return;
      }
      base.say("星域排净！下一片", 1.1);
      v.level += 1;
      v.revealed = new Set();
      v.firstDone = false;
      v.mines = new Set();
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
        const px = input.pointerX * (SIZE / 2);
        const py = input.pointerY * (SIZE / 2);
        const x = Math.round(px + (SIZE - 1) / 2);
        const z = Math.round(py + (SIZE - 1) / 2);
        probe(clamp(x, 0, SIZE - 1), clamp(z, 0, SIZE - 1));
      }
      for (const pad of input.padPressed) {
        if (pad < SIZE * SIZE) probe(pad % SIZE, Math.floor(pad / SIZE));
      }

      base.setFields([
        { label: "星域", value: `${v.level}/2` },
        { label: "已探测", value: `${v.revealed.size}/${safeTotal}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x04060f, 0x101a3a);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 180, 45);

    const tileGeo = new THREE.BoxGeometry(0.92, 0.24, 0.92);
    const coveredMat = new THREE.MeshStandardMaterial({ color: 0x2c3a68, emissive: ctx.accent, emissiveIntensity: 0.14, metalness: 0.4, roughness: 0.45 });
    const numberMats = Array.from({ length: 9 }, (_, i) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.55 - (i / 9) * 0.5, 0.6, 0.55),
        emissive: new THREE.Color().setHSL(0.55 - (i / 9) * 0.5, 0.7, 0.25),
        emissiveIntensity: 0.4,
        metalness: 0.3,
        roughness: 0.5,
      }),
    );
    const mineGeo = ball(0.3, 0xff5d5d, 0xff3b30).geometry as THREE.SphereGeometry;
    const mineMat = new THREE.MeshStandardMaterial({ color: 0xff5d5d, emissive: 0xff3b30, emissiveIntensity: 0.8 });
    const tileMeshes = new Map<string, THREE.Mesh>();
    const mineMeshes = new Map<string, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const wx = (x: number) => x - (SIZE - 1) / 2;
      const wz = (z: number) => z - (SIZE - 1) / 2;
      for (let x = 0; x < SIZE; x += 1) {
        for (let z = 0; z < SIZE; z += 1) {
          const key = `${x},${z}`;
          const revealed = v.revealed.has(key);
          let mesh = tileMeshes.get(key);
          if (!mesh) {
            mesh = new THREE.Mesh(tileGeo, coveredMat);
            tileMeshes.set(key, mesh);
            root.add(mesh);
          }
          mesh.position.set(wx(x), 0.12, wz(z));
          const count = mineCount(v.mines, x, z);
          mesh.material = revealed ? numberMats[count] : coveredMat;
          mesh.position.y = revealed ? 0.02 : 0.12 + Math.sin(time * 1.5 + x + z) * 0.015;
        }
      }
      for (const key of v.mines) {
        if (!v.revealed.has(key)) continue;
        if (!mineMeshes.has(key)) {
          const mesh = new THREE.Mesh(mineGeo, mineMat);
          mineMeshes.set(key, mesh);
          root.add(mesh);
        }
        const [x, z] = key.split(",").map(Number);
        mineMeshes.get(key)!.position.set(wx(x), 0.3, wz(z));
      }
      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -6.4, 7);
      ctx.camera.lookAt(0, 0, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        tileGeo.dispose();
        coveredMat.dispose();
        numberMats.forEach((m) => m.dispose());
        mineGeo.dispose();
        mineMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g47-mine-sweep",
  no: 47,
  name: "扫雷星域",
  tagline: "数字是雷数的线索，首探必安全。",
  category: "益智",
  controls: "点击浮标 / 数字键探测",
  hint: "清空所有非雷浮标过关 · 踩雷即失败 · 两片星域",
  accent: "#93c5fd",
  createLogic,
  createStage,
};

export default def;
