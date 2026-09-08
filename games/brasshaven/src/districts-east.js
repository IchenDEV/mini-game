import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DistrictBuilder } from "./district-builder.js";
import { buildAirshipHull } from "./airship.js";

const TAU = Math.PI * 2;

// Each articulated assembly is merged by material, independently of the
// builder's static architecture. No individual rivet or hull rib is a draw call.
function assembly(b, parent = b.root) {
  const group = new THREE.Group();
  parent.add(group);
  const parts = new Map();
  function put(mat, geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    geometry.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    // Shared builder materials also shade their baked per-piece color attribute.
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    colors.fill(1);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(geometry);
  }
  const box = (m, x, y, z, w, h, d, ry = 0, rz = 0) =>
    put(m, new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry, rz);
  const cyl = (m, x, y, z, r, h, axis = "y", top = r, segments = 16) =>
    put(
      m,
      new THREE.CylinderGeometry(top, r, h, segments),
      x,
      y,
      z,
      axis === "z" ? Math.PI / 2 : 0,
      0,
      axis === "x" ? Math.PI / 2 : 0,
    );
  const ring = (m, x, y, z, r, tube, axis = "z", arc = TAU) =>
    put(
      m,
      new THREE.TorusGeometry(r, tube, 6, 64, arc),
      x,
      y,
      z,
      axis === "y" ? Math.PI / 2 : 0,
      axis === "x" ? Math.PI / 2 : 0,
    );
  function beam(m, a, c, width = 0.1) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...c);
    const delta = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(width, width, delta.length(), 6);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    const mid = start.add(end).multiplyScalar(0.5);
    put(m, g, mid.x, mid.y, mid.z);
  }
  function sphere(m, x, y, z, sx, sy = sx, sz = sx, hemisphere = false) {
    const g = new THREE.SphereGeometry(
      1,
      32,
      hemisphere ? 10 : 16,
      0,
      TAU,
      0,
      hemisphere ? Math.PI / 2 : Math.PI,
    );
    g.scale(sx, sy, sz);
    put(m, g, x, y, z);
  }
  function finish() {
    for (const [name, geometries] of parts) {
      const mesh = new THREE.Mesh(
        mergeGeometries(geometries),
        b.materials[name],
      );
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
    parts.clear();
    return group;
  }
  return { group, put, box, cyl, ring, beam, sphere, finish };
}

function railing(b, x1, x2, y, z, mat = "brass") {
  b.beam(mat, [x1, y + 0.95, z], [x2, y + 0.95, z], 0.075);
  b.beam("iron", [x1, y + 0.42, z], [x2, y + 0.42, z], 0.055);
  const count = Math.ceil((x2 - x1) / 0.7);
  for (let i = 0; i <= count; i++) {
    const x = x1 + ((x2 - x1) * i) / count;
    b.cyl("iron", x, y + 0.48, z, 0.055, 0.96);
    b.cyl(mat, x, y + 0.99, z, 0.095, 0.1);
  }
}

function facade(b, x, y, z, width, rows = 2, spacing = 1.65) {
  const count = Math.floor(width / spacing);
  for (let row = 0; row < rows; row++)
    for (let i = 0; i < count; i++)
      b.window(
        x + (i - (count - 1) / 2) * spacing,
        y + row * 2.25 - 0.775,
        z,
        0.82,
        1.55,
      );
}

function rivets(b, x1, x2, y, z, mat = "brass") {
  const count = Math.ceil((x2 - x1) / 0.44);
  for (let i = 0; i <= count; i++)
    b.cyl(mat, x1 + (i * (x2 - x1)) / count, y, z, 0.055, 0.075, "z");
}

function foundation(b, x, z, w, d) {
  b.box("stone", x, -0.55, z, w, 1.1, d);
  b.box("trim", x, 0.08, z, w + 0.25, 0.24, d + 0.25);
}

function rock(a, mat, x, y, z, r, h, seed = 0) {
  const g = new THREE.CylinderGeometry(r * 0.32, r, h, 5 + (seed % 3), 1);
  g.rotateY(seed * 1.7);
  a.put(mat, g, x, y, z, 0, 0, Math.sin(seed * 2.4) * 0.14);
}

