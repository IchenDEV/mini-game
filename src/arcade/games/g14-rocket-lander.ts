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
import { addLights, ball, box, createStageShell, Particles, setBackdrop, starfield } from "../kit/world";

export const GRAVITY = 3.4;
export const THRUST = 7.6;
export const FUEL_MAX = 100;
export const FUEL_BURN = 20;
export const LAND_VY = 2.4;
export const LAND_VX = 1.7;
export const LAND_TILT = 0.4;

export interface Pad {
  x: number;
  half: number;
}

export interface GView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  fuel: number;
  pad: Pad;
  level: number;
  thrusting: boolean;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "←→ 调整姿态 · 按住喷射 · 轻柔落在停机坪",
    meterLabel: "燃料",
  });
  const v: GView = {
    x: 0,
    y: 12,
    vx: 0,
    vy: 0,
    angle: 0,
    fuel: FUEL_MAX,
    pad: { x: 0, half: 1.3 },
    level: 1,
    thrusting: false,
    fx: [],
    alive: true,
  };

  const setupLevel = () => {
    v.x = (Math.random() - 0.5) * 6;
    v.y = 12;
    v.vx = (Math.random() - 0.5) * 1.6;
    v.vy = 0;
    v.angle = 0;
    v.fuel = FUEL_MAX;
    v.pad = { x: (Math.random() - 0.5) * 8, half: Math.max(0.85, 1.4 - v.level * 0.1) };
  };

  const reset = () => {
    base.clearHud(FUEL_MAX / FUEL_MAX);
    v.level = 1;
    setupLevel();
    v.fx = [];
    v.alive = true;
  };
  reset();

  const land = () => {
    const fuelBonus = Math.round(v.fuel * 2);
    base.score += 100 + fuelBonus;
    ctx.audio.play("win");
    base.say(`着陆成功 +${100 + fuelBonus}`, 1.2);
    v.level += 1;
    setupLevel();
  };

  const crash = () => {
    v.alive = false;
    v.fx.push({ x: v.x, y: 0.4, z: 0, color: 0xff6b7a, count: 26 });
    base.detail = `坚持到第 ${v.level} 关`;
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
      const g = GRAVITY + (v.level - 1) * 0.35;

      v.angle = clamp(v.angle + input.axisX * 1.8 * dt, -1.1, 1.1);
      v.thrusting = input.action && v.fuel > 0;
      if (v.thrusting) {
        v.vx += Math.sin(v.angle) * THRUST * dt;
        v.vy += Math.cos(v.angle) * THRUST * dt;
        v.fuel = Math.max(0, v.fuel - FUEL_BURN * dt);
      }
      v.vx -= Math.sin(v.angle) * 0; // keep vx purely thrust/gravity driven
      v.vy -= g * dt;
      v.x = clamp(v.x + v.vx * dt, -8, 8);
      v.y += v.vy * dt;
      base.setMeter(v.fuel / FUEL_MAX);

      const padTop = 0.25;
      const onPadX = Math.abs(v.x - v.pad.x) <= v.pad.half;
      if (v.y <= padTop) {
        const soft = Math.abs(v.vy) < LAND_VY;
        const straight = Math.abs(v.angle) < LAND_TILT;
        const slowX = Math.abs(v.vx) < LAND_VX;
        if (onPadX && soft && straight && slowX) {
          land();
          return;
        }
        crash();
        return;
      }

      base.setFields([
        { label: "关卡", value: String(v.level) },
        { label: "垂直", value: `${v.vy.toFixed(1)} m/s` },
        { label: "横移", value: `${v.vx.toFixed(1)} m/s` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a0d1c, 0x27203f);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 220, 55);

    const ground = box(24, 0.6, 8, 0x2a2440, { metalness: 0.3 });
    ground.position.set(0, -0.3, 0);
    root.add(ground);

    const lander = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.5, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8ecf8, metalness: 0.6, roughness: 0.3 }),
    );
    lander.add(body);
    const nozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x59617a, metalness: 0.7, roughness: 0.4 }),
    );
    nozzle.rotation.x = Math.PI;
    nozzle.position.y = -0.55;
    lander.add(nozzle);
    const flame = ball(0.2, 0xffe2a8, 0xff9d3c);
    flame.position.y = -0.85;
    flame.visible = false;
    lander.add(flame);
    root.add(lander);

    const padMesh = box(1, 0.25, 2, ctx.accent, { emissive: ctx.accent });
    root.add(padMesh);
    const beaconL = ball(0.1, 0xff5d73, 0xff5d73);
    const beaconR = ball(0.1, 0x4ade80, 0x4ade80);
    root.add(beaconL, beaconR);

    const particles = new Particles(ctx.scene, 70);
    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      lander.position.set(v.x, v.y, 0);
      lander.rotation.z = v.angle;
      flame.visible = v.thrusting;
      if (v.thrusting) {
        flame.scale.setScalar(0.8 + Math.random() * 0.5);
        particles.burst(v.x - Math.sin(v.angle) * 0.8, v.y - Math.cos(v.angle) * 0.9, 0, 0xffb45e, 2, 1.6);
      }
      padMesh.scale.x = v.pad.half;
      padMesh.position.set(v.pad.x, 0.12, 0);
      beaconL.position.set(v.pad.x - v.pad.half - 0.3, 0.35, 0);
      beaconR.position.set(v.pad.x + v.pad.half + 0.3, 0.35, 0);

      particles.update(dt);
      const follow = Math.max(2.4, v.y);
      ctx.camera.position.set(v.x * 0.5, follow + 3.2, 10.5);
      ctx.camera.lookAt(v.x * 0.6, follow - 1.2, 0);
    };

    return {
      paint,
      onDispose: () => {
        (padMesh.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g14-rocket-lander",
  no: 14,
  name: "火箭着陆",
  tagline: "燃料有限、重力渐强，把火箭稳稳放上停机坪。",
  category: "竞速",
  controls: "← → 姿态 · 按住空格/点击 喷射",
  hint: "垂直<2.4 横移<1.7 且摆正才算着陆 · 燃料换积分",
  accent: "#f87171",
  createLogic,
  createStage,
};

export default def;
