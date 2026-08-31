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

export const LANES = [-2.6, 0, 2.6];
const COIN_COLOR = 0xffd45e;
const HAZARD_COLOR = 0xff5d73;

export interface Runner {
  id: number;
  kind: "hazard" | "coin";
  lane: number;
  z: number;
}

export interface GView {
  lane: number;
  laneX: number;
  runnerZ: number;
  items: Runner[];
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右换道 · 吃金币 · 撞尖刺就结束" });
  const rng = makeRng(31415);
  const v: GView = { lane: 1, laneX: 0, runnerZ: 0, items: [], fx: [], alive: true };
  let nextId = 1;
  let distAcc = 0;
  let coins = 0;
  let combo = 0;
  let maxCombo = 0;
  let hazardTimer = 1.2;
  let coinTimer = 1.8;
  let prevAxis = 0;
  let bonus = 0;

  const reset = () => {
    base.clearHud();
    v.lane = 1;
    v.laneX = 0;
    v.items = [];
    v.fx = [];
    v.alive = true;
    distAcc = 0;
    coins = 0;
    combo = 0;
    maxCombo = 0;
    hazardTimer = 1.2;
    coinTimer = 1.8;
    prevAxis = 0;
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
      const speed = Math.min(26, 11 + base.elapsed * 0.35);
      distAcc += speed * dt;
      v.runnerZ += speed * dt;

      // Lane switching: discrete edges from keys, or tap a side of the screen.
      if (input.axisX <= -0.5 && prevAxis > -0.5) v.lane = Math.max(0, v.lane - 1);
      if (input.axisX >= 0.5 && prevAxis < 0.5) v.lane = Math.min(2, v.lane + 1);
      if (input.pointerActive && input.actionPressed) {
        if (input.pointerX < -0.2) v.lane = Math.max(0, v.lane - 1);
        else if (input.pointerX > 0.2) v.lane = Math.min(2, v.lane + 1);
      }
      prevAxis = input.axisX;
      v.laneX += (LANES[v.lane] - v.laneX) * Math.min(1, dt * 14);

      hazardTimer -= dt;
      if (hazardTimer <= 0) {
        hazardTimer = clamp(1 - base.elapsed * 0.01, 0.5, 1);
        const lanes = [0, 1, 2].sort(() => rng() - 0.5);
        const count = base.elapsed > 12 && rng() < 0.45 ? 2 : 1;
        for (let i = 0; i < count; i += 1) {
          v.items.push({ id: nextId++, kind: "hazard", lane: lanes[i], z: -78 });
        }
      }
      coinTimer -= dt;
      if (coinTimer <= 0) {
        coinTimer = 1.4 + rng() * 1.2;
        const lane = Math.floor(rng() * 3) as 0 | 1 | 2;
        for (let i = 0; i < 3; i += 1) {
          v.items.push({ id: nextId++, kind: "coin", lane, z: -78 - i * 2.4 });
        }
      }

      for (let i = v.items.length - 1; i >= 0; i -= 1) {
        const item = v.items[i];
        const pz = item.z;
        item.z += speed * dt;
        const sameLane = item.lane === v.lane;
        const near = Math.abs(v.laneX - LANES[item.lane]) < 1.1;
        if (pz <= 0.9 && item.z >= -0.9 && (sameLane || near)) {
          if (item.kind === "hazard") {
            if (near) {
              v.alive = false;
              v.fx.push({ x: v.laneX, y: 0.8, z: 0, color: HAZARD_COLOR, count: 26 });
              base.detail = `跑了 ${Math.floor(distAcc)} 米 · 金币 ×${coins} · 最长连击 ×${maxCombo}`;
              base.finish("lose");
              return;
            }
          } else if (near) {
            v.items.splice(i, 1);
            coins += 1;
            combo += 1;
            maxCombo = Math.max(maxCombo, combo);
            bonus += 10 + combo * 2;
            ctx.audio.play("pickup", Math.min(1, combo / 10));
            v.fx.push({ x: LANES[item.lane], y: 0.9, z: 0, color: COIN_COLOR, count: 8 });
            if (combo > 0 && combo % 8 === 0) base.say(`连击 ×${combo}`, 0.8);
            continue;
          }
        }
        if (item.kind === "coin" && item.z > 2) {
          // A coin that slipped past breaks the streak.
          combo = 0;
        }
        if (item.z > 6) v.items.splice(i, 1);
      }

      base.score = Math.floor(distAcc) + bonus;
      base.setFields([
        { label: "金币", value: `×${coins}` },
        { label: "连击", value: `×${combo}` },
        { label: "速度", value: speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a0f26, 0x1d2a55);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 240, 60);

    const track = box(LANES[2] * 2 + 3.4, 0.4, 200, 0x1b2547, { metalness: 0.3 });
    track.position.set(0, -0.2, -60);
    root.add(track);
    for (const laneX of LANES) {
      const stripe = box(0.12, 0.02, 200, ctx.accent, { emissive: ctx.accent });
      stripe.position.set(laneX, 0.02, -60);
      root.add(stripe);
    }

    const runner = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 0.7, 4, 10),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.35 }),
    );
    body.position.y = 0.95;
    runner.add(body);
    root.add(runner);

    const meshes = new Map<number, THREE.Mesh>();
    const hazardGeo = new THREE.ConeGeometry(0.55, 1.4, 4);
    const hazardMat = new THREE.MeshStandardMaterial({ color: HAZARD_COLOR, emissive: HAZARD_COLOR, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.5, flatShading: true });
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20);
    const coinMat = new THREE.MeshStandardMaterial({ color: COIN_COLOR, emissive: COIN_COLOR, emissiveIntensity: 0.65, metalness: 0.6, roughness: 0.25 });
    const particles = new Particles(ctx.scene, 70);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      runner.position.set(v.laneX, Math.abs(Math.sin(time * 12)) * 0.12, 0);
      runner.rotation.z = clamp((LANES[v.lane] - v.laneX) * -0.25, -0.4, 0.4);

      const seen = new Set<number>();
      for (const item of v.items) {
        seen.add(item.id);
        let mesh = meshes.get(item.id);
        if (!mesh) {
          mesh = new THREE.Mesh(item.kind === "hazard" ? hazardGeo : coinGeo, item.kind === "hazard" ? hazardMat : coinMat);
          meshes.set(item.id, mesh);
          root.add(mesh);
        }
        if (item.kind === "hazard") mesh.position.set(LANES[item.lane], 0.7, item.z);
        else {
          mesh.position.set(LANES[item.lane], 0.85, item.z);
          mesh.rotation.x = Math.PI / 2;
          mesh.rotation.z = time * 4;
        }
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.laneX * 0.4, 6.2, 9.5);
      ctx.camera.lookAt(v.laneX * 0.6, 0.6, -10);
    };

    return {
      paint,
      onDispose: () => {
        hazardGeo.dispose();
        hazardMat.dispose();
        coinGeo.dispose();
        coinMat.dispose();
        for (const mesh of meshes.values()) mesh.geometry.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g10-lane-dash",
  no: 10,
  name: "三道狂奔",
  tagline: "三条赛道越来越快，换道要果断。",
  category: "动作",
  controls: "← → 换道 / 点击屏幕两侧",
  hint: "吃金币攒连击 · 尖刺撞不得",
  accent: "#4ade80",
  createLogic,
  createStage,
};

export default def;
