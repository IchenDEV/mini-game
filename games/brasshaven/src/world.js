import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

// All architectural detail is geometry. One merged mesh per static material;
// moving machinery gets a small, independently merged set of meshes.
export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = "Brasshaven architecture";
  const steamSources = [];
  const lights = [];
  const obstacles = [];
  const moving = [];
  let powered = false;
  const cache = new Map();
  const staticParts = new Map();
  let parts = staticParts;
  let frame = new THREE.Matrix4();
  let seed = 74129;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const material = (color, roughness = 0.88, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const m = {
    brick: [0x986b4f, 0xa77655, 0xb0805e, 0x8f7160, 0xb88a66].map((c) =>
      material(c),
    ),
    stone: material(0x969380),
    stoneLight: material(0xbcb49d),
    mortar: material(0x3e413d),
    slate: material(0x405b61, 0.76, 0.12),
    slateLight: material(0x658087, 0.72, 0.12),
    iron: material(0x374b4e, 0.5, 0.7),
    ironLight: material(0x73827a, 0.45, 0.75),
    brass: material(0xd9ab5b, 0.36, 0.72),
    brassDark: material(0x9e783f, 0.48, 0.7),
    copper: material(0xbf8553, 0.43, 0.7),
    patina: material(0x57938a, 0.5, 0.68),
    wood: material(0x62462d),
    woodLight: material(0x83603c),
    black: material(0x111d1d),
    distant: material(0x809aa1),
    distantTrim: material(0xa1b0af),
    quay: material(0x666f63),
    quayEdge: material(0x767f71),
    amber: new THREE.MeshStandardMaterial({
      color: 0xe5ba73,
      emissive: 0xff9f25,
      emissiveIntensity: 0.45,
      roughness: 0.42,
    }),
    clock: new THREE.MeshStandardMaterial({
      color: 0xf5e2b1,
      emissive: 0xffc56d,
      emissiveIntensity: 0.18,
      roughness: 0.5,
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: 0x61e9eb,
      emissive: 0x00d9ef,
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.2,
    }),
    farAmber: new THREE.MeshStandardMaterial({
      color: 0xbd9c61,
      emissive: 0xf4a94f,
      emissiveIntensity: 0.8,
    }),
    farCyan: new THREE.MeshStandardMaterial({
      color: 0x4b9b9e,
      emissive: 0x32a7b3,
      emissiveIntensity: 0.8,
    }),
  };
  // Locally painted pore, stain and scratch maps keep the block-built forms
  // readable as aged masonry and worked metal rather than uniform plastic.
  function finishMap(metal = false) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d");
    c.fillStyle = "#eeeeee";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 7000; i++) {
      const v = 145 + random() * 110;
      c.fillStyle = `rgba(${v},${v},${v},${metal ? 0.23 : 0.5})`;
      c.fillRect(
        random() * 256,
        random() * 256,
        metal ? 0.6 : 1 + random() * 2.5,
        metal ? 8 + random() * 35 : 1 + random() * 2,
      );
    }
    for (let i = 0; i < 18; i++) {
      const x = random() * 256,
        y = random() * 256,
        r = 4 + random() * 25;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, metal ? "#36443d25" : "#383d342e");
      g.addColorStop(1, "#33333300");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (!metal) {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#30352d35");
      g.addColorStop(0.08, "#30352d00");
      g.addColorStop(0.87, "#30352d00");
      g.addColorStop(1, "#30352d44");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const stoneFinish = finishMap(),
    metalFinish = finishMap(true);
  for (const mat of [
    ...m.brick,
    m.stone,
    m.stoneLight,
    m.slate,
    m.slateLight,
    m.wood,
    m.woodLight,
    m.quay,
    m.quayEdge,
  ]) {
    mat.map = stoneFinish;
    mat.bumpMap = stoneFinish;
    mat.bumpScale = 0.018;
  }
  for (const mat of [
    m.brass,
    m.brassDark,
    m.copper,
    m.patina,
    m.iron,
    m.ironLight,
  ]) {
    mat.map = metalFinish;
    mat.bumpMap = metalFinish;
    mat.bumpScale = 0.004;
  }
  const pavementCanvas = document.createElement("canvas");
  pavementCanvas.width = pavementCanvas.height = 256;
  const pc = pavementCanvas.getContext("2d");
  pc.fillStyle = "#777e76";
  pc.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 24; row++)
    for (let col = -1; col < 13; col++) {
      const v = 175 + random() * 55;
      pc.fillStyle = `rgb(${v},${v},${v * 0.96})`;
      pc.fillRect(col * 22 + (row % 2) * 11 + 1, row * 11 + 1, 20, 9);
    }
  const pavement = new THREE.CanvasTexture(pavementCanvas);
  pavement.colorSpace = THREE.SRGBColorSpace;
  pavement.anisotropy = 8;
  m.quay.map = pavement;
  m.quay.bumpMap = pavement;
  m.quay.bumpScale = 0.035;
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const bevelPoints = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        bevelPoints.push(
          new THREE.Vector3(x * 0.465, y * 0.5, z * 0.465),
          new THREE.Vector3(x * 0.465, y * 0.465, z * 0.5),
          new THREE.Vector3(x * 0.5, y * 0.465, z * 0.465),
        );
      }
  const beveledBox = new ConvexGeometry(bevelPoints);
  const bevelUV = [];
  const bp = beveledBox.attributes.position,
    bn = beveledBox.attributes.normal;
  for (let i = 0; i < bp.count; i++) {
    const nx = Math.abs(bn.getX(i)),
      ny = Math.abs(bn.getY(i)),
      nz = Math.abs(bn.getZ(i));
    bevelUV.push(
      (nx > ny && nx > nz ? bp.getZ(i) : bp.getX(i)) + 0.5,
      (ny > nx && ny > nz ? bp.getZ(i) : bp.getY(i)) + 0.5,
    );
  }
  beveledBox.setAttribute("uv", new THREE.Float32BufferAttribute(bevelUV, 2));
  beveledBox.setIndex(Array.from({ length: bp.count }, (_, i) => i));
  const bevelMaterials = new Set([...m.brick, m.stone, m.stoneLight]);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const unitCone = new THREE.CylinderGeometry(0.5, 1, 1, 8);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const transform = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function add(
    geometry,
    mat,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    if (geometry === unitBox && bevelMaterials.has(mat)) geometry = beveledBox;
    q.setFromEuler(e.set(rx, ry, rz));
    transform.compose(position.set(x, y, z), q, scale.set(sx, sy, sz));
    transform.premultiply(frame);
    const copy = geometry.clone().applyMatrix4(transform);
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(copy);
  }
  const box = (mat, x, y, z, w, h, d, ry = 0, rz = 0) =>
    add(unitBox, mat, x, y, z, w, h, d, 0, ry, rz);
  const cylinder = (mat, x, y, z, r, h, rx = 0, rz = 0) =>
    add(unitCylinder, mat, x, y, z, r, h, r, rx, 0, rz);
  function ring(mat, x, y, z, radius, tube, rx = 0, ry = 0, arc = Math.PI * 2) {
    const key = `ring:${radius}:${tube}:${arc}`;
    if (!cache.has(key))
      cache.set(
        key,
        new THREE.TorusGeometry(
          radius,
          tube,
          6,
          Math.max(8, Math.ceil((32 * arc) / (Math.PI * 2))),
          arc,
        ),
      );
    add(cache.get(key), mat, x, y, z, 1, 1, 1, rx, ry);
  }
  function at(x, y, z, ry, fn) {
    const previous = frame;
    frame = frame
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationY(ry));
    fn();
    frame = previous;
  }
  function merge(target, into) {
    for (const [mat, geometries] of target) {
      const geometry = mergeGeometries(geometries, false);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      into.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
    target.clear();
  }
  function obstacle(x, z, w, d) {
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  function bolts(x, y, z, radius, count = 12, size = 0.055, mat = m.brass) {
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      cylinder(
        mat,
        x + Math.sin(a) * radius,
        y + Math.cos(a) * radius,
        z,
        size,
        0.08,
        Math.PI / 2,
      );
    }
  }
  function beam(mat, a, b, width = 0.1, depth = width) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const midpoint = start.add(end).multiplyScalar(0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    const matrix = new THREE.Matrix4().compose(
      midpoint,
      rotation,
      new THREE.Vector3(width, delta.length(), depth),
    );
    const copy = unitBox.clone().applyMatrix4(frame.clone().multiply(matrix));
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(copy);
  }
  function pipe(a, b, radius = 0.17, mat = m.copper, collars = true) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start),
      length = delta.length();
    const direction = delta.clone().normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction,
    );
    function section(center, r, h, sectionMat) {
      const matrix = new THREE.Matrix4().compose(
        center,
        rotation,
        new THREE.Vector3(r, h, r),
      );
      const copy = unitCylinder
        .clone()
        .applyMatrix4(frame.clone().multiply(matrix));
      if (!parts.has(sectionMat)) parts.set(sectionMat, []);
      parts.get(sectionMat).push(copy);
    }
    section(start.clone().add(end).multiplyScalar(0.5), radius, length, mat);
    if (collars) {
      const count = Math.max(1, Math.ceil(length / 1.4));
      for (let i = 0; i <= count; i++) {
        const center = start.clone().addScaledVector(delta, i / count);
        section(center, radius * 1.38, 0.13, m.brassDark);
        section(
          center.clone().addScaledVector(direction, 0.075),
          radius * 1.2,
          0.035,
          m.brass,
        );
      }
    }
  }

  // Brick courses include alternating bonds and slightly recessed mortar.
  function brickFace(width, height, distant = false) {
    const bh = distant ? 0.52 : 0.29;
    const bw = distant ? 1.12 : 0.61;
    const rows = Math.ceil(height / bh);
    for (let row = 0; row < rows; row++) {
      const bottom = row * bh,
        h = Math.min(bh, height - bottom);
      const offset = row % 2 ? bw / 2 : 0;
      for (let left = -width / 2 - offset; left < width / 2; left += bw) {
        const l = Math.max(left, -width / 2),
          r = Math.min(left + bw, width / 2);
        if (r - l < 0.05) continue;
        box(
          distant ? m.distant : m.brick[Math.floor(random() * m.brick.length)],
          (l + r) / 2,
          bottom + h / 2,
          0.015 + random() * 0.014,
          r - l - 0.035,
          h - 0.035,
          0.12,
        );
      }
    }
  }
  function masonry(x, y, z, w, h, d, distant = false) {
    box(distant ? m.distant : m.mortar, x, y + h / 2, z, w, h, d);
    at(x, y, z + d / 2, 0, () => brickFace(w, h, distant));
    at(x + w / 2, y, z, Math.PI / 2, () => brickFace(d, h, distant));
    if (!distant) at(x - w / 2, y, z, -Math.PI / 2, () => brickFace(d, h));
  }
  function cornice(x, y, z, w, d, distant = false) {
    const mat = distant ? m.distantTrim : m.stone;
    box(mat, x, y, z, w + 0.18, 0.16, d + 0.18);
    box(mat, x, y + 0.19, z, w + 0.42, 0.22, d + 0.42);
    box(
      distant ? mat : m.stoneLight,
      x,
      y + 0.33,
      z,
      w + 0.48,
      0.055,
      d + 0.48,
    );
  }
  function quoins(x, y, z, w, h, d) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        for (let j = 0; j < h / 0.43; j++) {
          const wide = j % 2 === 0;
          box(
            j % 3 ? m.stone : m.stoneLight,
            x + sx * (w / 2 - 0.07),
            y + j * 0.43 + 0.2,
            z + sz * (d / 2 - 0.07),
            wide ? 0.65 : 0.43,
            0.39,
            wide ? 0.43 : 0.65,
          );
        }
      }
  }
  function archGeometry(w, h) {
    const key = `arch:${w}:${h}`;
    if (!cache.has(key)) {
      const r = w / 2,
        spring = h - r;
      const shape = new THREE.Shape();
      shape.moveTo(-r, 0);
      shape.lineTo(r, 0);
      shape.lineTo(r, spring);
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        shape.lineTo(Math.cos(a) * r, spring + Math.sin(a) * r);
      }
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.06,
        bevelEnabled: false,
        curveSegments: 1,
      });
      // ExtrudeGeometry is unindexed; give it an index to match the reused
      // primitive geometries before merging the material batches.
      geometry.setIndex(
        Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
      );
      cache.set(key, geometry);
    }
    return cache.get(key);
  }
  function windowAt(x, y, z, w = 0.85, h = 1.75, ry = 0, glow = m.amber) {
    at(x, y, z, ry, () => {
      add(archGeometry(w + 0.22, h + 0.14), m.black, 0, -0.06, 0);
      add(archGeometry(w, h), glow, 0, 0, 0.075);
      const spring = h - w / 2;
      for (const side of [-1, 1]) {
        for (let yy = 0.1; yy < spring; yy += 0.29)
          box(m.stone, side * (w / 2 + 0.14), yy, 0.1, 0.22, 0.25, 0.22);
      }
      for (let j = 0; j <= 10; j++) {
        const a = (j * Math.PI) / 10;
        box(
          j === 5 ? m.stoneLight : m.stone,
          Math.cos(a) * (w / 2 + 0.14),
          spring + Math.sin(a) * (w / 2 + 0.14),
          0.1,
          0.23,
          0.28,
          0.23,
          0,
          a - Math.PI / 2,
        );
      }
      for (const xx of [-w / 4, 0, w / 4]) {
        const top = spring + Math.sqrt((w * w) / 4 - xx * xx);
        box(m.iron, xx, top / 2, 0.17, 0.055, top, 0.09);
      }
      for (let yy = 0.35; yy < h - 0.15; yy += 0.43) {
        const width =
          yy < spring
            ? w
            : 2 * Math.sqrt(Math.max(0, (w * w) / 4 - (yy - spring) ** 2));
        box(m.iron, 0, yy, 0.17, width, 0.05, 0.09);
      }
      box(m.stoneLight, 0, -0.15, 0.14, w + 0.48, 0.18, 0.48);
      box(m.brassDark, 0, -0.025, 0.21, w + 0.1, 0.06, 0.12);
    });
  }
  function roof(x, y, z, w, d, height) {
    const steps = Math.ceil(height / 0.22);
    for (let j = 0; j < steps; j++) {
      const inset = (j / steps) * Math.min(w, d) * 0.25;
      const ww = w - inset * 2,
        dd = d - inset * 2;
      box(j % 3 ? m.slate : m.slateLight, x, y + j * 0.22, z, ww, 0.25, dd);
      for (let xx = -ww / 2 + 0.2 + (j % 2) * 0.3; xx < ww / 2; xx += 0.64) {
        box(
          m.iron,
          x + xx,
          y + j * 0.22 + 0.13,
          z + dd / 2 - 0.09,
          0.028,
          0.018,
          0.28,
        );
        box(
          m.iron,
          x + xx,
          y + j * 0.22 + 0.13,
          z - dd / 2 + 0.09,
          0.028,
          0.018,
          0.28,
        );
      }
      for (let zz = -dd / 2 + 0.2; zz < dd / 2; zz += 0.64)
        box(
          m.iron,
          x + ww / 2 - 0.08,
          y + j * 0.22 + 0.13,
          z + zz,
          0.25,
          0.018,
          0.025,
        );
    }
    const capW = w * 0.53,
      capD = d * 0.53;
    box(m.slate, x, y + height + 0.02, z, capW, 0.16, capD);
    // Finish the shallow roof plateau as separate slate courses instead of
    // a projecting pale stone cornice; seams remain legible from overhead.
    for (let zz = -capD / 2; zz < capD / 2; zz += 0.42) {
      const tileD = Math.min(0.42, capD / 2 - zz);
      box(
        m.slateLight,
        x,
        y + height + 0.11,
        z + zz + tileD / 2,
        capW - 0.08,
        0.045,
        tileD - 0.03,
      );
      for (let xx = -capW / 2 + 0.3; xx < capW / 2; xx += 0.62)
        box(
          m.slate,
          x + xx,
          y + height + 0.138,
          z + zz + tileD / 2,
          0.025,
          0.012,
          tileD - 0.035,
        );
    }
    for (const sign of [-1, 1]) {
      box(
        m.iron,
        x,
        y + height + 0.15,
        z + (sign * capD) / 2,
        capW + 0.1,
        0.075,
        0.075,
      );
      box(
        m.iron,
        x + (sign * capW) / 2,
        y + height + 0.15,
        z,
        0.075,
        0.075,
        capD,
      );
    }
    pipe(
      [x - capW / 2, y + height + 0.2, z],
      [x + capW / 2, y + height + 0.2, z],
      0.055,
      m.brassDark,
    );
  }
  function chimney(x, z, bottom, height, w = 0.82) {
    masonry(x, bottom, z, w, height, w);
    for (const yy of [
      bottom + 0.35,
      bottom + height * 0.55,
      bottom + height - 0.5,
    ])
      cornice(x, yy, z, w, w);
    box(m.stoneLight, x, bottom + height + 0.02, z, w + 0.4, 0.16, w + 0.4);
    box(m.black, x, bottom + height + 0.11, z, w * 0.69, 0.03, w * 0.69);
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        box(
          m.stone,
          x + dx * w * 0.42,
          bottom + height + 0.28,
          z + dz * w * 0.42,
          0.2,
          0.5,
          0.2,
        );
    steamSources.push(
      new THREE.Vector3(x, bottom + height + 0.25, z)
        .applyMatrix4(frame)
        .toArray(),
    );
  }
  function valve(x, y, z, r = 0.3) {
    cylinder(m.brassDark, x, y, z - 0.08, 0.09, 0.34, Math.PI / 2);
    ring(m.copper, x, y, z + 0.13, r, 0.045);
    for (let j = 0; j < 5; j++) {
      const a = (j * Math.PI * 2) / 5;
      beam(
        m.brass,
        [x, y, z + 0.13],
        [x + Math.sin(a) * r, y + Math.cos(a) * r, z + 0.13],
        0.045,
      );
    }
    cylinder(m.brass, x, y, z + 0.15, 0.09, 0.08, Math.PI / 2);
  }
  function tank(x, y, z, radius, height) {
    cylinder(m.copper, x, y + height / 2, z, radius, height);
    add(
      unitCone,
      m.brassDark,
      x,
      y + height + radius * 0.23,
      z,
      radius,
      radius * 0.46,
      radius,
    );
    cylinder(m.brass, x, y + height + radius * 0.53, z, radius * 0.26, 0.2);
    for (const yy of [
      y + 0.12,
      y + height * 0.24,
      y + height * 0.8,
      y + height,
    ]) {
      cylinder(m.iron, x, yy, z, radius + 0.065, 0.12);
      ring(m.brass, x, yy + 0.07, z, radius + 0.07, 0.035, Math.PI / 2);
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        box(
          m.brass,
          x + Math.cos(a) * (radius + 0.09),
          yy,
          z + Math.sin(a) * (radius + 0.09),
          0.08,
          0.075,
          0.08,
        );
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      box(
        m.brassDark,
        x + Math.cos(a) * radius,
        y + height / 2,
        z + Math.sin(a) * radius,
        0.035,
        height * 0.68,
        0.035,
      );
    }
    for (const dx of [-1, 1])
      box(m.iron, x + dx * radius * 0.65, y - 0.12, z, 0.18, 0.4, radius * 1.3);
    box(
      m.brassDark,
      x,
      y + height * 0.52,
      z + radius + 0.06,
      radius * 0.65,
      0.5,
      0.1,
    );
    cylinder(
      m.clock,
      x,
      y + height * 0.55,
      z + radius + 0.15,
      0.15,
      0.04,
      Math.PI / 2,
    );
    ring(m.brass, x, y + height * 0.55, z + radius + 0.19, 0.16, 0.035);
    box(
      m.black,
      x + 0.035,
      y + height * 0.55 + 0.03,
      z + radius + 0.22,
      0.025,
      0.13,
      0.015,
      0,
      -0.7,
    );
  }
  function crate(x, y, z, size = 0.75, turn = 0) {
    at(x, y, z, turn, () => {
      box(m.wood, 0, size / 2, 0, size, size, size);
      for (let i = 0; i < 5; i++) {
        const t = -size / 2 + (size * (i + 0.5)) / 5;
        box(
          i % 2 ? m.wood : m.woodLight,
          t,
          size / 2,
          size / 2 + 0.015,
          size / 5 - 0.025,
          size - 0.05,
          0.05,
        );
        box(
          m.woodLight,
          size / 2 + 0.015,
          size / 2,
          t,
          0.05,
          size - 0.05,
          size / 5 - 0.025,
        );
        box(m.woodLight, t, size + 0.015, 0, size / 5 - 0.025, 0.05, size);
      }
      for (const t of [-size * 0.36, size * 0.36]) {
        box(m.iron, t, size / 2, 0, 0.085, size + 0.1, size + 0.1);
        box(
          m.iron,
          0,
          size * 0.5 + t,
          size / 2 + 0.06,
          size + 0.08,
          0.08,
          0.035,
        );
        for (const yy of [0.1, size - 0.1])
          cylinder(m.brass, t, yy, size / 2 + 0.095, 0.035, 0.035, Math.PI / 2);
      }
      beam(
        m.woodLight,
        [-size * 0.36, 0.1, size / 2 + 0.08],
        [size * 0.36, size - 0.1, size / 2 + 0.08],
        0.1,
        0.05,
      );
    });
  }

  // The left-hand works: deep window reveals, bonded brick, a stepped slate
  // mansard and a raised central dormer, with two unequal square smokestacks.
  at(-2, 0, 1, 0, () => {
    frame.multiply(new THREE.Matrix4().makeScale(1, 1.13, 1));
    masonry(-7, 0.3, -6, 9, 4.9, 7);
    quoins(-7, 0.3, -6, 9, 5, 7);
    cornice(-7, 0.2, -6, 9.15, 7.15);
    cornice(-7, 3.45, -6, 9.15, 7.15);
    cornice(-7, 5.12, -6, 9.2, 7.2);
    roof(-7, 5.52, -6, 9.6, 7.5, 2.65);
    masonry(-6.8, 5.6, -3.65, 4.15, 2.2, 2.35);
    quoins(-6.8, 5.6, -3.65, 4.15, 2.2, 2.35);
    cornice(-6.8, 7.74, -3.65, 4.2, 2.4);
    for (let i = 0; i < 4; i++)
      box(
        i % 2 ? m.slateLight : m.slate,
        -6.8,
        8.1 + i * 0.25,
        -3.65,
        4.1 - i * 0.8,
        0.26,
        2.4 - i * 0.26,
      );
    pipe([-7.63, 9.04, -3.65], [-5.97, 9.04, -3.65], 0.06, m.brassDark);
    windowAt(-7.9, 5.87, -2.39, 0.7, 1.58);
    windowAt(-5.7, 5.87, -2.39, 0.7, 1.58);
    for (const x of [-10.15, -8.8, -4.35]) windowAt(x, 1.25, -2.39, 0.83, 1.9);
    for (const z of [-4.2, -6.6, -8.45])
      windowAt(-2.39, 1.3, z, 0.83, 1.85, Math.PI / 2);
    for (const x of [-10, -4.1]) windowAt(x, 4.05, -2.37, 0.7, 0.85);
    chimney(-9.95, -7.2, 6.9, 6.1, 0.84);
    chimney(-6.65, -7.8, 7.9, 6.1, 1.02);
    chimney(-3.7, -8.1, 6.3, 3.6, 0.58);
    for (const x of [-11.35, -2.65]) {
      pipe([x, 0.8, -2.13], [x, 5.4, -2.13], 0.09, m.patina);
      pipe([x, 5.4, -2.13], [x, 5.4, -9.35], 0.09, m.patina);
    }
    // Factory door, arch, copper lintel, and shallow approach steps.
    at(-6.65, 0.48, -2.26, 0, () => {
      add(archGeometry(1.6, 2.65), m.black, 0, 0, 0);
      for (let i = 0; i < 8; i++)
        box(m.wood, -0.7 + i * 0.2, 1.1, 0.11, 0.17, 2.12, 0.1);
      for (const yy of [0.45, 1.5]) box(m.iron, 0, yy, 0.19, 1.6, 0.13, 0.12);
      for (const xx of [-0.83, 0.83])
        box(m.stone, xx, 1.03, 0.06, 0.26, 2.35, 0.4);
      ring(m.copper, 0, 1.85, 0.19, 0.92, 0.15, 0, 0, Math.PI);
      bolts(0, 1.85, 0.36, 0.92, 14, 0.045);
      box(m.brass, 0.4, 1.08, 0.27, 0.08, 0.29, 0.12);
      cylinder(m.amber, 0, 2.3, 0.26, 0.17, 0.05, Math.PI / 2);
    });
    for (let i = 0; i < 3; i++)
      box(m.stone, -6.65, 0.08 + i * 0.14, -1.24 - i * 0.3, 2.4, 0.16, 0.82);
    tank(-10.1, 6.6, -3.7, 0.64, 1.55);
    pipe([-10.1, 6.75, -2.8], [-10.1, 4.0, -2.0], 0.13);
    pipe([-10.1, 4.0, -2.0], [-7.6, 4.0, -2.0], 0.13);
    tank(-11.9, 0.3, -1.1, 0.53, 2.5);
    tank(-10.6, 0.3, -1.1, 0.4, 1.8);
    pipe([-11.9, 2.95, -1.1], [-11.9, 3.45, -1.1], 0.16);
    pipe([-11.9, 3.45, -1.1], [-10.6, 3.45, -1.1], 0.16);
    pipe([-10.6, 3.45, -1.1], [-10.6, 2.1, -1.1], 0.16);
    valve(-11.8, 1.6, -0.43, 0.23);
    tank(-12.05, 0.5, -4.1, 0.65, 2.35);
    pipe([-12.05, 2.92, -4.1], [-12.05, 3.4, -4.1], 0.18);
    pipe([-12.05, 3.4, -4.1], [-10.9, 3.4, -4.1], 0.18);
    valve(-11.75, 1.8, -3.37, 0.26);
    obstacle(-7, -6, 9.6, 7.5);
    obstacle(-6.65, -1.65, 2.6, 1.45);
    obstacle(-12.05, -4.1, 1.5, 1.5);
  });

  // Lower west foundry wing gives the works a broad, stepped industrial mass.
  box(m.stone, -16, 0.0, -4.2, 7.8, 0.35, 7.5);
  box(m.quay, -16, -0.65, -4.2, 7.8, 1.0, 7.5);
  masonry(-16, 0.25, -4.2, 7.2, 4.0, 5.6);
  quoins(-16, 0.25, -4.2, 7.2, 4.0, 5.6);
  cornice(-16, 0.2, -4.2, 7.3, 5.7);
  cornice(-16, 4.25, -4.2, 7.4, 5.8);
  roof(-16, 4.64, -4.2, 7.6, 5.8, 1.8);
  for (const x of [-18.5, -16.6, -14.7]) windowAt(x, 1.0, -1.32, 0.9, 2.35);
  pipe([-19.75, 0.5, -1.1], [-19.75, 4.5, -1.1], 0.2);
  pipe([-19.75, 4.5, -1.1], [-13.6, 4.5, -1.1], 0.2);
  tank(-18.5, 6.25, -4.0, 0.55, 1.5);
  for (const x of [-18.6, -17.0]) crate(x, 0.18, -0.8, 0.7);

  // Clock tower, structural pilasters and projecting belt courses.
  at(-1.6, 0, -10.8, 0, () => {
    masonry(7, 0.25, -6, 5, 14.8, 5);
    quoins(7, 0.3, -6, 5, 14.8, 5);
    cornice(7, 0.22, -6, 5.25, 5.25);
    for (const yy of [4.6, 10.3, 14.75]) cornice(7, yy, -6, 5.15, 5.15);
    for (const x of [4.73, 9.27]) {
      box(m.stone, x, 7.5, -3.22, 0.4, 14.5, 0.52);
      for (const yy of [1, 4.5, 7.8, 10.2, 14.65])
        box(m.stoneLight, x, yy, -3.19, 0.62, 0.26, 0.7);
    }
    box(m.slate, 7, 15.23, -6, 5.5, 0.32, 5.5);
    for (const x of [4.48, 9.52])
      for (const z of [-3.48, -8.52]) {
        box(m.stone, x, 15.65, z, 0.7, 0.8, 0.7);
        box(m.brassDark, x, 16.12, z, 0.8, 0.15, 0.8);
        add(unitCone, m.iron, x, 16.52, z, 0.17, 0.7, 0.17);
      }
    for (let i = 0; i < 7; i++) {
      box(m.stone, 4.7 + i * 0.77, 15.65, -3.46, 0.43, 0.7, 0.35);
      box(m.stone, 9.53, 15.65, -8.3 + i * 0.77, 0.35, 0.7, 0.43);
    }
    roof(7, 15.38, -6.1, 3.8, 3.8, 0.66);
    for (const z of [-4.8, -7.05])
      for (const y of [1.45, 5.5, 10.95])
        windowAt(
          9.62,
          y,
          z,
          0.66,
          y > 10 ? 1.9 : 1.5,
          Math.PI / 2,
          y > 10 ? m.cyan : m.amber,
        );
    pipe([9.92, 0.7, -7.9], [9.92, 14.4, -7.9], 0.13);
    pipe([9.96, 14.4, -7.9], [9.96, 14.4, -4.0], 0.13);
    for (let y = 2; y < 14; y += 0.4)
      box(m.brassDark, 9.93, y, -6.35, 0.18, 0.045, 0.62);
    for (const z of [-6.65, -6.05])
      pipe([9.94, 1.65, z], [9.94, 14, z], 0.035, m.brassDark, false);

    // Large inset amber clock with separate chapter ring, sixty ticks, Roman
    // numeral batons and raised hands. All numerals are actual brass geometry.
    const clockX = 7,
      clockY = 12.62,
      clockZ = -3.01;
    box(m.iron, clockX, clockY, -3.32, 3.98, 4.05, 0.3);
    cylinder(
      m.brassDark,
      clockX,
      clockY,
      clockZ - 0.08,
      1.9,
      0.34,
      Math.PI / 2,
    );
    cylinder(m.clock, clockX, clockY, clockZ + 0.12, 1.63, 0.08, Math.PI / 2);
    ring(m.brass, clockX, clockY, clockZ + 0.22, 1.79, 0.11);
    ring(m.iron, clockX, clockY, clockZ + 0.24, 1.59, 0.045);
    ring(m.brassDark, clockX, clockY, clockZ + 0.25, 1.16, 0.025);
    bolts(clockX, clockY, clockZ + 0.32, 1.8, 24, 0.055);
    for (let i = 0; i < 60; i++) {
      const a = (i * Math.PI) / 30;
      box(
        m.black,
        clockX + Math.sin(a) * 1.49,
        clockY + Math.cos(a) * 1.49,
        clockZ + 0.28,
        i % 5 ? 0.024 : 0.055,
        i % 5 ? 0.07 : 0.15,
        0.035,
        0,
        -a,
      );
    }
    const numerals = [
      "XII",
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6,
        word = numerals[i];
      const cx = clockX + Math.sin(a) * 1.32,
        cy = clockY + Math.cos(a) * 1.32;
      for (let j = 0; j < word.length; j++) {
        const xx = cx + (j - (word.length - 1) / 2) * 0.1;
        if (word[j] === "I")
          box(m.black, xx, cy, clockZ + 0.29, 0.025, 0.19, 0.035);
        else {
          beam(
            m.black,
            [xx - 0.037, cy + 0.095, clockZ + 0.29],
            [xx + (word[j] === "X" ? 0.037 : 0), cy - 0.095, clockZ + 0.29],
            0.025,
            0.035,
          );
          beam(
            m.black,
            [xx + 0.037, cy + 0.095, clockZ + 0.29],
            [xx - (word[j] === "X" ? 0.037 : 0), cy - 0.095, clockZ + 0.29],
            0.025,
            0.035,
          );
        }
      }
    }
    beam(
      m.iron,
      [7, clockY, clockZ + 0.38],
      [6.35, clockY + 0.63, clockZ + 0.38],
      0.14,
      0.08,
    );
    beam(
      m.iron,
      [7, clockY, clockZ + 0.39],
      [8.03, clockY + 0.65, clockZ + 0.39],
      0.095,
      0.08,
    );
    cylinder(m.brass, 7, clockY, clockZ + 0.43, 0.15, 0.1, Math.PI / 2);
    for (const x of [5.13, 8.87])
      for (const y of [10.77, 14.46]) {
        box(m.brassDark, x, y, -2.98, 0.31, 0.31, 0.18, 0, Math.PI / 4);
        cylinder(m.brass, x, y, -2.84, 0.075, 0.05, Math.PI / 2);
      }
    lights.push({
      position: new THREE.Vector3(7, 12.6, -1.85).applyMatrix4(frame).toArray(),
      color: 0xffae42,
      intensity: 9,
      distance: 8,
    });

    function gear(x, y, z, r, teeth, speed, phase = 0) {
      // Meshes share a pivot; tooth/rim/spoke/hub detail is merged by finish.
      const group = new THREE.Group();
      group.name = "Clockwork gear";
      group.position.set(x, y, z).applyMatrix4(frame);
      const previous = parts,
        previousFrame = frame;
      frame = new THREE.Matrix4();
      parts = new Map();
      ring(m.brass, 0, 0, 0, r * 0.83, r * 0.085);
      ring(m.brassDark, 0, 0, -0.12, r * 0.84, r * 0.08);
      for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth;
        box(
          m.brass,
          Math.sin(a) * r * 0.95,
          Math.cos(a) * r * 0.95,
          0,
          r * 0.16,
          r * 0.19,
          0.24,
          0,
          -a,
        );
      }
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        beam(
          m.brassDark,
          [Math.sin(a) * r * 0.16, Math.cos(a) * r * 0.16, 0],
          [Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0],
          r * 0.12,
          0.16,
        );
        cylinder(
          m.brass,
          Math.sin(a) * r * 0.68,
          Math.cos(a) * r * 0.68,
          0.12,
          r * 0.035,
          0.05,
          Math.PI / 2,
        );
      }
      cylinder(m.brassDark, 0, 0, 0, r * 0.24, 0.36, Math.PI / 2);
      ring(m.brass, 0, 0, 0.2, r * 0.19, r * 0.035);
      cylinder(m.iron, 0, 0, 0.23, r * 0.095, 0.14, Math.PI / 2);
      bolts(0, 0, 0.22, r * 0.15, 6, r * 0.025);
      merge(parts, group);
      parts = previous;
      frame = previousFrame;
      group.rotation.z = phase;
      root.add(group);
      moving.push({ group, speed, phase });
    }
    box(m.iron, 7, 7.7, -3.29, 3.62, 5.05, 0.17);
    for (const x of [5.25, 8.75]) {
      box(m.brassDark, x, 7.7, -3.12, 0.085, 4.85, 0.12);
      for (let y = 5.5; y < 10; y += 0.4)
        cylinder(m.brass, x, y, -3.01, 0.045, 0.06, Math.PI / 2);
    }
    gear(7.05, 8.6, -2.82, 1.58, 28, 0.07);
    gear(5.92, 6.39, -2.78, 0.89, 16, -0.1225, 0.11);
    gear(8.18, 5.88, -2.75, 0.85, 15, 0.13, 0.12);
    gear(6.7, 7.05, -2.49, 0.48, 12, -0.19, 0.2);
    for (const x of [5.37, 8.7])
      pipe([x, 4.9, -3.02], [x, 10.1, -3.02], 0.075, m.patina);

    // Cyan pressure engine sits proud of the lower facade like a locomotive
    // boiler: a thick flange, glass core, cage ribs, gauges and copper plumbing.
    box(m.stone, 7, 0.24, -2.3, 3.6, 0.46, 2.8);
    box(m.stoneLight, 7, 0.5, -2.35, 3.3, 0.16, 2.55);
    for (const x of [6.0, 8.0]) box(m.iron, x, 0.79, -2.25, 0.36, 0.45, 1.85);
    box(m.patina, 7, 1.8, -2.48, 2.35, 2.18, 1.35);
    cylinder(m.iron, 7, 1.95, -1.91, 1.14, 1.05, Math.PI / 2);
    cylinder(m.brassDark, 7, 1.95, -1.34, 1.17, 0.24, Math.PI / 2);
    cylinder(m.black, 7, 1.95, -1.18, 0.96, 0.12, Math.PI / 2);
    ring(m.patina, 7, 1.95, -1.12, 0.94, 0.11);
    ring(m.cyan, 7, 1.95, -1.01, 0.79, 0.045);
    ring(m.brass, 7, 1.95, -1.07, 1.08, 0.07);
    bolts(7, 1.95, -0.98, 1.065, 16, 0.065);
    cylinder(m.patina, 7, 1.95, -1.08, 0.63, 0.18, Math.PI / 2);
    ring(m.cyan, 7, 1.95, -0.93, 0.51, 0.045);
    cylinder(m.cyan, 7, 1.95, -0.91, 0.27, 0.16, Math.PI / 2);
    ring(m.brass, 7, 1.95, -0.8, 0.29, 0.035);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(
        m.ironLight,
        7 + Math.sin(a) * 0.68,
        1.95 + Math.cos(a) * 0.68,
        -0.91,
        0.095,
        0.35,
        0.16,
        0,
        -a,
      );
      box(
        m.cyan,
        7 + Math.sin(a) * 0.94,
        1.95 + Math.cos(a) * 0.94,
        -0.97,
        0.09,
        0.17,
        0.035,
        0,
        -a,
      );
    }
    for (const x of [5.57, 8.43]) {
      pipe([x, 0.65, -1.65], [x, 2.72, -1.65], 0.15);
      pipe([x, 2.72, -1.65], [x, 2.72, -2.9], 0.15);
      valve(x, 1.25, -1.39, 0.23);
    }
    pipe([6.25, 3.02, -2.2], [6.25, 3.82, -2.2], 0.15);
    pipe([6.25, 3.82, -2.2], [7.72, 3.82, -2.2], 0.15);
    pipe([7.72, 3.82, -2.2], [7.72, 3.04, -2.2], 0.15);
    cylinder(m.clock, 7.08, 3.27, -1.74, 0.22, 0.09, Math.PI / 2);
    ring(m.brass, 7.08, 3.27, -1.66, 0.24, 0.05);
    beam(m.black, [7.08, 3.27, -1.59], [7.17, 3.39, -1.59], 0.025);
    lights.push({
      position: new THREE.Vector3(7, 2.0, 0.15).applyMatrix4(frame).toArray(),
      color: 0x22ddea,
      intensity: 16,
      distance: 9,
    });
    steamSources.push(
      new THREE.Vector3(5.56, 3.03, -1.67).applyMatrix4(frame).toArray(),
      new THREE.Vector3(8.44, 3.03, -1.67).applyMatrix4(frame).toArray(),
    );
    obstacle(7, -6, 5.8, 5.8);
    obstacle(7, -2.15, 3.75, 3.05);
    tank(11.08, 0.6, -4.1, 0.85, 2.85);
    tank(12.66, 0.4, -6.12, 0.55, 2.05);
    pipe([11.08, 3.48, -4.1], [11.08, 4.05, -4.1], 0.17);
    pipe([11.08, 4.05, -4.1], [9.52, 4.05, -4.1], 0.17);
    pipe([12.66, 0.9, -5.8], [12.66, 0.9, -3], 0.13);
    pipe([12.66, 0.9, -3], [11.3, 0.9, -3], 0.13);
    obstacle(11.08, -4.1, 1.95, 1.95);
    obstacle(12.66, -6.12, 1.3, 1.3);
  });

  // Rear pipe bridge leaves the full courtyard open and preserves the gap
  // between the two hero buildings. Cross bracing makes it read as a truss.
  for (const z of [-7.1, -8.0]) {
    pipe([-4.7, 6.25, z], [2.8, 6.25, z - 10.8], z === -7.1 ? 0.27 : 0.17);
    beam(m.iron, [-4.7, 5.7, z], [2.8, 5.7, z - 10.8], 0.15);
    for (let i = 0; i < 14; i++) {
      const t = i / 14,
        x = -4.7 + 7.5 * t,
        zz = z - 10.8 * t;
      beam(
        m.brassDark,
        [x, 5.7, zz],
        [x + 7.5 / 14, 6.1, zz - 10.8 / 14],
        0.055,
      );
      box(m.iron, x, 5.95, zz, 0.06, 0.5, 0.15);
    }
  }
  for (const t of [0.32, 0.76]) {
    const x = -4.7 + 7.5 * t,
      z = -7.55 - 10.8 * t;
    pipe([x, 0.4, z], [x, 6.65, z], 0.16, m.iron);
    box(m.stone, x, 0.4, z, 0.65, 0.8, 0.65);
    box(m.brassDark, x, 6.3, z, 0.65, 0.8, 1.5);
    bolts(x, 6.3, z + 0.78, 0.23, 6, 0.04);
  }
  valve(-0.95, 6.28, -12.2, 0.43);
  pipe([0.55, 6.3, -14.66], [0.55, 7.23, -14.66], 0.095);
  steamSources.push([0.55, 7.28, -14.66]);

  function lantern(x, y, z, tall = true) {
    const pole = tall ? 2.25 : 0.35;
    box(m.stone, x, y + 0.14, z, 0.72, 0.28, 0.72);
    box(m.stoneLight, x, y + 0.34, z, 0.5, 0.14, 0.5);
    cylinder(m.iron, x, y + pole / 2 + 0.38, z, 0.105, pole);
    for (const yy of [0.44, pole * 0.6, pole + 0.27])
      cylinder(m.brass, x, y + yy, z, 0.16, 0.1);
    const ly = y + pole + 0.65;
    box(m.brassDark, x, ly - 0.26, z, 0.58, 0.13, 0.58);
    box(m.amber, x, ly + 0.08, z, 0.26, 0.48, 0.26);
    for (const dx of [-0.21, 0.21])
      for (const dz of [-0.21, 0.21])
        box(m.iron, x + dx, ly + 0.07, z + dz, 0.055, 0.6, 0.055);
    box(m.iron, x, ly + 0.39, z, 0.6, 0.13, 0.6);
    add(unitCone, m.brassDark, x, ly + 0.54, z, 0.37, 0.23, 0.37);
    cylinder(m.brass, x, ly + 0.75, z, 0.065, 0.21);
    lights.push({
      position: [x, ly + 0.08, z],
      color: 0xffb04c,
      intensity: tall ? 5 : 3,
      distance: tall ? 6 : 4,
    });
    if (tall) obstacle(x, z, 0.8, 0.8);
  }
  // First six recommendations prioritize clock, engine and courtyard lamps.
  for (const [x, z] of [
    [-12, 4],
    [12, 4],
    [-12, 10],
    [12, 10],
  ])
    lantern(x, 0, z);
  for (const [x, z] of [
    [-8.02, -1.92],
    [-5.22, -1.92],
    [4.65, -2.6],
    [9.4, -2.6],
  ])
    lantern(x, 0.12, z, false);
  for (const [x, z, size, turn] of [
    [-10.9, -1.38, 0.8, 0.1],
    [-9.92, -1.28, 0.62, -0.1],
    [-3.65, -1.35, 0.85, 0],
    [-2.7, -1.53, 0.58, 0.18],
    [10.35, -1.32, 0.65, -0.13],
    [11.15, -1.5, 0.62, 0.1],
  ]) {
    crate(x, 0.05, z, size, turn);
    obstacle(x, z, size + 0.12, size + 0.12);
  }
  crate(-10.88, 0.88, -1.38, 0.51, -0.12);
  crate(-3.7, 0.94, -1.35, 0.5, 0.08);

  function railing(a, b) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / 1.4);
    for (let i = 0; i <= count; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / count,
        z = a[1] + ((b[1] - a[1]) * i) / count;
      box(m.stone, x, 0.19, z, 0.37, 0.38, 0.37);
      box(m.iron, x, 0.77, z, 0.11, 0.95, 0.11);
      box(m.brassDark, x, 1.27, z, 0.21, 0.1, 0.21);
      for (const y of [0.54, 1.12]) cylinder(m.brass, x, y, z, 0.1, 0.07);
      if (i < count) {
        const xx = a[0] + ((b[0] - a[0]) * (i + 1)) / count,
          zz = a[1] + ((b[1] - a[1]) * (i + 1)) / count;
        for (const y of [0.52, 1.1]) beam(m.iron, [x, y, z], [xx, y, zz], 0.07);
        beam(m.brassDark, [x, 0.54, z], [xx, 1.08, zz], 0.045);
      }
    }
  }
  railing([-14.6, -10.8], [-14.6, 10.7]);
  railing([14.6, -10.8], [14.6, 10.7]);
  railing([-14.6, -11.45], [14.6, -11.45]);
  // Short corner returns only: no fence across the foreground character.
  railing([-14.6, 10.7], [-12.9, 10.7]);
  railing([12.9, 10.7], [14.6, 10.7]);

  // Continuous city blocks, with narrow cross-canals and a broad opposite
  // bank exactly at the existing bridge landing (x=-8, z=21).
  function quay(minX, maxX, minZ, maxZ) {
    const w = maxX - minX,
      d = maxZ - minZ;
    const x = (minX + maxX) / 2,
      z = (minZ + maxZ) / 2;
    box(m.quay, x, -0.53, z, w, 0.94, d);
    for (let zz = minZ; zz < maxZ; zz += 2.1) {
      const depth = Math.min(2.1, maxZ - zz);
      for (let xx = minX; xx < maxX; xx += 2.8) {
        const width = Math.min(2.8, maxX - xx);
        box(
          m.quay,
          xx + width / 2,
          -0.055,
          zz + depth / 2,
          width - 0.005,
          0.1,
          depth - 0.005,
        );
      }
    }
    function edge(ax, az, bx, bz) {
      const length = Math.hypot(bx - ax, bz - az),
        n = Math.ceil(length / 1.25);
      const alongX = az === bz;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          box(
            row === 2 ? m.quayEdge : m.quay,
            ax + (bx - ax) * t,
            -0.84 + row * 0.32,
            az + (bz - az) * t,
            alongX ? length / n - 0.035 : 0.22,
            0.29,
            alongX ? 0.22 : length / n - 0.035,
          );
        }
      }
      beam(m.quayEdge, [ax, -0.045, az], [bx, -0.045, bz], 0.22, 0.24);
      for (let i = 1; i < n; i += 7) {
        const t = i / n,
          xx = ax + (bx - ax) * t,
          zz = az + (bz - az) * t;
        cylinder(m.iron, xx, 0.13, zz, 0.1, 0.3);
        cylinder(m.ironLight, xx, 0.28, zz, 0.16, 0.08);
      }
    }
    edge(minX, minZ, maxX, minZ);
    edge(minX, maxZ, maxX, maxZ);
    edge(minX, minZ, minX, maxZ);
    edge(maxX, minZ, maxX, maxZ);
  }
  quay(-42, 43, -25, -14.5);
  quay(-42, 43, -35.5, -27);
  quay(-42, 43, -49, -37.5);
  for (const [left, right] of [
    [-42, -33],
    [-31.5, -19],
    [19, 31.5],
    [33, 43],
  ])
    quay(left, right, -14.5, 21);
  quay(-42, 43, 21, 40);
  // Low bridges stitch the quay blocks together without filling the canals.
  function canalBridge(x, z, w, d) {
    box(m.iron, x, -0.02, z, w, 0.18, d);
    for (let zz = -d / 2; zz < d / 2; zz += 0.32)
      box(
        m.wood,
        x,
        0.09,
        z + zz + 0.15,
        w - 0.12,
        0.1,
        Math.min(0.29, d / 2 - zz),
      );
    railing([x - w / 2, z - d / 2], [x - w / 2, z + d / 2]);
    railing([x + w / 2, z - d / 2], [x + w / 2, z + d / 2]);
    for (const xx of [x - w * 0.35, x + w * 0.35])
      beam(m.iron, [xx, -0.22, z - d / 2], [xx, -0.22, z + d / 2], 0.2);
  }
  for (const x of [-24, -7, 12, 36]) {
    canalBridge(x, -26, 2.5, 2.5);
    canalBridge(x + 1.5, -36.5, 2.3, 2.5);
  }
  canalBridge(0.7, -13.2, 2.3, 3);
  // Railway continuation and low dock furnishings frame, rather than block,
  // the existing pedestrian bridge's arrival on the southern bank.
  for (const x of [-8.6, -7.4]) box(m.iron, x, 0.035, 30.5, 0.07, 0.06, 19);
  for (let z = 21.5; z < 40; z += 0.65)
    box(m.wood, -8, 0.015, z, 1.7, 0.04, 0.12);
  for (const [x, z] of [
    [-14, 24],
    [-15, 24.2],
    [-19, 29],
    [17, 25],
    [18, 25.2],
  ])
    crate(x, 0, z, 0.8, 0.12);

  // Riveted dock crane, oriented out over the western canal. Only its
  // suspended cable and hook move; the entire truss remains statically merged.
  const craneX = -13,
    craneZ = -6;
  box(m.stone, craneX, 0.25, craneZ, 1.45, 0.5, 1.6);
  cylinder(m.iron, craneX, 0.7, craneZ, 0.58, 0.45);
  cylinder(m.brassDark, craneX, 0.96, craneZ, 0.66, 0.14);
  for (const zz of [-6.4, -5.6]) {
    beam(m.iron, [-13.4, 1, zz], [-13.15, 5.6, zz], 0.15);
    beam(m.iron, [-12.6, 1, zz], [-12.85, 5.6, zz], 0.15);
    for (let y = 1.15; y < 5.3; y += 0.7) {
      beam(m.brassDark, [-13.3, y, zz], [-12.7, y + 0.6, zz], 0.08);
      box(m.brassDark, -13, y, zz, 0.8, 0.1, 0.13);
    }
    beam(m.iron, [-12.3, 4.2, zz], [-17.7, 7.35, zz], 0.16);
    beam(m.iron, [-12.3, 5.2, zz], [-17.7, 7.35, zz], 0.14);
    for (let i = 0; i < 6; i++) {
      const t = i / 6,
        t2 = (i + 1) / 6;
      beam(
        m.brassDark,
        [-12.3 - t * 5.4, 4.2 + t * 3.15, zz],
        [-12.3 - t2 * 5.4, 5.2 + t2 * 2.15, zz],
        0.09,
      );
    }
    beam(m.iron, [-13, 5.6, zz], [-11.9, 3.8, zz], 0.07);
  }
  for (let x = -17.2; x < -12; x += 0.8)
    box(m.iron, x, 4.2 + ((-12.3 - x) / 5.4) * 3.15, -6, 0.11, 0.12, 0.98);
  box(m.iron, -12.15, 3.7, -6, 0.85, 0.65, 1.2);
  cylinder(m.brassDark, -13, 2.1, -6, 0.28, 1.05, Math.PI / 2);
  ring(m.brass, -13, 2.1, -5.42, 0.3, 0.065);
  ring(m.ironLight, -17.7, 7.35, -6, 0.24, 0.055);
  const hook = new THREE.Group();
  hook.name = "Swaying crane hook";
  hook.position.set(-17.7, 7.35, -6);
  const savedParts = parts;
  parts = new Map();
  pipe([0, 0, 0], [0, -3.6, 0], 0.025, m.iron, false);
  box(m.brassDark, 0, -3.65, 0, 0.3, 0.35, 0.25);
  ring(m.iron, 0, -4.02, 0, 0.2, 0.055, 0, 0, Math.PI * 1.55);
  cylinder(m.brass, 0, -3.67, 0.16, 0.07, 0.06, Math.PI / 2);
  merge(parts, hook);
  parts = savedParts;
  root.add(hook);
  obstacle(-13, -6, 1.5, 1.7);

  // Individually articulated distant mills, towers, boiler houses and pipes.
  // Buildings vary in height and spacing; there is no backdrop wall/plane.
  function skylineBuilding(x, z, w, d, h, variant) {
    box(m.distant, x, h / 2 - 0.4, z, w, h, d);
    // Low relief bonded courses on the visible facades of the nearest row.
    if (z > -26 && Math.abs(x) < 28) {
      at(x, 0, z + d / 2, 0, () => brickFace(w, h - 0.4, true));
      at(x + w / 2, 0, z, Math.PI / 2, () => brickFace(d, h - 0.4, true));
    }
    for (let y = 2.6; y < h - 0.6; y += 2.6) {
      cornice(x, y, z, w, d, true);
      const columns = Math.max(1, Math.floor(w / 1.3));
      for (let i = 0; i < columns; i++) {
        if (random() < 0.24) continue;
        const xx = x + (i - (columns - 1) / 2) * 1.15;
        const glow = random() > 0.6 ? m.farCyan : m.farAmber;
        box(m.black, xx, y - 1.15, z + d / 2 + 0.055, 0.58, 1.15, 0.12);
        box(glow, xx, y - 1.15, z + d / 2 + 0.13, 0.31, 0.92, 0.04);
        box(m.distant, xx, y - 1.15, z + d / 2 + 0.17, 0.04, 0.98, 0.06);
        box(m.distant, xx, y - 1.15, z + d / 2 + 0.17, 0.42, 0.055, 0.06);
      }
      for (let zz = z - d / 2 + 0.8; zz < z + d / 2 - 0.2; zz += 1.3) {
        if (random() < 0.4) continue;
        box(m.black, x + w / 2 + 0.055, y - 1.15, zz, 0.12, 1.14, 0.53);
        box(
          random() > 0.5 ? m.farAmber : m.farCyan,
          x + w / 2 + 0.13,
          y - 1.15,
          zz,
          0.045,
          0.86,
          0.24,
        );
        box(m.distant, x + w / 2 + 0.16, y - 1.15, zz, 0.05, 0.06, 0.32);
      }
    }
    cornice(x, h - 0.4, z, w, d, true);
    for (const dx of [-1, 1])
      for (const dz of [-1, 1]) {
        box(
          m.distantTrim,
          x + dx * (w / 2 - 0.07),
          h / 2,
          z + dz * (d / 2 - 0.07),
          0.28,
          h,
          0.28,
        );
        box(
          m.distantTrim,
          x + dx * (w / 2 - 0.07),
          h + 0.35,
          z + dz * (d / 2 - 0.07),
          0.43,
          0.72,
          0.43,
        );
      }
    if (variant % 3 === 0) {
      for (let k = 0; k < 9; k++)
        box(
          k % 3 ? m.slate : m.distant,
          x,
          h + k * 0.25,
          z,
          w * 0.98 - k * w * 0.075,
          0.3,
          d * 0.98 - k * d * 0.075,
        );
      for (const dx of [-w * 0.23, w * 0.23]) {
        box(m.distant, x + dx, h + 0.66, z + d * 0.36, 0.83, 1.15, 0.85);
        box(m.black, x + dx, h + 0.63, z + d * 0.36 + 0.44, 0.46, 0.7, 0.05);
        box(
          m.farAmber,
          x + dx,
          h + 0.63,
          z + d * 0.36 + 0.48,
          0.22,
          0.52,
          0.035,
        );
        for (let k = 0; k < 3; k++)
          box(
            m.slate,
            x + dx,
            h + 1.26 + k * 0.18,
            z + d * 0.36,
            1.05 - k * 0.28,
            0.2,
            1.06 - k * 0.18,
          );
      }
      cylinder(m.distantTrim, x, h + 2.1, z, 0.15, 1.1);
      box(m.farCyan, x, h + 2.67, z, 0.14, 0.15, 0.14);
    } else {
      const stackH = 2 + random() * 4;
      const sx = x - w * 0.24;
      box(m.distant, sx, h + stackH / 2, z, 0.6, stackH, 0.6);
      for (const yy of [h + 0.1, h + stackH * 0.65, h + stackH])
        box(m.distantTrim, sx, yy, z, 0.85, 0.18, 0.85);
      if (variant % 2 === 0)
        steamSources.push(
          new THREE.Vector3(sx, h + stackH + 0.15, z)
            .applyMatrix4(frame)
            .toArray(),
        );
      if (variant % 4 === 1) {
        cylinder(m.distantTrim, x + w * 0.24, h + 0.8, z, 0.55, 1.5);
        cylinder(m.distant, x + w * 0.24, h + 1.57, z, 0.66, 0.16);
      }
    }
    if (variant % 7 === 2) {
      // Octagonal pump observatory: open cage, copper cap and needle spire.
      cylinder(m.distantTrim, x, h + 0.55, z, w * 0.31, 1.1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        box(
          m.iron,
          x + Math.cos(a) * w * 0.28,
          h + 1.55,
          z + Math.sin(a) * w * 0.28,
          0.1,
          1.45,
          0.1,
        );
      }
      cylinder(m.patina, x, h + 2.3, z, w * 0.36, 0.2);
      for (let k = 0; k < 5; k++)
        cylinder(
          m.patina,
          x,
          h + 2.47 + k * 0.21,
          z,
          w * (0.34 - k * 0.05),
          0.23,
        );
      cylinder(m.brassDark, x, h + 3.8, z, 0.06, 1.3);
    }
    if (variant % 8 === 4) {
      // Restrained municipal clock motif below a stepped gable.
      box(m.distant, x, h + 0.55, z + d / 2, 1.95, 1.65, 0.45);
      for (let k = 0; k < 4; k++)
        box(
          m.slate,
          x,
          h + 1.44 + k * 0.2,
          z + d / 2,
          2.2 - k * 0.45,
          0.23,
          0.68,
        );
      cylinder(
        m.quayEdge,
        x,
        h + 0.6,
        z + d / 2 + 0.26,
        0.61,
        0.07,
        Math.PI / 2,
      );
      ring(m.iron, x, h + 0.6, z + d / 2 + 0.33, 0.63, 0.045);
      beam(
        m.iron,
        [x, h + 0.6, z + d / 2 + 0.34],
        [x - 0.27, h + 0.88, z + d / 2 + 0.34],
        0.055,
      );
      beam(
        m.iron,
        [x, h + 0.6, z + d / 2 + 0.35],
        [x + 0.35, h + 0.78, z + d / 2 + 0.35],
        0.04,
      );
    }
    if (variant % 2 === 0) {
      pipe(
        [x + w / 2 + 0.25, 0.5, z + d / 2 - 0.45],
        [x + w / 2 + 0.25, h - 0.4, z + d / 2 - 0.45],
        0.1,
        m.distantTrim,
      );
    }
    obstacle(x, z, w, d);
  }
  let index = 0;
  for (let row = 0; row < 3; row++) {
    const columns = [15, 19, 23][row],
      spacing = [5.4, 4.3, 3.6][row];
    for (let column = 0; column < columns; column++) {
      const x =
        (column - (columns - 1) / 2) * spacing +
        (row % 2) * 1.5 +
        (random() - 0.5) * 0.8;
      let z = -19 - row * 10.5 - random() * 1.8;
      const w = 2.4 + random() * 1.7,
        d = 2.8 + random() * 1.8;
      const bankFront = [-14.5, -27, -37.5][row];
      z = Math.min(z, bankFront - d / 2 - 0.25);
      const h = 2.6 + random() * (row === 0 ? 3.8 : 5.5);
      if (row === 0 && x > 1 && x < 15) continue;
      const depthScale = [0.8, 0.62, 0.42][row];
      at(x, 0, z, 0, () => {
        frame.multiply(
          new THREE.Matrix4().makeScale(depthScale, depthScale, depthScale),
        );
        skylineBuilding(0, 0, w, d, h, index++);
      });
    }
  }
  for (const side of [-1, 1]) {
    for (let j = 0; j < 5; j++) {
      const x = side * (28.2 + (j % 2) * 7.4);
      const z = -10 + j * 5.5;
      // Keep the near right skyline below the hero silhouettes from camera.
      skylineBuilding(
        x,
        z,
        3.5 + random() * 1.5,
        3.5 + random(),
        2.5 + random() * (j > 2 ? 1.5 : 3.5),
        index++,
      );
    }
  }
  for (const z of [-18, -29]) {
    pipe([-29, 3.8, z], [29, 3.8, z], 0.16, m.distantTrim);
    for (let x = -27; x < 30; x += 6) {
      box(m.distant, x, 1.75, z, 0.22, 3.5, 0.24);
      beam(m.distantTrim, [x - 0.8, 3.7, z], [x, 2.8, z], 0.12);
    }
  }

  merge(staticParts, root);
  unitBox.dispose();
  beveledBox.dispose();
  unitCylinder.dispose();
  unitCone.dispose();
  for (const geometry of cache.values()) geometry.dispose();
  root.userData.staticDrawCalls = root.children.filter(
    (child) => child.isMesh,
  ).length;
  scene.add(root);
  return {
    steamSources,
    lights,
    obstacles,
    setPowered(value) {
      powered = Boolean(value);
      m.cyan.emissiveIntensity = powered ? 3.2 : 2.2;
    },
    update(time, dt) {
      if (!Number.isFinite(time)) return;
      for (const { group, speed } of moving)
        group.rotation.z += (dt || 0) * speed * (powered ? 1.5 : 0.65);
      hook.rotation.z = Math.sin(time * 0.72) * 0.035;
      hook.rotation.x = Math.sin(time * 0.53 + 0.8) * 0.022;
    },
  };
}
