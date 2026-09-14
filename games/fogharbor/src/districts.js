import * as THREE from "three";
import {
  RAILWAY,
  alignRailSupportGeometry,
  addRailRunningSurface,
} from "./railway.js";
import {
  hipRoofGeometry,
  archMouldingGeometry,
  masonryMaterial,
  slateMaterial,
  foliageGeometry,
} from "./architecture.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original western waterfront: a lived-in wharf and a walk-in municipal engine hall.
export function createDistricts(scene) {
  const root = new THREE.Group();
  root.name = "Rivenport western districts";
  scene.add(root);
  const palette = {
    stone: "#c4b99b",
    lightStone: "#ded2af",
    darkStone: "#929081",
    mortar: "#77796b",
    brick: "#92654f",
    brickLight: "#9c7058",
    brickDark: "#865d4b",
    slate: "#566064",
    slateLight: "#6b7373",
    burgundy: "#683840",
    roofLight: "#78444a",
    iron: "#303e3e",
    ironLight: "#526163",
    copper: "#a46e3f",
    copperLight: "#d79b51",
    brass: "#bc994c",
    patina: "#527e6e",
    wood: "#654b34",
    woodLight: "#94734c",
    woodDark: "#3d3429",
    green: "#3e6954",
    greenLight: "#597f60",
    leaf: "#52693b",
    leafLight: "#85905a",
    leafDark: "#354e37",
    cream: "#efe0b7",
    ochre: "#c19954",
    window: "#293e3e",
    glass: "#476668",
    warm: "#ffca72",
    water: "#73c6c0",
    linen: "#d8d8c7",
    blue: "#899fab",
    red: "#973f35",
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: ["copper", "copperLight", "brass"].includes(key)
          ? 0.35
          : 0.86,
        metalness: ["copper", "copperLight", "brass"].includes(key)
          ? 0.8
          : ["iron", "ironLight"].includes(key)
            ? 0.6
            : 0.03,
        flatShading: false,
        ...(key === "warm"
          ? { emissive: "#ffb753", emissiveIntensity: 0.65 }
          : {}),
      }),
    ]),
  );
  materials.roofSlate = slateMaterial();
  for (const name of ["leaf", "leafLight", "leafDark"])
    materials[name].side = THREE.DoubleSide;
  materials.ashlar = masonryMaterial();
  materials.terracotta = masonryMaterial(true);
  const wharf = new THREE.Group(),
    works = new THREE.Group(),
    skyline = new THREE.Group();
  wharf.name = "Seventh Wharf";
  works.name = "Old Pump Works";
  skyline.name = "Western skyline";
  root.add(wharf, works, skyline);
  let active = wharf,
    seed = 72319;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const batches = new Map(),
    obstacles = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const foliage = foliageGeometry();
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion();
  function group(name, parent = active) {
    const g = new THREE.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  function add(
    geo,
    mat,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rot = [0, 0, 0],
    parent = active,
  ) {
    quaternion.setFromEuler(new THREE.Euler(...rot));
    matrix.compose(
      new THREE.Vector3(x, y, z),
      quaternion,
      new THREE.Vector3(sx, sy, sz),
    );
    const key = `${parent.uuid}:${mat}`;
    if (!batches.has(key)) batches.set(key, { parent, mat, geometries: [] });
    batches.get(key).geometries.push(geo.clone().applyMatrix4(matrix));
  }
  function box(x, y, z, w, h, d, mat, rot = [0, 0, 0], parent = active) {
    add(
      mat.startsWith("leaf") ? foliage : unitBox,
      mat,
      x,
      y,
      z,
      w,
      h,
      d,
      rot,
      parent,
    );
  }
  function cylinder(
    x,
    y,
    z,
    r,
    h,
    mat,
    rot = [0, 0, 0],
    parent = active,
    top = r,
    sides = 12,
  ) {
    const g = new THREE.CylinderGeometry(top, r, h, sides).toNonIndexed();
    add(g, mat, x, y, z, 1, 1, 1, rot, parent);
    g.dispose();
  }
  function ring(
    x,
    y,
    z,
    r,
    t,
    mat,
    rot = [0, 0, 0],
    parent = active,
    arc = Math.PI * 2,
  ) {
    const g = new THREE.TorusGeometry(r, t, 6, 36, arc).toNonIndexed();
    add(g, mat, x, y, z, 1, 1, 1, rot, parent);
    g.dispose();
  }
  function beam(a, b, r, mat, parent = active, square = false) {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const g = square
      ? new THREE.BoxGeometry(r * 2, delta.length(), r * 2).toNonIndexed()
      : new THREE.CylinderGeometry(r, r, delta.length(), 8).toNonIndexed();
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        from.add(to).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.normalize(),
        ),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    add(g, mat, 0, 0, 0, 1, 1, 1, [0, 0, 0], parent);
    g.dispose();
  }
  function solid(x, z, w, d) {
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  function wall(x, y, z, w, h, d, brick = false, parent = active) {
    box(
      x,
      y + h / 2,
      z,
      w,
      h,
      d,
      brick ? "terracotta" : "ashlar",
      [0, 0, 0],
      parent,
    );
  }
  function sideWall(
    x,
    y,
    z,
    depth,
    h,
    brick = false,
    parent = active,
    facing = 1,
  ) {
    const g = group("bonded return wall", parent);
    g.position.set(x, 0, z);
    g.rotation.y = (facing * Math.PI) / 2;
    wall(0, y, 0, depth, h, 0.22, brick, g);
  }
  function sign(text, x, y, z, w, h, parent = active) {
    box(x, y, z, w + 0.13, h + 0.13, 0.12, "woodDark", [0, 0, 0], parent);
    for (const dx of [-w / 2, w / 2])
      for (const dy of [-h / 2, h / 2])
        cylinder(
          x + dx,
          y + dy,
          z + 0.073,
          0.022,
          0.026,
          "brass",
          [Math.PI / 2, 0, 0],
          parent,
          0.022,
          6,
        );
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const c = canvas.getContext("2d");
    c.fillStyle = "#252e2b";
    c.fillRect(0, 0, 1024, canvas.height);
    c.strokeStyle = "#a98c51";
    c.lineWidth = 3;
    c.strokeRect(10, 10, 1004, canvas.height - 20);
    const rows = text.split("\n"),
      lineHeight = canvas.height / (rows.length + 1);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#e7d4a4";
    c.font = `600 ${lineHeight * 0.88}px Georgia, serif`;
    rows.forEach((row, i) => c.fillText(row, 512, lineHeight * (i + 1), 965));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.set(x, y, z + 0.077);
    parent.add(mesh);
  }
  function windowAt(x, y, z, w = 1, h = 1.5, parent = active, arched = false) {
    if (arched) {
      const spring = h / 2 - w / 2,
        s = new THREE.Shape();
      s.moveTo(-w / 2, -h / 2);
      s.lineTo(-w / 2, spring);
      s.absarc(0, spring, w / 2, Math.PI, 0, true);
      s.lineTo(w / 2, -h / 2);
      s.closePath();
      const geo = new THREE.ShapeGeometry(s, 12).toNonIndexed();
      add(geo, "window", x, y, z + 0.025, 1, 1, 1, [0, 0, 0], parent);
      geo.dispose();
      const arch = archMouldingGeometry(w / 2 + 0.01, 0.105, 0.15);
      add(arch, "lightStone", x, y + spring, z, 1, 1, 1, [0, 0, 0], parent);
      arch.dispose();
      for (const side of [-1, 1])
        box(
          x + side * (w / 2 + 0.045),
          y + (spring - h / 2) / 2,
          z + 0.05,
          0.12,
          h / 2 + spring,
          0.18,
          "stone",
          [0, 0, 0],
          parent,
        );
    } else {
      box(x, y, z, w + 0.21, h + 0.19, 0.15, "darkStone", [0, 0, 0], parent);
      box(x, y, z + 0.09, w, h, 0.027, "window", [0, 0, 0], parent);
      for (const dx of [-w / 2, w / 2])
        box(
          x + dx,
          y,
          z + 0.13,
          0.075,
          h,
          0.12,
          "lightStone",
          [0, 0, 0],
          parent,
        );
      box(
        x,
        y + h / 2,
        z + 0.13,
        w,
        0.09,
        0.13,
        "lightStone",
        [0, 0, 0],
        parent,
      );
    }
    box(x, y, z + 0.13, 0.052, h, 0.07, "woodLight", [0, 0, 0], parent);
    box(x, y - 0.12, z + 0.13, w, 0.052, 0.07, "woodLight", [0, 0, 0], parent);
    box(
      x,
      y - h / 2 - 0.1,
      z + 0.13,
      w + 0.36,
      0.16,
      0.38,
      "lightStone",
      [0, 0, 0],
      parent,
    );
    box(
      x - w * 0.22,
      y - h * 0.13,
      z + 0.105,
      w * 0.22,
      h * 0.36,
      0.014,
      "glass",
      [0, 0, 0],
      parent,
    );
  }
  function leaves(x, y, z, r = 0.35, parent = active, flowers = false) {
    for (let i = 0; i < 15; i++) {
      const a = i * 2.4,
        rr = r * (0.4 + (i % 4) * 0.19),
        xx = x + Math.sin(a) * rr,
        zz = z + Math.cos(a) * rr,
        yy = y + (i % 3) * 0.095;
      box(
        xx,
        yy,
        zz,
        0.18,
        0.2,
        0.2,
        i % 3 ? "leaf" : "leafLight",
        [0, a, 0],
        parent,
      );
      if (flowers && i % 4 === 0) {
        box(xx, yy + 0.14, zz, 0.1, 0.04, 0.05, "cream", [0, 0, 0], parent);
        box(xx, yy + 0.14, zz, 0.05, 0.04, 0.1, "cream", [0, 0, 0], parent);
        box(xx, yy + 0.17, zz, 0.029, 0.019, 0.029, "ochre", [0, 0, 0], parent);
      }
    }
  }
  function pot(x, y, z, r = 0.28, parent = active) {
    cylinder(x, y + 0.2, z, r, 0.4, "brick", [0, 0, 0], parent, r * 0.78, 10);
    cylinder(x, y + 0.405, z, r * 1.03, 0.07, "brickLight", [0, 0, 0], parent);
    leaves(x, y + 0.55, z, r * 1.05, parent, true);
  }
  function crate(x, y, z, w = 0.6, parent = active) {
    box(x, y + w * 0.44, z, w, w * 0.86, w, "woodDark", [0, 0, 0], parent);
    for (let i = 0; i < 4; i++)
      for (const side of [-1, 1]) {
        box(
          x,
          y + 0.09 + i * w * 0.2,
          z + side * w * 0.51,
          w,
          0.09,
          0.04,
          "woodLight",
          [0, 0, 0],
          parent,
        );
        box(
          x + side * w * 0.51,
          y + 0.09 + i * w * 0.2,
          z,
          0.04,
          0.09,
          w,
          "wood",
          [0, 0, 0],
          parent,
        );
      }
    for (const dx of [-w * 0.4, w * 0.4])
      box(
        x + dx,
        y + w * 0.44,
        z + w * 0.53,
        0.06,
        w * 0.9,
        0.05,
        "wood",
        [0, 0, 0],
        parent,
      );
  }
  function barrel(x, y, z, r = 0.3, parent = active) {
    cylinder(x, y + 0.4, z, r, 0.78, "wood", [0, 0, 0], parent, r * 0.87, 12);
    for (const yy of [0.1, 0.4, 0.68])
      cylinder(x, y + yy, z, r * 1.025, 0.065, "iron", [0, 0, 0], parent);
  }
  function lantern(x, y, z, parent = active) {
    box(x, y, z, 0.26, 0.37, 0.26, "warm", [0, 0, 0], parent);
    for (const dx of [-0.14, 0.14])
      for (const dz of [-0.14, 0.14])
        box(x + dx, y, z + dz, 0.03, 0.43, 0.03, "iron", [0, 0, 0], parent);
    box(x, y - 0.24, z, 0.35, 0.07, 0.35, "iron", [0, 0, 0], parent);
    cylinder(x, y + 0.27, z, 0.25, 0.14, "iron", [0, 0, 0], parent, 0.065, 4);
  }
  function lamp(x, z, parent = active) {
    cylinder(x, 0.15, z, 0.16, 0.3, "iron", [0, 0, 0], parent);
    cylinder(x, 1.36, z, 0.06, 2.65, "iron", [0, 0, 0], parent);
    beam([x, 2.56, z], [x + 0.28, 2.83, z], 0.04, "iron", parent);
    lantern(x + 0.28, 2.49, z, parent);
    solid(x, z, 0.31, 0.31);
  }
  function railing(x1, z1, x2, z2, y = 0.03, parent = active) {
    const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        x = x1 + (x2 - x1) * t,
        z = z1 + (z2 - z1) * t;
      cylinder(x, y + 0.43, z, 0.047, 0.86, "iron", [0, 0, 0], parent);
      cylinder(x, y + 0.91, z, 0.07, 0.08, "iron", [0, 0, 0], parent);
    }
    for (const h of [0.34, 0.85])
      beam([x1, y + h, z1], [x2, y + h, z2], 0.032, "iron", parent);
  }
  function roofTiles(x, y, z, w, d, h, mat = "slate", parent = active) {
    const roof = hipRoofGeometry(w, d, h, Math.min(h * 0.6, w * 0.3, d * 0.3));
    add(roof, "roofSlate", x, y, z, 1, 1, 1, [0, 0, 0], parent);
    roof.dispose();
    box(x, y - 0.035, z, w + 0.08, 0.065, d + 0.08, "iron", [0, 0, 0], parent);
  }
  function gauge(x, y, z, r = 0.23, parent = active) {
    cylinder(x, y, z, r, 0.14, "brass", [Math.PI / 2, 0, 0], parent);
    cylinder(
      x,
      y,
      z + 0.081,
      r * 0.86,
      0.02,
      "cream",
      [Math.PI / 2, 0, 0],
      parent,
    );
    for (let i = 0; i < 11; i++) {
      const a = -2.2 + i * 0.44;
      box(
        x + Math.sin(a) * r * 0.66,
        y + Math.cos(a) * r * 0.66,
        z + 0.097,
        0.012,
        0.045,
        0.01,
        "iron",
        [0, 0, -a],
        parent,
      );
    }
    beam(
      [x, y, z + 0.11],
      [x + r * 0.37, y + r * 0.35, z + 0.11],
      0.012,
      "iron",
      parent,
    );
  }
  function pipe(points, r = 0.1, parent = active) {
    for (let i = 0; i < points.length - 1; i++) {
      beam(points[i], points[i + 1], r, "copper", parent);
      const a = new THREE.Vector3(...points[i]),
        b = new THREE.Vector3(...points[i + 1]),
        dir = b.clone().sub(a).normalize(),
        mid = a.add(b).multiplyScalar(0.5);
      beam(
        mid.clone().addScaledVector(dir, -0.045).toArray(),
        mid.clone().addScaledVector(dir, 0.045).toArray(),
        r * 1.35,
        "copperLight",
        parent,
      );
    }
  }
  function valve(x, y, z, r = 0.2, parent = active) {
    ring(x, y, z, r, 0.024, "red", [0, 0, 0], parent);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      beam(
        [x, y, z],
        [x + Math.cos(a) * r, y + Math.sin(a) * r, z],
        0.016,
        "red",
        parent,
      );
    }
    cylinder(x, y, z, 0.06, 0.09, "brass", [Math.PI / 2, 0, 0], parent);
  }

  const legacyWharf = group("legacy wharf architecture", wharf);
  active = legacyWharf;
  // Seventh Wharf: three different household/storefront silhouettes share the quay.
  for (const house of [
    { x: -37, w: 5.4, z: -6, d: 4.5, h: 5.9, brick: false },
    { x: -29.85, w: 6.1, z: -6.35, d: 3.8, h: 4.4, brick: true },
    { x: -22.5, w: 5.6, z: -5.9, d: 4.8, h: 6.5, brick: false },
  ]) {
    const { x, w, z, d, h, brick } = house,
      front = z + d / 2;
    wall(x, 0, z, w, h, d, brick);
    sideWall(x + w / 2 + 0.015, 0, z, d, h, brick);
    sideWall(x - w / 2 - 0.015, 0, z, d, h, brick, legacyWharf, -1);
    for (const yy of [0.16, 3.06, h + 0.06]) {
      box(x, yy, front + 0.12, w + 0.3, 0.16, 0.38, "lightStone");
      box(x + w / 2 + 0.09, yy, z, 0.25, 0.16, d + 0.24, "stone");
    }
    for (const xx of [x - w * 0.28, x + w * 0.28])
      windowAt(xx, h - 1.33, front + 0.1, 0.91, 1.64, legacyWharf, !brick);
    const doorway = x + (brick ? 1.2 : 0);
    box(doorway, 1.25, front + 0.16, 1.08, 2.5, 0.16, "woodDark");
    box(doorway, 1.23, front + 0.26, 0.86, 2.21, 0.035, "green");
    for (const yy of [0.66, 1.53]) {
      box(doorway, yy, front + 0.285, 0.7, 0.68, 0.018, "woodDark");
      box(doorway, yy, front + 0.298, 0.6, 0.58, 0.015, "green");
    }
    cylinder(doorway + 0.31, 1.11, front + 0.33, 0.035, 0.032, "brass", [
      Math.PI / 2,
      0,
      0,
    ]);
    windowAt(x - w * 0.29, 1.61, front + 0.15, 0.88, 1.37);
    if (!brick) windowAt(x + w * 0.29, 1.61, front + 0.15, 0.88, 1.37);
    box(doorway, 0.075, front + 0.43, 1.42, 0.15, 0.48, "stone");
    roofTiles(
      x,
      h + 0.2,
      z,
      w + 0.58,
      d + 0.5,
      brick ? 0.7 : 1.32,
      brick ? "slate" : "burgundy",
    );
    for (const xx of [x - w * 0.28, x + w * 0.28]) {
      wall(xx, h + 0.9, z - 0.68, 0.56, 0.95, 0.52, true);
      box(xx, h + 1.91, z - 0.68, 0.75, 0.14, 0.7, "lightStone");
      cylinder(xx, h + 2.15, z - 0.68, 0.11, 0.36, "copper");
      box(xx, h - 2.24, front + 0.33, 1.09, 0.2, 0.42, "green");
      leaves(xx, h - 2.04, front + 0.41, 0.4, legacyWharf, true);
    }
    lantern(x + w / 2 - 0.17, 2.34, front + 0.49);
    solid(x, z, w, d);
    solid(doorway, front + 0.4, 1.44, 0.52);
  }
  sign("SEVENTH WHARF", -29.84, 3.32, -4.29, 4.35, 0.57);
  sign("CARTER & DAUGHTER\nPROVISIONS", -22.49, 3.4, -3.35, 3.49, 0.63);
  sign("No. 7", -37, 2.78, -3.52, 0.72, 0.32);
  active = wharf;
  // The sailmaker's second step records the high-water line, even after drainage.
  box(-37, 0.235, -3.49, 1.16, 0.17, 0.19, "stone");
  box(-37, 0.24, -3.384, 1.12, 0.025, 0.012, "leafDark");
  for (const x of [-37.46, -36.54]) {
    box(x, 0.17, -3.383, 0.035, 0.13, 0.013, "mortar");
  }
  // Brick risers keep the cutting surface and folded canvas above the flooding.
  const cuttingTable = group("sailmaker raised cutting table");
  for (const x of [-38.99, -38.01]) {
    for (const z of [-3.67, -3.19]) {
      for (let row = 0; row < 2; row++) {
        box(
          x,
          0.07 + row * 0.13,
          z,
          0.24,
          0.115,
          0.2,
          row ? "brickLight" : "brick",
          [0, 0, 0],
          cuttingTable,
        );
      }
      box(x, 0.63, z, 0.075, 0.85, 0.075, "woodDark", [0, 0, 0], cuttingTable);
    }
  }
  box(
    -38.5,
    1.09,
    -3.43,
    1.35,
    0.13,
    0.77,
    "woodLight",
    [0, 0, 0],
    cuttingTable,
  );
  box(
    -38.52,
    1.173,
    -3.48,
    0.93,
    0.025,
    0.57,
    "linen",
    [0, 0.08, 0],
    cuttingTable,
  );
  box(
    -38.87,
    1.226,
    -3.61,
    0.34,
    0.072,
    0.33,
    "cream",
    [0, 0, 0],
    cuttingTable,
  );
  // The measuring tape drapes over the front edge with visible ruled divisions.
  box(
    -38.35,
    1.193,
    -3.4,
    0.049,
    0.015,
    0.62,
    "ochre",
    [0, 0, 0],
    cuttingTable,
  );
  box(
    -38.35,
    0.983,
    -3.058,
    0.05,
    0.42,
    0.019,
    "ochre",
    [0, 0, 0],
    cuttingTable,
  );
  for (let i = 0; i < 9; i++) {
    box(
      -38.35,
      1.203,
      -3.66 + i * 0.065,
      i % 3 ? 0.023 : 0.041,
      0.006,
      0.008,
      "woodDark",
      [0, 0, 0],
      cuttingTable,
    );
    if (i < 6)
      box(
        -38.35,
        0.82 + i * 0.061,
        -3.045,
        i % 3 ? 0.024 : 0.04,
        0.008,
        0.008,
        "woodDark",
        [0, 0, 0],
        cuttingTable,
      );
  }
  for (const side of [-1, 1]) {
    ring(
      -38.04 + side * 0.041,
      1.196,
      -3.48,
      0.042,
      0.012,
      "iron",
      [Math.PI / 2, 0, 0],
      cuttingTable,
    );
    beam(
      [-38.04 + side * 0.041, 1.198, -3.48],
      [-38.04 - side * 0.035, 1.198, -3.27],
      0.009,
      "ironLight",
      cuttingTable,
    );
  }
  solid(-38.5, -3.43, 1.37, 0.79);
  materials.doorWater = new THREE.MeshStandardMaterial({
    color: "#527777",
    roughness: 0.13,
    metalness: 0.16,
    transparent: true,
    opacity: 0.51,
    depthWrite: false,
  });
  materials.doorWet = new THREE.MeshStandardMaterial({
    color: "#566961",
    roughness: 0.33,
    metalness: 0.02,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const pooledWetColor = new THREE.Color("#566961");
  const drainedWetColor = new THREE.Color("#48574f");
  const doorstepWater = group("accumulated doorstep water");
  const doorstepWet = group("doorstep residual wet patch");
  doorstepWater.position.set(-37, 0.071, -0.65);
  doorstepWet.position.set(-37, 0.057, -0.65);
  const puddleEdge = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const radius = 1 + 0.08 * Math.sin(i * 1.7) + 0.05 * Math.cos(i * 2.3);
    puddleEdge.push(
      new THREE.Vector3(
        Math.cos(angle) * 0.88 * radius,
        -Math.sin(angle) * 2.12 * radius + 0.2,
        0,
      ),
    );
  }
  const puddleCurve = new THREE.CatmullRomCurve3(puddleEdge, true);
  const puddleShape = new THREE.Shape(
    puddleCurve
      .getPoints(100)
      .map((point) => new THREE.Vector2(point.x, point.y)),
  );
  const puddleGeometry = new THREE.ShapeGeometry(puddleShape).rotateX(
    -Math.PI / 2,
  );
  for (const [parent, material, size] of [
    [doorstepWater, materials.doorWater, 1],
    [doorstepWet, materials.doorWet, 1.045],
  ]) {
    const puddle = new THREE.Mesh(puddleGeometry, material);
    puddle.scale.set(size, 1, size);
    puddle.receiveShadow = true;
    parent.add(puddle);
  }
  // Neighbours' everyday work is tucked against the frontages, not into the route.
  for (const [x, z] of [
    [-39.18, -3.16],
    [-34.94, -3.08],
    [-25.01, -2.65],
    [-19.89, -2.53],
  ]) {
    pot(x, 0, z, 0.29);
    solid(x, z, 0.6, 0.6);
  }
  crate(-27.58, 0, -3.79, 0.67);
  crate(-27.58, 0.62, -3.79, 0.53);
  barrel(-26.65, 0, -3.66, 0.3);
  solid(-27.2, -3.74, 1.75, 0.82);
  for (const z of [-3.1, -2.88, -2.66])
    box(-32.99, 0.67, z, 1.44, 0.1, 0.17, "woodLight");
  for (const x of [-33.56, -32.43])
    box(x, 0.34, -2.89, 0.09, 0.67, 0.67, "iron");
  solid(-33, -2.89, 1.5, 0.68);
  const linens = [];
  for (const x of [-34.1, -31.75])
    box(x, 1.79, -4.07, 0.075, 3.58, 0.075, "wood");
  beam([-34.1, 3.52, -4.07], [-31.75, 3.52, -4.07], 0.017, "iron");
  for (let i = 0; i < 3; i++) {
    const cloth = group("wharf hanging linen");
    cloth.position.set(-33.64 + i * 0.7, 3.47, -4.07);
    for (let j = 0; j < 6; j++)
      box(
        -0.26 + j * 0.1,
        -0.57,
        Math.sin(j) * 0.027,
        0.1,
        1.13,
        0.028,
        i % 2 ? "blue" : "linen",
        [0, 0, 0],
        cloth,
      );
    linens.push(cloth);
  }
  // Public ledger station faces the wharf story marker without occupying it.
  // An empty, crooked mailbox mount remains on the canal rail after its removal.
  beam([-30.6, 0.83, 5.95], [-30.6, 0.79, 5.66], 0.033, "iron");
  box(-30.6, 0.99, 5.65, 0.29, 0.39, 0.041, "iron", [0, 0, -0.13]);
  for (const dx of [-0.089, 0.089]) {
    for (const y of [0.87, 1.09]) {
      cylinder(
        -30.6 + dx,
        y,
        5.683,
        0.024,
        0.025,
        "copper",
        [Math.PI / 2, 0, 0],
        wharf,
        0.024,
        6,
      );
    }
  }
  beam([-30.68, 0.8, 5.67], [-30.79, 0.61, 5.81], 0.023, "iron");
  for (const x of [-30.48, -29.52])
    box(x, 0.77, -0.12, 0.085, 1.54, 0.1, "wood");
  sign("BERTHS & DELIVERIES\nSEVENTH WHARF", -30, 1.11, -0.055, 1.07, 0.81);
  box(-30, 0.35, -0.07, 1.2, 0.11, 0.24, "woodLight");
  solid(-30, -0.12, 1.23, 0.42);
  sign("OLD PUMP WORKS  ←", -41.55, 2.35, -0.59, 2.16, 0.39);
  cylinder(-41.55, 1.18, -0.63, 0.055, 2.36, "iron");
  solid(-41.55, -0.63, 0.16, 0.16);
  // A narrow freight derrick makes the wharf legible from across the water.
  cylinder(-25.35, 0.15, 4.31, 0.44, 0.3, "iron");
  box(-25.35, 1.86, 4.31, 0.26, 3.55, 0.27, "wood");
  beam([-25.35, 3.47, 4.31], [-23.24, 3.69, 7.15], 0.12, "wood", wharf, true);
  beam([-25.35, 1.81, 4.31], [-23.75, 3.64, 6.51], 0.07, "iron");
  beam([-23.24, 3.69, 7.15], [-23.24, 1.15, 7.15], 0.016, "iron");
  ring(
    -23.24,
    1.09,
    7.15,
    0.1,
    0.022,
    "iron",
    [0, 0, 0],
    wharf,
    Math.PI * 1.55,
  );
  ring(-25.35, 1.12, 4.53, 0.35, 0.035, "iron");
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    beam(
      [-25.35, 1.12, 4.53],
      [-25.35 + Math.sin(a) * 0.35, 1.12 + Math.cos(a) * 0.35, 4.53],
      0.02,
      "iron",
    );
  }
  solid(-25.35, 4.31, 0.92, 0.92);
  for (const [x, z] of [
    [-39.5, 4.8],
    [-28, 5.1],
    [-19.1, 4.9],
    [-43.35, 3.8],
  ])
    lamp(x, z);

  const legacyPump = group("legacy pump architecture", works);
  // Pump works: a generous central entrance and genuine inspection aisles.
  active = legacyPump;
  wall(-53.5, 0, -12.67, 15, 4.95, 0.25, true);
  sideWall(-61.05, 0, -8.1, 9.35, 4.95, true, legacyPump, -1);
  sideWall(-45.95, 0, -8.1, 9.35, 4.95, true);
  const pumpFacade = group("pump hall removable front facade");
  for (const [x, w] of [
    [-58.15, 5.7],
    [-48.35, 4.7],
  ]) {
    wall(x, 0, -3.36, w, 0.55, 0.33, true);
    wall(x, 0.55, -3.36, w, 3.25, 0.33, true, pumpFacade);
  }
  for (const x of [-55.2, -50.8]) {
    box(x, 2.07, -3.14, 0.25, 4.15, 0.3, "iron");
    for (const y of [0.17, 3.84])
      box(x, y, -3.14, 0.51, 0.19, 0.54, "ironLight");
  }
  box(-53, 4.09, -3.22, 4.46, 0.35, 0.44, "iron", [0, 0, 0], pumpFacade);
  sign("OLD PUMP WORKS", -53, 4.11, -2.94, 4.11, 0.53, pumpFacade);
  for (let i = 0; i < 11; i++)
    cylinder(
      -55 + i * 0.4,
      4.11,
      -2.982,
      0.033,
      0.024,
      "brass",
      [Math.PI / 2, 0, 0],
      pumpFacade,
      0.033,
      6,
    );
  for (const x of [-59.6, -57.2, -48.1])
    windowAt(x, 2.36, -3.145, 1.39, 2.1, pumpFacade, true);
  for (const y of [0.15, 3.84, 5.02]) {
    box(-53.5, y, -12.65, 15.43, 0.17, 0.38, "stone");
    box(-45.9, y, -8.13, 0.3, 0.17, 9.55, "stone");
    box(-61.1, y, -8.13, 0.3, 0.17, 9.55, "stone");
  }
  for (const x of [-60.85, -56.1, -50.4, -46.2]) {
    box(x, 2.52, -12.43, 0.22, 4.9, 0.21, "iron");
    beam([x, 4.88, -12.42], [x, 4.88, -3.56], 0.11, "iron", legacyPump, true);
    beam([x, 3.95, -12.42], [x, 4.83, -11.5], 0.066, "iron", legacyPump, true);
  }
  solid(-53.5, -12.68, 15.3, 0.35);
  solid(-61.05, -8.1, 0.34, 9.4);
  solid(-45.95, -8.1, 0.34, 9.4);
  solid(-58.15, -3.36, 5.7, 0.45);
  solid(-48.35, -3.36, 4.7, 0.45);
  solid(-55.2, -3.2, 0.3, 0.5);
  solid(-50.8, -3.2, 0.3, 0.5);
  // Open doors fold against the outside walls, never across the central corridor.
  for (const [x, side] of [
    [-55.46, -1],
    [-50.54, 1],
  ]) {
    box(x, 1.51, -3.02, 0.63, 2.95, 0.12, "green");
    for (let i = 0; i < 6; i++)
      box(x - 0.25 + i * 0.1, 1.51, -2.947, 0.047, 2.85, 0.025, "greenLight");
    for (const y of [0.56, 2.48]) box(x, y, -2.925, 0.63, 0.075, 0.035, "iron");
  }
  // Sawtooth roof with glazed northlights: a distinct municipal industrial silhouette.
  const pumpRoof = group("pump hall removable sawtooth roof");
  for (let bay = 0; bay < 3; bay++) {
    const x = -58.53 + bay * 5.05;
    box(
      x - 0.18,
      5.65,
      -8.13,
      4.59,
      0.13,
      9.55,
      "slate",
      [0, 0, Math.atan(0.2)],
      pumpRoof,
    );
    box(x + 2.02, 5.57, -8.13, 0.1, 1.27, 9.3, "iron", [0, 0, 0], pumpRoof);
    for (let z = -12.39; z < -3.5; z += 0.56) {
      box(x + 2.081, 5.68, z, 0.032, 0.84, 0.49, "glass", [0, 0, 0], pumpRoof);
      box(
        x + 2.11,
        5.68,
        z + 0.26,
        0.044,
        0.91,
        0.035,
        "ironLight",
        [0, 0, 0],
        pumpRoof,
      );
    }
    for (let z = -12.4; z < -3.4; z += 0.8)
      beam(
        [x - 2.43, 5.28, z],
        [x + 2.07, 6.18, z],
        0.018,
        "ironLight",
        pumpRoof,
      );
  }
  // Tall flue and boiler bank sit inside the western wall, away from the entrance.
  wall(-60.2, 0, -11.2, 1.02, 8.6, 1.04, true);
  box(-60.2, 8.67, -11.2, 1.3, 0.21, 1.32, "stone");
  cylinder(-60.2, 8.96, -11.2, 0.22, 0.4, "iron");
  for (const y of [1.25, 3.8, 6.45, 8.19])
    box(-60.2, y, -10.637, 1.11, 0.11, 0.055, "iron");
  solid(-60.2, -11.2, 1.16, 1.2);
  for (const x of [-59.73, -57.93]) {
    cylinder(x, 1.64, -10.8, 0.57, 2.61, "copper");
    cylinder(
      x,
      3.04,
      -10.8,
      0.57,
      0.2,
      "copperLight",
      [0, 0, 0],
      legacyPump,
      0.29,
    );
    for (const y of [0.42, 1.03, 2.58, 2.91]) {
      cylinder(x, y, -10.8, 0.61, 0.09, "brass");
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        box(
          x + Math.sin(a) * 0.617,
          y,
          -10.8 + Math.cos(a) * 0.617,
          0.055,
          0.06,
          0.055,
          "copperLight",
        );
      }
    }
    box(x, 0.36, -10.19, 0.48, 0.39, 0.09, "iron");
    gauge(x, 2.28, -10.19, 0.27);
    valve(x, 1.49, -10.13, 0.23);
    pipe(
      [
        [x, 3.11, -10.8],
        [x, 3.64, -10.8],
        [-59.88, 3.64, -11.03],
      ],
      0.14,
    );
    solid(x, -10.8, 1.27, 1.29);
  }
  // Main horizontal pumping engine, with a large flywheel west of the inspection spot.
  box(-58.88, 0.21, -7.78, 2.32, 0.42, 2.88, "darkStone");
  box(-58.88, 0.54, -7.78, 1.92, 0.24, 2.3, "iron");
  cylinder(-58.98, 1.02, -7.47, 0.38, 2.45, "iron", [Math.PI / 2, 0, 0]);
  for (const z of [-8.64, -6.3])
    cylinder(-58.98, 1.02, z, 0.46, 0.14, "brass", [Math.PI / 2, 0, 0]);
  const flywheel = group("western pump flywheel");
  flywheel.position.set(-58.77, 2.02, -6.57);
  ring(0, 0, 0, 1.31, 0.13, "iron", [0, 0, 0], flywheel);
  ring(0, 0, 0.145, 1.31, 0.042, "brass", [0, 0, 0], flywheel);
  cylinder(0, 0, 0.07, 0.2, 0.49, "ironLight", [Math.PI / 2, 0, 0], flywheel);
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    beam(
      [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.03],
      [Math.cos(a) * 1.27, Math.sin(a) * 1.27, 0.03],
      0.058,
      "iron",
      flywheel,
      true,
    );
    cylinder(
      Math.cos(a) * 1.3,
      Math.sin(a) * 1.3,
      0.2,
      0.029,
      0.03,
      "brass",
      [Math.PI / 2, 0, 0],
      flywheel,
      0.029,
      6,
    );
  }
  const piston = group("western pump reciprocating piston");
  box(-58.81, 1.02, -7.85, 0.13, 0.13, 1.87, "ironLight", [0, 0, 0], piston);
  ring(-58.81, 1.02, -6.88, 0.13, 0.028, "brass", [0, 0, 0], piston);
  beam([-58.75, 1.02, -6.6], [-58.77, 2.02, -6.45], 0.065, "iron");
  solid(-58.9, -7.65, 2.38, 3.08);
  // Beck's control bench and spare parts stay against the eastern interior wall.
  box(-47.23, 0.68, -9.65, 1.31, 1.24, 3.76, "green");
  box(-47.23, 1.36, -9.65, 1.5, 0.13, 3.95, "woodLight");
  solid(-47.23, -9.65, 1.6, 4.05);
  for (const z of [-10.7, -9.5, -8.3]) {
    gauge(-47.55, 1.8, z, 0.23);
    box(-47.23, 1.57, z, 0.54, 0.36, 0.31, "iron");
  }
  for (const z of [-11.5, -10.4]) {
    crate(-49.19, 0, z, 0.65);
    crate(-49.19, 0.6, z, 0.52);
  }
  solid(-49.19, -10.95, 0.72, 1.85);
  sign("PRESSURE · INTAKE · RETURN", -52.25, 2.33, -12.47, 3.91, 0.46);
  for (const x of [-55.8, -51.3, -46.7]) lantern(x, 3.51, -3.05, pumpFacade);
  pipe(
    [
      [-60.2, 3.62, -11.03],
      [-56.7, 3.62, -11.03],
      [-56.7, 4.28, -11.03],
      [-49.8, 4.28, -11.03],
      [-49.8, 2.22, -10.9],
    ],
    0.13,
  );
  pipe(
    [
      [-58.98, 0.94, -8.6],
      [-58.98, 0.37, -9.23],
      [-55.85, 0.37, -9.23],
      [-55.85, 0.37, -11.14],
    ],
    0.18,
  );
  // Return pipe rises over the front wall; the discharge itself stays below the road.
  pipe(
    [
      [-59.7, 2.66, -10.8],
      [-60.6, 2.66, -10.8],
      [-60.6, 4.42, -10.8],
      [-60.6, 4.42, -3.5],
      [-60.6, 0.2, -3.5],
    ],
    0.17,
  );
  for (const z of [-10, -7.2, -4.5])
    beam([-60.6, 4.4, z], [-61, 4.4, z], 0.055, "iron");
  sign("MUNICIPAL WATER SERVICE", -48.35, 3.34, -3.04, 3.35, 0.43, pumpFacade);
  active = works;
  for (const [x, z] of [
    [-62.57, 2.2],
    [-46.47, 3.1],
    [-55.1, 4.8],
  ])
    lamp(x, z);
  barrel(-46.92, 0, -1.39, 0.31);
  pot(-60.75, 0, -2.07, 0.28);
  solid(-46.92, -1.39, 0.67, 0.67);
  solid(-60.75, -2.07, 0.6, 0.6);
  for (const z of [-1.6, 0.72, 3.2, 5.1]) {
    box(-59, 0.022, z, 0.63, 0.029, 0.79, "iron");
    for (let i = 0; i < 6; i++)
      box(-59, 0.043, z - 0.3 + i * 0.12, 0.54, 0.011, 0.032, "ironLight");
  }
  const waterRibbons = group("western outfall stream");
  box(-59, -0.51, 6.53, 1.21, 0.75, 0.09, "woodDark");
  for (let i = 0; i < 11; i++) {
    const a = ((i + 0.5) * Math.PI) / 11;
    box(
      -59 + Math.cos(a) * 0.66,
      -0.76 + Math.sin(a) * 0.66,
      6.58,
      0.18,
      0.22,
      0.31,
      "stone",
      [0, 0, a - Math.PI / 2],
    );
  }
  for (const x of [-59.67, -58.33])
    box(x, -0.7, 6.58, 0.2, 0.51, 0.3, "darkStone");
  for (let i = 0; i < 9; i++) {
    const x = -59.46 + i * 0.115;
    beam(
      [x, -0.48, 6.66],
      [x, -0.52, 6.97],
      0.043,
      "water",
      waterRibbons,
      true,
    );
    beam(
      [x, -0.52, 6.97],
      [x, -0.77, 7.25],
      0.041,
      "water",
      waterRibbons,
      true,
    );
  }
  const foam = group("western outfall foam");
  foam.position.set(-59, -0.747, 7.28);
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4,
      r = 0.1 + (i % 7) * 0.06;
    box(
      Math.cos(a) * r,
      0,
      Math.sin(a) * r * 0.7,
      0.06,
      0.012,
      0.04,
      i % 3 ? "water" : "cream",
      [0, a, 0],
      foam,
    );
  }

  // Both new bridges use precisely the same walkable crown as the original route.
  const legacyBridges = [];
  function bridgeAt(center) {
    const g = group("western arched pedestrian bridge");
    legacyBridges.push(g);
    for (let i = 0; i < 40; i++) {
      const z = 6 + (i + 0.5) * 0.25,
        y = 0.55 * Math.sin((Math.PI * (z - 6)) / 10);
      for (let j = 0; j < 7; j++)
        box(
          center - 1.7 + ((j + 0.5) * 3.4) / 7,
          y - 0.09,
          z,
          3.4 / 7 - 0.021,
          0.18,
          0.23,
          (i + j) % 4 ? "stone" : "lightStone",
          [0, 0, 0],
          g,
        );
      for (const x of [center - 1.8, center + 1.8]) {
        const bottom = -1.42 + 1.48 * Math.sin((Math.PI * (z - 6)) / 10);
        box(
          x,
          (bottom + y) / 2,
          z,
          0.32,
          y - bottom,
          0.233,
          "darkStone",
          [0, 0, 0],
          g,
        );
        box(x, y + 0.13, z, 0.3, 0.3, 0.233, "stone", [0, 0, 0], g);
      }
    }
    for (const x of [center - 1.84, center + 1.84]) {
      for (let i = 0; i < 24; i++) {
        const z = 6 + ((i + 0.5) * 10) / 24,
          t = (z - 6) / 10,
          bottom = -1.42 + 1.48 * Math.sin(Math.PI * t);
        box(
          x,
          bottom + 0.13,
          z,
          0.44,
          0.27,
          0.402,
          i % 3 ? "stone" : "lightStone",
          [-Math.atan(((1.48 * Math.PI) / 10) * Math.cos(Math.PI * t)), 0, 0],
          g,
        );
      }
      for (let i = 0; i <= 10; i++) {
        const z = 6 + i,
          y = 0.55 * Math.sin((Math.PI * i) / 10);
        cylinder(x, y + 0.7, z, 0.047, 0.98, "iron", [0, 0, 0], g);
        cylinder(x, y + 1.21, z, 0.079, 0.07, "ironLight", [0, 0, 0], g);
        if (i < 10) {
          const next = 0.55 * Math.sin((Math.PI * (i + 1)) / 10);
          beam([x, y + 1.13, z], [x, next + 1.13, z + 1], 0.034, "iron", g);
          beam([x, y + 0.65, z], [x, next + 0.65, z + 1], 0.025, "iron", g);
        }
      }
      for (const z of [6.24, 15.76])
        for (let row = 0; row < 4; row++)
          box(
            x,
            -0.65 + row * 0.2,
            z,
            0.56,
            0.18,
            0.6,
            row < 2 ? "darkStone" : "stone",
            [0, 0, 0],
            g,
          );
    }
  }
  bridgeAt(-34);
  bridgeAt(-58);
  // New retaining walls stop at the existing bank, with proper bridge openings.
  const bridgeGap = (x) => Math.abs(x + 58) < 1.95 || Math.abs(x + 34) < 1.95;
  for (let x = -63.7; x < -33.5; x += 0.58) {
    if (bridgeGap(x)) continue;
    for (let row = 0; row < 6; row++)
      box(
        x,
        -1.54 + row * 0.25,
        6.28,
        0.552,
        0.229,
        0.41,
        row < 4 ? "darkStone" : "stone",
      );
    box(x, 0.005, 6.15, 0.56, 0.18, 0.65, "lightStone");
    if (Math.round((x + 63.7) / 0.58) % 2 === 0) {
      cylinder(x, 0.44, 5.96, 0.045, 0.88, "iron");
      cylinder(x, 0.91, 5.96, 0.068, 0.06, "ironLight");
    }
    for (const y of [0.35, 0.82])
      beam([x - 0.275, y, 5.96], [x + 0.275, y, 5.96], 0.033, "iron");
    for (const y of [-0.79, -0.55])
      box(x, y, 6.503, 0.572, 0.018, 0.02, "mortar");
  }
  for (let x = -63.7; x < -33.5; x += 0.58) {
    if (bridgeGap(x)) continue;
    for (let row = 0; row < 6; row++)
      box(
        x,
        -1.54 + row * 0.25,
        15.95,
        0.552,
        0.229,
        0.41,
        row < 4 ? "darkStone" : "stone",
      );
    box(x, 0.005, 16.02, 0.56, 0.18, 0.65, "lightStone");
    if (Math.round((x + 63.7) / 0.58) % 2 === 0)
      cylinder(x, 0.45, 16.17, 0.045, 0.9, "iron");
    for (const y of [0.35, 0.85])
      beam([x - 0.275, y, 16.17], [x + 0.275, y, 16.17], 0.032, "iron");
  }
  for (const x of [-62.5, -53.5, -47.7, -40.7]) {
    for (const dx of [-0.12, 0.12])
      box(x + dx, -0.82, 6.66, 0.17, 1.95, 0.22, "wood");
    for (const y of [-1.35, -0.4]) box(x, y, 6.79, 0.56, 0.075, 0.06, "iron");
  }
  sign("SOUTH TOWPATH  ·  RIVENPORT", -46.8, 1.32, 18.31, 2.69, 0.48);
  for (const x of [-48.06, -45.54])
    box(x, 0.68, 18.26, 0.08, 1.36, 0.09, "wood");
  solid(-46.8, 18.25, 2.73, 0.2);

  // A narrow paved service court meets a Victorian perimeter beyond the walk bounds.
  box(-63.43, -0.105, -6.76, 4.18, 0.2, 15.8, "darkStone");
  for (let row = 0; row < 34; row++) {
    const z = -14.4 + row * 0.455;
    for (let column = 0; column < 9; column++) {
      const left = -65.48 + column * 0.465 - (row % 2) * 0.2325;
      const clippedLeft = Math.max(left, -65.48);
      const right = Math.min(left + 0.465, -61.34);
      if (right - clippedLeft < 0.025) continue;
      box(
        (clippedLeft + right) / 2,
        0.026,
        z,
        right - clippedLeft - 0.019,
        0.047,
        0.433,
        (column + row) % 7 === 0 ? "stone" : "darkStone",
      );
    }
  }
  sideWall(-65.48, 0, -6.2, 17.1, 2.05, true, works, 1);
  for (let z = -14.6; z < 2.36; z += 0.44)
    box(-65.48, 2.12, z, 0.43, 0.15, 0.418, "stone");
  for (const z of [-14.75, -9.05, -3.35, 2.35, 5.3]) {
    wall(-65.48, 0, z, 0.59, 2.45, 0.59, true);
    box(-65.48, 2.5, z, 0.78, 0.16, 0.79, "lightStone");
  }
  // A closed maintenance gate terminates the wall while suggesting the city beyond.
  for (let z = 2.68; z < 5.03; z += 0.19) {
    box(-65.47, 1.03, z, 0.035, 1.93, 0.035, "iron");
    cylinder(-65.47, 2.06, z, 0.039, 0.12, "iron", [0, 0, 0], works, 0.004, 4);
  }
  for (const y of [0.34, 1.72])
    beam([-65.47, y, 2.62], [-65.47, y, 5.05], 0.035, "iron");
  const yardSign = group("service yard boundary plate");
  yardSign.position.set(-65.335, 0, -5.66);
  yardSign.rotation.y = Math.PI / 2;
  sign("PUMP WORKS · SERVICE YARD", 0, 1.56, 0, 2.18, 0.34, yardSign);

  // Rail bends behind the engine hall instead of intersecting its sawtooth roof.
  const westernRail = group("legacy western railway", skyline);
  const westernRailSupports = group(
    "western railway support details",
    westernRail,
  );
  active = westernRailSupports;
  const railZ = (x) => -12.65 - 3.55 * Math.min(1, Math.max(0, (-x - 25) / 18));
  for (let x = -25; x > -68; x -= 0.55) {
    const z = railZ(x),
      nextZ = railZ(x - 0.55);
    const segmentLength = Math.hypot(0.55, nextZ - z);
    const segmentAngle = Math.atan2(nextZ - z, 0.55);
    const midX = x - 0.275,
      midZ = (z + nextZ) / 2;
    for (const side of [-1, 1]) {
      const gx = midX + Math.sin(segmentAngle) * side * 0.92;
      const gz = midZ + Math.cos(segmentAngle) * side * 0.92;
      box(
        gx,
        4.57,
        gz,
        segmentLength,
        0.37,
        0.105,
        "iron",
        [0, segmentAngle, 0],
        westernRailSupports,
      );
      for (const y of [4.385, 4.765])
        box(
          gx,
          y,
          gz,
          segmentLength,
          0.051,
          0.19,
          "ironLight",
          [0, segmentAngle, 0],
          westernRailSupports,
        );
    }
  }
  for (const x of [-29, -36, -43, -50, -57, -64]) {
    const z = railZ(x);
    wall(x, 0, z, 0.64, 4.43, 0.87, false, westernRailSupports);
    box(x, 4.46, z, 1.12, 0.25, 1.4, "darkStone");
    for (const side of [-1, 1])
      for (const zz of [z - 0.81, z + 0.81]) {
        beam(
          [x, 3.01, zz],
          [x + side * 1.45, 4.57, zz],
          0.082,
          "iron",
          westernRailSupports,
          true,
        );
        beam(
          [x, 3.41, zz],
          [x + side * 0.9, 4.59, zz],
          0.037,
          "ironLight",
          westernRailSupports,
          true,
        );
      }
  }
  for (const batch of batches.values()) {
    if (batch.parent === westernRailSupports)
      for (const geo of batch.geometries) alignRailSupportGeometry(geo, railZ);
  }
  addRailRunningSurface(
    RAILWAY.startX,
    -25,
    (geo, mat) => {
      add(geo, mat, 0, 0, 0, 1, 1, 1, [0, 0, 0], westernRail);
      geo.dispose();
    },
    (...args) => box(...args, westernRail),
    (x, y, z, r, h, mat) =>
      cylinder(x, y, z, r, h, mat, [0, 0, 0], westernRail),
    (a, b, r, mat) => beam(a, b, r, mat, westernRail),
  );
  const legacySkyline = group("legacy western city buildings", skyline);
  active = legacySkyline;
  for (let i = 0; i < 10; i++) {
    const x = -65 + i * 4.2,
      z = -24 - (i % 3) * 1.7,
      w = 3.15 + (i % 2) * 0.5,
      h = 5.2 + (i % 4) * 1.13,
      d = 4.1;
    wall(x, 0, z, w, h, d, i % 3 === 0, legacySkyline);
    sideWall(x + w / 2, 0, z, d, h, i % 3 === 0, legacySkyline);
    for (let y = 1.1; y < h - 0.5; y += 1.63)
      for (const dx of [-w * 0.27, w * 0.27])
        windowAt(x + dx, y, z + d / 2 + 0.06, 0.67, 1.08, legacySkyline);
    for (const y of [0.14, h]) box(x, y, z, w + 0.25, 0.15, d + 0.26, "stone");
    roofTiles(
      x,
      h + 0.15,
      z,
      w + 0.48,
      d + 0.4,
      1.02,
      i % 3 ? "slate" : "burgundy",
      legacySkyline,
    );
    wall(
      x + w * 0.25,
      h + 0.86,
      z - 0.7,
      0.51,
      0.78,
      0.54,
      true,
      legacySkyline,
    );
    box(x + w * 0.25, h + 1.68, z - 0.7, 0.68, 0.11, 0.71, "darkStone");
  }

  active = skyline;

  const boilerSteam = [];
  const steamMaterial = new THREE.MeshBasicMaterial({
    color: "#e7e2d6",
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const puffGeometry = new THREE.IcosahedronGeometry(0.065, 0);
  for (let i = 0; i < 10; i++) {
    const puff = new THREE.Mesh(puffGeometry, steamMaterial);
    puff.name = "pump boiler steam";
    works.add(puff);
    boilerSteam.push(puff);
  }
  const dynamic = new Set([
    westernRail,
    legacyWharf,
    legacyPump,
    legacySkyline,
    ...legacyBridges,
    pumpRoof,
    pumpFacade,
    flywheel,
    piston,
    foam,
    waterRibbons,
    doorstepWater,
    doorstepWet,
    ...linens,
  ]);
  root.updateMatrixWorld(true);
  const finalBatches = new Map();
  const distantMaterials = Object.fromEntries(
    Object.entries(materials).map(([key, material]) => {
      const m = material.clone();
      m.onBeforeCompile = material.onBeforeCompile;
      m.customProgramCacheKey = material.customProgramCacheKey;
      m.color.lerp(new THREE.Color("#647477"), 0.26).multiplyScalar(0.79);
      return [key, m];
    }),
  );
  const roofMaterials = Object.fromEntries(
    Object.entries(materials).map(([key, material]) => {
      const m = material.clone();
      m.onBeforeCompile = material.onBeforeCompile;
      m.customProgramCacheKey = material.customProgramCacheKey;
      m.transparent = true;
      return [key, m];
    }),
  );
  const facadeMaterials = Object.fromEntries(
    Object.entries(materials).map(([key, material]) => {
      const faded = material.clone();
      faded.onBeforeCompile = material.onBeforeCompile;
      faded.customProgramCacheKey = material.customProgramCacheKey;
      faded.transparent = true;
      return [key, faded];
    }),
  );
  const within = (object, ancestor) => {
    for (let item = object; item; item = item.parent)
      if (item === ancestor) return true;
    return false;
  };
  for (const { parent, mat, geometries } of batches.values()) {
    let anchor = parent;
    while (
      anchor !== wharf &&
      anchor !== works &&
      anchor !== skyline &&
      !dynamic.has(anchor)
    )
      anchor = anchor.parent;
    const material = within(parent, pumpRoof)
      ? roofMaterials[mat]
      : within(parent, pumpFacade)
        ? facadeMaterials[mat]
        : within(parent, skyline)
          ? distantMaterials[mat]
          : materials[mat];
    const key = `${anchor.uuid}:${material.uuid}`,
      local = new THREE.Matrix4()
        .copy(anchor.matrixWorld)
        .invert()
        .multiply(parent.matrixWorld);
    if (!finalBatches.has(key))
      finalBatches.set(key, { anchor, material, geometries: [] });
    for (const geo of geometries)
      finalBatches.get(key).geometries.push(geo.applyMatrix4(local));
  }
  for (const { anchor, material, geometries } of finalBatches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
    mesh.name = `${anchor.name} surfaces`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    anchor.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  unitBox.dispose();
  // Include the English sign textures as well as the batched masonry in the fade.
  const frontFadeMaterials = new Set(Object.values(facadeMaterials));
  pumpFacade.traverse((object) => {
    if (!object.isMesh) return;
    object.material.transparent = true;
    frontFadeMaterials.add(object.material);
  });
  let current = {},
    phase = 0,
    roofOpacity = 1,
    doorstepWaterLevel = 1;
  let authoredPump = null,
    authoredWheel = null,
    authoredPiston = null,
    pistonRestZ = 0;
  const authoredFade = [],
    authoredFadeGroups = [];
  function setState(state = {}) {
    current = state;
  }
  function update(time, dt = 1 / 60, state = current) {
    current = state;
    const px = state.playerPosition?.x ?? state.playerX,
      pz = state.playerPosition?.z ?? state.playerZ;
    const insideHall =
      Number.isFinite(px) &&
      Number.isFinite(pz) &&
      px > -61.8 &&
      px < -45.2 &&
      pz > -13.5 &&
      pz < -2;
    roofOpacity = THREE.MathUtils.damp(roofOpacity, insideHall ? 0 : 1, 7, dt);
    pumpRoof.visible = roofOpacity > 0.025;
    pumpFacade.visible = roofOpacity > 0.025;
    Object.values(roofMaterials).forEach((m) => {
      m.opacity = roofOpacity;
      m.depthWrite = roofOpacity > 0.95;
    });
    frontFadeMaterials.forEach((material) => {
      material.opacity = roofOpacity;
      material.depthWrite = roofOpacity > 0.95;
    });
    const pause =
      (state.pumpStep > 0 && state.pumpStep < 3) ||
      (!state.pumpRestored && time % 8.6 > 5.7 && time % 8.6 < 6.6);
    if (!pause) phase += dt * 0.57;
    flywheel.rotation.z = -phase;
    if (authoredWheel) authoredWheel.rotation.z = -phase;
    if (authoredPiston)
      authoredPiston.position.z = pistonRestZ + Math.sin(phase) * 0.23;
    for (const group of authoredFadeGroups) group.visible = roofOpacity > 0.025;
    for (const { material, opacity } of authoredFade) {
      material.opacity = opacity * roofOpacity;
      material.depthWrite = material.opacity > 0.95;
    }
    piston.position.z = Math.sin(phase) * 0.23;
    linens.forEach((cloth, i) => {
      cloth.rotation.x = Math.sin(time * 1.16 + i) * 0.06;
      cloth.rotation.z = Math.sin(time * 0.73 + i) * 0.022;
    });
    foam.scale.set(
      1 + Math.sin(time * 1.1) * 0.1,
      1,
      1 + Math.cos(time * 1.3) * 0.09,
    );
    waterRibbons.visible = !pause;
    doorstepWaterLevel = THREE.MathUtils.damp(
      doorstepWaterLevel,
      state.pumpRestored ? 0 : 1,
      0.65,
      dt,
    );
    doorstepWater.scale.set(
      0.25 + doorstepWaterLevel * 0.75,
      1,
      0.25 + doorstepWaterLevel * 0.75,
    );
    materials.doorWater.opacity = doorstepWaterLevel * 0.51;
    doorstepWater.visible = doorstepWaterLevel > 0.015;
    materials.doorWet.color
      .copy(pooledWetColor)
      .lerp(drainedWetColor, 1 - doorstepWaterLevel);
    boilerSteam.forEach((puff, i) => {
      const progress = (time * 0.27 + (i % 5) / 5) % 1;
      const x = i < 5 ? -59.73 : -57.93;
      puff.position.set(
        x + Math.sin(progress * 5 + i) * 0.09,
        3.13 + progress * 1.17,
        -10.8 + Math.cos(progress * 4 + i) * 0.07,
      );
      puff.scale.setScalar(0.6 + progress * 1.6);
      puff.visible = !authoredPump && progress < 0.92;
    });
  }
  return {
    root,
    replaceRailway() {
      westernRail.visible = false;
    },
    installWharf(asset) {
      legacyWharf.visible = false;
      root.add(asset);
    },
    installPump(asset) {
      legacyPump.visible = false;
      authoredPump = asset;
      authoredWheel = asset.getObjectByName("Pump_Flywheel");
      authoredPiston = asset.getObjectByName("Pump_Piston");
      pistonRestZ = authoredPiston?.position.z ?? 0;
      const fadedMaterials = new Map();
      for (const name of ["Pump_Roof", "Pump_Facade"]) {
        const part = asset.getObjectByName(name);
        if (!part) continue;
        authoredFadeGroups.push(part);
        part.traverse((object) => {
          if (!object.isMesh) return;
          const fade = (original) => {
            if (!fadedMaterials.has(original)) {
              const material = original.clone();
              material.onBeforeCompile = original.onBeforeCompile;
              material.customProgramCacheKey = original.customProgramCacheKey;
              material.transparent = true;
              authoredFade.push({ material, opacity: original.opacity });
              fadedMaterials.set(original, material);
            }
            return fadedMaterials.get(original);
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(fade)
            : fade(object.material);
        });
      }
      root.add(asset);
    },
    replaceSkyline() {
      legacySkyline.visible = false;
    },
    replaceBridges() {
      legacyBridges.forEach((bridge) => {
        bridge.visible = false;
      });
    },
    obstacles,
    spots: {
      wharf: { x: -30, z: 2 },
      doorstep: { x: -37, z: 1 },
      beck: { x: -49, z: 1.5 },
      engine: { x: -57, z: -8 },
      outfall: { x: -59, z: 4 },
    },
    update,
    setState,
  };
}
