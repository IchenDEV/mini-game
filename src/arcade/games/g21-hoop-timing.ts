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
import { addLights, ball, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const TOTAL_BALLS = 10;
export const HOOP_Y = 5.6;
export const HOOP_RANGE = 3.1;
export const MAKE_WINDOW = 0.85;

export interface GView {
  hoopX: number;
  ballY: number;
  ballVy: number;
  flying: boolean;
  ballsLeft: number;
  makes: number;
  streak: number;
  fx: FxEvent[];
  alive: boolean;
}

/** Time for a shot to fall back down through the rim height. */
export function flightTime(vy: number, g: number, targetY: number): number {
  const disc = vy * vy - 2 * g * targetY;
  if (disc < 0) return -1;
  return (vy + Math.sqrt(disc)) / g;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "看准篮筐回中的一瞬间出手" });
  const v: GView = {
    hoopX: 0,
    ballY: 0.5,
    ballVy: 0,
    flying: false,
    ballsLeft: TOTAL_BALLS,
    makes: 0,
    streak: 0,
    fx: [],
    alive: true,
  };

  const reset = () => {
    base.clearHud();
    v.hoopX = 0;
    v.ballY = 0.5;
    v.ballVy = 0;
    v.flying = false;
    v.ballsLeft = TOTAL_BALLS;
    v.makes = 0;
    v.streak = 0;
    v.fx = [];
    v.alive = true;
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
      v.hoopX = Math.sin(base.elapsed * 1.15) * HOOP_RANGE;

      if (v.flying) {
        v.ballVy -= 9.8 * dt;
        v.ballY += v.ballVy * dt;
        if (v.ballVy < 0 && v.ballY <= HOOP_Y && v.ballY > HOOP_Y - 1) {
          // Score check happens once, on the way down through the rim.
          if (Math.abs(v.hoopX) < MAKE_WINDOW) {
            v.makes += 1;
            v.streak += 1;
            base.score += 10 + v.streak * 2;
            ctx.audio.play("pickup", Math.min(1, v.streak / 6));
            v.fx.push({ x: 0, y: HOOP_Y, z: 0, color: 0xffc46b, count: 14 });
            base.say(v.streak >= 3 ? `连中 ${v.streak} 球！` : "命中 +", 0.9);
          } else {
            v.streak = 0;
            ctx.audio.play("tick");
          }
          v.flying = false;
          v.ballY = 0.5;
          v.ballVy = 0;
        }
        if (v.ballY < 0) {
          v.flying = false;
          v.streak = 0;
          v.ballY = 0.5;
          v.ballVy = 0;
        }
      } else if (input.actionPressed && v.ballsLeft > 0) {
        v.flying = true;
        v.ballVy = 11.5;
        v.ballsLeft -= 1;
        ctx.audio.play("shoot");
      }

      if (v.ballsLeft === 0 && !v.flying) {
        const win = v.makes >= 5;
        base.detail = `命中 ${v.makes} / ${TOTAL_BALLS}`;
        base.finish(win ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "用球", value: `${TOTAL_BALLS - v.ballsLeft}/${TOTAL_BALLS}` },
        { label: "命中", value: String(v.makes) },
        { label: "连中", value: `×${v.streak}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x140f1e, 0x33244d);
    addLights(ctx.scene, ctx.accent);

    const court = box(14, 0.4, 10, 0x3a2a55, { metalness: 0.25 });
    court.position.set(0, -0.2, -1);
    root.add(court);

    const pole = box(0.18, HOOP_Y + 1.2, 0.18, 0x8b8ba8, { metalness: 0.5 });
    pole.position.set(0, (HOOP_Y + 1.2) / 2, -2.2);
    root.add(pole);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.07, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xff6b4a, emissive: 0xff5a2a, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.4 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = HOOP_Y;
    root.add(rim);
    const net = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 0.9, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    net.position.y = HOOP_Y - 0.5;
    root.add(net);

    const sphere = ball(0.34, 0xffb45e, 0xff7a1f);
    root.add(sphere);
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      rim.position.x = v.hoopX;
      net.position.x = v.hoopX;
      sphere.position.set(0, v.ballY, 0.8);
      particles.update(dt);
      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      ctx.camera.position.set(3.8, 3.4, 7.2);
      ctx.camera.lookAt(0, HOOP_Y * 0.62, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        (rim.material as THREE.Material).dispose();
        (net.material as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g21-hoop-timing",
  no: 21,
  name: "投篮节奏",
  tagline: "篮筐左右游走，出手时机就是一切。",
  category: "体育",
  controls: "空格 / 点击 出手",
  hint: "球下落穿过筐心才算进 · 连中有加成 · 10 球定胜负",
  accent: "#fb7185",
  createLogic,
  createStage,
};

export default def;
