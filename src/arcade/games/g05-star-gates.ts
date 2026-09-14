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

const MIN_Y = 0.5;
const MAX_Y = 8.4;
const FLAP_VY = 5.4;
const GRAVITY = 13.5;
const SHIP_R = 0.42;

export interface Gate {
  id: number;
  z: number;
  gapY: number;
  gapH: number;
  passed: boolean;
}

export interface GView {
  shipY: number;
  vy: number;
  gates: Gate[];
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击喷射上升 · 从星门缺口穿过" });
  const rng = makeRng(77031);
  const v: GView = { shipY: 4, vy: 0, gates: [], fx: [], alive: true };
  let nextId = 1;
  let passed = 0;
  let gateTimer = 0.8;

  const reset = () => {
    base.clearHud();
    passed = 0;
    gateTimer = 0.8;
    v.shipY = 4;
    v.vy = 0;
    v.gates = [];
    v.fx = [];
    v.alive = true;
  };
  reset();

  const crash = (why: string) => {
    if (!v.alive) return;
    v.alive = false;
    v.fx.push({ x: 0, y: v.shipY, z: 0, color: 0xff8b5c, count: 24 });
    base.detail = `穿过 ${passed} 道星门 · ${why}`;
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

      if (input.actionPressed) {
        v.vy = FLAP_VY;
        ctx.audio.play("tick", 0.2);
      }
      v.vy -= GRAVITY * dt;
      v.shipY += v.vy * dt;
      if (v.shipY > MAX_Y) {
        v.shipY = MAX_Y;
        v.vy = Math.min(v.vy, 0);
      }
      if (v.shipY < MIN_Y) {
        v.shipY = MIN_Y;
        crash("触地了");
        return;
      }

      const speed = 8 + base.elapsed * 0.18;
      gateTimer -= dt;
      if (gateTimer <= 0) {
        gateTimer = clamp(2.2 - base.elapsed * 0.012, 1.5, 2.2);
        const gapH = Math.max(2, 2.7 - base.elapsed * 0.012);
        v.gates.push({
          id: nextId++,
          z: -75,
          gapY: 1.6 + rng() * 5.2,
          gapH,
          passed: false,
        });
      }

      for (let i = v.gates.length - 1; i >= 0; i -= 1) {
        const g = v.gates[i];
        const pz = g.z;
        g.z += speed * dt;
        // Swept overlap with the ship plane at z=0.
        if (pz <= 0.6 && g.z >= -0.6) {
          const top = g.gapY + g.gapH / 2 - SHIP_R;
          const bottom = g.gapY - g.gapH / 2 + SHIP_R;
          if (v.shipY > top || v.shipY < bottom) {
            crash("撞上了星门");
            return;
          }
        }
        if (!g.passed && pz < 0 && g.z >= 0) {
          g.passed = true;
          passed += 1;
          base.score += 10;
          ctx.audio.play("pickup", 0.4);
          if (passed % 5 === 0) base.say(`${passed} 连穿！`, 0.9);
        }
        if (g.z > 8) v.gates.splice(i, 1);
      }

      base.setFields([
        { label: "星门", value: `×${passed}` },
        { label: "高度", value: v.shipY.toFixed(1) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x07131f, 0x123244);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 200, 55);
    groundGrid(ctx.scene, 80, 40, 0x14314a).position.y = 0.02;

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0xffc46b, metalness: 0.55, roughness: 0.3 }),
    );
    hull.rotation.x = -Math.PI / 2;
    ship.add(hull);
    const flame = ball(0.14, 0xffe2a8, 0xff9d3c);
    flame.position.z = 0.62;
    ship.add(flame);
    root.add(ship);

    const pillarMat = new THREE.MeshStandardMaterial({
      color: ctx.accent,
      emissive: ctx.accent,
      emissiveIntensity: 0.35,
      metalness: 0.4,
      roughness: 0.4,
      transparent: true,
      opacity: 0.92,
    });
    const gateMeshes = new Map<number, { bottom: THREE.Mesh; top: THREE.Mesh }>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      ship.position.set(0, v.shipY, 0);
      ship.rotation.x = clamp(v.vy * 0.09, -0.5, 0.5);

      const seen = new Set<number>();
      for (const g of v.gates) {
        seen.add(g.id);
        let pair = gateMeshes.get(g.id);
        if (!pair) {
          const mk = () => new THREE.Mesh(new THREE.BoxGeometry(7, 1, 0.7), pillarMat);
          pair = { bottom: mk(), top: mk() };
          gateMeshes.set(g.id, pair);
          root.add(pair.bottom, pair.top);
        }
        const bottomH = Math.max(0.05, g.gapY - g.gapH / 2);
        pair.bottom.scale.set(1, bottomH, 1);
        pair.bottom.position.set(0, bottomH / 2, g.z);
        const topH = Math.max(0.05, 9.4 - (g.gapY + g.gapH / 2));
        pair.top.scale.set(1, topH, 1);
        pair.top.position.set(0, 9.4 - topH / 2, g.z);
      }
      for (const [id, pair] of gateMeshes) {
        if (!seen.has(id)) {
          root.remove(pair.bottom, pair.top);
          pair.bottom.geometry.dispose();
          pair.top.geometry.dispose();
          gateMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(6.5, v.shipY * 0.55 + 2.2, 11);
      ctx.camera.lookAt(0, v.shipY * 0.6 + 0.5, -6);
    };

    return {
      paint,
      onDispose: () => {
        pillarMat.dispose();
        for (const pair of gateMeshes.values()) {
          pair.bottom.geometry.dispose();
          pair.top.geometry.dispose();
        }
      },
    };
  });
}

const def: GameDefinition = {
  id: "g05-star-gates",
  no: 5,
  name: "星门穿行",
  tagline: "一枚小火箭，靠喷射在星门缝隙里求生。",
  category: "休闲",
  controls: "空格 / 回车 / 点击 喷射",
  hint: "掌握喷射节奏 · 穿门 +10 · 别触地",
  accent: "#fbbf24",
  createLogic,
  createStage,
};

export default def;
