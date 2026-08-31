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
import { addLights, box, createStageShell, cylinder, Particles, setBackdrop } from "../kit/world";

export const ROUND_SECONDS = 45;
export const CELLS = 9;
export const CELL_XY = [-2.4, 0, 2.4];

export interface Mole {
  cell: number;
  kind: "normal" | "gold" | "bomb";
  upTimer: number;
  total: number;
  whacked: boolean;
}

export interface GView {
  moles: Mole[];
  seconds: number;
  hits: number;
  streak: number;
  fx: FxEvent[];
  alive: boolean;
}

export function cellCenter(cell: number): [number, number] {
  const row = Math.floor(cell / 3);
  const col = cell % 3;
  return [CELL_XY[col], CELL_XY[row]];
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "地鼠冒头就敲 · 金鼠 30 分 · 炸弹鼠敲不得",
    meterLabel: "剩余时间",
  });
  const rng = makeRng(91552);
  const v: GView = { moles: [], seconds: ROUND_SECONDS, hits: 0, streak: 0, fx: [], alive: true };
  let spawnTimer = 0.6;

  const reset = () => {
    base.clearHud(1);
    v.moles = [];
    v.seconds = ROUND_SECONDS;
    v.hits = 0;
    v.streak = 0;
    v.fx = [];
    v.alive = true;
    spawnTimer = 0.6;
  };
  reset();

  const occupied = (cell: number) => v.moles.some((m) => m.cell === cell);

  const spawn = () => {
    const free: number[] = [];
    for (let c = 0; c < CELLS; c += 1) if (!occupied(c)) free.push(c);
    if (free.length === 0) return;
    const cell = free[Math.floor(rng() * free.length)];
    const roll = rng();
    const kind: Mole["kind"] = roll < 0.12 ? "gold" : roll < 0.24 ? "bomb" : "normal";
    const total = kind === "gold" ? 0.8 : kind === "bomb" ? 1.3 : 1.1 + rng() * 0.6;
    v.moles.push({ cell, kind, upTimer: total, total, whacked: false });
  };

  const hitCell = (cell: number) => {
    const idx = v.moles.findIndex((m) => m.cell === cell && !m.whacked);
    if (idx < 0) {
      // Whiffing breaks the streak.
      if (v.streak > 0) {
        v.streak = 0;
        ctx.audio.play("tick");
      }
      return;
    }
    const mole = v.moles[idx];
    if (mole.kind === "bomb") {
      v.moles.splice(idx, 1);
      v.streak = 0;
      ctx.audio.play("hit");
      base.say("是炸弹鼠！", 0.8);
      v.fx.push({ ...fxAt(cell), color: 0xff5d5d, count: 16 });
      return;
    }
    v.moles.splice(idx, 1);
    v.hits += 1;
    v.streak += 1;
    const pts = mole.kind === "gold" ? 30 : 10 + Math.min(5, v.streak);
    base.score += pts;
    ctx.audio.play("pickup", Math.min(1, v.streak / 10));
    v.fx.push({ ...fxAt(cell), color: mole.kind === "gold" ? 0xffd166 : 0x9df2a0, count: 10 });
    if (v.streak % 6 === 0) base.say(`连击 ×${v.streak}`, 0.9);
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
      v.seconds -= dt;
      base.setMeter(clamp(v.seconds / ROUND_SECONDS, 0, 1));

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = clamp(0.75 - base.elapsed * 0.008, 0.3, 0.75) * (0.7 + rng() * 0.6);
        spawn();
      }

      for (let i = v.moles.length - 1; i >= 0; i -= 1) {
        const mole = v.moles[i];
        mole.upTimer -= dt;
        if (mole.upTimer <= 0) {
          v.moles.splice(i, 1);
          if (mole.kind !== "bomb" && !mole.whacked && v.streak > 0) v.streak = 0;
        }
      }

      // Pointer pick: nearest cell to the click point.
      if (input.pointerActive && input.actionPressed) {
        const px = input.pointerX * 4.6;
        const py = input.pointerY * 3.4 + 0.8;
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
        if (bestD < 2.2) hitCell(best);
      }
      for (const pad of input.padPressed) {
        if (pad < CELLS) hitCell(pad);
      }

      if (v.seconds <= 0) {
        base.setMeter(0);
        base.detail = `45 秒命中 ${v.hits} 只地鼠`;
        base.finish(v.hits >= 20 ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "命中", value: String(v.hits) },
        { label: "连击", value: `×${v.streak}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function fxAt(cell: number): { x: number; y: number; z: number } {
  const [x, y] = cellCenter(cell);
  return { x, y: 0.4, z: y * 0.6 + 2 };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0d2014, 0x2c5e34);
    addLights(ctx.scene, ctx.accent);

    const lawn = box(9.5, 0.5, 6.5, 0x3f8f4f, { roughness: 0.9 });
    lawn.position.set(0, -0.25, 1.6);
    root.add(lawn);

    const holeGeo = cylinder(0.72, 0.72, 0.3, 20);
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });
    const moleBody = new THREE.CapsuleGeometry(0.4, 0.42, 4, 12);
    const moleMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 });
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x2c2f3a, emissive: 0xff3b30, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 });
    const holes: THREE.Mesh[] = [];
    const moleMeshes: THREE.Mesh[] = [];
    for (let c = 0; c < CELLS; c += 1) {
      const [x, y] = cellCenter(c);
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.set(x, 0.02, y * 0.6 + 2);
      root.add(hole);
      holes.push(hole);
      const mole = new THREE.Mesh(moleBody, moleMat);
      mole.position.set(x, -0.5, y * 0.6 + 2);
      root.add(mole);
      moleMeshes.push(mole);
    }

    const particles = new Particles(ctx.scene, 50);
    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      moleMeshes.forEach((mesh) => {
        mesh.position.y = -0.55;
        mesh.material = moleMat;
      });
      for (const mole of v.moles) {
        const [x, y] = cellCenter(mole.cell);
        const mesh = moleMeshes[mole.cell];
        const rise = clamp(1 - mole.upTimer / mole.total, 0, 1);
        const sink = mole.upTimer < 0.18 ? mole.upTimer / 0.18 : 1;
        mesh.position.set(x, -0.55 + rise * sink * 0.85, y * 0.6 + 2);
        mesh.rotation.z = Math.sin(time * 9) * 0.08;
        mesh.material = mole.kind === "gold" ? goldMat : mole.kind === "bomb" ? bombMat : moleMat;
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 5.6, 7.4);
      ctx.camera.lookAt(0, 0.2, 1.2);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        holeGeo.dispose();
        holeMat.dispose();
        moleBody.dispose();
        moleMat.dispose();
        goldMat.dispose();
        bombMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g29-mole-patrol",
  no: 29,
  name: "打地鼠3D",
  tagline: "三排九洞地鼠乱冒，金鼠一闪而过。",
  category: "休闲",
  controls: "点击地鼠 / 数字键 1-9 敲对应洞",
  hint: "普通鼠 10 分起 · 金鼠 30 · 炸弹鼠敲了断连击",
  accent: "#a3e635",
  createLogic,
  createStage,
};

export default def;
