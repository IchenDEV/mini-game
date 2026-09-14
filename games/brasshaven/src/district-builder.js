import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const COLORS = {
  stone: 0xb6ad91,
  trim: 0xe0d5af,
  brick: 0xad7654,
  roof: 0x386c70,
  iron: 0x30484a,
  brass: 0xd8aa53,
  copper: 0xb97b46,
  accent: 0x489e91,
  glass: 0x8fd6c4,
  glow: 0xc1fff0,
  wood: 0x725137,
  leaf: 0x42835a,
  dark: 0x243532,
};
const Y = new THREE.Vector3(0, 1, 0);

/** Coordinates are centers except masonry/window/roof/tank: y is their base.
 * Primitive calls are baked. Use moving(x,y,z, callback) for animated assemblies;
 * callback builds in group-local coordinates and its result is a THREE.Group.
 */
export class DistrictBuilder {
  constructor(scene, palette = {}) {
    this.root = new THREE.Group();
    this.root.name = "District architecture";
    scene.add(this.root);
    this.materials = {};
    for (const [name, color] of Object.entries({ ...COLORS, ...palette })) {
      const metal = ["iron", "brass", "copper", "accent"].includes(name);
      this.materials[name] = new THREE.MeshStandardMaterial({
        color,
        roughness: metal ? 0.4 : 0.85,
        metalness: metal ? 0.65 : 0,
      });
    }
    Object.assign(this.materials.glass, {
      transparent: true,
      opacity: 0.29,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.materials.glow.emissive.copy(this.materials.glow.color);
    this.materials.glow.emissiveIntensity = 0.22;
    this.materials.dark.roughness = 0.95;
    this.steamSources = [];
    this.lights = [];
    this.obstacles = [];
    this.animations = [];
    this.powered = false;
    this._parts = new Map();
    this._frame = new THREE.Matrix4();
    this._box = new THREE.BoxGeometry(1, 1, 1);
    this._cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
    this._rings = new Map();
    this._finished = null;
  }
  // Also accepts a supplied geometry; the caller retains ownership of its source.
  add(mat, geometry, matrix = new THREE.Matrix4()) {
    if (!this.materials[mat])
      throw new Error(`Unknown district material: ${mat}`);
    let copy = geometry.clone();
    // Uniform non-indexed position/normal/uv layout allows all Three primitives.
    if (copy.index) {
      const indexed = copy;
      copy = indexed.toNonIndexed();
      indexed.dispose();
    }
    for (const key of Object.keys(copy.attributes))
      if (!["position", "normal", "uv"].includes(key))
        copy.deleteAttribute(key);
    if (!copy.attributes.normal) copy.computeVertexNormals();
    if (!copy.attributes.uv)
      copy.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(copy.attributes.position.count * 2),
          2,
        ),
      );
    const transform = this._frame.clone().multiply(matrix);
    copy.applyMatrix4(transform);
    // Deterministic per-block patina keeps the merged masonry from reading flat.
    const varied = [
      "stone",
      "trim",
      "brick",
      "roof",
      "wood",
      "leaf",
      "leafLight",
    ].includes(mat);
    const p = transform.elements,
      noise =
        Math.sin(p[12] * 12.9898 + p[13] * 78.233 + p[14] * 37.719) *
        43758.5453;
    const tone = varied ? 0.86 + (noise - Math.floor(noise)) * 0.2 : 1;
    const colors = new Float32Array(copy.attributes.position.count * 3);
    colors.fill(tone);
    copy.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.materials[mat].vertexColors = true;
    if (!this._parts.has(mat)) this._parts.set(mat, []);
    this._parts.get(mat).push(copy);
  }
  box(mat, x, y, z, w, h, d, ry = 0) {
    this.add(
      mat,
      this._box,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(Y, ry),
        new THREE.Vector3(w, h, d),
      ),
    );
  }
  cyl(mat, x, y, z, r, h, axis = "y") {
    const direction =
      axis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : axis === "z"
          ? new THREE.Vector3(0, 0, 1)
          : Y;
    this.add(
      mat,
      this._cylinder,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromUnitVectors(Y, direction),
        new THREE.Vector3(r, h, r),
      ),
    );
  }
  ring(mat, x, y, z, r, tube, axis = "z") {
    const key = `${r}:${tube}`;
    if (!this._rings.has(key))
      this._rings.set(key, new THREE.TorusGeometry(r, tube, 6, 48));
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      axis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : axis === "y"
          ? Y
          : new THREE.Vector3(0, 0, 1),
    );
    this.add(
      mat,
      this._rings.get(key),
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        rotation,
        new THREE.Vector3(1, 1, 1),
      ),
    );
  }
  _segment(mat, a, b, width, round = false) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    if (delta.lengthSq() < 1e-12) return;
    this.add(
      mat,
      round ? this._cylinder : this._box,
      new THREE.Matrix4().compose(
        start.add(end).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
        new THREE.Vector3(width, delta.length(), width),
      ),
    );
  }
  beam(mat, a, b, width = 0.1) {
    this._segment(mat, a, b, width);
  }
  pipe(mat, a, b, r = 0.16) {
    this._segment(mat, a, b, r, true);
    const start = new THREE.Vector3(...a),
      delta = new THREE.Vector3(...b).sub(start),
      length = delta.length();
    if (length < 1e-6) return;
    const dir = delta.clone().normalize(),
      count = Math.max(1, Math.ceil(length / 1.6));
    for (let i = 0; i <= count; i++) {
      const p = start.clone().addScaledVector(delta, i / count);
      this._segment(
        "brass",
        p.clone().addScaledVector(dir, -0.07).toArray(),
        p.clone().addScaledVector(dir, 0.07).toArray(),
        r * 1.38,
        true,
      );
      this._segment(
        "iron",
        p.clone().addScaledVector(dir, -0.018).toArray(),
        p.clone().addScaledVector(dir, 0.018).toArray(),
        r * 1.46,
        true,
      );
    }
  }
  at(x, y, z, ry, build) {
    const frame = this._frame;
    this._frame = frame
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationY(ry));
    try {
      build();
    } finally {
      this._frame = frame;
    }
  }
  _merge(parts, target) {
    for (const [name, list] of parts) {
      const geometry = mergeGeometries(list, false);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.materials[name]);
      mesh.name = `${target.name} / ${name}`;
      mesh.castShadow = name !== "glass";
      mesh.receiveShadow = true;
      target.add(mesh);
      list.forEach((g) => g.dispose());
    }
    parts.clear();
  }
  moving(x, y, z, build) {
    const previous = this._parts,
      frame = this._frame;
    const group = new THREE.Group();
    group.name = "Moving machinery";
    group.matrix.copy(
      frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)),
    );
    group.matrix.decompose(group.position, group.quaternion, group.scale);
    this._parts = new Map();
    this._frame = new THREE.Matrix4();
    try {
      build(group);
      this._merge(this._parts, group);
    } finally {
      this._parts = previous;
      this._frame = frame;
    }
    this.root.add(group);
    return group;
  }
  masonry(x, y, z, w, h, d) {
    this.box("stone", x, y + h / 2, z, w, h, d);
    // Clipped alternating bond, recessed joints, proud quoins and double cornice.
    const face = (width) => {
      const rows = Math.ceil(h / 0.34);
      for (let row = 0; row < rows; row++) {
        const bh = Math.min(0.34, h - row * 0.34);
        for (
          let left = -width / 2 - (row % 2) * 0.37;
          left < width / 2;
          left += 0.74
        ) {
          const lo = Math.max(left, -width / 2),
            hi = Math.min(left + 0.74, width / 2);
          if (hi - lo > 0.04)
            this.box(
              "brick",
              (lo + hi) / 2,
              row * 0.34 + bh / 2,
              0.025,
              hi - lo - 0.035,
              bh - 0.026,
              0.085 + (row % 3) * 0.006,
            );
        }
      }
    };
    this.at(x, y, z + d / 2, 0, () => face(w));
    this.at(x + w / 2, y, z, Math.PI / 2, () => face(d));
    this.at(x - w / 2, y, z, -Math.PI / 2, () => face(d));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (let row = 0; row < h / 0.46; row++) {
          const bh = Math.min(0.42, h - row * 0.46);
          if (bh > 0)
            this.box(
              "trim",
              x + sx * (w / 2 - 0.12),
              y + row * 0.46 + bh / 2,
              z + sz * (d / 2 - 0.12),
              row % 2 ? 0.35 : 0.55,
              bh,
              row % 2 ? 0.55 : 0.35,
            );
        }
    this.box("stone", x, y + 0.08, z, w + 0.28, 0.16, d + 0.28);
    this.box("trim", x, y + h + 0.05, z, w + 0.24, 0.13, d + 0.24);
    this.box("stone", x, y + h + 0.19, z, w + 0.43, 0.15, d + 0.43);
    const corners = [
      [-w / 2, 0, -d / 2],
      [w / 2, 0, -d / 2],
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
    ].map((p) =>
      new THREE.Vector3(x + p[0], y, z + p[2]).applyMatrix4(this._frame),
    );
    this.obstacles.push({
      minX: Math.min(...corners.map((p) => p.x)),
      maxX: Math.max(...corners.map((p) => p.x)),
      minZ: Math.min(...corners.map((p) => p.z)),
      maxZ: Math.max(...corners.map((p) => p.z)),
    });
  }
  window(x, y, z, w = 0.8, h = 1.7, ry = 0) {
    this.at(x, y, z, ry, () => {
      this.box("dark", 0, h / 2, 0, w + 0.15, h + 0.12, 0.1);
      this.box("glow", 0, h / 2, 0.062, w, h, 0.03);
      for (const sign of [-1, 1]) {
        this.box(
          "trim",
          sign * (w / 2 + 0.12),
          h / 2,
          0.055,
          0.18,
          h + 0.2,
          0.23,
        );
        this.box("iron", (sign * w) / 2, h / 2, 0.12, 0.065, h, 0.085);
      }
      for (let i = 1; i < 4; i++)
        this.box("iron", -w / 2 + (w * i) / 4, h / 2, 0.13, 0.04, h, 0.08);
      for (let i = 1; i < 4; i++)
        this.box("iron", 0, (h * i) / 4, 0.13, w, 0.045, 0.08);
      this.box("trim", 0, -0.09, 0.06, w + 0.5, 0.16, 0.38);
      // Segmented semicircular hood and dark inset fanlight.
      this.cyl("dark", 0, h, 0, w * 0.57, 0.12, "z");
      for (let i = 0; i < 9; i++) {
        const a = (Math.PI * i) / 9,
          aa = (Math.PI * (i + 1)) / 9,
          r = w * 0.6;
        this.beam(
          "trim",
          [Math.cos(a) * r, h + Math.sin(a) * r, 0.06],
          [Math.cos(aa) * r, h + Math.sin(aa) * r, 0.06],
          0.18,
        );
        if (i % 2 === 0)
          this.beam(
            "brass",
            [0, h, 0.14],
            [Math.cos(a) * w * 0.48, h + Math.sin(a) * w * 0.48, 0.14],
            0.04,
          );
      }
    });
  }
  roof(x, y, z, w, d, height) {
    const count = Math.max(3, Math.ceil(height / 0.22));
    for (let i = 0; i < count; i++) {
      const t = i / count,
        ww = w * (1 - t * 0.66),
        dd = d * (1 - t * 0.66);
      this.box(
        "roof",
        x,
        y + ((i + 0.5) * height) / count,
        z,
        ww,
        (height / count) * 0.93,
        dd,
      );
      const cols = Math.ceil(ww / 0.65);
      for (const sign of [-1, 1])
        for (let j = 0; j < cols; j++)
          this.box(
            i % 4 === 0 ? "accent" : "roof",
            x - ww / 2 + ((j + 0.5) * ww) / cols,
            y + ((i + 1) * height) / count,
            z + sign * (dd / 2 - 0.12),
            ww / cols - 0.035,
            0.045,
            0.28,
          );
      for (const sign of [-1, 1])
        for (let j = 0; j < Math.ceil(dd / 0.65); j++)
          this.box(
            "roof",
            x + sign * (ww / 2 - 0.1),
            y + ((i + 1) * height) / count,
            z - dd / 2 + ((j + 0.5) * dd) / Math.ceil(dd / 0.65),
            0.26,
            0.05,
            dd / Math.ceil(dd / 0.65) - 0.035,
          );
    }
    this.box("brass", x, y + height + 0.04, z, w * 0.35, 0.09, 0.11);
    this.box("trim", x, y - 0.08, z, w + 0.1, 0.16, d + 0.1);
  }
  tank(x, y, z, r, h) {
    this.cyl("copper", x, y + h / 2, z, r, h);
    for (const t of [0, 0.08, 0.5, 0.92, 1]) {
      this.cyl(t === 0.5 ? "iron" : "brass", x, y + h * t, z, r * 1.07, 0.12);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        this.box(
          "brass",
          x + Math.sin(a) * r * 1.04,
          y + h * t,
          z + Math.cos(a) * r * 1.04,
          0.09,
          0.1,
          0.09,
        );
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      this.beam(
        "brass",
        [x + Math.sin(a) * r, y + 0.12, z + Math.cos(a) * r],
        [x + Math.sin(a) * r, y + h - 0.12, z + Math.cos(a) * r],
        0.035,
      );
    }
    for (let i = 0; i < 5; i++)
      this.cyl(
        "copper",
        x,
        y + h + 0.08 + i * 0.13,
        z,
        r * (1 - i * 0.16),
        0.14,
      );
    this.pipe("iron", [x, y + h + 0.65, z], [x, y + h + 1.05, z], r * 0.18);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        this.box(
          "iron",
          x + sx * r * 0.6,
          y - 0.2,
          z + sz * r * 0.6,
          0.17,
          0.5,
          0.17,
        );
    this.cyl("trim", x, y + h * 0.67, z + r + 0.08, r * 0.28, 0.12, "z");
    this.ring("brass", x, y + h * 0.67, z + r + 0.16, r * 0.3, 0.055);
    this.beam(
      "iron",
      [x, y + h * 0.67, z + r + 0.2],
      [x + r * 0.14, y + h * 0.8, z + r + 0.2],
      0.05,
    );
  }
  gear(x, y, z, r, teeth, speed) {
    const group = this.moving(x, y, z, () => {
      this.ring("brass", 0, 0, 0, r * 0.83, r * 0.11);
      this.ring("copper", 0, 0, 0.1, r * 0.66, r * 0.035);
      this.cyl("iron", 0, 0, 0, r * 0.23, 0.3, "z");
      this.cyl("brass", 0, 0, 0.22, r * 0.15, 0.22, "z");
      for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth;
        this.beam(
          "brass",
          [Math.sin(a) * r * 0.83, Math.cos(a) * r * 0.83, 0],
          [Math.sin(a) * r, Math.cos(a) * r, 0],
          r * 0.17,
        );
        if (i % Math.max(1, Math.floor(teeth / 6)) === 0)
          this.beam(
            "brass",
            [Math.sin(a) * r * 0.15, Math.cos(a) * r * 0.15, 0],
            [Math.sin(a) * r * 0.8, Math.cos(a) * r * 0.8, 0],
            r * 0.1,
          );
      }
    });
    group.name = "Clockwork gear";
    this.animations.push((time, dt, powered) => {
      group.rotation.z += speed * dt * (powered ? 1 : 0.12);
    });
    return group;
  }
  finish() {
    if (this._finished) return this._finished;
    this._merge(this._parts, this.root);
    this._box.dispose();
    this._cylinder.dispose();
    this._rings.forEach((g) => g.dispose());
    this._rings.clear();
    this._finished = {
      root: this.root,
      steamSources: this.steamSources,
      lights: this.lights,
      obstacles: this.obstacles,
      update: (time, dt = 0) => {
        for (const animate of this.animations) animate(time, dt, this.powered);
      },
      setPowered: (value) => {
        this.powered = Boolean(value);
        this.materials.glow.emissiveIntensity = this.powered ? 1.45 : 0.22;
      },
    };
    return this._finished;
  }
}
