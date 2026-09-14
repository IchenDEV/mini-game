import * as THREE from "three";
import { LogicBase, clamp } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const BOARD_W = 8;
export const BOARD_H = 6;

/** Trace the beam; returns the exit cell or the target hit. */
export function traceBeam(
  mirrors: Record<string, 0 | 1>,
  startX = 0,
  startZ = 2,
  maxSteps = 200,
): { x: number; z: number; hit: boolean } {
  let x = startX;
  let z = startZ;
  let dx = 1;
  let dz = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    x += dx;
    z += dz;
    if (x < 0 || x >= BOARD_W || z < 0 || z >= BOARD_H) {
      return { x, z, hit: false };
    }
    if (x === BOARD_W - 1 && z === 1) {
      return { x, z, hit: true };
    }
    const m = mirrors[`${x},${z}`];
    if (m !== undefined) {
      // '/' (0) and '\' (1) reflections for a dx/dz unit step.
      if (m === 0) {
        [dx, dz] = [-dz, -dx];
      } else {
        [dx, dz] = [dz, dx];
      }
    }
  }
  return { x, z, hit: false };
}

export interface GView {
  mirrors: Record<string, 0 | 1>;
  levelIndex: number;
  moves: number;
  beam: { x: number; z: number }[];
  solved: boolean;
  fx: FxEvent[];
  alive: boolean;
}

// Initial (unsolved) prism orientations. Solutions:
// L1: rotate "5,2" to '/' -> beam up at (5,1) then '/' sends it +x into the target.
// L2: rotate "4,1" to '/' -> beam up column 4 then +x into the target.
export const LEVEL_MIRRORS: Record<string, 0 | 1>[] = [
  { "5,2": 1, "5,1": 1 },
  { "1,2": 1, "1,4": 1, "4,4": 0, "4,1": 1 },
];

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击棱镜旋转 90° · 把激光引到绿色接收器" });
  const v: GView = {
    mirrors: {},
    levelIndex: 0,
    moves: 0,
    beam: [],
    solved: false,
    fx: [],
    alive: true,
  };

  const loadLevel = (index: number) => {
    v.mirrors = { ...LEVEL_MIRRORS[Math.min(index, LEVEL_MIRRORS.length - 1)] };
    v.moves = 0;
    v.solved = false;
  };

  const retrace = () => {
    const result = traceBeam(v.mirrors);
    v.beam = [{ x: 0, z: 2 }, { x: result.x, z: result.z }];
    v.solved = result.hit;
  };

  const reset = () => {
    base.clearHud();
    v.levelIndex = 0;
    loadLevel(0);
    retrace();
    v.fx = [];
    v.alive = true;
  };
  reset();

  const rotate = (key: string) => {
    const cur = v.mirrors[key];
    if (cur === undefined) return;
    v.mirrors[key] = (cur === 0 ? 1 : 0) as 0 | 1;
    v.moves += 1;
    ctx.audio.play("swap", 0.5);
    retrace();
    if (v.solved) {
      base.score += 100 + Math.max(0, 40 - v.moves * 5);
      if (v.levelIndex >= LEVEL_MIRRORS.length - 1) {
        base.detail = `${LEVEL_MIRRORS.length} 关激光全部校准`;
        base.finish("win");
        return;
      }
      base.say("校准成功！", 1);
      v.levelIndex += 1;
      loadLevel(v.levelIndex);
      retrace();
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
        // Pick the closest prism to the click point.
        const px = input.pointerX * 9;
        const py = input.pointerY * 5.4 + 0.6;
        let bestKey = "";
        let bestD = Infinity;
        for (const key of Object.keys(v.mirrors)) {
          const [x, z] = key.split(",").map(Number);
          const d = Math.hypot(x - 3.5 - px, z - 2.5 - py);
          if (d < bestD) {
            bestD = d;
            bestKey = key;
          }
        }
        if (bestKey && bestD < 1.2) rotate(bestKey);
      }
      for (const pad of input.padPressed) {
        const keys = Object.keys(v.mirrors);
        if (pad < keys.length) rotate(keys[pad]);
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1018, 0x1c3040);
    addLights(ctx.scene, ctx.accent);

    const board = box(BOARD_W * 1.1, 0.3, BOARD_H * 1.1, 0x15273a, { metalness: 0.4 });
    board.position.set(0, -0.2, 0);
    root.add(board);

    const mirrorGeo = new THREE.BoxGeometry(0.8, 0.9, 0.14);
    const mirrorMats = [
      new THREE.MeshStandardMaterial({ color: 0xcfe3ff, emissive: ctx.accent, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x9fc8ff, emissive: ctx.accent, emissiveIntensity: 0.25, metalness: 0.85, roughness: 0.2 }),
    ];
    const emitter = box(0.4, 0.7, 0.7, 0xff5d5d, { emissive: 0xff3b30 });
    root.add(emitter);
    const receiver = box(0.4, 0.9, 0.9, 0x4ade80, { emissive: 0x2f9f5f });
    root.add(receiver);

    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff6b7a, transparent: true, opacity: 0.85 });
    const beamGroup = new THREE.Group();
    root.add(beamGroup);
    const meshes = new Map<string, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const wx = (x: number) => x - (BOARD_W - 1) / 2;
      const wz = (z: number) => z - (BOARD_H - 1) / 2;
      emitter.position.set(wx(0) - 1, 0.4, wz(2));
      receiver.position.set(wx(BOARD_W - 1) + 0.6, 0.4, wz(1));
      (receiver.material as THREE.MeshStandardMaterial).emissiveIntensity = v.solved ? 1.2 : 0.4;

      for (const key of Object.keys(v.mirrors)) {
        if (!meshes.has(key)) {
          const mesh = new THREE.Mesh(mirrorGeo, mirrorMats[0]);
          meshes.set(key, mesh);
          root.add(mesh);
        }
        const [x, z] = key.split(",").map(Number);
        const mesh = meshes.get(key)!;
        mesh.material = mirrorMats[v.mirrors[key]];
        mesh.rotation.y = v.mirrors[key] === 0 ? Math.PI / 4 : -Math.PI / 4;
        mesh.position.set(wx(x), 0.45, wz(z));
      }

      // Beam: straight segments from emitter to the traced exit.
      for (const child of [...beamGroup.children]) {
        beamGroup.remove(child);
      }
      const pts = v.beam;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const ax = wx(pts[i].x);
        const az = wz(pts[i].z);
        const bx = wx(pts[i + 1].x);
        const bz = wz(pts[i + 1].z);
        const len = Math.hypot(bx - ax, bz - az);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), beamMat);
        seg.position.set((ax + bx) / 2, 0.45, (az + bz) / 2);
        seg.rotation.y = -Math.atan2(bz - az, bx - ax);
        beamGroup.add(seg);
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 9, 7.4);
      ctx.camera.lookAt(0, 0, 0);
      void dt;
      void clamp;
    };

    return {
      paint,
      onDispose: () => {
        mirrorGeo.dispose();
        mirrorMats.forEach((m) => m.dispose());
        beamMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g44-laser-align",
  no: 44,
  name: "激光校准",
  tagline: "旋转棱镜改变光路，把激光送进接收器。",
  category: "益智",
  controls: "点击棱镜旋转 / 数字键轮换",
  hint: "光路实时可见 · 斜镜一转方向就变 · 两关校准",
  accent: "#f87171",
  createLogic,
  createStage,
};

export default def;
