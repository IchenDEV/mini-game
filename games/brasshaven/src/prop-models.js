import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { REGIONS } from "./game-state.js";

const PI = Math.PI;
const PALETTES = {
  brasshaven: [0xd8aa53, 0x38585a, 0x90b9a0],
  verdant: [0xc6a05c, 0x46795a, 0xb5ce78],
  tideworks: [0xbca073, 0x287984, 0x8dc8cc],
  foundry: [0xb57c4f, 0x554743, 0xffa044],
  observatory: [0xc6b079, 0x615b82, 0xacc1e4],
  skyport: [0xc89b58, 0x3c6275, 0xc4dfdd],
};

function prop(region, id, kind) {
  const config = typeof region === "string"
    ? REGIONS.find((entry) => entry.id === region)
    : region;
  if (!config || !Object.hasOwn(PALETTES, config.id))
    throw new RangeError("Unknown prop region");
  if (!Number.isInteger(id) || id < 0 || id > 2)
    throw new RangeError("Prop id must be 0, 1, or 2");
  const root = new THREE.Group();
  root.name = `${config.id} ${kind} ${id + 1}`;
  const [metal, enamel, accent] = PALETTES[config.id];
  const colors = { metal, enamel, accent, dark: 0x293a3b, ivory: 0xe1d5b5, lamp: 0x7c9290 };
  // Per-prop ownership: changing/disposal of a station lamp cannot affect siblings.
  const materials = new Map();
  const material = (name) => {
    if (!materials.has(name)) {
      const glowing = name === "lamp" || (name === "accent" && config.id === "foundry");
      materials.set(name, new THREE.MeshStandardMaterial({
        name: `${config.id} ${name}`,
        color: colors[name],
        metalness: name === "metal" ? 0.72 : name === "dark" ? 0.45 : 0.12,
        roughness: name === "metal" ? 0.36 : 0.58,
        emissive: glowing ? (name === "lamp" ? 0x173c39 : 0xe55b19) : 0,
        emissiveIntensity: glowing ? 0.45 : 0,
      }));
    }
    return materials.get(name);
  };
  return { root, config, material };
}

// Bake primitives into one mesh per material per independently moving assembly.
// All primitives here have indexed position/normal/uv attributes.
function assembly(group, material) {
  const parts = new Map();
  const add = (name, geometry, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    geometry.translate(...position);
    if (!parts.has(name)) parts.set(name, []);
    parts.get(name).push(geometry);
  };
  const box = (name, size, position, rotation) => add(name, new THREE.BoxGeometry(...size), position, rotation);
  const cyl = (name, top, bottom, height, position, rotation) =>
    add(name, new THREE.CylinderGeometry(top, bottom, height, 16), position, rotation);
  const ring = (name, radius, tube, position, rotation) =>
    add(name, new THREE.TorusGeometry(radius, tube, 6, 32), position, rotation);
  const orb = (name, size, position, rotation) =>
    add(name, new THREE.SphereGeometry(1, 16, 10).scale(...size), position, rotation);
  const rod = (name, from, to, radius = 0.045) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    add(name, geometry, a.add(b).multiplyScalar(0.5).toArray());
  };
  return {
    add, box, cyl, ring, orb, rod,
    finish() {
      for (const [name, geometries] of parts) {
        const merged = mergeGeometries(geometries, false);
        geometries.forEach((geometry) => geometry.dispose());
        const mesh = new THREE.Mesh(merged, material(name));
        mesh.name = `${group.name} / ${name}`;
        mesh.castShadow = mesh.receiveShadow = true;
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        group.add(mesh);
      }
      parts.clear();
    },
  };
}

function wheel(b, radius, center, teeth = 12) {
  b.ring("metal", radius * 0.78, radius * 0.13, center);
  b.cyl("dark", radius * 0.23, radius * 0.23, 0.23, center, [PI / 2, 0, 0]);
  for (let i = 0; i < teeth; i++) {
    const angle = i * 2 * PI / teeth;
    b.box("metal", [radius * 0.25, radius * 0.26, 0.19],
      [center[0] + Math.sin(angle) * radius * 0.96, center[1] + Math.cos(angle) * radius * 0.96, center[2]], [0, 0, -angle]);
  }
  for (let i = 0; i < 3; i++)
    b.box("metal", [radius * 1.38, 0.075, 0.12], center, [0, 0, i * PI / 3]);
}

function plate(b, id, y, z) {
  b.box("metal", [0.34, 0.21, 0.045], [0, y, z]);
  for (let i = 0; i <= id; i++)
    b.box("dark", [0.027, 0.12, 0.018], [(i - id / 2) * 0.075, y, z + 0.029]);
}

