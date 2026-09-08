import * as THREE from "three";
import { DistrictBuilder } from "./district-builder.js";

const TAU = Math.PI * 2;

function material(b, name, color, metalness = 0, roughness = 0.8) {
  b.materials[name] = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
  });
}
function rivets(b, x, y, z, r, count = 16) {
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    b.cyl(
      "brass",
      x + Math.sin(a) * r,
      y + Math.cos(a) * r,
      z,
      0.065,
      0.08,
      "z",
    );
  }
}
function finial(b, x, y, z, h = 0.9) {
  b.cyl("brass", x, y + h * 0.3, z, 0.07, h * 0.6);
  b.box("brass", x, y + h * 0.7, z, 0.18, 0.18, 0.18, Math.PI / 4);
  b.cyl("brass", x, y + h * 0.92, z, 0.035, h * 0.4);
}
function balustrade(b, x, z, length, axis = "x", y = 0.25) {
  for (let i = 0; i <= Math.ceil(length / 0.65); i++) {
    const p = -length / 2 + (i * length) / Math.ceil(length / 0.65),
      xx = x + (axis === "x" ? p : 0),
      zz = z + (axis === "z" ? p : 0);
    b.box("iron", xx, y + 0.53, zz, 0.065, 1.06, 0.065);
    b.box("brass", xx, y + 1.06, zz, 0.11, 0.11, 0.11, Math.PI / 4);
  }
  for (const h of [0.2, 0.87])
    b.beam(
      "iron",
      axis === "x" ? [x - length / 2, y + h, z] : [x, y + h, z - length / 2],
      axis === "x" ? [x + length / 2, y + h, z] : [x, y + h, z + length / 2],
      0.09,
    );
}
function dockEdges(b) {
  for (const side of [-1, 1]) {
    b.box("stone", side * 14.7, -0.22, 5.5, 0.54, 0.44, 12);
    balustrade(b, side * 14.7, 5.5, 12, "z", 0.05);
    for (const z of [0, 4, 8, 11]) {
      b.box("trim", side * 14.7, 0.18, z, 0.62, 0.36, 0.62);
      b.box("iron", side * 14.7, 1.2, z, 0.14, 2, 0.14);
      b.box("brass", side * 14.7, 2.18, z, 0.45, 0.09, 0.45);
      b.box("glow", side * 14.7, 2.39, z, 0.25, 0.34, 0.25);
      b.box("roof", side * 14.7, 2.6, z, 0.4, 0.12, 0.4);
      finial(b, side * 14.7, 2.65, z, 0.3);
    }
  }
}
function farCity(b, kind) {
  const stage = new THREE.Group();
  stage.name =
    kind === "garden"
      ? "Beyond the glass · botanical terraces"
      : "Beyond the tide · harbor silhouettes";
  b.root.add(stage);
  // A named static background batch, on continuous below-grade support.
  const city = b.moving(0, 0, 0, () => {
    const footprints = [
      [-24, -13, 5, 5, 8],
      [-23, -25, 6, 5, 12],
      [-16, -31, 7, 5, 10],
      [-8, -32, 5, 6, 8],
      [0, -34, 7, 5, 11],
      [10, -33, 6, 5, 9],
      [20, -29, 6, 6, 13],
      [25, -16, 5, 6, 8],
    ];
    for (let i = 0; i < footprints.length; i++) {
      const [x, z, w, d, h] = footprints[i];
      b.box("distant", x, -0.5, z, w + 2, 1, d + 2);
      b.box("distant", x, h / 2, z, w, h, d);
      for (const yy of [0, h * 0.48, h])
        b.box("distantTrim", x, yy + 0.15, z, w + 0.25, 0.26, d + 0.25);
      for (let yy = 1.4; yy < h - 1; yy += 2)
        for (let xx = x - w / 2 + 0.75; xx < x + w / 2 - 0.3; xx += 1.2) {
          b.box("distantDark", xx, yy, z + d / 2 + 0.03, 0.47, 1.1, 0.08);
          b.box(
            "distantTrim",
            xx - 0.27,
            yy,
            z + d / 2 + 0.09,
            0.09,
            1.26,
            0.13,
          );
          b.box("distantTrim", xx, yy - 0.6, z + d / 2 + 0.08, 0.65, 0.1, 0.14);
        }
      for (let j = 0; j < 5; j++)
        b.box(
          "distantRoof",
          x,
          h + 0.25 + j * 0.3,
          z,
          w - j * 0.6,
          0.32,
          d - j * 0.5,
        );
      if (i % 2 === 0) {
        b.cyl("distantTrim", x, h + 2.3, z, 0.7, 1.5);
        b.cyl("distantRoof", x, h + 3.15, z, 0.98, 0.3);
      }
    }
  });
  stage.add(city);
}
function sceneryMaterials(b) {
  material(b, "distant", 0xa1b7b4);
  material(b, "distantTrim", 0xc4d0c3);
  material(b, "distantDark", 0x718f91);
  material(b, "distantRoof", 0x839f99);
}
function pot(b, x, y, z, r = 0.65) {
  b.cyl("brick", x, y + r * 0.6, z, r, r * 1.2);
  b.cyl("trim", x, y + r * 1.2, z, r * 1.13, 0.14);
  b.cyl("dark", x, y + r * 1.28, z, r * 0.86, 0.08);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    b.box(
      "copper",
      x + Math.sin(a) * r,
      y + r * 0.6,
      z + Math.cos(a) * r,
      0.075,
      r,
      0.075,
    );
  }
  return y + r * 1.3;
}
function fern(b, x, y, z, size = 1, phase = 0) {
  b.box("wood", x, y + size * 0.55, z, 0.16, size * 1.1, 0.16);
  for (let arm = 0; arm < 7; arm++) {
    const a = (arm * TAU) / 7 + phase,
      tip = [
        x + Math.cos(a) * size * 1.5,
        y + size * 1.02,
        z + Math.sin(a) * size * 1.5,
      ];
    const mid = [
      x + Math.cos(a) * size * 0.6,
      y + size * 1.55,
      z + Math.sin(a) * size * 0.6,
    ];
    b.beam("leaf", [x, y + size * 0.9, z], mid, 0.075);
    b.beam("leaf", mid, tip, 0.055);
    for (let j = 1; j < 6; j++) {
      const t = j / 6,
        xx = mid[0] + (tip[0] - mid[0]) * t,
        zz = mid[2] + (tip[2] - mid[2]) * t,
        yy = mid[1] + (tip[1] - mid[1]) * t;
      for (const side of [-1, 1]) {
        const len = size * 0.42 * (1 - t * 0.7),
          ang = a + side * 0.95;
        b.beam(
          j % 2 ? "leaf" : "leafLight",
          [xx, yy, zz],
          [xx + Math.cos(ang) * len, yy - 0.1, zz + Math.sin(ang) * len],
          size * 0.12,
        );
      }
    }
  }
}
function palm(b, x, y, z, height = 4, phase = 0) {
  for (let i = 0; i < height / 0.27; i++)
    b.box(
      i % 3 ? "wood" : "copper",
      x + Math.sin(i * 0.14) * 0.1,
      y + i * 0.27,
      z,
      0.28,
      0.25,
      0.28,
      i * 0.21,
    );
  for (let j = 0; j < 9; j++) {
    const a = (j * TAU) / 9 + phase;
    let previous = [x, y + height, z];
    for (let k = 1; k < 7; k++) {
      const t = k / 6,
        len = height * 0.65 * t;
      const next = [
        x + Math.cos(a) * len,
        y + height + Math.sin(t * Math.PI) * 0.85 - t * 0.5,
        z + Math.sin(a) * len,
      ];
      b.beam(
        k % 3 ? "leaf" : "leafLight",
        previous,
        next,
        0.25 * (1 - t * 0.65),
      );
      for (const side of [-1, 1]) {
        const s = 0.45 * Math.sin(t * Math.PI),
          angle = a + side * 1.05;
        b.beam(
          "leafLight",
          next,
          [
            next[0] + Math.cos(angle) * s,
            next[1] - 0.13,
            next[2] + Math.sin(angle) * s,
          ],
          0.12,
        );
      }
      previous = next;
    }
  }
}
function flowers(b, x, y, z, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = i * 2.399,
      r = 0.2 + Math.sqrt(i) * 0.15,
      xx = x + Math.cos(a) * r,
      zz = z + Math.sin(a) * r,
      yy = y + 0.35 + (i % 3) * 0.13;
    b.beam("leaf", [xx, y, zz], [xx, yy, zz], 0.04);
    b.box("pollen", xx, yy, zz, 0.11, 0.14, 0.11);
    for (let j = 0; j < 4; j++) {
      const aa = (j * Math.PI) / 2;
      b.box(
        i % 2 ? "petal" : "petalPink",
        xx + Math.cos(aa) * 0.115,
        yy,
        zz + Math.sin(aa) * 0.115,
        0.14,
        0.08,
        0.14,
        aa,
      );
    }
  }
}
function arch(b, x, y, z, r, depth, mat = "stone", thickness = 0.42) {
  for (let i = 0; i < 17; i++) {
    const a = (i * Math.PI) / 17 + 0.009,
      c = ((i + 1) * Math.PI) / 17 - 0.009;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    shape.lineTo(Math.cos(a) * (r + thickness), Math.sin(a) * (r + thickness));
    shape.lineTo(Math.cos(c) * (r + thickness), Math.sin(c) * (r + thickness));
    shape.lineTo(Math.cos(c) * r, Math.sin(c) * r);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
    });
    b.add(
      i === 8 ? "trim" : mat,
      geo,
      new THREE.Matrix4().makeTranslation(x, y, z - depth / 2),
    );
    geo.dispose();
  }
}