export function createFoundry(scene) {
  const b = new DistrictBuilder(scene, {
    stone: 0x665a55,
    trim: 0xd1b394,
    brick: 0xa64932,
    roof: 0x793a2f,
    iron: 0x384247,
    brass: 0xd6a049,
    copper: 0xcd7142,
    accent: 0xd85b31,
    glass: 0xf4b86a,
    glow: 0xff781c,
    dark: 0x292c31,
  });
  b.root.name = "Cinderworks — terraced kiln and hydraulic hammer";
  const detail = assembly(b);
  foundation(b, -7.7, -7.4, 11.6, 9.5);
  // A stepped firebrick kiln, buttressed on three levels, with a copper crown.
  b.masonry(-8, 0.15, -7.2, 10.2, 4.5, 7.5);
  b.masonry(-8.8, 4.65, -8.5, 7.7, 2.1, 6.2);
  b.masonry(-9.4, 6.8, -9.2, 5.4, 2.2, 4.9);
  for (const [x, y, z, w, d] of [
    [-8, 4.7, -7.2, 10.6, 7.9],
    [-8.8, 6.85, -8.5, 8.1, 6.6],
    [-9.4, 9.05, -9.2, 5.8, 5.3],
  ]) {
    b.box("iron", x, y, z, w, 0.25, d);
    b.box("copper", x, y + 0.19, z, w + 0.18, 0.14, d + 0.18);
    rivets(b, x - w / 2 + 0.2, x + w / 2 - 0.2, y, z + d / 2 + 0.06);
  }
  for (const x of [-12.65, -10.45, -5.6, -3.4]) {
    b.masonry(x, 0.1, -3.4, 0.62, 5, 0.85);
    b.box("trim", x, 5.16, -3.4, 0.86, 0.23, 1.1);
  }
  // Two massive glowing furnace mouths, with radial stone voussoirs.
  for (const x of [-8.5, -5.55]) {
    b.box("dark", x, 1.85, -3.37, 2.1, 2.65, 0.16);
    b.box("glow", x, 1.6, -3.23, 1.62, 1.95, 0.07);
    detail.ring("trim", x, 2.58, -3.18, 1.04, 0.21, "z", Math.PI);
    detail.sphere("glow", x, 2.42, -3.23, 0.8, 0.68, 0.035, true);
    for (const side of [-1, 1])
      b.box("trim", x + side * 1.04, 1.62, -3.12, 0.35, 2, 0.42);
    for (let i = 0; i < 9; i++) {
      const t = (i * Math.PI) / 8;
      detail.box(
        "iron",
        x + Math.cos(t) * 1.06,
        2.58 + Math.sin(t) * 1.06,
        -2.96,
        0.075,
        0.4,
        0.12,
        0,
        t - Math.PI / 2,
      );
    }
    for (let i = -2; i <= 2; i++)
      b.box("iron", x + i * 0.3, 1.74, -3.05, 0.075, 2.15, 0.1);
    b.box("iron", x, 0.57, -2.9, 2.45, 0.23, 0.7);
    b.lights.push({
      position: [x, 1.8, -2.5],
      color: 0xff8234,
      intensity: 7,
      distance: 5,
    });
  }
  facade(b, -9, 5.65, -5.34, 6.3, 1, 1.55);
  b.tank(-11.4, 5.2, -5.9, 0.72, 2.1);
  // Crown exhaust and three asymmetric stacks carry collars, ladders and vents.
  detail.cyl("copper", -9.4, 9.55, -9.2, 2.22, 0.8, "y", 1.55);
  for (const [x, z, h, r] of [
    [-11.6, -10.3, 12.2, 0.7],
    [-6.4, -10.5, 10.6, 0.54],
    [-9.4, -9.2, 11.1, 0.83],
  ]) {
    b.cyl("brick", x, h / 2, z, r, h);
    for (let y = 1; y < h; y += 1.9) {
      b.cyl("iron", x, y, z, r + 0.08, 0.18);
      b.cyl("trim", x, y + 0.19, z, r + 0.14, 0.15);
    }
    b.cyl("copper", x, h - 0.1, z, r + 0.22, 0.45);
    b.cyl("dark", x, h + 0.15, z, r * 0.85, 0.045);
    for (let y = 3; y < h - 0.3; y += 0.42)
      b.beam(
        "iron",
        [x - 0.23, y, z + r + 0.05],
        [x + 0.23, y, z + r + 0.05],
        0.04,
      );
    for (const side of [-1, 1])
      b.pipe(
        "iron",
        [x + side * 0.25, 3, z + r],
        [x + side * 0.25, h - 0.4, z + r],
        0.045,
      );
    b.steamSources.push([x, h + 0.3, z]);
  }
  // An open crucible, separated from the furnace and fed by a covered runner.
  b.cyl("iron", -1.85, 0.72, -5.8, 1.7, 1.1);
  detail.cyl("copper", -1.85, 2.2, -5.8, 1.26, 2, "y", 1.65);
  b.cyl("glow", -1.85, 3.16, -5.8, 1.4, 0.09);
  b.ring("iron", -1.85, 3.22, -5.8, 1.62, 0.19, "y");
  for (let i = 0; i < 12; i++) {
    const t = (i * TAU) / 12;
    b.beam(
      "iron",
      [-1.85 + Math.cos(t) * 1.22, 1.3, -5.8 + Math.sin(t) * 1.22],
      [-1.85 + Math.cos(t) * 1.61, 3.15, -5.8 + Math.sin(t) * 1.61],
      0.095,
    );
  }
  for (const x of [-3.65, -0.05]) b.cyl("brass", x, 2.5, -5.8, 0.26, 0.7, "x");
  b.pipe("copper", [-4.6, 3.8, -6.7], [-1.85, 3.8, -6.7], 0.22);
  b.pipe("copper", [-1.85, 3.8, -6.7], [-1.85, 3.5, -5.8], 0.22);
  b.steamSources.push([-1.85, 3.35, -5.8]);
  // Molten channels stay entirely behind the clear promenade.
  for (const [x, z, w, d] of [
    [-1.9, -9.3, 0.75, 5],
    [1, -11.5, 6.6, 0.8],
    [4, -8.5, 0.8, 6.8],
  ]) {
    b.box("dark", x, 0.2, z, w + 0.45, 0.45, d + 0.45);
    b.box("glow", x, 0.44, z, w, 0.045, d);
    if (d > w)
      for (let zz = z - d / 2; zz <= z + d / 2; zz += 0.8)
        b.box("iron", x, 0.6, zz, w + 0.55, 0.09, 0.1);
  }
  // Four-legged gantry and a separate, articulated sliding hammer assembly.
  foundation(b, 7, -14.3, 9, 7.8);
  b.masonry(7, 0.15, -14.3, 7.8, 2.4, 6.6);
  for (const x of [3.4, 10.6])
    for (const z of [-16.5, -12.1]) {
      b.box("iron", x, 8.6, z, 0.68, 12.8, 0.8);
      b.box("copper", x, 8.6, z + 0.43, 0.25, 12.5, 0.09);
      for (const y of [3.2, 7, 11.5, 14.8])
        b.box("brass", x, y, z, 1.02, 0.28, 1.13);
      b.beam("iron", [x, 13.7, z], [7, 15.4, z], 0.34);
    }
  for (const z of [-16.5, -12.1]) {
    b.box("iron", 7, 14.9, z, 8.6, 1.15, 1.1);
    b.box("copper", 7, 15.56, z, 9.1, 0.22, 1.35);
    rivets(b, 3, 11, 14.92, z + 0.58);
    for (let x = 3.5; x < 10; x += 1.3)
      b.beam("brass", [x, 14.45, z + 0.57], [x + 0.75, 15.35, z + 0.57], 0.085);
  }
  b.box("iron", 7, 15, -14.3, 3.5, 1, 5.5);
  for (const x of [5.8, 8.2]) {
    b.cyl("copper", x, 13.4, -14.3, 0.65, 3.4);
    for (const y of [11.8, 13.6, 15]) b.cyl("brass", x, y, -14.3, 0.78, 0.2);
  }
  b.box("dark", 7, 2.85, -13.8, 4.1, 0.75, 3.4);
  b.box("glow", 7, 3.27, -13.8, 2.6, 0.13, 1.4);
  const hammer = assembly(b);
  hammer.group.name = "Hydraulic crosshead";
  hammer.group.position.set(7, 7.8, -14.3);
  hammer.box("iron", 0, 0, 0, 5.1, 1.65, 3.75);
  hammer.box("copper", 0, 0.17, 1.91, 4.8, 1.1, 0.12);
  hammer.box("dark", 0, -1.03, 0.25, 3.2, 0.5, 2.55);
  for (const x of [-1.2, 1.2]) hammer.cyl("trim", x, 3.4, 0, 0.27, 5.5);
  for (let i = -4; i <= 4; i++) {
    hammer.box(
      i % 2 === 0 ? "brass" : "dark",
      i * 0.47,
      -0.39,
      2,
      0.3,
      0.32,
      0.09,
      0,
      -0.35,
    );
    hammer.cyl("brass", i * 0.5, 0.6, 2, 0.065, 0.09, "z");
  }
  hammer.finish();
  let cycle = 0;
  b.animations.push((time, dt, powered) => {
    cycle += dt * (powered ? 1.2 : 0.15);
    hammer.group.position.y = 7.7 + Math.sin(cycle) * 2.55;
    b.materials.glow.emissiveIntensity =
      (powered ? 1.9 : 0.75) + Math.sin(time * 2.1) * 0.13;
  });
  b.gear(10.8, 10.8, -11.55, 1.3, 18, 0.32);
  b.gear(10.8, 8.7, -11.55, 0.77, 12, -0.52);
  b.box("iron", -1.4, 7.6, -11.9, 9.7, 0.2, 1.1);
  railing(b, -6.2, 3.4, 7.75, -11.3);
  for (const x of [-5.8, 3.4])
    b.beam("iron", [x, 5.8, -12.5], [x, 7.5, -11.4], 0.16);
  b.pipe("copper", [-8, 8.4, -10.8], [2.4, 8.4, -10.8], 0.27);
  b.pipe("copper", [2.4, 8.4, -10.8], [2.4, 13.6, -14.3], 0.27);
  b.pipe("copper", [2.4, 13.6, -14.3], [5.8, 13.6, -14.3], 0.27);
  b.box("iron", 6.8, 5.9, -10.5, 8.8, 0.22, 1.25);
  railing(b, 2.5, 11.1, 6, -9.93);
  for (const x of [3.5, 10.5])
    b.beam("iron", [x, 3.2, -12], [x, 5.8, -10.1], 0.16);
  // Peripheral basalt and grounded distant factories establish the volcanic site.
  for (let i = 0; i < 12; i++) {
    const x = i < 6 ? -14.1 - i * 0.45 : 13.5 + (i - 6) * 0.45;
    const z = -4.5 - (i % 6) * 2.4;
    rock(
      detail,
      i % 3 ? "dark" : "stone",
      x,
      0.6,
      z,
      1 + (i % 3) * 0.2,
      2.5 + (i % 4),
      i,
    );
  }
  for (const [x, z, h] of [
    [-25, -31, 16],
    [-34, -38, 12],
    [25, -33, 19],
    [34, -42, 14],
  ]) {
    foundation(b, x, z, 9, 9);
    b.masonry(x, 0, z, 6, h * 0.46, 6);
    for (const dx of [-1.7, 1.7]) {
      b.cyl("brick", x + dx, h / 2, z, 0.85, h);
      for (let y = 4; y < h; y += 3) b.cyl("trim", x + dx, y, z, 1, 0.25);
      b.cyl("iron", x + dx, h, z, 1.08, 0.35);
      b.steamSources.push([x + dx, h + 0.3, z]);
    }
    rock(detail, "stone", x, -2.3, z, 6.5, 4.5, 3);
  }
  detail.finish();
  return b.finish();
}