/** Region config (or region ID), zero-based item ID 0..2 → fresh THREE.Group.
 * Root rests at y=0. userData.spinner is a child Group at (0,1.35,0), with
 * geometry centered on its local origin; animate its Y rotation / Y position.
 * Opaque, shadow-casting geometry; no picking metadata or update loop installed.
 * All geometry/materials belong to this prop; dispose unique resources on removal.
 */
export function createCollectible(region, id) {
  const { root, config, material } = prop(region, id, "collectible");
  const base = assembly(root, material);
  base.cyl("dark", 0.27, 0.36, 0.12, [0, 0.06, 0]);
  base.cyl("metal", 0.29, 0.29, 0.04, [0, 0.14, 0]);
  plate(base, id, 0.115, 0.31);
  base.finish();
  const spinner = new THREE.Group();
  spinner.name = `${config.id} core`;
  spinner.position.y = 1.35;
  root.add(spinner);
  root.userData.spinner = spinner;
  const b = assembly(spinner, material);
  switch (config.id) {
    case "brasshaven":
      wheel(b, 0.53, [0, 0, 0], 12 + id * 2);
      b.cyl("enamel", 0.085, 0.085, 0.28, [0, 0, 0], [PI / 2, 0, 0]);
      break;
    case "verdant":
      b.orb("accent", [0.28, 0.47, 0.28]);
      for (let i = 0; i < 5 + id; i++) {
        const angle = i * 2 * PI / (5 + id);
        b.orb("enamel", [0.13, 0.43, 0.09], [Math.sin(angle) * 0.27, 0, Math.cos(angle) * 0.27], [0, angle, 0]);
      }
      for (const y of [-0.48, 0.48]) b.cyl("metal", 0.13, 0.13, 0.1, [0, y, 0]);
      b.ring("metal", 0.31, 0.035, [0, 0, 0], [PI / 2, 0, 0]);
      break;
    case "tideworks":
      b.cyl("metal", 0.13, 0.13, 0.42, [0, 0, 0], [PI / 2, 0, 0]);
      b.orb("accent", [0.18, 0.18, 0.24]);
      b.ring("metal", 0.49, 0.03);
      for (let i = 0; i < 6 + id; i++) {
        const angle = i * 2 * PI / (6 + id);
        b.box("enamel", [0.24, 0.39, 0.075], [Math.sin(angle) * 0.32, Math.cos(angle) * 0.32, 0], [0.42, 0.18, -angle + 0.45]);
      }
      break;
    case "foundry":
      b.cyl("dark", 0.33, 0.24, 0.64);
      b.cyl("accent", 0.265, 0.265, 0.045, [0, 0.325, 0]);
      b.ring("metal", 0.31, 0.065, [0, 0.32, 0], [PI / 2, 0, 0]);
      b.cyl("metal", 0.29, 0.29, 0.1, [0, -0.34, 0]);
      for (const x of [-0.4, 0.4]) {
        b.box("metal", [0.13, 0.18, 0.2], [x, 0.13, 0]);
        b.rod("dark", [x, -0.2, 0], [x, 0.36, 0], 0.06);
      }
      for (let i = 0; i < 3 + id; i++) {
        const angle = i * 2 * PI / (3 + id);
        b.box("accent", [0.085, 0.3, 0.035], [Math.sin(angle) * 0.3, 0, Math.cos(angle) * 0.3], [0, angle, 0]);
      }
      break;
    case "observatory":
      b.ring("metal", 0.51, 0.04);
      b.ring("metal", 0.46, 0.035, [0, 0, 0], [0.55, 0.75, 0]);
      b.ring("enamel", 0.36, 0.065, [0, 0, 0], [PI / 2, 0, 0]);
      // Solid polished lens: no transparent shell or sorting dependency.
      b.orb("accent", [0.27, 0.27, 0.1]);
      b.ring("metal", 0.28, 0.04);
      for (let i = 0; i < 4 + id; i++) {
        const angle = i * 2 * PI / (4 + id);
        b.orb("ivory", [0.055, 0.055, 0.055], [Math.sin(angle) * 0.51, Math.cos(angle) * 0.51, 0]);
      }
      break;
    case "skyport": {
      b.cyl("ivory", 0.15, 0.15, 0.78);
      const turns = 5 + id;
      const points = Array.from({ length: turns * 20 + 1 }, (_, i) => {
        const t = i / (turns * 20), angle = t * turns * 2 * PI;
        return new THREE.Vector3(Math.cos(angle) * 0.28, (t - 0.5) * 0.65, Math.sin(angle) * 0.28);
      });
      // A single continuous winding, not a pile of disconnected rings.
      b.add("metal", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 24, 0.055, 6, false));
      for (const y of [-0.46, 0.46]) {
        b.cyl("enamel", 0.34, 0.34, 0.12, [0, y, 0]);
        b.cyl("metal", 0.085, 0.085, 0.12, [0, y + Math.sign(y) * 0.09, 0]);
      }
      break;
    }
  }
  b.finish();
  // Keep the bobbed top below 1.95 and broaden narrow cores for distant picking.
  const scales = {
    brasshaven: [1, 0.82, 1], verdant: [1.45, 0.92, 1.45],
    tideworks: [1, 0.9, 1], foundry: [1.15, 1, 1.15],
    observatory: [1, 0.86, 1], skyport: [1.5, 0.8, 1.5],
  };
  spinner.scale.set(...scales[config.id]);
  return root;
}

