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

const RUN_SECONDS = 60;
const HALF = 5.6;

export interface Falling {
  id: number;
  kind: "coin" | "bomb" | "gem";
  x: number;
  y: number;
  vy: number;
}

export interface GView {
  basketX: number;
  items: Falling[];
  fx: FxEvent[];
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, {
    hint: "左右移动竹篮 · 金币能接就接 · 炸弹别碰",
    meterLabel: "剩余时间",
  });
  const rng = makeRng(90210);
  const v: GView = { basketX: 0, items: [], fx: [] };
  let nextId = 1;
  let timeLeft = RUN_SECONDS;
  let coinTimer = 0.5;
  let bombTimer = 3;
  let gemTimer = 7;
  let streak = 0;
  let caught = 0;

  const reset = () => {
    base.clearHud(1);
    timeLeft = RUN_SECONDS;
    coinTimer = 0.5;
    bombTimer = 3;
    gemTimer = 7;
    streak = 0;
    caught = 0;
    v.basketX = 0;
    v.items = [];
    v.fx = [];
  };
  reset();

  const multiplier = () => 1 + Math.min(4, Math.floor(streak / 4));

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
      timeLeft -= dt;
      base.setMeter(clamp(timeLeft / RUN_SECONDS, 0, 1));

      if (input.pointerActive && Math.abs(input.pointerX) > 0.05) {
        const target = clamp(input.pointerX * HALF * 1.1, -HALF, HALF);
        v.basketX += (target - v.basketX) * Math.min(1, dt * 12);
      }
      v.basketX = clamp(v.basketX + input.axisX * 9 * dt, -HALF, HALF);

      const fall = 5 + base.elapsed * 0.1;
      coinTimer -= dt;
      if (coinTimer <= 0) {
        coinTimer = clamp(0.5 - base.elapsed * 0.004, 0.26, 0.5);
        v.items.push({ id: nextId++, kind: "coin", x: -HALF + rng() * HALF * 2, y: 12, vy: fall * (0.9 + rng() * 0.3) });
      }
      bombTimer -= dt;
      if (bombTimer <= 0) {
        bombTimer = 1.6 + rng() * 1.6;
        v.items.push({ id: nextId++, kind: "bomb", x: -HALF + rng() * HALF * 2, y: 12, vy: fall * 1.05 });
      }
      gemTimer -= dt;
      if (gemTimer <= 0) {
        gemTimer = 6 + rng() * 4;
        v.items.push({ id: nextId++, kind: "gem", x: -HALF + rng() * HALF * 2, y: 12, vy: fall });
      }

      for (let i = v.items.length - 1; i >= 0; i -= 1) {
        const item = v.items[i];
        item.y -= item.vy * dt;
        const near = Math.abs(item.x - v.basketX) < 1.05 && item.y < 1.15 && item.y > -0.4;
        if (near) {
          v.items.splice(i, 1);
          if (item.kind === "bomb") {
            v.fx.push({ x: item.x, y: 0.6, z: 0, color: 0xff6b57, count: 26 });
            base.detail = `接到 ${caught} 枚金币 · 倍率 ×${multiplier()}`;
            base.finish("lose");
            return;
          }
          const value = item.kind === "gem" ? 50 : 5 * multiplier();
          base.score += value;
          ctx.audio.play("pickup", item.kind === "gem" ? 1 : Math.min(1, streak / 12));
          v.fx.push({ x: item.x, y: 0.7, z: 0, color: item.kind === "gem" ? 0x8ef0ff : 0xffd45e, count: item.kind === "gem" ? 16 : 8 });
          if (item.kind !== "gem") {
            caught += 1;
            streak += 1;
            if (streak % 6 === 0) base.say(`连击 ×${streak}`, 0.8);
          } else {
            base.say("宝石 +50", 0.9);
          }
          continue;
        }
        if (item.y < -1.2) {
          v.items.splice(i, 1);
          if (item.kind === "coin") streak = 0;
        }
      }

      base.setFields([
        { label: "连击", value: `×${streak}` },
        { label: "倍率", value: `×${multiplier()}` },
        { label: "金币", value: `×${caught}` },
      ]);

      if (timeLeft <= 0) {
        base.setMeter(0);
        base.detail = `坚持满 60 秒 · 金币 ×${caught}`;
        base.finish("win");
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x101a33, 0x27406b);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 180, 50);

    const basket = new THREE.Group();
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 0.75, 0.75, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8a5a33, metalness: 0.35, roughness: 0.6, side: THREE.DoubleSide }),
    );
    bowl.position.y = 0.38;
    basket.add(bowl);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.07, 8, 24),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.5 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.72;
    basket.add(rim);
    root.add(basket);

    const ground = box(30, 0.4, 14, 0x223354, { metalness: 0.2 });
    ground.position.set(0, -0.6, -3);
    root.add(ground);

    const meshes = new Map<number, THREE.Mesh>();
    const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 20);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd45e, emissive: 0xffb020, emissiveIntensity: 0.55, metalness: 0.65, roughness: 0.25 });
    const bombGeo = ball(0.42, 0).geometry as THREE.SphereGeometry;
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x333a4d, emissive: 0xff3b30, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.4 });
    const gemGeo = new THREE.OctahedronGeometry(0.48, 0);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x38e1ff, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.2 });
    const particles = new Particles(ctx.scene, 70);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      basket.position.set(v.basketX, 0, 0);
      basket.rotation.z = clamp((v.basketX - (basket.userData.px ?? v.basketX)) * -2, -0.3, 0.3);
      basket.userData.px = v.basketX;

      const seen = new Set<number>();
      for (const item of v.items) {
        seen.add(item.id);
        let mesh = meshes.get(item.id);
        if (!mesh) {
          if (item.kind === "coin") mesh = new THREE.Mesh(coinGeo, coinMat);
          else if (item.kind === "bomb") mesh = new THREE.Mesh(bombGeo, bombMat);
          else mesh = new THREE.Mesh(gemGeo, gemMat);
          meshes.set(item.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(item.x, item.y, 0);
        mesh.rotation.y += dt * (item.kind === "gem" ? 3 : 5);
        if (item.kind === "coin") mesh.rotation.x = Math.PI / 2;
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

      ctx.camera.position.set(0, 8.5 + Math.sin(time * 0.4) * 0.3, 12.5);
      ctx.camera.lookAt(0, 2.4, 0);
    };

    return {
      paint,
      onDispose: () => {
        coinGeo.dispose();
        coinMat.dispose();
        bombGeo.dispose();
        bombMat.dispose();
        gemGeo.dispose();
        gemMat.dispose();
        for (const mesh of meshes.values()) mesh.geometry.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g11-coin-storm",
  no: 11,
  name: "金币雨",
  tagline: "60 秒金币雨，接得越稳倍率越高。",
  category: "休闲",
  controls: "← → / A D / 左右拖动",
  hint: "金币 ×5 起步 · 连击提高倍率 · 炸弹一触即炸",
  accent: "#f59e0b",
  createLogic,
  createStage,
};

export default def;