export function createObservatory(scene) {
  const b = new DistrictBuilder(scene, {
    stone: 0xd0d4df,
    trim: 0xf1ece3,
    brick: 0x9091b0,
    roof: 0x777195,
    iron: 0x485164,
    brass: 0xc29a56,
    copper: 0x986d50,
    accent: 0x9478bf,
    glass: 0xaac6e9,
    glow: 0xc6acff,
    dark: 0x343f56,
  });
  b.root.name = "Astral Crown — silver dome and celestial armillary";
  const detail = assembly(b);
  foundation(b, -7.7, -7.6, 12, 10.2);
  // Ashlar follows the drum's circumference; recessed joints remain readable
  // under the strong daylight key without a texture or extra draw calls.
  function courses(x, z, radius, base, rows, sectors, rise = 0.31) {
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < sectors; i++) {
        const t = ((i + (row % 2) * 0.5) * TAU) / sectors;
        b.box(
          row % 5 === 0 ? "trim" : "stone",
          x + Math.sin(t) * radius,
          base + (row + 0.5) * rise,
          z + Math.cos(t) * radius,
          (TAU * radius) / sectors - 0.035,
          rise - 0.035,
          0.14,
          t,
        );
      }
  }
  // Low broad drum, projecting portico, and a ribbed violet hemisphere.
  detail.cyl("brick", -8, 2.65, -8.2, 5, 5.1, "y", 5, 40);
  courses(-8, -8.2, 5.04, 0.15, 16, 40);
  for (const y of [0.45, 1, 4.8, 5.25]) b.cyl("trim", -8, y, -8.2, 5.4, 0.24);
  for (let i = 0; i < 20; i++) {
    const t = (i * TAU) / 20;
    const x = -8 + Math.sin(t) * 5.08,
      z = -8.2 + Math.cos(t) * 5.08;
    b.box("brick", x, 2.8, z, 0.28, 3.75, 0.32, t);
    b.box("trim", x, 4.69, z, 0.46, 0.23, 0.46, t);
    if (Math.cos(t) > -0.4) b.window(x, 1.5, z, 0.89, 2.3, t);
  }
  // Stacked cornice and alternating dentils cast a crisp shadow below the dome.
  for (const [y, r, h, mat] of [
    [4.95, 5.46, 0.12, "brick"],
    [5.08, 5.53, 0.14, "trim"],
    [5.26, 5.38, 0.16, "stone"],
    [5.4, 5.43, 0.1, "brass"],
  ])
    detail.cyl(mat, -8, y, -8.2, r, h, "y", r, 40);
  for (let i = 0; i < 60; i++) {
    const t = (i * TAU) / 60;
    b.box(
      "trim",
      -8 + Math.sin(t) * 5.29,
      4.83,
      -8.2 + Math.cos(t) * 5.29,
      0.2,
      0.23,
      0.33,
      t,
    );
  }
  detail.sphere("roof", -8, 5.45, -8.2, 5.03, 4.05, 5.03, true);
  // Raised metal shingles leave narrow seams on each curved panel.
  for (let row = 0; row < 7; row++)
    for (let panel = 0; panel < 24; panel++) {
      const g = new THREE.SphereGeometry(
        1,
        3,
        2,
        (panel * TAU) / 24 + 0.012,
        TAU / 24 - 0.024,
        0.2 + row * 0.185,
        0.168,
      );
      g.scale(5.07, 4.09, 5.07);
      detail.put(
        (panel + row * 2) % 9 === 0 ? "accent" : "roof",
        g,
        -8,
        5.45,
        -8.2,
      );
    }
  for (let j = 0; j < 12; j++) {
    const theta = (j * TAU) / 12;
    for (let k = 0; k < 12; k++) {
      const p = (k * Math.PI) / 24,
        q = ((k + 1) * Math.PI) / 24;
      detail.beam(
        "copper",
        [
          -8 + Math.cos(theta) * Math.cos(p) * 5.13,
          5.46 + Math.sin(p) * 4.14,
          -8.2 + Math.sin(theta) * Math.cos(p) * 5.13,
        ],
        [
          -8 + Math.cos(theta) * Math.cos(q) * 5.13,
          5.46 + Math.sin(q) * 4.14,
          -8.2 + Math.sin(theta) * Math.cos(q) * 5.13,
        ],
        0.095,
      );
    }
  }
  for (const theta of [0.18, 0.48, 0.83, 1.12]) {
    detail.ring(
      "copper",
      -8,
      5.45 + Math.sin(theta) * 4.14,
      -8.2,
      Math.cos(theta) * 5.13,
      0.075,
      "y",
    );
    for (let j = 0; j < 24; j++) {
      const t = (j * TAU) / 24;
      b.box(
        "brass",
        -8 + Math.cos(t) * Math.cos(theta) * 5.15,
        5.45 + Math.sin(theta) * 4.17,
        -8.2 + Math.sin(t) * Math.cos(theta) * 5.15,
        0.11,
        0.11,
        0.11,
      );
    }
  }
  b.cyl("trim", -8, 9.47, -8.2, 0.73, 0.27);
  b.cyl("glass", -8, 9.99, -8.2, 0.48, 0.83);
  for (let i = 0; i < 6; i++) {
    const t = (i * TAU) / 6;
    b.cyl(
      "brass",
      -8 + Math.cos(t) * 0.49,
      9.98,
      -8.2 + Math.sin(t) * 0.49,
      0.045,
      1.08,
    );
  }
  detail.sphere("trim", -8, 10.44, -8.2, 0.7, 0.51, 0.7, true);
  b.cyl("brass", -8, 11, -8.2, 0.055, 0.9);
  detail.sphere("brass", -8, 11.49, -8.2, 0.16);
  // Classical entrance: double columns, a triangular pediment and zodiac seal.
  b.box("dark", -8, 1.8, -2.95, 2.1, 3.2, 0.18);
  b.box("glass", -8, 2.25, -2.82, 1.7, 1.9, 0.08);
  for (let i = -2; i <= 2; i++)
    b.box("brass", -8 + i * 0.35, 2.1, -2.7, 0.045, 2.2, 0.06);
  for (const x of [-10.6, -9.8, -6.2, -5.4]) {
    b.cyl("trim", x, 2.25, -2.4, 0.21, 4.05);
    for (const y of [0.38, 0.63, 3.97, 4.2])
      b.cyl("brass", x, y, -2.4, 0.3, 0.15);
  }
  for (let i = 0; i < 20; i++)
    b.box("trim", -10.85 + i * 0.3, 4.16, -1.66, 0.14, 0.19, 0.28);
  b.box("brick", -8, 4.27, -2.5, 6.35, 0.09, 1.73);
  b.box("trim", -8, 4.4, -2.5, 6.3, 0.42, 1.7);
  b.roof(-8, 4.6, -2.5, 6.6, 1.9, 1.2);
  for (let i = 0; i < 3; i++)
    b.box(
      "trim",
      -8,
      0.12 + i * 0.13,
      -1.05 - i * 0.31,
      6 - i * 0.34,
      0.22,
      0.43,
    );
  detail.ring("brass", -8, 4.47, -1.6, 0.4, 0.07);
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4;
    detail.beam(
      "brass",
      [-8 + Math.cos(t) * 0.13, 4.47 + Math.sin(t) * 0.13, -1.6],
      [-8 + Math.cos(t) * 0.32, 4.47 + Math.sin(t) * 0.32, -1.6],
      0.035,
    );
  }
  // The right landmark is an open instrument, with a tall sculpted pedestal.
  foundation(b, 6.5, -14.4, 9.1, 8.5);
  for (const [y, r, h] of [
    [0.4, 3.8, 0.55],
    [0.9, 3.25, 0.5],
    [1.35, 2.65, 0.4],
    [4.1, 1.75, 5.2],
    [6.85, 2.45, 0.4],
    [7.2, 2.8, 0.3],
  ])
    b.cyl(y > 2 && y < 6 ? "brick" : "trim", 6.5, y, -14.4, r, h);
  for (let i = 0; i < 8; i++) {
    const t = (i * TAU) / 8;
    const x = 6.5 + Math.sin(t) * 1.73,
      z = -14.4 + Math.cos(t) * 1.73;
    b.box("trim", x, 4.1, z, 0.33, 4.9, 0.33, t);
    b.box("accent", x, 4.5, z, 0.16, 2.2, 0.39, t);
    b.beam(
      "brass",
      [6.5 + Math.sin(t) * 2.4, 7.3, -14.4 + Math.cos(t) * 2.4],
      [6.5 + Math.sin(t) * 1.3, 9.1, -14.4 + Math.cos(t) * 1.3],
      0.12,
    );
  }
  courses(6.5, -14.4, 1.72, 1.6, 16, 24, 0.32);
  courses(6.5, -14.4, 3.76, 0.15, 2, 40, 0.26);
  courses(6.5, -14.4, 3.22, 0.68, 2, 36, 0.23);
  for (const y of [1.6, 3.25, 5.85, 6.5]) {
    detail.cyl("stone", 6.5, y, -14.4, 1.99, 0.15, "y", 1.99, 24);
    detail.ring("brass", 6.5, y + 0.1, -14.4, 1.98, 0.045, "y");
  }
  for (let i = 0; i < 32; i++) {
    const t = (i * TAU) / 32;
    b.box(
      "trim",
      6.5 + Math.sin(t) * 2.37,
      6.6,
      -14.4 + Math.cos(t) * 2.37,
      0.15,
      0.3,
      0.3,
      t,
    );
    b.cyl(
      "brass",
      6.5 + Math.sin(t) * 2.73,
      7.39,
      -14.4 + Math.cos(t) * 2.73,
      0.075,
      0.12,
    );
  }
  b.gear(6.5, 4.5, -12.25, 0.64, 16, 0.12);
  b.gear(7.32, 5.2, -12.45, 0.38, 12, -0.2);
  b.pipe("copper", [5.5, 2.2, -12.8], [5.5, 5.7, -12.8], 0.085);
  b.pipe("copper", [5.5, 5.7, -12.8], [6.5, 5.7, -12.8], 0.085);
  // Fixed meridian and suspended nested axes, with tick marks merged into each ring.
  const center = new THREE.Group();
  center.name = "Nested celestial gimbals";
  center.position.set(6.5, 11.3, -14.4);
  b.root.add(center);
  const meridian = assembly(b, center);
  meridian.ring("brass", 0, 0, 0, 4.65, 0.25);
  meridian.ring("brass", 0, 0, 0, 4.91, 0.08);
  for (let i = 0; i < 72; i++) {
    const t = (i * TAU) / 72;
    meridian.box(
      "iron",
      Math.cos(t) * 4.65,
      Math.sin(t) * 4.65,
      0.28,
      i % 6 === 0 ? 0.13 : 0.07,
      i % 6 === 0 ? 0.36 : 0.17,
      0.075,
      0,
      t - Math.PI / 2,
    );
  }
  for (let i = 0; i < 96; i++) {
    const t = (i * TAU) / 96;
    meridian.box(
      "copper",
      Math.cos(t) * 4.43,
      Math.sin(t) * 4.43,
      0,
      0.11,
      0.24,
      0.3,
      0,
      t - Math.PI / 2,
    );
    if (i % 4 === 0)
      meridian.cyl(
        "brass",
        Math.cos(t) * 4.7,
        Math.sin(t) * 4.7,
        0.35,
        0.065,
        0.1,
        "z",
      );
  }
  for (const x of [-4.65, 4.65]) {
    meridian.cyl("copper", x, 0, 0, 0.34, 0.62, "x");
    meridian.ring("brass", x, 0, 0, 0.35, 0.075, "x");
  }
  meridian.finish();
  const outer = assembly(b, center);
  outer.group.rotation.x = 0.6;
  outer.ring("brass", 0, 0, 0, 4.25, 0.22, "y");
  outer.ring("copper", 0, 0, 0, 4.07, 0.09, "y");
  for (let i = 0; i < 12; i++) {
    const t = (i * TAU) / 12;
    outer.box(
      "accent",
      Math.cos(t) * 4.23,
      0,
      Math.sin(t) * 4.23,
      0.48,
      0.18,
      0.48,
      -t,
    );
    outer.sphere("trim", Math.cos(t) * 4.23, 0.18, Math.sin(t) * 4.23, 0.09);
    // Twelve distinct constellation-like line glyphs around the zodiac belt.
    const x = Math.cos(t) * 4.23,
      z = Math.sin(t) * 4.23;
    outer.beam(
      "brass",
      [x - 0.15, 0.13, z - 0.12],
      [x + 0.12, 0.13, z + 0.14],
      0.027,
    );
    outer.beam(
      "brass",
      [x + 0.12, 0.13, z + 0.14],
      [x + 0.17, 0.13, z - 0.1],
      0.027,
    );
  }
  outer.finish();
  const inner = assembly(b, outer.group);
  inner.group.rotation.z = 0.8;
  inner.ring("copper", 0, 0, 0, 3.55, 0.2, "x");
  inner.ring("brass", 0, 0, 0, 3.32, 0.085, "x");
  inner.cyl("brass", 0, 0, 0, 0.075, 7.3, "x");
  for (const x of [-3.55, 3.55]) inner.sphere("trim", x, 0, 0, 0.24);
  inner.finish();
  const globe = assembly(b, inner.group);
  globe.group.rotation.x = 0.4;
  globe.sphere("glass", 0, 0, 0, 1.57);
  globe.sphere("brass", 0, 0, 0, 0.7);
  globe.ring("glow", 0, 0, 0, 1.65, 0.055, "y");
  for (let i = 0; i < 6; i++) {
    const g = new THREE.TorusGeometry(1.6, 0.035, 5, 48);
    globe.put("brass", g, 0, 0, 0, 0, (i * Math.PI) / 6);
  }
  for (const y of [-0.8, 0.8]) globe.ring("brass", 0, y, 0, 1.4, 0.035, "y");
  globe.ring("brass", 0, 0, 0, 2.7, 0.065, "z");
  globe.sphere("glow", 2.7, 0, 0, 0.33);
  globe.sphere("copper", -1.91, 1.91, 0, 0.23);
  globe.finish();
  b.animations.push((time, dt, powered) => {
    const speed = powered ? 1 : 0.17;
    outer.group.rotation.y += dt * 0.13 * speed;
    inner.group.rotation.x += dt * 0.23 * speed;
    globe.group.rotation.y += dt * 0.31 * speed;
    b.materials.glow.emissiveIntensity =
      (powered ? 1.6 : 0.65) + Math.sin(time * 1.2) * 0.09;
  });
  b.lights.push({
    position: [6.5, 11.3, -14.4],
    color: 0xc8b6ff,
    intensity: 8,
    distance: 8,
  });
  // A side telescope on its own balcony, aimed toward the mountains.
  b.cyl("trim", -0.6, 1.4, -8.8, 1.3, 2.5);
  b.box("trim", -0.6, 2.7, -8.8, 3.3, 0.2, 3.3);
  railing(b, -2.1, 0.9, 2.85, -7.3);
  b.cyl("brass", -0.6, 3.6, -8.8, 0.18, 1.8);
  detail.beam("copper", [-1.7, 3.75, -8.8], [0.9, 5.15, -9.3], 0.33);
  detail.beam("trim", [0.4, 4.88, -9.2], [1.2, 5.31, -9.35], 0.43);
  // Faceted snow and crystalline spires remain outside both stage and walkway.
  for (const side of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const x = side * (13.5 + (i % 3) * 0.8),
        z = -4 - i * 2.4;
      for (let ledge = 0; ledge < 5; ledge++) {
        const width = 2.65 - ledge * 0.39,
          rise = 0.62 + (i % 3) * 0.09;
        const xx = x + Math.sin(i + ledge) * 0.16;
        const zz = z + Math.cos(i * 2 + ledge) * 0.19;
        b.box(
          ledge % 3 ? "stone" : "brick",
          xx,
          -0.35 + (ledge + 0.5) * rise,
          zz,
          width,
          rise + 0.1,
          width * 0.8,
          i * 0.73,
        );
        b.box(
          "trim",
          xx - 0.1,
          -0.32 + (ledge + 1) * rise,
          zz + 0.08,
          width * 0.83,
          0.12,
          width * 0.67,
          i * 0.73,
        );
        detail.cyl(
          "stone",
          xx + width * 0.23,
          -0.35 + (ledge + 0.45) * rise,
          zz + width * 0.3,
          width * 0.31,
          rise * 0.9,
          "y",
          width * 0.19,
          5,
        );
      }
      detail.cyl(
        i % 3 ? "glass" : "accent",
        x + 0.4,
        2.3,
        z + 0.4,
        0.35,
        3.2 + (i % 2),
        "y",
        0,
        5,
      );
    }
  for (const [x, z, h, r] of [
    [-27, -34, 15, 6],
    [-38, -47, 22, 8],
    [28, -36, 17, 6.5],
    [40, -47, 24, 8],
  ]) {
    // Overlapping, staggered strata form a chipped massif. Snow sits on
    // individual ledges, revealing darker rock faces and deep vertical clefts.
    for (let spur = 0; spur < 7; spur++) {
      const angle = spur * 2.4;
      const ox = Math.cos(angle) * r * (spur ? 0.56 : 0);
      const oz = Math.sin(angle) * r * (spur ? 0.5 : 0);
      const peak = h * (spur ? 0.45 + (spur % 3) * 0.14 : 1);
      const levels = 6 + (spur % 3);
      for (let level = 0; level < levels; level++) {
        const t = level / levels,
          height = peak / levels;
        const width = r * (spur ? 0.55 : 0.88) * (1 - t * 0.78);
        const xx = x + ox + Math.sin(level * 2.1 + spur) * width * 0.12;
        const zz = z + oz + Math.cos(level * 1.7 + spur) * width * 0.16;
        b.box(
          (level + spur) % 3 ? "brick" : "stone",
          xx,
          -4 + (level + 0.5) * height,
          zz,
          width,
          height + 0.18,
          width * 0.78,
          angle + (level % 2) * 0.18,
        );
        if (level > 1)
          b.box(
            "trim",
            xx - width * 0.08,
            -4 + (level + 1) * height + 0.055,
            zz + width * 0.06,
            width * 0.82,
            0.15,
            width * 0.67,
            angle,
          );
        const chip = new THREE.CylinderGeometry(
          width * 0.16,
          width * 0.28,
          height * 0.88,
          5,
        );
        detail.put(
          "stone",
          chip,
          xx + width * 0.37,
          -4 + (level + 0.4) * height,
          zz + width * 0.22,
          0,
          angle + 0.4,
          -0.12,
        );
      }
    }
    b.cyl("trim", x - 1.1, h * 0.49, z + r * 0.4, 1.3, 2.4);
    detail.sphere(
      "roof",
      x - 1.1,
      h * 0.49 + 1.2,
      z + r * 0.4,
      1.5,
      1.4,
      1.5,
      true,
    );
  }
  detail.finish();
  return b.finish();
}