export function createConservatory(scene) {
  const b = new DistrictBuilder(scene, {
    stone: 0xb5b299,
    trim: 0xe1d9b5,
    brick: 0xa26e51,
    roof: 0x347b6b,
    iron: 0x264b42,
    accent: 0x54a98a,
    glass: 0x65c794,
    leaf: 0x347245,
    glow: 0xcbffd3,
  });
  b.root.name = "Verdant Conservatory · glass, copper and living collections";
  sceneryMaterials(b);
  material(b, "leafLight", 0x83b953);
  material(b, "petal", 0xf4c455);
  material(b, "petalPink", 0xd97888);
  material(b, "pollen", 0xffe7a1);
  material(b, "water", 0x72dbbd, 0.28, 0.23);
  const cx = -7.8,
    cz = -10.3;
  // The solid base ends below the glass so the planted interior remains visible.
  b.masonry(cx, 0, cz, 12.8, 1.35, 9.2);
  b.box("dark", cx, 1.5, cz, 12.1, 0.13, 8.55);
  b.box("trim", cx, 1.62, cz, 12.95, 0.12, 9.4);
  const front = cz + 4.6;
  for (const x of [
    cx - 6.1,
    cx - 3.7,
    cx - 1.3,
    cx + 1.3,
    cx + 3.7,
    cx + 6.1,
  ]) {
    b.box("iron", x, 4.22, front, 0.15, 5.25, 0.16);
    b.box("brass", x, 1.95, front, 0.32, 0.45, 0.28);
    b.box("brass", x, 6.55, front, 0.3, 0.22, 0.32);
    finial(b, x, 6.85, front, 0.7);
  }
  // Gridded clear walls, with a pale iron arcade across the broad frontage.
  for (const sign of [-1, 1]) {
    const z = cz + sign * 4.6;
    b.box("glass", cx, 4.2, z, 12.4, 5, 0.055);
    for (const yy of [1.9, 3.2, 4.6, 6.5])
      b.box("iron", cx, yy, z + 0.055, 12.8, 0.095, 0.12);
    for (let x = cx - 6; x <= cx + 6; x += 0.8)
      b.box("iron", x, 4.2, z + 0.04, 0.047, 4.75, 0.08);
    for (let x = cx - 4.8; x < cx + 6; x += 2.4)
      arch(b, x, 5.4, z, 1.05, 0.14, "brass", 0.075);
  }
  for (const side of [-1, 1]) {
    const x = cx + side * 6.4;
    b.box("glass", x, 4.2, cz, 0.055, 5, 9.2);
    for (let z = cz - 4.6; z <= cz + 4.6; z += 0.92)
      b.box("iron", x, 4.2, z, 0.11, 5.2, 0.095);
    for (const yy of [1.9, 3.2, 4.6, 6.5])
      b.box("iron", x, yy, cz, 0.12, 0.09, 9.3);
  }
  // Segmented pitched glass wings. Every roof panel has a metal perimeter.
  for (const sign of [-1, 1]) {
    for (let z = cz - 4.6; z < cz + 4.6; z += 0.92) {
      const a = [cx + sign * 6.4, 6.65, z],
        c = [cx, 8.15, z];
      b.beam("iron", a, c, 0.12);
      b.beam(
        "brass",
        [a[0], a[1] + 0.045, a[2]],
        [c[0], c[1] + 0.045, c[2]],
        0.04,
      );
    }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8,
        x = cx + sign * 6.4 * (1 - t),
        y = 6.65 + 1.5 * t;
      const geo = new THREE.BoxGeometry(0.82, 0.045, 9.2);
      b.add(
        "glass",
        geo,
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, cz),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            -sign * Math.atan(1.5 / 6.4),
          ),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      geo.dispose();
      b.box("iron", x, y + 0.035, cz, 0.055, 0.06, 9.3);
    }
  }
  // A faceted Victorian palm-house dome, elliptical in profile and open underneath.
  const domeY = 7.2,
    radius = 4.3,
    domeH = 4.7;
  const dome = new THREE.SphereGeometry(1, 24, 10, 0, TAU, 0, Math.PI / 2);
  b.add(
    "glass",
    dome,
    new THREE.Matrix4().compose(
      new THREE.Vector3(cx, domeY, cz),
      new THREE.Quaternion(),
      new THREE.Vector3(radius, domeH, radius),
    ),
  );
  dome.dispose();
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16;
    for (let j = 0; j < 10; j++) {
      const t = (j * Math.PI) / 20,
        tt = ((j + 1) * Math.PI) / 20;
      b.beam(
        "trim",
        [
          cx + Math.cos(a) * Math.cos(t) * radius,
          domeY + Math.sin(t) * domeH,
          cz + Math.sin(a) * Math.cos(t) * radius,
        ],
        [
          cx + Math.cos(a) * Math.cos(tt) * radius,
          domeY + Math.sin(tt) * domeH,
          cz + Math.sin(a) * Math.cos(tt) * radius,
        ],
        0.095,
      );
    }
  }
  for (let j = 0; j < 7; j++) {
    const t = (j * Math.PI) / 14;
    b.ring(
      j % 2 ? "iron" : "brass",
      cx,
      domeY + Math.sin(t) * domeH,
      cz,
      Math.cos(t) * radius,
      0.055,
      "y",
    );
  }
  b.cyl("brass", cx, 11.92, cz, 0.62, 0.22);
  b.cyl("iron", cx, 12.25, cz, 0.38, 0.55);
  for (let i = 0; i < 5; i++)
    b.cyl("roof", cx, 12.56 + i * 0.12, cz, 0.66 - i * 0.11, 0.13);
  finial(b, cx, 13.13, cz, 1.15);
  // Proud entrance pavilion, door and brass sunburst. Its steps stop at z=-3.1.
  for (const sign of [-1, 1]) {
    b.masonry(cx + sign * 1.3, 0, front + 0.14, 0.48, 4.1, 0.68);
    b.box("iron", cx + sign * 0.48, 2.68, front + 0.42, 0.88, 2.05, 0.11);
    b.box("glass", cx + sign * 0.48, 3.15, front + 0.5, 0.72, 0.95, 0.03);
    b.box("brass", cx + sign * 0.12, 2.4, front + 0.56, 0.065, 0.42, 0.06);
  }
  arch(b, cx, 4.0, front + 0.2, 1.3, 0.45, "trim", 0.3);
  b.ring("brass", cx, 5, front + 0.4, 0.6, 0.065);
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    b.beam(
      "brass",
      [cx, 5, front + 0.4],
      [cx + Math.sin(a) * 0.54, 5 + Math.cos(a) * 0.54, front + 0.4],
      0.04,
    );
  }
  for (let i = 0; i < 4; i++)
    b.box(
      "stone",
      cx,
      0.14 + i * 0.25,
      front + 0.9 - i * 0.23,
      2.5,
      0.28,
      0.85,
    );
  // Specimen palms above a dense understorey, visible through the lower glazing.
  for (const [x, z, h, phase] of [
    [-11.2, -10, 3.5, 0],
    [-7.8, -10.3, 5.1, 0.5],
    [-3.4, -8.4, 2.9, 1],
  ]) {
    const base = pot(b, x, 1.6, z, 0.85);
    const tree = b.moving(x, base, z, () => palm(b, 0, 0, 0, h, phase));
    tree.name = "Palm fronds";
    b.animations.push((time, dt, on) => {
      tree.rotation.z =
        Math.sin(time * 0.65 + phase) * (0.004 + (on ? 0.006 : 0));
    });
  }
  for (let i = 0; i < 20; i++) {
    const x = cx - 5.5 + (i % 6) * 2.12,
      z = cz - 3.5 + Math.floor(i / 6) * 2.05;
    const y = pot(b, x, 1.65, z, 0.36);
    fern(b, x, y, z, 0.65 + (i % 3) * 0.13, i * 0.8);
    if (i % 2 === 0) flowers(b, x + 0.55, 1.65, z + 0.3, 5);
  }
  for (const x of [-13, -11, -5, -3]) {
    const yy = pot(b, x, 0, -4.6, 0.52);
    flowers(b, x, yy, -4.6, 9);
  }
  // Tall irrigation engine: a filigree wind-driven water crown rather than a building.
  const tx = 6.2,
    tz = -14.5;
  b.masonry(tx, 0, tz, 4.1, 1.65, 4.1);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = tx + sx * 1.62,
        z = tz + sz * 1.62;
      b.box("trim", x, 2.05, z, 0.65, 0.7, 0.65);
      b.pipe("iron", [x, 2.4, z], [x, 12.8, z], 0.16);
      for (const yy of [4.7, 7.4, 10.1]) b.cyl("brass", x, yy, z, 0.26, 0.2);
      b.beam("copper", [x, 3, z], [tx - sx * 1.62, 6.9, z], 0.095);
      b.beam("iron", [x, 7.3, z], [tx - sx * 1.62, 10.8, z], 0.085);
    }
  b.box("iron", tx, 2.6, tz, 3.4, 0.22, 0.35);
  b.box("iron", tx, 2.6, tz, 0.35, 0.22, 3.4);
  b.tank(tx, 3.1, tz, 1.13, 5.3);
  b.cyl("accent", tx, 11.9, tz, 2.22, 0.52);
  b.cyl("brass", tx, 12.2, tz, 2.38, 0.18);
  b.cyl("dark", tx, 12.31, tz, 2.15, 0.08);
  b.cyl("water", tx, 12.37, tz, 2.1, 0.05);
  for (let i = 0; i < 20; i++) {
    const a = (i * TAU) / 20;
    b.box(
      "brass",
      tx + Math.cos(a) * 2.27,
      12.03,
      tz + Math.sin(a) * 2.27,
      0.12,
      0.45,
      0.12,
    );
  }
  b.pipe("copper", [tx, 8.7, tz], [tx, 14.8, tz], 0.18);
  const spinner = b.moving(tx, 14.2, tz, () => {
    b.cyl("brass", 0, 0, 0, 0.33, 0.7);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8,
        xx = Math.cos(a) * 2.8,
        zz = Math.sin(a) * 2.8;
      b.pipe("copper", [0, 0, 0], [xx, 0, zz], 0.075);
      b.box("accent", xx, 0.28, zz, 0.7, 0.58, 0.07, -a);
      b.box("brass", xx, 0.6, zz, 0.72, 0.055, 0.09, -a);
      b.box("glow", xx, -0.16, zz, 0.13, 0.13, 0.13);
    }
  });
  spinner.name = "Irrigation wind whirligig";
  b.animations.push((time, dt, on) => {
    spinner.rotation.y += dt * (on ? 0.46 : 0.06);
  });
  finial(b, tx, 14.8, tz, 1.4);
  b.gear(tx, 4.6, tz + 1.4, 1.05, 16, -0.35);
  b.pipe("copper", [tx - 1.8, 10, tz], [tx - 1.8, 10, -8], 0.22);
  b.pipe("copper", [tx - 1.8, 10, -8], [-0.8, 10, -8], 0.22);
  b.pipe("copper", [-0.8, 10, -8], [-0.8, 3, -8], 0.22);
  for (const z of [-12, -9])
    b.pipe("brass", [tx - 1.8, 10, z], [tx - 1.8, 9.4, z], 0.1);
  b.steamSources.push([tx - 1.8, 9.4, -12], [-0.8, 10, -8]);
  // Raised botanical beds and an espalier beyond the courtyard boundary.
  for (const [x, z] of [
    [5, -6],
    [10, -8.5],
    [11.5, -15],
  ]) {
    b.masonry(x, 0, z, 2.5, 0.65, 2.1);
    b.box("dark", x, 0.8, z, 2.2, 0.12, 1.8);
    fern(b, x, 0.85, z, 1.25, x);
    flowers(b, x + 0.5, 0.85, z + 0.6, 9);
  }
  for (let i = 0; i < 6; i++) {
    const x = 1.2 + i * 2.15;
    b.box("iron", x, 2.75, -19, 0.12, 5.5, 0.12);
    finial(b, x, 5.5, -19, 0.65);
    if (i < 5) arch(b, x + 1.075, 4.3, -19, 1.02, 0.12, "iron", 0.09);
    fern(b, x, 0.1, -19, 0.9, i);
  }
  b.animations.push((time, dt, on) => {
    b.materials.leafLight.emissive.setHex(0x48882d);
    b.materials.leafLight.emissiveIntensity = on
      ? 0.14 + Math.sin(time * 1.5) * 0.05
      : 0;
    b.materials.water.emissive.setHex(0x4cddbd);
    b.materials.water.emissiveIntensity = on ? 0.24 : 0.03;
  });
  b.lights.push(
    { position: [cx, 6, cz], color: 0xaaffbc, intensity: 2, distance: 12 },
    { position: [tx, 12, tz], color: 0x86ffce, intensity: 2, distance: 9 },
  );
  dockEdges(b);
  farCity(b, "garden");
  return b.finish();
}

