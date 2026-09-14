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
export const CELLS = GRID * GRID;

export function toggleCell(lights: boolean[], cell: number): void {
  const row = Math.floor(cell / GRID);
  const col = cell % GRID;
  const touch = (r: number, c: number) => {
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
    lights[r * GRID + c] = !lights[r * GRID + c];
  };
  touch(row, col);
  touch(row - 1, col);
  touch(row + 1, col);
  touch(row, col - 1);
  touch(row, col + 1);
}

export interface GView {
  lights: boolean[];
  moves: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点一格会翻转十字 · 把灯全部熄灭" });
  const rng = makeRng(73301);
  const v: GView = { lights: [], moves: 0, fx: [], alive: true };

  const reset = () => {
    base.clearHud();
    v.lights = new Array(CELLS).fill(false);
    v.moves = 0;
    v.fx = [];
    v.alive = true;
    const shuffled = new Set<number>();
    while (shuffled.size < 3) shuffled.add(Math.floor(rng() * CELLS));
    for (const cell of shuffled) toggleCell(v.lights, cell);
    if (v.lights.every((l) => !l)) toggleCell(v.lights, 4);
  };
  reset();

  const press = (cell: number) => {
    toggleCell(v.lights, cell);
    v.moves += 1;
    ctx.audio.play("swap", cell / CELLS);
    if (v.lights.every((l) => !l)) {
      base.score = Math.max(30, 300 - v.moves * 15);
      base.detail = `${v.moves} 步熄灭全部灯`;
      base.finish("win");
      v.alive = true;
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
      if (input.pointerActive && input.actionPressed) {
        const px = input.pointerX * 4.2;
        const py = input.pointerY * 3.8;
        let best = -1;
        let bestD = Infinity;
        for (let c = 0; c < CELLS; c += 1) {
          const [cx, cy] = cellCenter(c);
          const d = Math.hypot(cx - px, cy - py);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (best >= 0 && bestD < 1.2) press(best);
      }
      for (const pad of input.padPressed) {
        if (pad >= 0 && pad < CELLS) press(pad);
      }

      base.setFields([
        { label: "点亮", value: String(v.lights.filter(Boolean).length) },
        { label: "步数", value: String(v.moves) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function cellCenter(c: number): [number, number] {
  const row = Math.floor(c / GRID);
  const col = c % GRID;
  return [(col - 1) * 1.7, (1 - row) * 1.7];
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x120f04, 0x3f3214);
    addLights(ctx.scene, ctx.accent);

    const lampGeo = new THREE.BoxGeometry(1.45, 1.45, 0.34);
    const onMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.95, metalness: 0.3, roughness: 0.4 });
    const offMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0x000000, metalness: 0.4, roughness: 0.6 });
    const meshes: THREE.Mesh[] = [];
    for (let c = 0; c < CELLS; c += 1) {
      const mesh = new THREE.Mesh(lampGeo, offMat);
      root.add(mesh);
      meshes.push(mesh);
    }
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      v.lights.forEach((on, c) => {
        const [x, y] = cellCenter(c);
        const mesh = meshes[c];
        mesh.material = on ? onMat : offMat;
        mesh.position.set(x, y, on ? 0.25 + Math.sin(time * 5 + c) * 0.04 : 0);
        mesh.rotation.z = on ? Math.sin(time * 2 + c) * 0.06 : 0;
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -2.4, 6.4);
      ctx.camera.lookAt(0, 0, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        lampGeo.dispose();
        onMat.dispose();
        offMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g32-lights-grid",
  no: 32,
  name: "熄灯谜阵",
  tagline: "点一格翻一片，最少的手数让灯全灭。",
  category: "益智",
  controls: "点击灯 / 数字键 1-9",
  hint: "十字翻转 · 打乱必有解 · 步数越少分越高",
  accent: "#facc15",
  createLogic,
  createStage,
};

export default def;
