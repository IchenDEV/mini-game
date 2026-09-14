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
import {
  addLights,
  ball,
  createStageShell,
  Particles,
  setBackdrop,
  starfield,
} from "../kit/world";

const HALF_WIDTH = 6;
const SHARD = 0x9c8f7a;
const CORE_COLOR = 0xffd166;

interface Entity {
  id: number;
  kind: "rock" | "core";
  x: number;
  y: number;
  z: number;
  r: number;
  spin: number;
  passed: boolean;
}

export interface GView {
  shipX: number;
  tilt: number;
  speed: number;
  entities: Entity[];
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右移动 · 擦过陨石有险距加分" });
  const rng = makeRng(20260831);
  const v: GView = {
    shipX: 0,
    tilt: 0,
    speed: 13,
    entities: [],
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let distAcc = 0;
  let bonus = 0;
  let cores = 0;
  let nearMisses = 0;
  let spawnTimer = 0.6;
  let coreTimer = 2.4;

  const reset = () => {
    base.clearHud();
    distAcc = 0;
    bonus = 0;
    cores = 0;
    nearMisses = 0;
    spawnTimer = 0.6;
    coreTimer = 2.4;
    v.shipX = 0;
    v.tilt = 0;
    v.speed = 13;
    v.entities = [];
    v.fx = [];
    v.alive = true;
  };
  reset();

  const spawn = () => {
    const big = rng() < 0.22;
    v.entities.push({
      id: nextId++,
      kind: "rock",
      x: -HALF_WIDTH + rng() * HALF_WIDTH * 2,
      y: 0.4 + rng() * 2.2,
      z: -86,
      r: big ? 1.05 + rng() * 0.35 : 0.5 + rng() * 0.4,
      spin: (rng() - 0.5) * 3,
      passed: false,
    });
  };

  const crash = () => {
    v.alive = false;
    v.fx.push({ x: v.shipX, y: 1, z: 0, color: 0xff7b6b, count: 26 });
    base.detail = `飞行 ${Math.floor(distAcc)} 米 · 能量核心 ×${cores} · 险距 ×${nearMisses}`;
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
      const speed = Math.min(30, 13 + base.elapsed * 0.42);
      v.speed = speed;
      distAcc += speed * dt;

      if (input.pointerActive && Math.abs(input.pointerX) > 0.06) {
        const target = clamp(input.pointerX * HALF_WIDTH * 1.15, -HALF_WIDTH, HALF_WIDTH);
        v.shipX += (target - v.shipX) * Math.min(1, dt * 9);
      }
      v.shipX = clamp(v.shipX + input.axisX * 10.5 * dt, -HALF_WIDTH, HALF_WIDTH);

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn();
        spawnTimer = clamp(0.34 - base.elapsed * 0.004, 0.16, 0.34);
      }
      coreTimer -= dt;
      if (coreTimer <= 0) {
        coreTimer = 2 + rng() * 1.6;
        v.entities.push({
          id: nextId++,
          kind: "core",
          x: -HALF_WIDTH + rng() * HALF_WIDTH * 2,
          y: 1.1,
          z: -86,
          r: 0.45,
          spin: 2.4,
          passed: false,
        });
      }

      for (let i = v.entities.length - 1; i >= 0; i -= 1) {
        const e = v.entities[i];
        const pz = e.z;
        e.z += speed * dt;
        if (e.kind === "rock") {
          // Swept-window check so fast frames cannot tunnel through the ship.
          if (pz <= 0.7 && e.z >= -0.7) {
            const dx = Math.abs(e.x - v.shipX);
            if (dx < e.r + 0.62) {
              crash();
              return;
            }
            if (!e.passed && pz < 0 && e.z >= 0 && dx < e.r + 2.1) {
              e.passed = true;
              nearMisses += 1;
              bonus += 8;
              base.say("险距 +8", 0.8);
              ctx.audio.play("swap");
            }
          }
        } else if (pz <= 1 && e.z >= -1 && Math.abs(e.x - v.shipX) < 1) {
          v.entities.splice(i, 1);
          cores += 1;
          bonus += 25;
          base.say("+25", 0.7);
          ctx.audio.play("pickup");
          v.fx.push({ x: e.x, y: e.y, z: 0, color: CORE_COLOR, count: 10 });
          continue;
        }
        if (e.z > 10) v.entities.splice(i, 1);
      }

      base.score = Math.floor(distAcc) + bonus;
      base.setFields([
        { label: "速度", value: `${speed.toFixed(0)} m/s` },
        { label: "核心", value: `×${cores}` },
        { label: "险距", value: `×${nearMisses}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1026, 0x1a2c50);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 320, 60);

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.3, 5),
      new THREE.MeshStandardMaterial({ color: ctx.accent, metalness: 0.5, roughness: 0.3 }),
    );
    hull.rotation.x = Math.PI / 2;
    ship.add(hull);
    const glow = ball(0.16, 0xfff2c8, 0xffc860);
    glow.position.z = 0.75;
    ship.add(glow);
    root.add(ship);

    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: SHARD,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
    });
    const coreGeo = new THREE.OctahedronGeometry(0.45, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: CORE_COLOR,
      emissive: CORE_COLOR,
      emissiveIntensity: 0.9,
      metalness: 0.4,
      roughness: 0.25,
    });
    const meshMap = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 70);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      ship.position.set(v.shipX, 0.9, 0);
      ship.rotation.z = -v.tilt;
      hull.rotation.y = time * 0.8;

      const seen = new Set<number>();
      for (const e of v.entities) {
        seen.add(e.id);
        let mesh = meshMap.get(e.id);
        if (!mesh) {
          mesh = new THREE.Mesh(e.kind === "rock" ? rockGeo : coreGeo, e.kind === "rock" ? rockMat : coreMat);
          meshMap.set(e.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(e.x, e.y, e.z);
        mesh.rotation.x += e.spin * dt;
        mesh.rotation.y += e.spin * dt * 0.7;
      }
      for (const [id, mesh] of meshMap) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshMap.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      const camX = v.shipX * 0.35;
      ctx.camera.position.set(camX, 3.6, 9.6);
      ctx.camera.lookAt(v.shipX * 0.5, 0.7, -10);
    };

    return {
      paint,
      onDispose: () => {
        rockGeo.dispose();
        rockMat.dispose();
        coreGeo.dispose();
        coreMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g01-asteroid-corridor",
  no: 1,
  name: "陨石回廊",
  tagline: "在陨石带里穿行，擦身而过反而更值钱。",
  category: "动作",
  controls: "← → / A D / 左右拖动",
  hint: "躲开陨石 · 擦身而过 +8 · 拾取核心 +25",
  accent: "#38bdf8",
  createLogic,
  createStage,
};

export default def;