// Water is purpose-built stepped geometry. All falling droplets share one batch.
function fallingWater(b, x, y, z, width, height, phase = 0) {
  b.box("water", x, y - height / 2, z, width, height, 0.12);
  const drops = b.moving(x, y, z, () => {
    for (let i = 0; i < 22; i++) {
      const xx = ((i * 13) % 23) / 23 - 0.5,
        yy = (-(i % 11) * height) / 11;
      b.box(
        i % 3 ? "foam" : "water",
        xx * width,
        yy,
        0.09,
        0.035 + (i % 3) * 0.025,
        0.15 + (i % 4) * 0.07,
        0.035,
      );
    }
  });
  drops.name = "Falling water glints";
  b.animations.push((time, dt, on) => {
    drops.position.y =
      y - ((time * (on ? 1.15 : 0.35) + phase) % (height / 11));
  });
  for (let i = 0; i < 7; i++)
    b.box(
      "foam",
      x + ((i - 3) * width) / 7,
      y - height + 0.08,
      z + 0.1 + (i % 2) * 0.12,
      (width / 7) * 0.8,
      0.08,
      0.3,
    );
}
function channel(b, a, c, r = 0.3) {
  // Flat open bronze trough, with independently readable turquoise water.
  const dx = c[0] - a[0],
    dz = c[2] - a[2],
    len = Math.hypot(dx, dz),
    nx = -dz / len,
    nz = dx / len;
  b.beam("copper", a, c, r * 2);
  b.beam("water", [a[0], a[1] + r, a[2]], [c[0], c[1] + r, c[2]], r * 1.4);
  for (const side of [-1, 1])
    b.beam(
      "brass",
      [a[0] + nx * r * side, a[1] + r, a[2] + nz * r * side],
      [c[0] + nx * r * side, c[1] + r, c[2] + nz * r * side],
      0.085,
    );
}
export function createTideworks(scene) {
  const b = new DistrictBuilder(scene, {
    stone: 0xb4b6a4,
    trim: 0xe0ddbc,
    brick: 0x7e9ea0,
    roof: 0x2e697d,
    iron: 0x29444e,
    copper: 0x9d7855,
    accent: 0x319da7,
    glass: 0x8bd6dd,
    glow: 0x8feafb,
  });
  b.root.name = "Azure Tideworks · aqueduct and tidal machinery";
  sceneryMaterials(b);
  material(b, "cobalt", 0x316994, 0.42, 0.26);
  material(b, "tileLight", 0x78bfc6, 0.3, 0.3);
  material(b, "water", 0x39becd, 0.3, 0.19);
  material(b, "foam", 0xc3fff0, 0.05, 0.36);
  // Pump station behind the aqueduct, with alternating glazed ceramic panels.
  b.masonry(-8.5, 0, -16.3, 8.5, 6.8, 5.4);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 13; col++) {
      b.box(
        (row + col) % 4 ? "cobalt" : "tileLight",
        -12.35 + col * 0.64,
        1.2 + row * 0.51,
        -13.52,
        0.595,
        0.465,
        0.09,
      );
    }
  for (const x of [-11.1, -8.5, -5.9]) {
    b.window(x, 3.5, -13.38, 1.2, 2.25);
    b.box("trim", x, 6.75, -13.45, 1.65, 0.16, 0.35);
  }
  b.roof(-8.5, 7.1, -16.3, 9.1, 6.2, 2.7);
  for (const x of [-11.5, -5.5]) {
    b.tank(x, 9, -16.3, 0.52, 1.4);
    b.steamSources.push([x, 11.5, -16.3]);
  }
  b.pipe("copper", [-12.7, 6.9, -13.1], [-4.3, 6.9, -13.1], 0.23);
  b.pipe("copper", [-12.7, 6.9, -13.1], [-12.7, 0.7, -13.1], 0.23);
  b.pipe("accent", [-4.3, 6.9, -13.1], [-4.3, 3, -13.1], 0.3);
  // Three open aqueduct arches: actual wedge blocks, voussoirs and no filled arch faces.
  const az = -8.7;
  for (const x of [-14.1, -9.5, -4.9, -0.3]) {
    b.masonry(x, 0, az, 0.76, 3.8, 1.65);
    b.box("trim", x, 3.76, az, 1.16, 0.26, 1.95);
    b.box("stone", x, 0.16, az, 1.4, 0.32, 2.2);
  }
  for (const x of [-11.8, -7.2, -2.6]) {
    arch(b, x, 3.6, az, 1.91, 1.65, "stone", 0.46);
    arch(b, x, 3.6, az + 0.89, 1.92, 0.18, "trim", 0.25);
    // Small vertical blocks fill the spandrel above the arc but leave its opening clear.
    for (let i = 0; i < 12; i++) {
      const xx = -2.3 + ((i + 0.5) * 4.6) / 12,
        curve = Math.sqrt(Math.max(0, 2.38 ** 2 - xx ** 2)),
        bottom = 3.6 + curve;
      const h = 6.23 - bottom;
      if (h > 0.05)
        b.box("stone", x + xx, bottom + h / 2, az, 4.6 / 12 - 0.02, h, 1.62);
    }
  }
  b.box("trim", -7.2, 6.34, az, 14.7, 0.23, 1.98);
  b.box("copper", -7.2, 6.57, az, 14.7, 0.19, 1.4);
  b.box("water", -7.2, 6.69, az, 14.65, 0.06, 1.16);
  for (const sign of [-1, 1])
    b.box("trim", -7.2, 6.82, az + sign * 0.76, 14.8, 0.55, 0.23);
  for (let x = -14.4; x < 0.2; x += 0.56)
    b.box("tileLight", x, 6.84, az + 0.9, 0.5, 0.22, 0.04);
  fallingWater(b, -13.1, 6.7, -8.35, 0.7, 5.8, 0);
  fallingWater(b, -1.45, 6.7, -8.35, 0.5, 3.7, 0.3);
  b.box("stone", -13.1, 0.34, -8.4, 1.5, 0.68, 2.25);
  b.box("water", -13.1, 0.7, -8.4, 1.25, 0.045, 1.95);
  channel(b, [-1.4, 3, -8.4], [2.7, 3, -8.4], 0.24);
  fallingWater(b, 2.7, 3.2, -8.35, 0.55, 2.65, 0.4);
  // Great wheel: layered oak buckets, dual iron rims, bolted brass rings and spokes.
  const wx = 6.3,
    wy = 6.4,
    wz = -11.8,
    r = 5.4;
  for (const x of [wx - 4.7, wx + 4.7]) {
    b.masonry(x, 0, wz, 1.2, 2.3, 3.7);
    b.box("trim", x, 2.4, wz, 1.55, 0.22, 4);
  }
  b.masonry(wx, 0, wz + 1.9, 1.3, 5.3, 1.1);
  b.masonry(wx, 0, wz - 1.9, 1.3, 5.3, 1.1);
  for (const z of [wz - 1.9, wz + 1.9]) {
    b.beam("iron", [wx - 4.5, 1, z], [wx, wy, z], 0.32);
    b.beam("iron", [wx + 4.5, 1, z], [wx, wy, z], 0.32);
    b.cyl("brass", wx, wy, z, 0.64, 0.44, "z");
  }
  b.cyl("iron", wx, wy, wz, 0.28, 5.2, "z");
  const wheel = b.moving(wx, wy, wz, () => {
    for (const z of [-1.1, 1.1]) {
      b.ring("iron", 0, 0, z, r - 0.08, 0.23);
      b.ring("copper", 0, 0, z, r - 0.5, 0.15);
      b.ring("brass", 0, 0, z + (z > 0 ? 0.2 : -0.2), r - 0.2, 0.075);
      b.ring("iron", 0, 0, z, 1.08, 0.17);
      rivets(b, 0, 0, z + (z > 0 ? 0.25 : -0.25), r - 0.15, 32);
      b.cyl("copper", 0, 0, z, 0.73, 0.27, "z");
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        b.beam(
          "iron",
          [Math.sin(a) * 0.6, Math.cos(a) * 0.6, z],
          [Math.sin(a) * (r - 0.3), Math.cos(a) * (r - 0.3), z],
          0.2,
        );
        b.beam(
          "brass",
          [Math.sin(a) * 1.2, Math.cos(a) * 1.2, z + 0.1],
          [Math.sin(a) * (r - 0.7), Math.cos(a) * (r - 0.7), z + 0.1],
          0.055,
        );
        b.beam(
          "copper",
          [Math.sin(a) * 2.5, Math.cos(a) * 2.5, z],
          [Math.sin(a + 0.4) * 4.8, Math.cos(a + 0.4) * 4.8, z],
          0.09,
        );
      }
    }
    for (let i = 0; i < 32; i++) {
      const a = (i * TAU) / 32,
        xx = Math.sin(a) * (r - 0.3),
        yy = Math.cos(a) * (r - 0.3);
      for (let j = 0; j < 5; j++) {
        const geo = new THREE.BoxGeometry(0.64, 0.19, 0.405);
        b.add(
          j % 2 ? "wood" : "copper",
          geo,
          new THREE.Matrix4().compose(
            new THREE.Vector3(xx, yy, -0.84 + j * 0.42),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              -a,
            ),
            new THREE.Vector3(1, 1, 1),
          ),
        );
        geo.dispose();
      }
      b.beam("brass", [xx, yy, -1.25], [xx, yy, 1.25], 0.075);
      b.beam(
        "iron",
        [Math.sin(a) * (r - 0.7), Math.cos(a) * (r - 0.7), -1.1],
        [Math.sin(a) * (r - 0.7), Math.cos(a) * (r - 0.7), 1.1],
        0.065,
      );
    }
  });
  wheel.name = "Great tidal wheel · thirty-two buckets";
  b.animations.push((time, dt, on) => {
    wheel.rotation.z -= dt * (on ? 0.16 : 0.024);
  });
  b.gear(wx, wy, wz + 2.35, 1.23, 20, -0.16);
  b.gear(wx + 1.8, wy - 1.6, wz + 2.4, 0.85, 14, 0.23);
  channel(b, [0.2, 6.9, -8.7], [2, 6.9, -11.6], 0.46);
  fallingWater(b, 2, 6.95, -11.55, 0.85, 5.8, 0.2);
  b.box("stone", wx, 0.16, wz, 11.1, 0.32, 4.1);
  b.box("water", wx, 0.36, wz, 10.7, 0.08, 3.75);
  // A narrow lighthouse behind the right-hand wheel: glazed belts, external pipe and gallery.
  const lx = 11.8,
    lz = -17.1;
  b.masonry(lx, 0, lz, 2.85, 10.4, 3.05);
  for (const yy of [2.3, 5.3, 8.3]) {
    b.box("cobalt", lx, yy, lz, 2.96, 0.75, 3.16);
    b.box("trim", lx, yy + 0.46, lz, 3.1, 0.14, 3.3);
    b.window(lx, yy + 0.62, lz + 1.57, 0.7, 1.6);
  }
  b.box("trim", lx, 10.7, lz, 3.8, 0.32, 3.95);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box("iron", lx + sx * 1.18, 12, lz + sz * 1.18, 0.13, 2.4, 0.13);
  b.box("glass", lx, 12, lz, 2.45, 2.25, 2.45);
  b.cyl("glow", lx, 12, lz, 0.42, 1.45);
  b.cyl("brass", lx, 12.8, lz, 0.61, 0.15);
  b.cyl("brass", lx, 11.2, lz, 0.61, 0.15);
  for (const yy of [11, 12, 13]) b.box("iron", lx, yy, lz, 2.65, 0.1, 2.65);
  b.roof(lx, 13.1, lz, 3.5, 3.5, 1.6);
  finial(b, lx, 14.8, lz, 1.1);
  for (const side of [-1, 1]) {
    balustrade(b, lx, lz + side * 1.8, 3.7, "x", 10.9);
    balustrade(b, lx + side * 1.8, lz, 3.6, "z", 10.9);
  }
  b.pipe("copper", [lx + 1.62, 0.6, lz], [lx + 1.62, 11, lz], 0.18);
  b.pipe("copper", [lx + 1.62, 11, lz], [lx, 11, lz], 0.18);
  // Secondary pressure vessels and low open sluicework to balance the left foreground.
  for (const [x, z, h] of [
    [-11.8, -4.7, 2.6],
    [-8.9, -4.6, 1.9],
  ]) {
    b.masonry(x, 0, z, 1.7, 0.4, 1.8);
    b.tank(x, 0.75, z, 0.62, h);
  }
  b.pipe("accent", [-11.8, 1.6, -4.7], [-8.9, 1.6, -4.6], 0.2);
  b.gear(-11.8, 2.1, -3.9, 0.4, 10, 0.3);
  b.box("stone", -0.2, 0.3, -4.7, 3.4, 0.6, 1.5);
  b.box("water", -0.2, 0.64, -4.7, 3.1, 0.07, 1.25);
  channel(b, [-4.3, 2, -13], [-4.3, 2, -5], 0.27);
  channel(b, [-4.3, 2, -5], [-1.5, 2, -5], 0.27);
  fallingWater(b, -1.5, 2.25, -4.8, 0.55, 1.52, 0.6);
  for (const x of [-3.6, -2.4]) {
    b.box("iron", x, 1.5, -5, 0.08, 3, 0.08);
    b.cyl("brass", x, 3, -5, 0.15, 0.1);
  }
  b.beam("iron", [-3.6, 2.8, -5], [-2.4, 2.8, -5], 0.11);
  b.gear(-3, 2.8, -4.87, 0.34, 10, 0.5);
  // Rhythmic glints remain in their channels; the engine provides ocean and spray particles.
  b.animations.push((time, dt, on) => {
    b.materials.water.emissive.setHex(0x1cbacc);
    b.materials.water.emissiveIntensity = on
      ? 0.14 + Math.sin(time * 1.7) * 0.05
      : 0.025;
    b.materials.foam.emissive.setHex(0x99ffff);
    b.materials.foam.emissiveIntensity = on ? 0.22 : 0.04;
  });
  b.lights.push(
    { position: [lx, 12, lz], color: 0xc0f6ff, intensity: 3, distance: 13 },
    {
      position: [wx, wy, wz + 2.6],
      color: 0x75dce9,
      intensity: 1.4,
      distance: 8,
    },
  );
  dockEdges(b);
  farCity(b, "coast");
  return b.finish();
}
