import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Both vessels use the district assembly's baked primitive contract. Only the
// propeller pivots move; seams, windows, rigging and machinery merge by finish.
export function buildAirshipHull(ship) {
  const TAU = Math.PI * 2;
  const point = (t, a) => [
    8.2 * Math.cos(t),
    2.27 * Math.sin(t) * Math.cos(a),
    2.42 * Math.sin(t) * Math.sin(a),
  ];
  // The poles run along the keel so the low-poly fabric and metal ribs agree.
  const hull = new THREE.SphereGeometry(1, 16, 24);
  hull.rotateZ(-Math.PI / 2).scale(8.2, 2.25, 2.4);
  ship.put("trim", hull);
  // Broad cloth gores, with occasional repaired panels and narrow seam gaps.
  for (let row = 2; row < 22; row++)
    for (let panel = 0; panel < 16; panel++) {
      if ((panel + row * 3) % 7 !== 0) continue;
      const g = new THREE.SphereGeometry(
        1, 3, 2, panel * TAU / 16 + 0.008, TAU / 16 - 0.016,
        row * Math.PI / 24 + 0.005, Math.PI / 24 - 0.01,
      );
      g.rotateZ(-Math.PI / 2).scale(8.21, 2.26, 2.41);
      ship.put("stone", g);
    }
  for (let k = 2; k < 24; k += 2) {
    const t = k * Math.PI / 24;
    const g = new THREE.TorusGeometry(1, 0.014, 4, 16);
    g.scale(2.42 * Math.sin(t), 2.27 * Math.sin(t), 1);
    g.rotateY(Math.PI / 2);
    ship.put(k === 6 || k === 18 ? "brass" : "copper", g, 8.2 * Math.cos(t));
  }
  for (let j = 0; j < 16; j++) {
    const a = j * TAU / 16;
    for (let k = 1; k < 23; k++)
      ship.beam(j % 4 === 0 ? "brass" : "copper",
        point(k * Math.PI / 24, a), point((k + 1) * Math.PI / 24, a),
        j % 4 === 0 ? 0.029 : 0.013);
  }
  for (const x of [-5.8, 5.8]) {
    const f = Math.sqrt(1 - (x / 8.2) ** 2);
    const g = new THREE.CylinderGeometry(1, 1, 0.24, 16, 1, true);
    g.rotateZ(Math.PI / 2).scale(1, 2.29 * f, 2.44 * f);
    ship.put("accent", g, x);
    for (let j = 0; j < 16; j++) {
      const a = j * TAU / 16;
      ship.box("brass", x, Math.cos(a) * 2.32 * f,
        Math.sin(a) * 2.47 * f, 0.12, 0.07, 0.07);
    }
  }
  ship.cyl("copper", 7.94, 0, 0, 0.48, 0.34, "x");
  ship.cyl("brass", 8.17, 0, 0, 0.22, 0.34, "x");
  ship.cyl("iron", 8.42, 0, 0, 0.065, 0.26, "x");

  // A stepped boat-shaped keel, passenger cabin and projecting pilothouse.
  ship.box("roof", 0, -3.02, 0, 5.8, 0.86, 1.35);
  ship.box("wood", -0.1, -3.49, 0, 5.8, 0.15, 1.47);
  ship.box("copper", 0, -3.62, 0, 4.7, 0.18, 1.14);
  ship.box("iron", -0.1, -3.75, 0, 3.6, 0.12, 0.85);
  ship.box("brass", 0, -2.56, 0, 6.15, 0.12, 1.54);
  ship.box("roof", 2.85, -2.83, 0, 1.05, 1.1, 1.2);
  ship.box("accent", 2.85, -2.22, 0, 1.25, 0.12, 1.42);
  ship.box("glass", 3.39, -2.64, 0, 0.035, 0.52, 1.04);
  for (const z of [-0.52, 0, 0.52])
    ship.box("brass", 3.42, -2.64, z, 0.045, 0.58, 0.045);
  ship.box("brass", 3.42, -2.94, 0, 0.06, 0.06, 1.18);
  for (const z of [-0.69, 0.69]) {
    for (let i = 0; i < 10; i++) {
      const x = -2.55 + i * 0.47;
      ship.box("brass", x, -2.97, z, 0.37, 0.52, 0.055);
      ship.box("roof", x, -2.95, z * 1.045, 0.29, 0.4, 0.025);
      ship.box("glass", x, -2.95, z * 1.08, 0.28, 0.39, 0.025);
      ship.box("copper", x, -3.36, z, 0.07, 0.07, 0.08);
    }
    ship.box("brass", 0, -3.3, z * 1.04, 5.8, 0.05, 0.06);
    ship.box("glass", 2.89, -2.63, z * 0.88, 0.8, 0.48, 0.03);
    for (const x of [2.5, 2.9, 3.28])
      ship.box("brass", x, -2.64, z * 0.91, 0.045, 0.58, 0.045);
    for (const x of [-2.6, -1.3, 1.3, 2.5]) {
      ship.beam("iron", [x, -2.54, z], [x * 1.45, -1.32, z * 2.6], 0.04);
      ship.beam("copper", [x, -3.35, z], [-x * 0.65, -1.5, z * 2.4], 0.019);
      ship.box("brass", x * 1.45, -1.32, z * 2.6, 0.16, 0.12, 0.14);
    }
  }
  // Broad aft rudders project past the envelope; inset ribs read as voxel slats.
  for (let i = 0; i < 6; i++) {
    const x = -8.15 + i * 0.45, reach = 1.22 + i * 0.27;
    ship.box("roof", x, 0.27, 0, 0.47, reach * 2, 0.16);
    ship.box("accent", x, 0, 0, 0.47, 0.16, reach * 2.2);
    ship.box("copper", x, 0.27, 0, 0.045, reach * 2, 0.19);
    ship.box("copper", x, 0, 0, 0.045, 0.19, reach * 2.2);
    for (const side of [-1, 1]) {
      ship.box("brass", x, 0.27 + side * reach, 0, 0.47, 0.075, 0.2);
      ship.box("brass", x, 0, side * reach * 1.1, 0.47, 0.2, 0.075);
    }
  }
  for (const z of [-1.7, 1.7]) {
    ship.beam("iron", [-1.3, -3.2, 0], [-1.3, -2.85, z], 0.1);
    ship.beam("brass", [-0.4, -2.55, 0], [-1.2, -2.85, z], 0.06);
    ship.cyl("copper", -1.3, -2.85, z, 0.27, 0.9, "x");
    for (let i = 0; i < 6; i++)
      ship.cyl("iron", -1.6 + i * 0.12, -2.85, z, 0.3, 0.045, "x");
    for (const x of [-1.74, -0.84])
      ship.cyl("brass", x, -2.85, z, 0.29, 0.1, "x");
    ship.cyl("iron", -0.94, -2.42, z, 0.085, 0.6);
    ship.cyl("brass", -0.94, -2.1, z, 0.12, 0.09);
  }
}

