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
import { addLights, ball, box, createStageShell, cylinder, Particles, setBackdrop } from "../kit/world";

export const HOLES = 3;
export const MAX_STROKES = 8;
export const HOLE_R = 0.55;
const FRICTION = 1.6;

export interface HoleDef {
  hx: number;
  hz: number;
  /** Constant slope acceleration across the green. */
  slopeX: number;
  slopeZ: number;
  par: number;
}

export interface GView {
  ballX: number;
  ballZ: number;
  vx: number;
  vz: number;
  aim: number;
  power: number;
  charging: boolean;
  hole: HoleDef;
  holeIndex: number;
  strokes: number;
  totalStrokes: number;
  rolling: boolean;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "←→ 瞄准 · 按住蓄力松手推杆 · 进洞越快分越高" });
  const rng = makeRng(88321);
  const v: GView = {
    ballX: 0,
    ballZ: 0,
    vx: 0,
    vz: 0,
    aim: 0,
    power: 0,
    charging: false,
    hole: { hx: 0, hz: -9, slopeX: 0, slopeZ: 0, par: 2 },
    holeIndex: 1,
    strokes: 0,
    totalStrokes: 0,
    rolling: false,
    fx: [],
    alive: true,
  };
  let chargeT = 0;

  const makeHole = (index: number): HoleDef => ({
    hx: -3 + rng() * 6,
    hz: -(7 + index * 2.5 + rng() * 2),
    slopeX: (rng() - 0.5) * 1.5,
    slopeZ: (rng() - 0.5) * 1.2,
    par: 2,
  });

  const reset = () => {
    base.clearHud();
    v.holeIndex = 1;
    v.hole = makeHole(1);
    v.ballX = 0;
    v.ballZ = 0;
    v.vx = 0;
    v.vz = 0;
    v.aim = 0;
    v.power = 0;
    v.charging = false;
    v.strokes = 0;
    v.totalStrokes = 0;
    v.rolling = false;
    v.fx = [];
    v.alive = true;
    chargeT = 0;
  };
  reset();

  const nextHoleOrFinish = () => {
    const parScore = Math.max(10, 60 - (v.strokes - v.hole.par) * 10);
    base.score += parScore;
    ctx.audio.play("win");
    base.say(`进洞！${v.strokes} 杆 +${parScore}`, 1.2);
    if (v.holeIndex >= HOLES) {
      base.detail = `${HOLES} 洞共 ${v.totalStrokes} 杆`;
      base.finish("win");
      return;
    }
    v.holeIndex += 1;
    v.hole = makeHole(v.holeIndex);
    v.ballX = 0;
    v.ballZ = 0;
    v.vx = 0;
    v.vz = 0;
    v.strokes = 0;
    v.rolling = false;
    v.aim = 0;
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

      if (!v.rolling) {
        v.aim = clamp(v.aim + input.axisX * 2.2 * dt, -Math.PI / 2, Math.PI / 2);
        if (input.actionPressed) {
          v.charging = true;
          chargeT = 0;
        }
        if (v.charging) {
          chargeT += dt * 1.8;
          v.power = Math.abs(Math.sin(chargeT));
          base.setMeter(v.power);
          if (input.actionReleased) {
            const speed = 3.5 + v.power * 8.5;
            const dx = v.hole.hx - v.ballX;
            const dz = v.hole.hz - v.ballZ;
            const baseAngle = Math.atan2(dx, dz);
            const angle = baseAngle + v.aim;
            v.vx = Math.sin(angle) * speed;
            v.vz = Math.cos(angle) * speed;
            v.rolling = true;
            v.charging = false;
            v.strokes += 1;
            v.totalStrokes += 1;
            ctx.audio.play("shoot");
          }
        }
      } else {
        v.vx += v.hole.slopeX * dt;
        v.vz += v.hole.slopeZ * dt;
        const speed = Math.hypot(v.vx, v.vz);
        if (speed > 0.02) {
          const decel = FRICTION * dt;
          const k = Math.max(0, speed - decel) / speed;
          v.vx *= k;
          v.vz *= k;
        }
        v.ballX += v.vx * dt;
        v.ballZ += v.vz * dt;

        const dist = Math.hypot(v.ballX - v.hole.hx, v.ballZ - v.hole.hz);
        if (dist < HOLE_R && Math.hypot(v.vx, v.vz) < 6.5) {
          nextHoleOrFinish();
          return;
        }
        if (speed < 0.15 || Math.abs(v.ballX) > 7 || v.ballZ > 2.5 || v.ballZ < v.hole.hz - 6) {
          v.vx = 0;
          v.vz = 0;
          v.rolling = false;
          if (v.strokes >= MAX_STROKES) {
            base.detail = `第 ${v.holeIndex} 洞超杆`;
            base.finish("lose");
            return;
          }
        }
      }

      base.setFields([
        { label: "球洞", value: `${v.holeIndex}/${HOLES}` },
        { label: "本洞", value: `${v.strokes} 杆` },
        { label: "距离", value: `${Math.hypot(v.hole.hx - v.ballX, v.hole.hz - v.ballZ).toFixed(1)}m` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0a1a10, 0x1d4a2c);
    addLights(ctx.scene, ctx.accent);

    const green = box(16, 0.4, 26, 0x2f8f4f, { roughness: 0.9 });
    green.position.set(0, -0.2, -8);
    root.add(green);

    const cup = new THREE.Mesh(
      cylinder(HOLE_R, HOLE_R, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x0c2415, roughness: 0.9 }),
    );
    root.add(cup);
    const flag = box(0.06, 1.4, 0.06, 0xff5d73, { emissive: 0xff5d73 });
    root.add(flag);
    const flagCloth = box(0.55, 0.32, 0.02, 0xff5d73, { emissive: 0xff5d73 });
    root.add(flagCloth);

    const sphere = ball(0.3, 0xffffff, 0x9be8ff);
    root.add(sphere);
    const putter = box(0.12, 0.3, 0.9, 0xd8d8e8, { metalness: 0.6 });
    root.add(putter);

    const particles = new Particles(ctx.scene, 40);
    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      cup.position.set(v.hole.hx, -0.05, v.hole.hz);
      flag.position.set(v.hole.hx, 0.6, v.hole.hz);
      flagCloth.position.set(v.hole.hx + 0.3, 1.15, v.hole.hz);
      sphere.position.set(v.ballX, 0.28, v.ballZ);
      putter.position.set(v.ballX + Math.sin(v.aim) * -0.7, 0.4, v.ballZ + Math.cos(v.aim) * -0.7);
      putter.rotation.y = v.aim;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(v.ballX * 0.6, 5.4, v.ballZ + 6.4);
      ctx.camera.lookAt((v.ballX + v.hole.hx) / 2, 0, (v.ballZ + v.hole.hz) / 2);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        cup.geometry.dispose();
        (cup.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g25-putt-cave",
  no: 25,
  name: "迷你推杆",
  tagline: "三洞标准杆，坡度会捣乱，手感定输赢。",
  category: "体育",
  controls: "←→ 瞄准 · 按住蓄力松手推杆",
  hint: "越接近洞口越要轻 · 8 杆封顶 · 3 洞结算",
  accent: "#4ade80",
  createLogic,
  createStage,
};

export default def;
