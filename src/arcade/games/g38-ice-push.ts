import * as THREE from "three";
import { LogicBase } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const LEVELS: string[][] = [
  ["#######", "#P..CG#", "#.....#", "#...CG#", "#######"],
  ["#######", "#P....#", "#.....#", "#..C.G#", "#######"],
];

export interface GView {
  levelIndex: number;
  walls: Set<string>;
  crates: Set<string>;
  goals: Set<string>;
  px: number;
  pz: number;
  moves: number;
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

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "方向键滑行 · 冰面会一直滑到撞上为止" });
  const v: GView = {
    levelIndex: 0,
    walls: new Set(),
    crates: new Set(),
    goals: new Set(),
    px: 1,
    pz: 1,
    moves: 0,
    fx: [],
    alive: true,
  };
  let prevAxisX = 0;
  let prevAxisY = 0;

  const loadLevel = (index: number) => {
    const map = LEVELS[Math.min(index, LEVELS.length - 1)];
    v.walls = new Set();
    v.crates = new Set();
    v.goals = new Set();
    map.forEach((line, z) => {
      line.split("").forEach((ch, x) => {
        const key = `${x},${z}`;
        if (ch === "#") v.walls.add(key);
        if (ch === "C") v.crates.add(key);
        if (ch === "G") v.goals.add(key);
        if (ch === "P") {
          v.px = x;
          v.pz = z;
        }
      });
    });
    v.moves = 0;
  };

  const reset = () => {
    base.clearHud();
    v.levelIndex = 0;
    loadLevel(0);
    v.fx = [];
    v.alive = true;
    prevAxisX = 0;
    prevAxisY = 0;
  };
  reset();

  const slide = (dir: Dir) => {
    const [dx, dz] = DELTA[dir];
    let px = v.px;
    let pz = v.pz;
    const crates = new Set(v.crates);
    const blocked = (x: number, z: number) => v.walls.has(`${x},${z}`);
    for (let step = 0; step < 60; step += 1) {
      const nx = px + dx;
      const nz = pz + dz;
      if (blocked(nx, nz)) break;
      if (crates.has(`${nx},${nz}`)) {
        // Push the crate: it slides until blocked.
        let cx = nx;
        let cz = nz;
        for (let s2 = 0; s2 < 60; s2 += 1) {
          const tx = cx + dx;
          const tz = cz + dz;
          if (blocked(tx, tz) || crates.has(`${tx},${tz}`)) break;
          cx = tx;
          cz = tz;
        }
        crates.delete(`${nx},${nz}`);
        crates.add(`${cx},${cz}`);
        if (cx === nx && cz === nz) break; // crate could not move
        px = nx;
        pz = nz;
        continue;
      }
      px = nx;
      pz = nz;
    }
    if (px === v.px && pz === v.pz) return;
    v.px = px;
    v.pz = pz;
    v.crates = crates;
    v.moves += 1;
    ctx.audio.play("tick");
    if ([...crates].every((c) => v.goals.has(c))) {
      base.score += Math.max(20, 120 - v.moves * 5);
      if (v.levelIndex >= LEVELS.length - 1) {
        base.detail = `${LEVELS.length} 个冰关全部完成`;
        base.finish("win");
        return;
      }
      base.say(`冰关 ${v.levelIndex + 1} 完成！`, 1.1);
      v.levelIndex += 1;
      loadLevel(v.levelIndex);
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
      if (input.axisX >= 0.5 && prevAxisX < 0.5) slide("right");
      else if (input.axisX <= -0.5 && prevAxisX > -0.5) slide("left");
      else if (input.axisY >= 0.5 && prevAxisY < 0.5) slide("up");
      else if (input.axisY <= -0.5 && prevAxisY > -0.5) slide("down");
      prevAxisX = input.axisX;
      prevAxisY = input.axisY;
      for (const pad of input.padPressed) {
        const dirs: Dir[] = ["up", "down", "left", "right"];
        if (pad < dirs.length) slide(dirs[pad]);
      }

      base.setFields([
        { label: "冰关", value: `${v.levelIndex + 1}/${LEVELS.length}` },
        { label: "步数", value: String(v.moves) },
        { label: "归位", value: `${[...v.crates].filter((c) => v.goals.has(c)).length}/${v.crates.size}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x081420, 0x1c3a55);
    addLights(ctx.scene, ctx.accent);

    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a5a78, metalness: 0.35, roughness: 0.5 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.7 });
    const crateOnGoalMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x2f9f5f, emissiveIntensity: 0.4, roughness: 0.5 });
    const goalMat = new THREE.MeshStandardMaterial({ color: 0x2f9f5f, emissive: 0x2f9f5f, emissiveIntensity: 0.5 });
    const player = box(0.82, 0.82, 0.82, ctx.accent, { emissive: ctx.accent });
    root.add(player);
    const particles = new Particles(ctx.scene, 50);

    const wallMeshes = new Map<string, THREE.Mesh>();
    const crateMeshes = new Map<string, THREE.Mesh>();
    const goalMeshes = new Map<string, THREE.Mesh>();
    const wallGeo = box(1, 1, 1, 0).geometry as THREE.BoxGeometry;
    const crateGeo = box(0.86, 0.86, 0.86, 0).geometry as THREE.BoxGeometry;
    const goalGeo = new THREE.BoxGeometry(0.9, 0.12, 0.9);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      player.position.set(v.px - 3, 0.42, v.pz - 3);
      player.rotation.y = Math.sin(time * 2) * 0.08;

      const wallsNeeded = new Set(v.walls);
      for (const key of wallsNeeded) {
        const [x, z] = key.split(",").map(Number);
        if (!wallMeshes.has(key)) {
          const mesh = new THREE.Mesh(wallGeo, wallMat);
          wallMeshes.set(key, mesh);
          root.add(mesh);
        }
        wallMeshes.get(key)!.position.set(x - 3, 0.5, z - 3);
      }
      for (const key of [...wallMeshes.keys()]) {
        if (!wallsNeeded.has(key)) {
          root.remove(wallMeshes.get(key)!);
          wallMeshes.delete(key);
        }
      }
      for (const key of v.goals) {
        if (!goalMeshes.has(key)) {
          const mesh = new THREE.Mesh(goalGeo, goalMat);
          goalMeshes.set(key, mesh);
          root.add(mesh);
        }
        const [x, z] = key.split(",").map(Number);
        goalMeshes.get(key)!.position.set(x - 3, 0.03, z - 3);
      }
      const cratesNeeded = new Set(v.crates);
      for (const key of cratesNeeded) {
        const [x, z] = key.split(",").map(Number);
        if (!crateMeshes.has(key)) {
          const mesh = new THREE.Mesh(crateGeo, crateMat);
          crateMeshes.set(key, mesh);
          root.add(mesh);
        }
        const mesh = crateMeshes.get(key)!;
        mesh.material = v.goals.has(key) ? crateOnGoalMat : crateMat;
        mesh.position.set(x - 3, 0.45, z - 3);
      }
      for (const key of [...crateMeshes.keys()]) {
        if (!cratesNeeded.has(key)) {
          root.remove(crateMeshes.get(key)!);
          crateMeshes.delete(key);
        }
      }
      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 9.5, 7.2);
      ctx.camera.lookAt(0, 0, -0.5);
    };

    return {
      paint,
      onDispose: () => {
        wallGeo.dispose();
        crateGeo.dispose();
        goalGeo.dispose();
        wallMat.dispose();
        crateMat.dispose();
        crateOnGoalMat.dispose();
        goalMat.dispose();
        iceMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g38-ice-push",
  no: 38,
  name: "冰面推箱",
  tagline: "在冰面上刹不住车，推箱子全靠预判。",
  category: "益智",
  controls: "方向键滑行",
  hint: "滑到撞上才停 · 箱子被推也会滑 · 三关通关",
  accent: "#7dd3fc",
  createLogic,
  createStage,
};

export default def;
