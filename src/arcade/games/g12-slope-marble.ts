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

const HALF_W = 4.4;

export interface Thing {
  id: number;
  kind: "hole" | "pillar" | "gem";
  x: number;
  z: number;
  r: number;
}

export interface GView {
  ballX: number;
  speed: number;
  things: Thing[];
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右滚 · 绕开黑洞和石柱 · 顺手捡宝石" });
  const rng = makeRng(91427);
  const v: GView = { ballX: 0, speed: 12, things: [], fx: [], alive: true };
  let nextId = 1;
  let dist = 0;
  let gems = 0;
  let spawnZ = -30;

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.speed = 12;
    v.things = [];
    v.fx = [];
    v.alive = true;
    nextId = 1;
    dist = 0;
    gems = 0;
    spawnZ = -30;
  };
  reset();

  const spawnRow = (z: number) => {
    const roll = rng();
    if (roll < 0.45) {
      // 1-2 holes
      const count = rng() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        v.things.push({ id: nextId++, kind: "hole", x: -HALF_W + rng() * HALF_W * 2, z: z - i * 2.2, r: 0.75 + rng() * 0.35 });
      }
    } else if (roll < 0.78) {
      v.things.push({ id: nextId++, kind: "pillar", x: -HALF_W + rng() * HALF_W * 2, z, r: 0.42 });
    } else {
      const x = -HALF_W + 0.6 + rng() * (HALF_W * 2 - 1.2);
      for (let i = 0; i < 3; i += 1) {
        v.things.push({ id: nextId++, kind: "gem", x, z: z - i * 1.8, r: 0.4 });
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
      if (!v.alive) return;
      const speed = Math.min(26, 12 + base.elapsed * 0.45);
      v.speed = speed;
      dist += speed * dt;

      if (input.pointerActive && Math.abs(input.pointerX) > 0.05) {
        const target = clamp(input.pointerX * HALF_W * 1.12, -HALF_W, HALF_W);
        v.ballX += (target - v.ballX) * Math.min(1, dt * 9);
      }
      v.ballX = clamp(v.ballX + input.axisX * 9.5 * dt, -HALF_W, HALF_W);

      // Keep a band of freshly spawned rows ahead of the ball.
      while (spawnZ > -72) {
        spawnRow(spawnZ);
        spawnZ -= 6.5 + rng() * 4;
      }
      spawnZ += speed * dt;

      for (let i = v.things.length - 1; i >= 0; i -= 1) {
        const t = v.things[i];
        const pz = t.z;
        t.z += speed * dt;
        const dx = Math.abs(t.x - v.ballX);
        if (pz <= 0.9 && t.z >= -0.9) {
          if (t.kind === "gem") {
            if (dx < 0.95) {
              v.things.splice(i, 1);
              gems += 1;
              base.score += 30;
              ctx.audio.play("pickup", Math.min(1, gems / 10));
              v.fx.push({ x: t.x, y: 0.7, z: 0, color: 0x8ef0ff, count: 10 });
              continue;
            }
          } else if (t.kind === "hole") {
            if (dx < t.r * 0.85) {
              v.alive = false;
              v.fx.push({ x: v.ballX, y: 0.2, z: 0, color: 0x6b7bff, count: 18 });
              base.detail = `滑行 ${Math.floor(dist)} 米 · 宝石 ×${gems}`;
              base.finish("lose");
              return;
            }
          } else if (dx < t.r + 0.32) {
            v.alive = false;
            v.fx.push({ x: v.ballX, y: 0.6, z: 0, color: 0xff8a5c, count: 18 });
            base.detail = `滑行 ${Math.floor(dist)} 米 · 宝石 ×${gems}`;
            base.finish("lose");
            return;
          }
        }
        if (t.z > 8) v.things.splice(i, 1);
      }

      base.score = Math.floor(dist) + gems * 30;
      base.setFields([
        { label: "宝石", value: `×${gems}` },
        { label: "速度", value: speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x1a1030, 0x43246b);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 200, 50);

    const slope = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2 + 3, 120),
      new THREE.MeshStandardMaterial({ color: 0x35235c, roughness: 0.8, metalness: 0.2 }),
    );
    slope.rotation.x = -Math.PI / 2;
    slope.position.set(0, -0.02, -45);
    root.add(slope);
    for (const side of [-1, 1]) {
      const rail = box(0.3, 0.5, 120, ctx.accent, { emissive: ctx.accent });
      rail.position.set(side * (HALF_W + 1.2), 0.2, -45);
      root.add(rail);
    }

    const sphere = ball(0.42, 0xffd76b, 0xff9d3c);
    root.add(sphere);

    const holeGeo = new THREE.CylinderGeometry(1, 1, 0.06, 24);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x05030c });
    const pillarGeo = new THREE.ConeGeometry(0.45, 1.6, 6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8d7cf0, emissive: 0x5c48d8, emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.5, flatShading: true });
    const gemGeo = new THREE.OctahedronGeometry(0.4, 0);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x38e1ff, emissiveIntensity: 0.85, metalness: 0.4, roughness: 0.2 });
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      sphere.position.set(v.ballX, 0.42, 0);
      sphere.rotation.x -= dt * v.speed * 0.6;

      const seen = new Set<number>();
      for (const t of v.things) {
        seen.add(t.id);
        let mesh = meshes.get(t.id);
        if (!mesh) {
          if (t.kind === "hole") mesh = new THREE.Mesh(holeGeo, holeMat);
          else if (t.kind === "pillar") mesh = new THREE.Mesh(pillarGeo, pillarMat);
          else mesh = new THREE.Mesh(gemGeo, gemMat);
          meshes.set(t.id, mesh);
          root.add(mesh);
        }
        const y = t.kind === "hole" ? 0.02 : t.kind === "pillar" ? 0.8 : 0.65 + Math.sin(time * 3 + t.id) * 0.08;
        mesh.position.set(t.x, y, t.z);
        if (t.kind === "hole") mesh.scale.setScalar(t.r);
        if (t.kind === "gem") mesh.rotation.y = time * 2.5;
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.ballX * 0.4, 4.4, 8.2);
      ctx.camera.lookAt(v.ballX * 0.55, 0, -9);
    };

    return {
      paint,
      onDispose: () => {
        holeGeo.dispose();
        holeMat.dispose();
        pillarGeo.dispose();
        pillarMat.dispose();
        gemGeo.dispose();
        gemMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g12-slope-marble",
  no: 12,
  name: "斜坡滚球",
  tagline: "越滚越快的水晶坡道，黑洞石柱都得让。",
  category: "竞速",
  controls: "← → / A D / 左右拖动",
  hint: "黑洞会吞球 · 石柱撞不得 · 宝石 +30",
  accent: "#a855f7",
  createLogic,
  createStage,
};

export default def;
