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
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

const SLAB_H = 0.55;
const START_W = 3.2;
const START_D = 3.2;
const RANGE = 4.6;export interface Slab {
  x: number;
  z: number;
  w: number;
  d: number;
  hue: number;
}

export interface GView {
  layers: Slab[];
  current: Slab | null;
  phase: number;
  speed: number;
  fx: FxEvent[];
  axis: "x" | "z";
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "看准时机放下 · 完美对齐会回补宽度" });
  const v: GView = { layers: [], current: null, phase: 0, speed: 2, fx: [], axis: "x" };
  let perfects = 0;

  const reset = () => {
    base.clearHud();
    perfects = 0;
    v.layers = [{ x: 0, z: 0, w: START_W, d: START_D, hue: 190 }];
    v.current = { x: -RANGE, z: 0, w: START_W, d: START_D, hue: 208 };
    v.phase = -Math.PI / 2;
    v.speed = 2;
    v.fx = [];
    v.axis = "x";
  };
  reset();

  const place = () => {
    const cur = v.current;
    const prev = v.layers[v.layers.length - 1];
    if (!cur || !prev) return;
    const axis = v.axis;
    const curMin = axis === "x" ? cur.x - cur.w / 2 : cur.z - cur.d / 2;
    const curMax = axis === "x" ? cur.x + cur.w / 2 : cur.z + cur.d / 2;
    const prevMin = axis === "x" ? prev.x - prev.w / 2 : prev.z - prev.d / 2;
    const prevMax = axis === "x" ? prev.x + prev.w / 2 : prev.z + prev.d / 2;
    const overlap = Math.min(curMax, prevMax) - Math.max(curMin, prevMin);
    if (overlap <= 0.001) {
      v.fx.push({ x: cur.x, y: v.layers.length * SLAB_H, z: cur.z, color: 0xff6b7a, count: 18 });
      base.detail = `堆到第 ${v.layers.length - 1} 层 · 完美 ×${perfects}`;
      base.finish("lose");
      v.current = null;
      return;
    }
    const perfect = Math.abs(
      axis === "x" ? cur.x - prev.x : cur.z - prev.z,
    ) < 0.14;
    let w = cur.w;
    let d = cur.d;
    if (perfect) {
      perfects += 1;
      base.say("完美 +25", 0.8);
      ctx.audio.play("pickup");
      if (axis === "x") w = Math.min(START_W, w + 0.4);
      else d = Math.min(START_D, d + 0.4);
    } else {
      ctx.audio.play("swap");
    }
    const center = (Math.max(curMin, prevMin) + Math.min(curMax, prevMax)) / 2;
    const sizeOnAxis = perfect ? (axis === "x" ? w : d) : overlap;
    const placed: Slab = {
      x: axis === "x" ? center : prev.x,
      z: axis === "z" ? center : prev.z,
      w: axis === "x" ? sizeOnAxis : w,
      d: axis === "z" ? sizeOnAxis : d,
      hue: (v.layers.length * 16 + 190) % 360,
    };
    v.layers.push(placed);
    base.score = (v.layers.length - 1) * 10 + perfects * 25;
    base.setFields([
      { label: "层数", value: String(v.layers.length - 1) },
      { label: "完美", value: `×${perfects}` },
    ]);
    v.axis = axis === "x" ? "z" : "x";
    v.phase = -Math.PI / 2;
    v.speed = Math.min(4.4, 2 + (v.layers.length - 1) * 0.05);
    v.current = {
      x: v.axis === "x" ? placed.x - RANGE : placed.x,
      z: v.axis === "z" ? placed.z - RANGE : placed.z,
      w: placed.w,
      d: placed.d,
      hue: placed.hue + 16,
    };
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
      if (!v.current) return;
      // Apply the tap against the position the player actually saw last frame.
      if (input.actionPressed) place();
      if (!v.current) return;
      v.phase += dt * v.speed;
      const prev = v.layers[v.layers.length - 1];
      const offset = Math.sin(v.phase) * RANGE;
      if (v.axis === "x") v.current.x = prev.x + offset;
      else v.current.z = prev.z + offset;
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x120b26, 0x241a4e);
    addLights(ctx.scene, ctx.accent);

    const slabGroup = new THREE.Group();
    root.add(slabGroup);
    const slabMeshes: THREE.Mesh[] = [];
    const particles = new Particles(ctx.scene, 60);
    let lastLayerCount = -1;
    let currentMesh: THREE.Mesh | null = null;

    const makeSlabMesh = (hue: number) =>
      new THREE.Mesh(
        new THREE.BoxGeometry(1, SLAB_H, 1),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(hue / 360, 0.75, 0.6),
          emissive: new THREE.Color().setHSL(hue / 360, 0.85, 0.25),
          emissiveIntensity: 0.5,
          metalness: 0.35,
          roughness: 0.35,
        }),
      );

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;

      if (v.layers.length !== lastLayerCount) {
        for (const mesh of slabMeshes) {
          slabGroup.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
        slabMeshes.length = 0;
        v.layers.forEach((slab, index) => {
          const mesh = makeSlabMesh(slab.hue);
          mesh.position.set(slab.x, index * SLAB_H + SLAB_H / 2, slab.z);
          mesh.scale.set(slab.w, 1, slab.d);
          slabGroup.add(mesh);
          slabMeshes.push(mesh);
        });
        lastLayerCount = v.layers.length;
      }

      if (v.current) {
        if (!currentMesh) {
          currentMesh = makeSlabMesh(v.current.hue);
          root.add(currentMesh);
        }
        const hue = ((v.current.hue % 360) + 360) % 360;
        (currentMesh.material as THREE.MeshStandardMaterial).color.setHSL(hue / 360, 0.8, 0.62);
        (currentMesh.material as THREE.MeshStandardMaterial).emissive.setHSL(hue / 360, 0.85, 0.3);
        const bobIndex = v.layers.length;
        currentMesh.position.set(
          v.current.x,
          bobIndex * SLAB_H + SLAB_H / 2 + Math.sin(time * 3) * 0.03,
          v.current.z,
        );
        currentMesh.scale.set(v.current.w, 1, v.current.d);
      } else if (currentMesh) {
        root.remove(currentMesh);
        currentMesh = null;
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 12);
      v.fx.length = 0;
      particles.update(dt);

      const towerH = v.layers.length * SLAB_H;
      const camY = Math.max(4.4, towerH + 3.6);
      ctx.camera.position.set(
        Math.cos(time * 0.12) * 7.5,
        camY,
        Math.sin(time * 0.12) * 7.5 + 1.5,
      );
      ctx.camera.lookAt(0, towerH - SLAB_H * 1.5, 0);
    };

    return {
      paint,
      onDispose: () => {
        for (const mesh of slabMeshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
        currentMesh?.geometry.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g02-neon-stack",
  no: 2,
  name: "霓虹叠塔",
  tagline: "一层层往上叠，切得越准塔越高。",
  category: "休闲",
  controls: "空格 / 回车 / 点击 放下",
  hint: "方块来回滑动 · 对齐放下 · 完美 +25 并回补宽度",
  accent: "#c084fc",
  createLogic,
  createStage,
};

export default def;