function gauge(b, root, material, x, y, z, radius = 0.25) {
  b.cyl("ivory", radius, radius, 0.09, [x, y, z], [PI / 2, 0, 0]);
  b.ring("metal", radius, 0.04, [x, y, z + 0.045]);
  for (let i = -2; i <= 2; i++) {
    const angle = i * PI / 4;
    b.box("dark", [0.025, 0.06, 0.015], [x + Math.sin(angle) * radius * 0.76, y + Math.cos(angle) * radius * 0.76, z + 0.054], [0, 0, -angle]);
  }
  const needle = new THREE.Group();
  needle.name = "Gauge needle pivot";
  needle.position.set(x, y, z + 0.074);
  root.add(needle);
  const n = assembly(needle, material);
  n.box("dark", [0.033, radius * 0.85, 0.025], [0, radius * 0.3, 0]);
  n.cyl("metal", 0.043, 0.043, 0.035, [0, 0, 0.01], [PI / 2, 0, 0]);
  n.finish();
  root.userData.needle = needle;
}

/** Same inputs/ownership as createCollectible. Front is +Z, foot at y=0.
 * userData.needle: Group pivot, rotate local Z; userData.lamp: independent
 * MeshStandardMaterial (color/emissive/emissiveIntensity). Name uses labels[id].
 * Static parts are merged by material; only the gauge needle remains separate.
 */
