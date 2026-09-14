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

export const COLS = 7;
export const LANE_SPACING = 2.2;

export interface Car {
  id: number;
  row: number;
  x: number;
  speed: number;
}

export interface Row {
  kind: "grass" | "road";
  dir: number;
}

export interface GView {
  col: number;
  row: number;
  carX: number;
  rows: Row[];
  cars: Car[];
  fx: FxEvent[];
  alive: boolean;
}

export function rowZ(row: number): number {
  return -row * LANE_SPACING;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "上键过马路 · 左右躲车 · 车流越来越快" });
  const rng = makeRng(86413);
  const v: GView = {
    col: 3,
    row: 0,
    carX: 0,
    rows: [],
    cars: [],
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let maxRow = 0;
  let prevAxisX = 0;

  const addRow = (r: number) => {
    const road = r % 2 === 0;
    const dir = road ? (rng() < 0.5 ? -1 : 1) : 0;
    v.rows[r] = { kind: road ? "road" : "grass", dir };
    if (!road) return;
    const speed = (2 + rng() * 1.6) * (1 + r * 0.05);
    const count = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i += 1) {
      v.cars.push({
        id: nextId++,
        row: r,
        x: -6 + rng() * 12,
        speed: dir * speed,
      });
    }
  };

  const reset = () => {
    base.clearHud();
    nextId = 1;
    v.col = 3;
    v.row = 0;
    v.carX = 0;
    v.rows = [{ kind: "grass", dir: 0 }];
    v.cars = [];
    v.fx = [];
    v.alive = true;
    maxRow = 0;
    prevAxisX = 0;
    for (let r = 1; r <= 12; r += 1) addRow(r);
  };
  reset();

  const crash = () => {
    v.alive = false;
    v.fx.push({ x: (v.col - 3) * 1.7, y: 0.5, z: rowZ(v.row), color: 0xff6b7a, count: 22 });
    base.detail = `冲到第 ${maxRow} 排`;
    base.finish("lose");
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

      // Lane switching on key edges.
      if (input.axisX >= 0.5 && prevAxisX < 0.5 && v.col < COLS - 1) v.col += 1;
      else if (input.axisX <= -0.5 && prevAxisX > -0.5 && v.col > 0) v.col -= 1;
      prevAxisX = input.axisX;

      // Cars move continuously.
      for (const car of v.cars) {
        car.x += car.speed * dt;
        if (car.x > 6.4) car.x = -6.4;
        if (car.x < -6.4) car.x = 6.4;
      }
      // Collision on the current row.
      for (const car of v.cars) {
        if (car.row !== v.row) continue;
        if (Math.abs(car.x - ((v.col - 3) * 1.7)) < 1) {
          crash();
          return;
        }
      }
      // Hop forward one row per press.
      if (input.actionPressed) {
        v.row += 1;
        maxRow = Math.max(maxRow, v.row);
        base.score = maxRow * 10;
        ctx.audio.play("swap", Math.min(1, v.row / 30));
        while (v.rows.length <= v.row + 8) addRow(v.rows.length);
      }

      v.carX = (v.col - 3) * 1.7;
      base.setFields([
        { label: "排行", value: String(maxRow) },
        { label: "车道", value: `${v.col + 1}/${COLS}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1a12, 0x1e4a2e);
    addLights(ctx.scene, ctx.accent);

    const rowMeshes = new Map<number, THREE.Mesh>();
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4f, roughness: 0.9 });
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.85 });
    const carGeo = box(1.3, 0.55, 0.8, 0xffffff).geometry as THREE.BoxGeometry;
    const carMats = [0xff5d73, 0xffd166, 0x60a5fa, 0xffffff].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.18, metalness: 0.4, roughness: 0.4 }),
    );
    const hopper = box(0.9, 0.7, 0.9, ctx.accent, { emissive: ctx.accent });
    root.add(hopper);
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      hopper.position.set(v.carX, 0.35, rowZ(v.row));
      hopper.rotation.z = Math.sin(time * 10) * 0.06;

      const seen = new Set<number>();
      for (let r = 0; r < v.rows.length; r += 1) {
        if (r < v.row - 4 || r > v.row + 10) continue;
        seen.add(1000 + r);
        let mesh = rowMeshes.get(1000 + r);
        if (!mesh) {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, LANE_SPACING - 0.3), v.rows[r].kind === "road" ? roadMat : grassMat);
          rowMeshes.set(1000 + r, mesh);
          root.add(mesh);
        }
        mesh.position.set(0, -0.15, rowZ(r));
        (mesh.material as THREE.Material) = v.rows[r].kind === "road" ? roadMat : grassMat;
      }
      for (const car of v.cars) {
        if (car.row < v.row - 4 || car.row > v.row + 10) continue;
        seen.add(car.id);
        let mesh = meshes.get(car.id);
        if (!mesh) {
          mesh = new THREE.Mesh(carGeo, carMats[car.id % carMats.length]);
          meshes.set(car.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(car.x, 0.28, rowZ(car.row));
      }
      for (const [id, mesh] of [...rowMeshes, ...meshes]) {
        if (!seen.has(id)) {
          root.remove(mesh);
          rowMeshes.delete(id);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.carX * 0.5, 4.6, rowZ(v.row) + 7.6);
      ctx.camera.lookAt(v.carX * 0.6, 0, rowZ(v.row) - 3);
    };

    return {
      paint,
      onDispose: () => {
        carGeo.dispose();
        carMats.forEach((m) => m.dispose());
        grassMat.dispose();
        roadMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g37-crossy-flow",
  no: 37,
  name: "过马路",
  tagline: "一条条车道往前跳，车流只会越来越急。",
  category: "动作",
  controls: "空格 / 上 前跳 · ← → 换道",
  hint: "躲开车流 · 每前进一排 +10",
  accent: "#34d399",
  createLogic,
  createStage,
};

export default def;
