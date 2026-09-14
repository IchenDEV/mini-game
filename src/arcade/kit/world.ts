import * as THREE from "three";
import type { GameLogic, GameStage, InputState, StageContext } from "./types";

export interface StageExt extends GameStage {
  root: THREE.Object3D;
}

/** Standard three-point-ish lighting used across the arcade. */
export function addLights(scene: THREE.Scene, accent: number): void {
  scene.add(new THREE.AmbientLight(0x8ea2c0, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(6, 12, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent, 1.1);
  rim.position.set(-8, 6, -10);
  scene.add(rim);
  scene.fog = new THREE.Fog(0x070b14, 30, 90);
}

export function setBackdrop(scene: THREE.Scene, top: number, bottom: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${top.toString(16).padStart(6, "0")}`);
    grad.addColorStop(1, `#${bottom.toString(16).padStart(6, "0")}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

export function starfield(scene: THREE.Scene, count = 260, spread = 70): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = Math.random() * spread * 0.7 - spread * 0.15;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xbcd2ff,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

export function groundGrid(
  scene: THREE.Scene,
  size = 60,
  divisions = 30,
  color = 0x1d2b45,
): THREE.GridHelper {
  const grid = new THREE.GridHelper(size, divisions, color, color);
  const mat = grid.material as THREE.Material;
  mat.transparent = true;
  mat.opacity = 0.5;
  scene.add(grid);
  return grid;
}

export function box(
  w: number,
  h: number,
  d: number,
  color: number,
  opts: { emissive?: number; roughness?: number; metalness?: number; opacity?: number } = {},
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.55 : 0,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.25,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

export function ball(
  radius: number,
  color: number,
  emissive = 0x000000,
  segments = 24,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, segments * 0.75 | 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissive ? 0.7 : 0,
      roughness: 0.35,
      metalness: 0.3,
    }),
  );
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 20,
): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
}

/**
 * Lightweight pooled particle bursts for pickups/explosions. Each stage
 * owns one; update(dt) animates and recycles.
 */
export class Particles {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh[] = [];
  private readonly live: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }[] = [];
  private readonly geometry = new THREE.SphereGeometry(0.09, 8, 6);

  constructor(private readonly scene: THREE.Scene, poolSize = 90) {
    this.group.visible = false;
    scene.add(this.group);
    for (let i = 0; i < poolSize; i += 1) {
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push(mesh);
    }
  }

  burst(x: number, y: number, z: number, color: number, count = 12, speed = 4): void {
    this.group.visible = true;
    for (let i = 0; i < count; i += 1) {
      const mesh = this.pool.pop();
      if (!mesh) return;
      mesh.visible = true;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0.7 + Math.random() * 0.9);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      const angle = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.8;
      const mag = speed * (0.5 + Math.random() * 0.7);
      this.live.push({
        mesh,
        vx: Math.cos(angle) * mag,
        vy: up * mag,
        vz: Math.sin(angle) * mag,
        life: 0.55 + Math.random() * 0.3,
        maxLife: 0.85,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.live.splice(i, 1);
        this.pool.push(p.mesh);
        continue;
      }
      p.vy -= 9.5 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
    }
    if (this.live.length === 0) this.group.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const mesh of [...this.pool, ...this.live.map((l) => l.mesh)]) {
      (mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.group);
  }
}

/** Simple camera shake, used on hits. */
export class Shaker {
  private t = 0;
  private strength = 0;
  trigger(strength = 0.35): void {
    this.strength = strength;
    this.t = 0.32;
  }
  update(dt: number, camera: THREE.Camera, base: THREE.Vector3): void {
    if (this.t > 0) {
      this.t -= dt;
      const k = Math.max(0, this.t / 0.32) * this.strength;
      camera.position.set(
        base.x + (Math.random() - 0.5) * k,
        base.y + (Math.random() - 0.5) * k,
        base.z + (Math.random() - 0.5) * k,
      );
    } else {
      camera.position.copy(base);
    }
  }
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

export interface StageResult {
  stage: GameStage;
  root: THREE.Group;
}

/**
 * Common stage harness: builds a root group, wires particles, and exposes
 * a per-frame paint callback that receives input + logic for syncing.
 */
export function createStageShell(
  ctx: StageContext,
  setup: (root: THREE.Group) => {
    paint: (
      dt: number,
      time: number,
      input: InputState,
      logic: GameLogic,
    ) => void;
    onDispose?: () => void;
  },
): GameStage {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const particles = new Particles(ctx.scene);
  let time = 0;
  const built = setup(root);
  return {
    update(dt, input, logic) {
      time += dt;
      particles.update(dt);
      built.paint(dt, time, input, logic);
    },
    resize() {
      // Stages using the engine-managed camera need no extra resize work.
    },
    dispose() {
      built.onDispose?.();
      particles.dispose();
      disposeTree(root);
      ctx.scene.remove(root);
    },
  };
}
