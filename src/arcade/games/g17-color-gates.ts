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
import { addLights, ball, createStageShell, groundGrid, Particles, setBackdrop, starfield } from "../kit/world";

export const COLORS = [
  { name: "赤", hex: 0xff5d73 },
  { name: "翠", hex: 0x4ade80 },
  { name: "蓝", hex: 0x60a5fa },
];

export interface Gate {
  id: number;
  z: number;
  color: number;
  passed: boolean;
}

export interface GView {
  colorIndex: number;
  gates: Gate[];
  speed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击换色 · 同色穿门 · 异色即碎" });
  const rng = makeRng(33177);
  const v: GView = { colorIndex: 0, gates: [], speed: 10, fx: [], alive: true };
  let nextId = 1;
  let gateTimer = 0.6;
  let passed = 0;
  let combo = 0;
  let maxCombo = 0;

  const reset = () => {
    base.clearHud();
    v.colorIndex = 0;
    v.gates = [];
    v.speed = 10;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    gateTimer = 0.6;
    passed = 0;
    combo = 0;
    maxCombo = 0;
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
      if (input.actionPressed) {
        v.colorIndex = (v.colorIndex + 1) % COLORS.length;
        ctx.audio.play("tick", v.colorIndex / 3);
      }
      v.speed = Math.min(24, 10 + base.elapsed * 0.4);

      gateTimer -= dt;
      if (gateTimer <= 0) {
        gateTimer = clamp(1.5 - base.elapsed * 0.014, 0.8, 1.5);
        v.gates.push({
          id: nextId++,
          z: -66,
          color: Math.floor(rng() * COLORS.length),
          passed: false,
        });
      }

      for (let i = v.gates.length - 1; i >= 0; i -= 1) {
        const gate = v.gates[i];
        const pz = gate.z;
        gate.z += v.speed * dt;
        if (pz <= 0.6 && gate.z >= -0.6 && !gate.passed) {
          gate.passed = true;
          if (gate.color === v.colorIndex) {
            passed += 1;
            combo += 1;
            maxCombo = Math.max(maxCombo, combo);
            base.score += 10 + combo * 2;
            ctx.audio.play("pickup", Math.min(1, combo / 10));
            if (combo % 5 === 0) base.say(`${COLORS[gate.color].name}门连击 ×${combo}`, 0.9);
          } else {
            v.alive = false;
            v.fx.push({ x: 0, y: 1, z: 0, color: COLORS[gate.color].hex, count: 26 });
            base.detail = `同色穿门 ${passed} 座 · 最长连击 ×${maxCombo}`;
            base.finish("lose");
            return;
          }
        }
        if (gate.z > 6) v.gates.splice(i, 1);
      }

      base.setFields([
        { label: "连击", value: `×${combo}` },
        { label: "穿门", value: `×${passed}` },
        { label: "速度", value: v.speed.toFixed(0) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x12081e, 0x2b1440);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 180, 55);
    groundGrid(ctx.scene, 60, 30, 0x2c1a4e).position.y = -0.6;

    const orb = ball(0.55, 0xffffff, 0xffffff);
    orb.position.set(0, 1, 0);
    root.add(orb);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    );
    halo.position.copy(orb.position);
    root.add(halo);

    const gateMeshes = new Map<number, THREE.Mesh>();
    const gateGeo = new THREE.TorusGeometry(2.1, 0.24, 10, 40);
    const gateMats = COLORS.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c.hex,
          emissive: c.hex,
          emissiveIntensity: 0.55,
          metalness: 0.45,
          roughness: 0.3,
        }),
    );
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const hex = COLORS[v.colorIndex].hex;
      (orb.material as THREE.MeshStandardMaterial).color.setHex(hex);
      (orb.material as THREE.MeshStandardMaterial).emissive.setHex(hex);
      (halo.material as THREE.MeshBasicMaterial).color.setHex(hex);
      halo.rotation.x = time * 1.6;
      halo.rotation.y = time * 1.1;

      const seen = new Set<number>();
      for (const gate of v.gates) {
        seen.add(gate.id);
        let mesh = gateMeshes.get(gate.id);
        if (!mesh) {
          mesh = new THREE.Mesh(gateGeo, gateMats[gate.color]);
          gateMeshes.set(gate.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(0, 1, gate.z);
        mesh.rotation.z = time * 0.6;
      }
      for (const [id, mesh] of gateMeshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          gateMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 2.4, 8.4);
      ctx.camera.lookAt(0, 1, -8);
    };

    return {
      paint,
      onDispose: () => {
        gateGeo.dispose();
        gateMats.forEach((m) => m.dispose());
        (halo.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g17-color-gates",
  no: 17,
  name: "色彩闸门",
  tagline: "赤翠蓝三色闸门，换对颜色才能穿过。",
  category: "动作",
  controls: "空格 / 点击 换色",
  hint: "闸门颜色要和自身一致 · 连击越高分越多",
  accent: "#f472b6",
  createLogic,
  createStage,
};

export default def;