export function createAirship(scene) {
  const ship = new THREE.Group();
  ship.name = "Ambient brass courier";
  scene.add(ship);
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe8d9ae, roughness: 0.86 });
  const patch = new THREE.MeshStandardMaterial({ color: 0xcbb88b, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd6a456, roughness: 0.4, metalness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x354e59, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x99d4df, roughness: 0.22, metalness: 0.2 });
  const materials = { trim: cloth, stone: patch, brass, copper: brass,
    roof: dark, accent: dark, iron: dark, wood: dark, glass };
  const parts = new Map();
  function put(m, g, x = 0, y = 0, z = 0) {
    g.translate(x, y, z);
    const material = materials[m];
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(g);
  }
  const box = (m, x, y, z, w, h, d) => put(m, new THREE.BoxGeometry(w, h, d), x, y, z);
  const cyl = (m, x, y, z, r, h, axis = "y") => {
    const g = new THREE.CylinderGeometry(r, r, h, 12);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    put(m, g, x, y, z);
  };
  function beam(m, a, b, radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), delta.normalize()));
    const mid = start.add(end).multiplyScalar(0.5);
    put(m, g, mid.x, mid.y, mid.z);
  }
  buildAirshipHull({ put, box, cyl, beam });
  for (const [mat, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    ship.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  const propellers = [];
  const blades = [];
  for (const angle of [0, Math.PI / 2]) {
    const g = new THREE.BoxGeometry(0.06, 1.65, 0.14);
    g.rotateX(angle);
    blades.push(g);
  }
  const hub = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8);
  hub.rotateZ(Math.PI / 2);
  blades.push(hub);
  const propGeometry = mergeGeometries(blades);
  blades.forEach((g) => g.dispose());
  for (const z of [-1.7, 1.7]) {
    const p = new THREE.Mesh(propGeometry, brass);
    p.name = "Courier propeller";
    p.position.set(-1.83, -2.85, z);
    ship.add(p);
    propellers.push(p);
  }
  ship.rotation.y = -0.16;
  // Match the original ambient envelope's footprint, independent of the port ship.
  ship.scale.setScalar(0.8 * 3.5 / 8.2);
  return {
    update(t) {
      ship.position.set(-6 + Math.sin(t * 0.035) * 4.5,
        9.6 + Math.sin(t * 0.3) * 0.12, -22);
      ship.rotation.z = Math.sin(t * 0.18) * 0.015;
      propellers.forEach((p) => (p.rotation.x = t * 12));
    },
  };
}