export function createSkyport(scene) {
  const b = new DistrictBuilder(scene, {
    stone: 0xd9d1b9,
    trim: 0xf6e9c9,
    brick: 0xc6bca6,
    roof: 0x334e69,
    iron: 0x354d5e,
    brass: 0xd2aa62,
    copper: 0xb77548,
    accent: 0x345f87,
    glass: 0xaacdd5,
    glow: 0xffd290,
    wood: 0x8b6544,
    dark: 0x293c4c,
  });
  b.root.name = "Aurelia Skyport — passenger terminal and moored airship";
  const detail = assembly(b);
  foundation(b, -7.4, -7.9, 12, 9.8);
  b.masonry(-7.6, 0.1, -7.8, 10.6, 4.8, 7.7);
  for (const y of [0.45, 3.1, 4.95])
    b.box("trim", -7.6, y, -7.8, 10.95, 0.23, 8.05);
  facade(b, -7.6, 1.9, -3.89, 9.9, 1, 1.7);
  for (const x of [-12.5, -9.95, -7.6, -5.25, -2.7]) {
    b.box("trim", x, 2.8, -3.81, 0.24, 4.45, 0.3);
    b.box("brass", x, 4.85, -3.7, 0.43, 0.26, 0.43);
  }
  // Steep slate mansard wings, long clerestory, and a glazed barrel vault.
  b.roof(-7.6, 5.1, -8, 11.2, 8.2, 2.75);
  b.masonry(-7.6, 5.5, -8.4, 6.7, 2, 4.2);
  b.roof(-7.6, 7.55, -8.4, 7.1, 4.6, 1.5);
  facade(b, -7.6, 6.58, -6.26, 6.5, 1, 1.35);
  for (const x of [-11.7, -3.6]) {
    b.box("stone", x, 5.92, -5.1, 1.5, 1.8, 1.5);
    b.window(x, 5.45, -4.31, 0.78, 1.1);
    b.roof(x, 6.9, -5.1, 1.85, 1.9, 0.85);
  }
  // Projecting passenger canopy: curved glazing, copper ribs and columns.
  // Explicit curved beams make the canopy legible even without transparency.
  for (let x = -11.5; x <= -3.5; x += 1.35) {
    for (let j = 0; j < 10; j++) {
      const a = (j * Math.PI) / 10,
        c = ((j + 1) * Math.PI) / 10;
      detail.beam(
        "copper",
        [x, 3.4 + Math.sin(a) * 0.85, -2.6 + Math.cos(a) * 1.2],
        [x, 3.4 + Math.sin(c) * 0.85, -2.6 + Math.cos(c) * 1.2],
        0.055,
      );
    }
    b.cyl("iron", x, 1.72, -1.4, 0.07, 3.4);
    b.cyl("brass", x, 0.33, -1.4, 0.13, 0.45);
    b.beam("copper", [x, 2.7, -1.4], [x, 3.5, -2.15], 0.07);
  }
  for (let j = 0; j < 10; j++) {
    const t = ((j + 0.5) * Math.PI) / 10;
    detail.box(
      j % 3 === 0 ? "accent" : "glass",
      -7.6,
      3.4 + Math.sin(t) * 0.85,
      -2.6 + Math.cos(t) * 1.2,
      8.3,
      0.065,
      0.34,
    );
  }
  for (const z of [-1.4, -3.8])
    b.beam("copper", [-11.7, 3.42, z], [-3.3, 3.42, z], 0.08);
  // A central cupola, topped by a compass-shaped wind vane.
  b.box("stone", -7.6, 8.9, -8.4, 2.3, 2.2, 2.3);
  b.window(-7.6, 8.325, -7.19, 1.1, 1.35);
  for (const y of [8.02, 10.02]) b.box("trim", -7.6, y, -8.4, 2.6, 0.23, 2.6);
  b.roof(-7.6, 10.15, -8.4, 2.9, 2.9, 1.5);
  b.cyl("brass", -7.6, 11.97, -8.4, 0.055, 1);
  b.beam("brass", [-8.2, 12.12, -8.4], [-7, 12.12, -8.4], 0.045);
  // A monumental copper boarding arch bridges to the mooring apron.
  detail.ring("copper", -0.2, 5.3, -9.9, 3.5, 0.23, "z", Math.PI);
  detail.ring("brass", -0.2, 5.3, -9.9, 3.85, 0.065, "z", Math.PI);
  for (const x of [-3.7, 3.3]) {
    b.cyl("copper", x, 2.72, -9.9, 0.23, 5.3);
    b.cyl("stone", x, 0.7, -9.9, 0.46, 1.3);
    for (const y of [1.4, 3.7, 5.3]) b.cyl("brass", x, y, -9.9, 0.34, 0.15);
  }
  for (let i = 0; i <= 16; i++) {
    const t = (i * Math.PI) / 16;
    detail.beam(
      "brass",
      [-0.2 + Math.cos(t) * 3.5, 5.3 + Math.sin(t) * 3.5, -9.9],
      [-0.2 + Math.cos(t) * 3.85, 5.3 + Math.sin(t) * 3.85, -9.9],
      0.05,
    );
  }
  // A tapering open mast, ring balconies and a lantern, unlike a solid tower.
  foundation(b, 7.8, -13.9, 7.7, 7.3);
  b.masonry(7.8, 0.1, -13.9, 5.4, 2.8, 5.3);
  b.box("trim", 7.8, 3, -13.9, 6.2, 0.3, 6.1);
  for (const dx of [-1, 1])
    for (const dz of [-1, 1]) {
      b.beam(
        "iron",
        [7.8 + dx * 2.3, 3, -13.9 + dz * 2.3],
        [7.8 + dx * 0.72, 14.4, -13.9 + dz * 0.72],
        0.2,
      );
      for (let i = 0; i < 4; i++) {
        const y = 3.3 + i * 2.6,
          lo = 2.3 - i * 0.37,
          hi = lo - 0.37;
        b.beam(
          "brass",
          [7.8 + dx * lo, y, -13.9 + dz * lo],
          [7.8 - dx * hi, y + 2.6, -13.9 + dz * hi],
          0.08,
        );
      }
    }
  for (const [y, r] of [
    [5.9, 2.85],
    [10.9, 2.05],
    [14.4, 1.45],
  ]) {
    b.cyl("iron", 7.8, y, -13.9, r, 0.2);
    b.cyl("copper", 7.8, y + 0.14, -13.9, r + 0.1, 0.13);
    b.ring("brass", 7.8, y + 1.02, -13.9, r, 0.065, "y");
    for (let i = 0; i < 24; i++) {
      const t = (i * TAU) / 24;
      b.cyl(
        "iron",
        7.8 + Math.cos(t) * r,
        y + 0.58,
        -13.9 + Math.sin(t) * r,
        0.045,
        0.83,
      );
    }
  }
  b.cyl("glass", 7.8, 15.35, -13.9, 0.8, 1.45);
  b.cyl("glow", 7.8, 15.35, -13.9, 0.4, 1.2);
  for (let i = 0; i < 8; i++) {
    const t = (i * TAU) / 8;
    b.cyl(
      "brass",
      7.8 + Math.cos(t) * 0.82,
      15.35,
      -13.9 + Math.sin(t) * 0.82,
      0.055,
      1.55,
    );
  }
  detail.cyl("roof", 7.8, 16.32, -13.9, 1.26, 0.6, "y", 0.15);
  b.cyl("brass", 7.8, 16.93, -13.9, 0.06, 0.75);
  b.box("wood", 5.1, 5.91, -10.2, 6, 0.24, 1.5);
  railing(b, 2.2, 8, 6.05, -9.5);
  railing(b, 2.2, 8, 6.05, -10.9);
  for (const x of [3, 6.8]) b.beam("iron", [x, 3, -12], [x, 5.8, -9.6], 0.13);
  // Original 16-metre passenger zeppelin: faceted fabric, hoops, stringers,
  // windowed gondola, wire rigging, stepped tail fins and separate propellers.
  const ship = assembly(b);
  ship.group.name = "Aurelia passenger zeppelin";
  ship.group.position.set(1.8, 10.6, -17.9);
  ship.group.rotation.y = -0.15;
  buildAirshipHull(ship);
  for (const z of [-1.7, 1.7]) {
    const prop = assembly(b, ship.group);
    prop.group.position.set(-1.83, -2.85, z);
    prop.cyl("brass", 0, 0, 0, 0.14, 0.18, "x");
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      const g = new THREE.BoxGeometry(0.06, 0.82, 0.14);
      g.translate(0, 0.46, 0).rotateX(t);
      prop.put("wood", g);
    }
    prop.finish();
    b.animations.push((time, dt, powered) => {
      prop.group.rotation.x += dt * (powered ? 17 : 5);
    });
  }
  ship.finish();
  b.animations.push((time, dt, powered) => {
    ship.group.position.y = 10.6 + Math.sin(time * 0.55) * 0.12;
    ship.group.rotation.z = Math.sin(time * 0.38) * 0.009;
    b.materials.glow.emissiveIntensity =
      (powered ? 1.5 : 0.55) + Math.sin(time * 1.3) * 0.1;
  });
  // Mooring stays and windswept signal pennants.
  b.beam("iron", [9.85, 10.6, -19.1], [7.8, 13.5, -13.9], 0.045);
  b.beam("iron", [8.2, 8.4, -18.5], [9.2, 10.9, -14.5], 0.035);
  for (const [x, y, z, phase] of [
    [-12.3, 8.6, -9, 0],
    [-2.8, 8.4, -9, 1.3],
    [9.3, 14, -14, 2.5],
  ]) {
    b.cyl("brass", x, y - 1.1, z, 0.045, 3.3);
    const flag = assembly(b);
    flag.group.position.set(x, y, z);
    for (let i = 0; i < 5; i++)
      flag.box(
        i % 2 ? "trim" : "accent",
        0.14 + i * 0.26,
        -0.11 - i * 0.025,
        0,
        0.27,
        0.68 - i * 0.095,
        0.035,
      );
    flag.finish();
    b.animations.push((time) => {
      flag.group.rotation.y = -0.3 + Math.sin(time * 1.8 + phase) * 0.25;
      flag.group.rotation.x = Math.sin(time * 2.5 + phase) * 0.08;
    });
  }
  b.lights.push({
    position: [7.8, 15.4, -13.9],
    color: 0xffd496,
    intensity: 7,
    distance: 7,
  });
  // Floating terminal islands have visible rock undersides and stone buttresses.
  for (const [x, z, h] of [
    [-26, -32, 8],
    [-36, -43, 12],
    [26, -33, 10],
    [37, -45, 15],
  ]) {
    detail.cyl("stone", x, -3.4, z, 1.2, 7, "y", 6.5, 7);
    foundation(b, x, z, 10, 8);
    b.masonry(x, 0, z, 5.2, h, 4.5);
    b.roof(x, h + 0.1, z, 5.7, 5, 2.1);
    facade(b, x, 2.3, z + 2.31, 5, Math.floor(h / 2.5), 1.4);
    for (const side of [-1, 1])
      b.beam(
        "trim",
        [x + side * 1.8, -5.4, z],
        [x + side * 4.2, -0.2, z],
        0.55,
      );
    b.cyl("copper", x, h + 3.3, z, 0.13, 3);
    b.ring("brass", x, h + 3.7, z, 0.68, 0.07);
  }
  detail.finish();
  return b.finish();
}