export function createRegulator(region, id) {
  const { root, config, material } = prop(region, id, "regulator");
  root.name = `${config.id} ${config.labels[id]}`;
  const b = assembly(root, material);
  let lamp = [0.42, 1.5, 0.1];
  switch (config.id) {
    case "brasshaven":
      b.cyl("ivory", 0.49, 0.61, 0.16, [0, 0.08, 0]);
      b.cyl("enamel", 0.25, 0.34, 0.92, [0, 0.62, 0]);
      b.cyl("metal", 0.33, 0.33, 0.12, [0, 1.1, 0]);
      b.cyl("dark", 0.12, 0.12, 1.02, [0, 0.55, 0], [0, 0, PI / 2]);
      for (const x of [-0.51, 0.51]) b.cyl("metal", 0.19, 0.19, 0.09, [x, 0.55, 0], [0, 0, PI / 2]);
      wheel(b, 0.34 + id * 0.025, [0, 1.49, 0.02], 8);
      b.rod("metal", [0, 1.08, 0], [0, 1.59, 0]);
      gauge(b, root, material, 0, 1.13, 0.31, 0.23);
      lamp = [0.4, 1.21, 0];
      b.rod("dark", [0.2, 0.95, 0], lamp);
      plate(b, id, 0.38, 0.33);
      break;
    case "verdant":
      b.cyl("ivory", 0.5, 0.59, 0.2, [0, 0.1, 0]);
      b.cyl("enamel", 0.38, 0.29, 0.44, [0, 0.42, 0]);
      b.cyl("dark", 0.34, 0.34, 0.04, [0, 0.65, 0]);
      b.rod("metal", [0, 0.55, 0], [0, 1.79, 0], 0.075);
      for (const side of [-1, 1]) {
        b.rod("metal", [0, 1.02, 0], [side * 0.43, 1.39, 0], 0.04);
        b.orb("enamel", [0.13, 0.34, 0.065], [side * 0.29, 1.3, 0], [0, 0, -side * 0.72]);
        b.ring("metal", 0.14, 0.035, [side * 0.43, 0.77, 0.08]);
        b.rod("metal", [side * 0.28, 0.45, 0], [side * 0.43, 0.77, 0.08]);
      }
      for (let i = 0; i <= id; i++) b.orb("accent", [0.075, 0.13, 0.06], [(i - id / 2) * 0.15, 1.7, 0.02]);
      gauge(b, root, material, 0, 1.09, 0.19, 0.2);
      lamp = [0, 1.79, 0];
      plate(b, id, 0.43, 0.37);
      break;
    case "tideworks":
      b.box("ivory", [1.16, 0.16, 0.91], [0, 0.08, 0]);
      b.box("enamel", [0.75, 0.78, 0.56], [0, 0.55, 0]);
      b.cyl("enamel", 0.3, 0.3, 0.88, [0, 0.71, 0.02], [0, 0, PI / 2]);
      for (const x of [-0.47, 0.47]) {
        b.cyl("metal", 0.32, 0.32, 0.09, [x, 0.71, 0.02], [0, 0, PI / 2]);
        b.rod("dark", [x, 0.75, 0], [x, 1.39, -0.1 - id * 0.06], 0.055);
        b.box("metal", [0.21, 0.09, 0.14], [x, 1.39, -0.1 - id * 0.06]);
      }
      b.box("enamel", [0.52, 0.25, 0.3], [0, 1.05, 0]);
      gauge(b, root, material, 0, 1.24, 0.19, 0.25);
      lamp = [0, 1.64, 0];
      b.rod("metal", [0, 1.23, 0], lamp, 0.05);
      plate(b, id, 0.41, 0.3);
      break;
    case "foundry":
      b.box("dark", [1.16, 0.18, 0.94], [0, 0.09, 0]);
      b.box("enamel", [0.91, 1.11, 0.65], [0, 0.735, 0]);
      b.box("metal", [1.01, 0.11, 0.74], [0, 1.34, 0]);
      b.box("dark", [0.58, 0.38, 0.06], [0, 0.55, 0.35]);
      for (let i = -2; i <= 2; i++) b.box("accent", [0.045, 0.23, 0.02], [i * 0.095, 0.55, 0.39]);
      for (const x of [-0.38, 0.38]) b.box("metal", [0.08, 0.84, 0.08], [x, 0.73, 0.34]);
      b.rod("dark", [-0.23, 1.4, 0], [-0.23, 1.83, -id * 0.08], 0.065);
      b.box("metal", [0.36, 0.1, 0.15], [-0.23, 1.83, -id * 0.08]);
      gauge(b, root, material, 0, 1.04, 0.36, 0.19);
      lamp = [0.29, 1.53, 0];
      b.cyl("dark", 0.13, 0.13, 0.14, [0.29, 1.45, 0]);
      plate(b, id, 0.25, 0.36);
      break;
    case "observatory": {
      for (let i = 0; i < 3; i++) {
        const angle = i * 2 * PI / 3;
        const foot = [Math.sin(angle) * 0.5, 0.07, Math.cos(angle) * 0.5];
        b.cyl("dark", 0.12, 0.15, 0.14, foot);
        b.rod("metal", foot, [0, 1.08, 0], 0.065);
      }
      b.cyl("enamel", 0.23, 0.23, 0.2, [0, 1.05, 0]);
      b.ring("metal", 0.34, 0.06, [0, 1.43, 0]);
      const tilt = PI / 2 - 0.28 - id * 0.09;
      b.cyl("enamel", 0.23, 0.16, 1.03, [0, 1.43, 0], [tilt, 0, 0]);
      const end = [0, 1.43 + Math.cos(tilt) * 0.51, Math.sin(tilt) * 0.51];
      b.cyl("metal", 0.265, 0.265, 0.1, end, [tilt, 0, 0]);
      b.cyl("accent", 0.21, 0.21, 0.105, end, [tilt, 0, 0]);
      gauge(b, root, material, 0, 0.93, 0.24, 0.17);
      lamp = [0.4, 1.4, 0];
      b.rod("metal", [0, 1.15, 0], lamp);
      plate(b, id, 0.67, 0.28);
      b.rod("metal", [0, 0.91, 0], [0, 0.67, 0.26]);
      break;
    }
    case "skyport":
      b.box("ivory", [1.02, 0.16, 0.85], [0, 0.08, 0]);
      b.cyl("enamel", 0.22, 0.35, 0.89, [0, 0.605, 0]);
      b.box("metal", [1.05, 0.15, 0.53], [0, 1.04, 0]);
      b.box("enamel", [0.95, 0.66, 0.25], [0, 1.36, -0.03]);
      gauge(b, root, material, -0.12, 1.4, 0.12, 0.23);
      b.cyl("ivory", 0.115, 0.115, 0.07, [0.29, 1.42, 0.13], [PI / 2, 0, 0]);
      b.box("dark", [0.15, 0.03, 0.02], [0.29, 1.42, 0.18], [0, 0, id * 0.5]);
      for (const x of [-0.59, 0.59]) {
        b.rod("metal", [x * 0.65, 1.03, 0], [x, 1.21, 0.2], 0.045);
        b.rod("dark", [x, 1.21, 0.2], [x, 1.47, 0.2], 0.065);
      }
      lamp = [0, 1.79, -0.03];
      plate(b, id, 0.72, 0.3);
      break;
  }
  b.orb("lamp", [0.105, 0.105, 0.105], lamp);
  b.finish();
  root.userData.lamp = material("lamp");
  return root;
}
