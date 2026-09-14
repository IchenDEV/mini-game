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
import { addLights, box, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const GATE_HALF_GAP = 1.25;

export interface Gate {
  id: number;
  x: number;
  z: number;
  done: boolean;
}

export interface Tree {
  id: number;
  x: number;
  z: number;
}

export interface GView {
  x: number;
  gates: Gate[];
  trees: Tree[];
  speed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右滑行 · 从旗门中间穿过 · 撞旗撞树都完" });
  const rng = makeRng(61279);
  const v: GView = { x: 0, gates: [], trees: [], speed: 12, fx: [], alive: true };
  let nextId = 1;
  let spawnZ = -30;
  let gateDir = 1;
  let passed = 0;
  let combo = 0;
  let dist = 0;
  let bestCombo = 0;
  let bonus = 0;

  const reset = () => {
    base.clearHud();
    v.x = 0;
    v.gates = [];
    v.trees = [];
    v.speed = 12;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    spawnZ = -30;
    gateDir = 1;
    passed = 0;
    combo = 0;
    dist = 0;
    bestCombo = 0;
    bonus = 0;
  };
  reset();

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
      const speed = Math.min(24, 12 + base.elapsed * 0.32);
      v.speed = speed;
      dist += speed * dt;

      if (input.pointerActive && Math.abs(input.pointerX) > 0.05) {
        const target = clamp(input.pointerX * 4.6, -4.6, 4.6);
        v.x += (target - v.x) * Math.min(1, dt * 9);
      }
      v.x = clamp(v.x + input.axisX * 10 * dt, -4.6, 4.6);

      while (spawnZ > -85) {
        const center = clamp(v.x + gateDir * (1.4 + rng() * 1.6), -4, 4);
        v.gates.push({ id: nextId++, x: center, z: spawnZ, done: false });
        // Trees scattered off the racing line.
        const treeCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < treeCount; i += 1) {
          const tx = -4.6 + rng() * 9.2;
          if (Math.abs(tx - center) < 2.2) continue;
          v.trees.push({ id: nextId++, x: tx, z: spawnZ - 1.5 - rng() * 3 });
        }
        gateDir *= -1;
        spawnZ -= 11 + rng() * 4;
      }
      spawnZ += speed * dt;

      const crash = (x: number, color: number) => {
        v.alive = false;
        v.fx.push({ x, y: 0.7, z: 0, color, count: 22 });
        base.detail = `滑过 ${Math.floor(dist)} 米 · 过门 ${passed} 座 · 最长连击 ×${bestCombo}`;
        base.finish("lose");
      };

      for (let i = v.gates.length - 1; i >= 0; i -= 1) {
        const gate = v.gates[i];
        const pz = gate.z;
        gate.z += speed * dt;
        if (!gate.done && pz <= 0.8 && gate.z >= -0.8) {
          gate.done = true;
          const dx = Math.abs(gate.x - v.x);
          if (dx < GATE_HALF_GAP) {
            passed += 1;
            combo += 1;
            bestCombo = Math.max(bestCombo, combo);
            bonus += 10 + combo * 2;
            ctx.audio.play("swap", Math.min(1, combo / 8));
            if (combo % 5 === 0) base.say(`连过 ×${combo}`, 0.9);
          } else if (dx < GATE_HALF_GAP + 0.5) {
            crash(gate.x, 0xff5d73);
            return;
          } else {
            // Missed the gate entirely: combo breaks, no bonus.
            combo = 0;
          }
        }
        if (gate.z > 5) v.gates.splice(i, 1);
      }

      for (let i = v.trees.length - 1; i >= 0; i -= 1) {
        const tree = v.trees[i];
        const pz = tree.z;
        tree.z += speed * dt;
        if (pz <= 0.7 && tree.z >= -0.7 && Math.abs(tree.x - v.x) < 0.75) {
          crash(tree.x, 0x7ddf9a);
          return;
        }
        if (tree.z > 5) v.trees.splice(i, 1);
      }

      base.score = Math.floor(dist) + bonus;
      base.setFields([
        { label: "过门", value: `×${passed}` },
        { label: "连击", value: `×${combo}` },
        { label: "速度", value: speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0d1830, 0x2c4a72);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 200, 55);

    const snow = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 130),
      new THREE.MeshStandardMaterial({ color: 0xdfe9ff, roughness: 0.95, metalness: 0.02 }),
    );
    snow.rotation.x = -Math.PI / 2;
    snow.position.set(0, -0.01, -50);
    root.add(snow);

    const runner = box(0.7, 0.9, 0.7, ctx.accent, { emissive: ctx.accent });
    root.add(runner);

    const gateGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff5d73, emissive: 0xff5d73, emissiveIntensity: 0.4, roughness: 0.6 });
    const flagMatL = new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 0.4, roughness: 0.6 });
    const treeGeo = new THREE.ConeGeometry(0.55, 1.7, 6);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f8f5b, roughness: 0.8, flatShading: true });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      runner.position.set(v.x, 0.5, 0);
      runner.rotation.z = Math.sin(time * 10) * 0.08;

      const seen = new Set<number>();
      const sync = (id: number, x: number, y: number, z: number, geo: THREE.BufferGeometry, mat: THREE.Material) => {
        seen.add(id);
        let mesh = meshes.get(id);
        if (!mesh) {
          mesh = new THREE.Mesh(geo, mat);
          meshes.set(id, mesh);
          root.add(mesh);
        }
        mesh.position.set(x, y, z);
      };
      for (const gate of v.gates) {
        sync(gate.id, gate.x - GATE_HALF_GAP, 0.75, gate.z, gateGeo, flagMatL);
        sync(-gate.id, gate.x + GATE_HALF_GAP, 0.75, gate.z, gateGeo, flagMat);
      }
      for (const tree of v.trees) sync(tree.id, tree.x, 0.85, tree.z, treeGeo, treeMat);
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.x * 0.4, 4.8, 8.6);
      ctx.camera.lookAt(v.x * 0.6, 0.4, -10);
    };

    return {
      paint,
      onDispose: () => {
        gateGeo.dispose();
        flagMat.dispose();
        flagMatL.dispose();
        treeGeo.dispose();
        treeMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g19-slalom-rush",
  no: 19,
  name: "雪山回转",
  tagline: "旗门左右交替，滑雪板切得越准分越高。",
  category: "竞速",
  controls: "← → / A D / 左右拖动",
  hint: "旗门中间穿过 +分 · 擦到旗杆直接摔",
  accent: "#93c5fd",
  createLogic,
  createStage,
};

export default def;
