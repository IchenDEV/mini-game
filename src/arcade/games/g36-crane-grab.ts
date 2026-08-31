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

export const DROPS = 8;
export const GRAB_R = 0.68;

export interface Prize {
  id: number;
  x: number;
  kind: "common" | "silver" | "gold";
  taken: boolean;
}

export interface GView {
  clawX: number;
  clawY: number;
  phase: "move" | "drop" | "lift";
  prizes: Prize[];
  dropsLeft: number;
  grabbed: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "爪子左右摆 · 看准奖品正上方松爪" });
  const rng = makeRng(71828);
  const v: GView = {
    clawX: 0,
    clawY: 3.6,
    phase: "move",
    prizes: [],
    dropsLeft: DROPS,
    grabbed: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;

  const reset = () => {
    base.clearHud();
    nextId = 1;
    v.prizes = [];
    for (let i = 0; i < 9; i += 1) {
      const roll = rng();
      const kind: Prize["kind"] = roll < 0.14 ? "gold" : roll < 0.42 ? "silver" : "common";
      v.prizes.push({ id: nextId++, x: -3.4 + rng() * 6.8, kind, taken: false });
    }
    v.clawX = 0;
    v.clawY = 3.6;
    v.phase = "move";
    v.dropsLeft = DROPS;
    v.grabbed = 0;
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

      if (v.phase === "move") {
        v.clawX = Math.sin(base.elapsed * 1.35) * 3.6;
        if (input.actionPressed && v.dropsLeft > 0) {
          v.dropsLeft -= 1;
          v.phase = "drop";
          ctx.audio.play("tick");
        }
      } else if (v.phase === "drop") {
        v.clawY -= 5.5 * dt;
        if (v.clawY <= 0.9) {
          // Grab attempt: take the closest available prize under the claw.
          let bestI = -1;
          let bestD = Infinity;
          v.prizes.forEach((p, i) => {
            if (p.taken) return;
            const d = Math.abs(p.x - v.clawX);
            if (d < bestD) {
              bestD = d;
              bestI = i;
            }
          });
          if (bestI >= 0 && bestD < GRAB_R) {
            const prize = v.prizes[bestI];
            prize.taken = true;
            v.grabbed += 1;
            const pts = prize.kind === "gold" ? 50 : prize.kind === "silver" ? 25 : 10;
            base.score += pts;
            ctx.audio.play("pickup", pts / 50);
            v.fx.push({ x: prize.x, y: 1, z: 0, color: prize.kind === "gold" ? 0xffd166 : 0xbfc9d9, count: 12 });
            if (pts === 50) base.say("抓到金奖！+50", 1);
          } else {
            ctx.audio.play("tick");
            base.say("扑空了", 0.7);
          }
          v.phase = "lift";
        }
      } else {
        v.clawY += 4.5 * dt;
        if (v.clawY >= 3.6) {
          v.clawY = 3.6;
          v.phase = "move";
        }
      }

      if (v.dropsLeft === 0 && v.phase === "move") {
        const win = base.score >= 150;
        base.detail = `抓到 ${v.grabbed} 件 / ${DROPS} 次`;
        base.finish(win ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "剩余", value: `${v.dropsLeft} 次` },
        { label: "抓取", value: String(v.grabbed) },
        { label: "爪位", value: v.clawX.toFixed(1) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x1a0f28, 0x452a5e);
    addLights(ctx.scene, ctx.accent);

    const pit = box(9, 0.5, 5, 0x33204a, { metalness: 0.3 });
    pit.position.set(0, -0.25, 0);
    root.add(pit);
    const frame = box(9.6, 0.3, 0.6, 0x553a75, { metalness: 0.5 });
    frame.position.set(0, 4.2, 0);
    root.add(frame);

    const rail = box(0.14, 0.14, 0.14, ctx.accent, { emissive: ctx.accent });
    rail.position.set(0, 3.7, 0);
    root.add(rail);
    const claw = new THREE.Group();
    for (const side of [-1, 1]) {
      const finger = box(0.1, 0.55, 0.1, 0xc9c9e0, { metalness: 0.7 });
      finger.position.set(side * 0.24, -0.28, 0);
      finger.rotation.z = side * 0.35;
      claw.add(finger);
    }
    root.add(claw);

    const prizeGeo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
    const prizeMats = {
      common: new THREE.MeshStandardMaterial({ color: 0x8a6bd8, roughness: 0.5, metalness: 0.3 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xc9cfe0, metalness: 0.8, roughness: 0.25 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.2 }),
    };
    const meshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      rail.position.x = v.clawX;
      claw.position.set(v.clawX, v.clawY, 0);

      const seen = new Set<number>();
      for (const prize of v.prizes) {
        if (prize.taken) continue;
        seen.add(prize.id);
        let mesh = meshes.get(prize.id);
        if (!mesh) {
          mesh = new THREE.Mesh(prizeGeo, prizeMats[prize.kind]);
          meshes.set(prize.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(prize.x, 0.35, (prize.id % 3) * 0.9 - 0.9);
        mesh.rotation.y += dt * 0.6;
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

      ctx.camera.position.set(0, 4.6, 8.8);
      ctx.camera.lookAt(0, 1.2, 0);
    };

    return {
      paint,
      onDispose: () => {
        prizeGeo.dispose();
        Object.values(prizeMats).forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g36-crane-grab",
  no: 36,
  name: "吊车抓宝",
  tagline: "八次下爪机会，金奖就在正中间晃。",
  category: "休闲",
  controls: "空格 / 点击 下爪",
  hint: "金奖 50 · 银奖 25 · 普通奖 10 · 150 分达标",
  accent: "#a78bfa",
  createLogic,
  createStage,
};

export default def;
