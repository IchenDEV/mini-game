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
import { addLights, ball, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const BEAM_HALF = 3.2;
export const MAX_TILT = 0.5;
export const FALL_Y = -3;

export interface GView {
  ballX: number;
  ballY: number;
  tilt: number;
  seconds: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "左右反向压杆 · 让球稳稳停在木板上" });
  const rng = makeRng(33019);
  const v: GView = { ballX: 0, ballY: 0.42, tilt: 0, seconds: 0, fx: [], alive: true };
  let angular = 0;
  let gustTimer = 2.4;

  const reset = () => {
    base.clearHud();
    v.ballX = 0;
    v.ballY = 0.42;
    v.tilt = 0;
    v.seconds = 0;
    v.fx = [];
    v.alive = true;
    angular = 0;
    gustTimer = 2.4;
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
      v.seconds += dt;

      // Torque from the ball's offset minus the player's counter-lean.
      const torque = v.ballX * 1.35 - input.axisX * 2.6 - v.tilt * 0.7;
      angular += torque * dt;
      angular *= 1 - Math.min(1, dt * 1.6);
      v.tilt = clamp(v.tilt + angular * dt, -MAX_TILT, MAX_TILT);

      // Ball rolls downhill; gravity component along the beam.
      v.ballX += Math.sin(v.tilt) * 5.4 * dt;
      // Occasional gusts to upset the balance.
      gustTimer -= dt;
      if (gustTimer <= 0) {
        gustTimer = 1.8 + rng() * 1.8;
        const push = (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.7);
        v.ballX += push;
        base.say(push > 0 ? "右风！" : "左风！", 0.7);
        ctx.audio.play("tick", push);
      }

      if (Math.abs(v.ballX) > BEAM_HALF || v.ballY < FALL_Y) {
        v.alive = false;
        v.fx.push({ x: v.ballX, y: 0, z: 0, color: 0xff6b7a, count: 20 });
        base.detail = `平衡 ${v.seconds.toFixed(1)} 秒`;
        base.finish("lose");
        return;
      }

      v.ballY = Math.cos(v.tilt) * 0.42;
      base.score = Math.floor(v.seconds * 10);
      base.setFields([
        { label: "坚持", value: `${v.seconds.toFixed(1)}s` },
        { label: "倾角", value: `${(v.tilt * 57.3).toFixed(0)}°` },
        { label: "偏移", value: v.ballX.toFixed(1) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x140f05, 0x3d2c10);
    addLights(ctx.scene, ctx.accent);

    const fulcrum = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x6b5427, metalness: 0.4, roughness: 0.6, flatShading: true }),
    );
    fulcrum.position.y = -0.9;
    fulcrum.rotation.y = Math.PI / 4;
    root.add(fulcrum);

    const beam = box(BEAM_HALF * 2, 0.22, 1.1, ctx.accent, { emissive: ctx.accent });
    beam.position.y = 0.3;
    root.add(beam);

    const sphere = ball(0.42, 0xffd76b, 0xff9d3c);
    root.add(sphere);

    const particles = new Particles(ctx.scene, 40);
    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      beam.rotation.z = -v.tilt;
      const bx = v.ballX * Math.cos(v.tilt);
      const by = 0.3 + Math.cos(v.tilt) * 0.42 + Math.abs(v.ballX) * Math.sin(Math.abs(v.tilt));
      sphere.position.set(bx, v.alive ? by : v.ballY, 0);
      sphere.rotation.z -= dt * 3;

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(Math.sin(time * 0.16) * 6.5, 2.6, 9.2);
      ctx.camera.lookAt(0, 0.4, 0);
    };

    return {
      paint,
      onDispose: () => {
        (beam.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g18-beam-balance",
  no: 18,
  name: "平衡木板",
  tagline: "球往低处滚，你偏要它停在正中。",
  category: "休闲",
  controls: "← → 反向压杆",
  hint: "偏移越大扭矩越大 · 阵风会突然捣乱",
  accent: "#facc15",
  createLogic,
  createStage,
};

export default def;
