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

export const CITY_HP = 5;
export const BLAST_R = 1.7;

export interface Meteor {
  id: number;
  x: number;
  y: number;
  tx: number;
  vy: number;
}

export interface Rocket {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export interface Blast {
  x: number;
  y: number;
  t: number;
}

export interface GView {
  aimX: number;
  aimY: number;
  meteors: Meteor[];
  rockets: Rocket[];
  blasts: Blast[];
  hp: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "点击天空拦截陨石 · 爆炸会波及一片" });
  const rng = makeRng(10191);
  const v: GView = {
    aimX: 0,
    aimY: 4,
    meteors: [],
    rockets: [],
    blasts: [],
    hp: CITY_HP,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let meteorTimer = 0.6;
  let intercepted = 0;
  let leaks = 0;
  let rocketTimer = 0;

  const reset = () => {
    base.clearHud();
    v.aimX = 0;
    v.aimY = 4;
    v.meteors = [];
    v.rockets = [];
    v.blasts = [];
    v.hp = CITY_HP;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    meteorTimer = 0.6;
    intercepted = 0;
    leaks = 0;
    rocketTimer = 0;
  };
  reset();

  const explode = (x: number, y: number) => {
    v.blasts.push({ x, y, t: 0.5 });
    ctx.audio.play("power");
    for (let i = v.meteors.length - 1; i >= 0; i -= 1) {
      const m = v.meteors[i];
      if (Math.hypot(m.x - x, m.y - y) < BLAST_R) {
        v.meteors.splice(i, 1);
        intercepted += 1;
        base.score += 15;
        v.fx.push({ x: m.x, y: m.y, z: 0, color: 0xffc46b, count: 10 });
      }
    }
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

      if (input.pointerActive) {
        v.aimX = clamp(input.pointerX * 7, -7, 7);
        v.aimY = clamp(input.pointerY * 5 + 1.5, 0.6, 7.2);
      }
      rocketTimer -= dt;
      if (input.actionPressed && rocketTimer <= 0) {
        rocketTimer = 0.35;
        v.rockets.push({ id: nextId++, x: 0, y: 0.9, tx: v.aimX, ty: Math.max(0.8, v.aimY) });
        ctx.audio.play("shoot");
      }

      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        meteorTimer = Math.max(0.3, 0.95 - base.elapsed * 0.01);
        const x = -6.5 + rng() * 13;
        v.meteors.push({ id: nextId++, x, y: 11, tx: -6 + rng() * 12, vy: 1.7 + rng() * 1.2 + base.elapsed * 0.03 });
      }

      for (let i = v.rockets.length - 1; i >= 0; i -= 1) {
        const r = v.rockets[i];
        const dx = r.tx - r.x;
        const dy = r.ty - r.y;
        const d = Math.hypot(dx, dy);
        const stepLen = 20 * dt;
        if (d <= stepLen) {
          v.rockets.splice(i, 1);
          explode(r.tx, r.ty);
        } else {
          r.x += (dx / d) * stepLen;
          r.y += (dy / d) * stepLen;
        }
      }

      for (const b of v.blasts) b.t -= dt;
      v.blasts = v.blasts.filter((b) => b.t > 0);

      for (let i = v.meteors.length - 1; i >= 0; i -= 1) {
        const m = v.meteors[i];
        const drift = (m.tx - m.x) * 0.25;
        m.x += clamp(drift, -0.8, 0.8) * dt + 0;
        m.y -= m.vy * dt;
        let killed = false;
        for (const b of v.blasts) {
          if (Math.hypot(m.x - b.x, m.y - b.y) < BLAST_R) {
            v.meteors.splice(i, 1);
            intercepted += 1;
            base.score += 15;
            v.fx.push({ x: m.x, y: m.y, z: 0, color: 0xffc46b, count: 10 });
            killed = true;
            break;
          }
        }
        if (killed) continue;
        if (m.y <= 0.5) {
          v.meteors.splice(i, 1);
          leaks += 1;
          v.hp -= 1;
          ctx.audio.play("hit");
          v.fx.push({ x: m.x, y: 0.5, z: 0, color: 0xff5d5d, count: 16 });
          if (v.hp <= 0) {
            v.alive = false;
            base.detail = `拦截 ${intercepted} 颗 · 漏过 ${leaks} 颗`;
            base.finish("lose");
            return;
          }
        }
      }

      base.setFields([
        { label: "拦截", value: String(intercepted) },
        { label: "城市", value: "▮".repeat(Math.max(0, v.hp)) + "▯".repeat(CITY_HP - Math.max(0, v.hp)) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x08061a, 0x1d1440);
    addLights(ctx.scene, ctx.accent);
    starfield(ctx.scene, 240, 60);

    const city = box(14, 0.9, 3, 0x232248, { metalness: 0.4 });
    city.position.set(0, -0.05, 0);
    root.add(city);
    for (let i = 0; i < 7; i += 1) {
      const h = 0.8 + ((i * 37) % 5) * 0.42;
      const tower = box(1, h, 1.6, 0x2f2d5c, { emissive: ctx.accent });
      tower.position.set(-5.6 + i * 1.85, h / 2, 0);
      root.add(tower);
    }
    const silo = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1, 6),
      new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 }),
    );
    silo.position.set(0, 1.1, 0);
    root.add(silo);

    const meteorGeo = new THREE.IcosahedronGeometry(0.4, 0);
    const meteorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a49, emissive: 0xff5a2a, emissiveIntensity: 0.5, roughness: 0.85, flatShading: true });
    const rocketGeo = new THREE.ConeGeometry(0.12, 0.5, 5);
    const rocketMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
    const meshes = new Map<number, THREE.Mesh>();
    const blastMeshes: { mesh: THREE.Mesh; t: number }[] = [];
    const blastGeo = new THREE.SphereGeometry(1, 18, 14);
    const blastMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8 });
    const particles = new Particles(ctx.scene, 80);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const seen = new Set<number>();
      for (const m of v.meteors) {
        seen.add(m.id);
        let mesh = meshes.get(m.id);
        if (!mesh) {
          mesh = new THREE.Mesh(meteorGeo, meteorMat);
          meshes.set(m.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(m.x, m.y, 0);
        mesh.rotation.x += dt * 2;
        mesh.rotation.y += dt * 1.3;
      }
      for (const r of v.rockets) {
        seen.add(r.id);
        let mesh = meshes.get(r.id);
        if (!mesh) {
          mesh = new THREE.Mesh(rocketGeo, rocketMat);
          meshes.set(r.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(r.x, r.y, 0);
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          meshes.delete(id);
        }
      }

      for (const blast of [...blastMeshes]) {
        blast.t -= dt;
        if (blast.t <= 0) {
          root.remove(blast.mesh);
          blastMeshes.splice(blastMeshes.indexOf(blast), 1);
        }
      }
      for (const b of v.blasts) {
        if (blastMeshes.some((bm) => bm.mesh.position.x === b.x && bm.mesh.position.y === b.y)) continue;
        const mesh = new THREE.Mesh(blastGeo, blastMat.clone());
        mesh.position.set(b.x, b.y, 0);
        root.add(mesh);
        blastMeshes.push({ mesh, t: 0.5 });
      }
      for (const bm of blastMeshes) {
        const k = 1 - bm.t / 0.5;
        bm.mesh.scale.setScalar(0.4 + k * BLAST_R);
        (bm.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 5.6 + Math.sin(time * 0.3) * 0.25, 12.6);
      ctx.camera.lookAt(0, 4.2, 0);
    };

    return {
      paint,
      onDispose: () => {
        meteorGeo.dispose();
        meteorMat.dispose();
        rocketGeo.dispose();
        rocketMat.dispose();
        blastGeo.dispose();
        blastMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g16-meteor-watch",
  no: 16,
  name: "流星守望",
  tagline: "点击夜空发射拦截弹，守住城市耐久。",
  category: "射击",
  controls: "移动瞄准 · 空格 / 点击 发射",
  hint: "爆炸有半径 · 连环拦截更划算 · 城市耐久 5 点",
  accent: "#fca5a5",
  createLogic,
  createStage,
};

export default def;
