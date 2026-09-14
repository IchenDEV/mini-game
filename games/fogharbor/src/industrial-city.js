import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TRANSIT_STOPS, stopDeck } from "./transit.js";
import { railPoint } from "./railway.js";
import { EXPANSION_SCENES } from "./expansion-layout.js";
import { INDUSTRIAL_PARCELS } from "./industrial-layout.js";

// Continuous steel structures, sheet-metal seams and working machinery, rather than voxel walls.
export function createIndustrialCity(scene, transport) {
  const root = new THREE.Group();
  root.name = "Workers railway and free aeronauts";
  scene.add(root);
  const materials = {
    iron: new THREE.MeshStandardMaterial({
      color: 0x263437,
      metalness: 0.78,
      roughness: 0.48,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xb89145,
      metalness: 0.85,
      roughness: 0.29,
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x71432f,
      metalness: 0.62,
      roughness: 0.72,
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0x722f2d,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
    green: new THREE.MeshStandardMaterial({
      color: 0x29443e,
      metalness: 0.4,
      roughness: 0.48,
    }),
    stone: new THREE.MeshStandardMaterial({ color: 0x79776b, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x665140, roughness: 0.88 }),
    light: new THREE.MeshStandardMaterial({
      color: 0xffd39b,
      emissive: 0xf5a84b,
      emissiveIntensity: 1.6,
    }),
    brick: new THREE.MeshStandardMaterial({ color: 0x8e6d56, roughness: 0.86 }),
  };
  if (typeof document !== "undefined") {
    const loader = new THREE.TextureLoader();
    for (const [name, file, scale] of [
      ["brick", "brick-wall-diffuse.jpg", 4],
      ["wood", "wood-table-diff.jpg", 2],
    ]) {
      const map = loader.load(`./textures/${file}`);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(scale, scale);
      materials[name].map = map;
    }
  }
  const obstacles = [],
    vents = [],
    lifts = new Map(),
    rotors = [],
    flags = [];
  let parent = root,
    batch = new Map();
  function add(g, material) {
    const mat = materials[material] ?? material;
    if (!batch.has(mat)) batch.set(mat, []);
    batch.get(mat).push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  }
  function flush() {
    for (const [mat, parts] of batch) {
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.name = "industrial fittings";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      parts.forEach((g) => g.dispose());
    }
    batch = new Map();
  }
  function box(x, y, z, w, h, d, mat = "iron", roll = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateZ(roll);
    g.translate(x, y, z);
    add(g, mat);
  }
  function pipe(a, b, r = 0.12, mat = "brass", sides = 12) {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(r, r, delta.length(), sides);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    g.translate(...from.add(to).multiplyScalar(0.5).toArray());
    add(g, mat);
  }
  function ring(x, y, z, r, mat = "brass", axis = "z") {
    const g = new THREE.TorusGeometry(r, 0.045, 6, 24);
    if (axis === "y") g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    add(g, mat);
  }
  function gear(x, y, z, r = 0.6) {
    flush();
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const previous = parent;
    parent = g;
    ring(0, 0, 0, r, "brass");
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(
        Math.sin(a) * (r + 0.025),
        Math.cos(a) * (r + 0.025),
        0,
        0.14,
        0.2,
        0.12,
        "brass",
        -a,
      );
      if (i % 2 === 0)
        pipe(
          [0, 0, 0],
          [Math.sin(a) * r, Math.cos(a) * r, 0],
          0.035,
          "iron",
          6,
        );
    }
    pipe([0, 0, -0.18], [0, 0, 0.18], 0.12, "iron");
    flush();
    parent = previous;
    rotors.push(g);
  }
  function sign(text, x, y, z, w = 3, h = 1, colour = "#c7b68d") {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#19322f";
    ctx.fillRect(0, 0, 768, 256);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 744, 232);
    const lines = text.split("\n");
    ctx.fillStyle = colour;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      ctx.font = `bold ${lines.length > 1 ? 40 : 45}px Georgia`;
      ctx.fillText(line, 384, 128 + (i - (lines.length - 1) / 2) * 61, 708);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }),
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
  }
  function frame(x, z, y, width, top) {
    for (const side of [-1, 1]) {
      const px = x + (side * width) / 2;
      pipe([px, y, z], [px, top, z], 0.095, "iron");
      pipe([px, y, z], [px, y + 0.24, z], 0.17, "brass");
      pipe(
        [px, top - 1, z],
        [x + side * (width / 2 - 0.7), top, z],
        0.065,
        "iron",
      );
    }
    pipe([x - width / 2, top, z], [x + width / 2, top, z], 0.095, "iron");
  }
  for (const stop of TRANSIT_STOPS) {
    flush();
    parent = new THREE.Group();
    parent.name = stop.english;
    root.add(parent);
    const { x, z, height: y } = stop,
      top = stopDeck(stop),
      rail = stop.mode === "train";
    const end = rail ? railPoint(x).z + 2.15 : z - 1.8;
    // Lift portal stays in the clear alley; its columns are part of walking collision.
    frame(x, z, y, 1.55, top + 2.8);
    for (const side of [-1, 1]) {
      const px = x + side * 0.775;
      obstacles.push({
        minX: px - 0.1,
        maxX: px + 0.1,
        minZ: z - 0.1,
        maxZ: z + 0.1,
      });
      pipe([px, top + 2.8, z], [px, top + 2.8, end], 0.09, "iron");
      for (let h = y + 1; h < top + 2.8; h += 1.15) ring(px, h, z, 0.13);
    }
    const bridgeStart = z - 0.7;
    box(
      x,
      top - 0.1,
      (bridgeStart + end) / 2,
      1.55,
      0.2,
      Math.abs(bridgeStart - end),
      "iron",
    );
    for (let k = 0; k < Math.abs(bridgeStart - end); k += 0.2)
      box(
        x,
        top - 0.02,
        Math.min(bridgeStart, end) + k,
        1.4,
        0.025,
        0.09,
        "wood",
      );
    for (const side of [-1, 1]) {
      pipe(
        [x + side * 0.7, top + 0.9, z - 0.8],
        [x + side * 0.7, top + 0.9, end],
        0.036,
      );
      for (let dz = z - 1; dz > end; dz -= 0.8)
        pipe(
          [x + side * 0.7, top, dz],
          [x + side * 0.7, top + 0.9, dz],
          0.025,
          "iron",
        );
    }
    gear(x, top + 2.15, z, 0.42);
    sign(stop.english.replace(" ", "\n"), x, y + 2.65, z + 0.15, 2.45, 0.8);
    sign(
      rail ? "WORKERS' RAILWAY" : "FREE AERONAUTS",
      x,
      top + 2.62,
      z + 0.11,
      2.7,
      0.55,
    );
    pipe(
      [x - 0.7, y + 1.8, z + 0.03],
      [x - 0.7, y + 2.1, z + 0.03],
      0.1,
      "light",
    );
    vents.push([x + 0.78, top + 2.85, z, 0.65]);
    flush();
    const lift = new THREE.Group();
    lift.name = `${stop.id} passenger lift`;
    lift.position.set(x, y + 0.04, z);
    parent.add(lift);
    const fixed = parent;
    parent = lift;
    box(0, -0.065, 0, 1.3, 0.13, 1.3, "iron");
    for (const side of [-1, 1]) {
      pipe([side * 0.61, 0, -0.5], [side * 0.61, 0, 0.5], 0.045);
      pipe([side * 0.61, 0, 0], [side * 0.61, 1.05, 0], 0.035, "iron");
      pipe([side * 0.61, 1.05, -0.5], [side * 0.61, 1.05, 0.5], 0.03);
    }
    flush();
    parent = fixed;
    lifts.set(stop.id, lift);
    if (rail) {
      // A riveted platform hangs from the viaduct, above the factory back streets.
      box(x, top - 0.16, end, 7.8, 0.24, 1.35, "iron");
      for (let dx = -3.6; dx <= 3.6; dx += 1.2) {
        if (Math.abs(dx) > 1) frame(x + dx, end + 0.45, top, 0.12, top + 2.4);
        // Shallow barrel vault with continuous sheet strips and cast iron ribs.
        for (let j = 0; j < 12; j++) {
          const a = -1.18 + (j * 2.36) / 12,
            b = -1.18 + ((j + 1) * 2.36) / 12;
          pipe(
            [x + dx, top + 1.75 + Math.cos(a) * 1.2, end + Math.sin(a) * 1.2],
            [x + dx, top + 1.75 + Math.cos(b) * 1.2, end + Math.sin(b) * 1.2],
            0.028,
            "brass",
            6,
          );
        }
      }
      const skin = [];
      for (let j = 0; j < 20; j++) {
        const a = -1.18 + (j * 2.36) / 20,
          b = -1.18 + ((j + 1) * 2.36) / 20;
        const p = [
            x - 4.1,
            top + 1.72 + Math.cos(a) * 1.2,
            end + Math.sin(a) * 1.2,
          ],
          q = [
            x - 4.1,
            top + 1.72 + Math.cos(b) * 1.2,
            end + Math.sin(b) * 1.2,
          ];
        skin.push(
          ...p,
          ...q,
          q[0] + 8.2,
          q[1],
          q[2],
          ...p,
          q[0] + 8.2,
          q[1],
          q[2],
          p[0] + 8.2,
          p[1],
          p[2],
        );
      }
      const canopy = new THREE.BufferGeometry();
      canopy.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(skin, 3),
      );
      canopy.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array((skin.length / 3) * 2),
          2,
        ),
      );
      canopy.computeVertexNormals();
      const canopyMaterial = materials.green.clone();
      canopyMaterial.side = THREE.DoubleSide;
      add(canopy, canopyMaterial);
      sign(
        rail ? "01 · RIVERSIDE WORKERS" : "",
        x + 2.3,
        top + 1.3,
        end + 0.02,
        2.5,
        0.48,
      );
    } else {
      pipe([x + 1.6, y, z - 1.3], [x + 1.6, top + 5, z - 1.3], 0.16, "iron");
      gear(x + 1.6, top + 3.4, z - 1.3, 0.7);
      for (const side of [-1, 1])
        pipe(
          [x + 1.6, top + 4.8, z - 1.3],
          [x + 1.6 + side * 2.4, top + 1.4, z - 1.3],
          0.035,
          "iron",
        );
      sign(
        "BUILT BY HAND\nKEPT IN THE AIR",
        x,
        top + 1.3,
        end + 0.12,
        2.1,
        0.7,
      );
    }
  }
  // Real observation decks are fixed to the authored vehicles. Nora remains visibly on them.
  for (const mode of ["train", "airship"]) {
    flush();
    parent =
      mode === "train"
        ? transport.train.vehicles[0].body
        : transport.airship.root;
    const deck = new THREE.Group();
    deck.name = `${mode} observation deck`;
    deck.position.x = mode === "train" ? 0 : -1.2;
    parent.add(deck);
    parent = deck;
    const y = mode === "train" ? 0.64 : -1.9,
      z = mode === "train" ? 1.12 : 1.18;
    box(0, y - 0.05, z, 2.65, 0.1, 0.7, "wood");
    for (const x of [-1.28, 1.28]) {
      for (const side of [-1, 1])
        pipe(
          [x, y, z + side * 0.32],
          [x, y + 0.9, z + side * 0.32],
          0.028,
          "brass",
        );
      pipe([x, y + 0.9, z - 0.32], [x, y + 0.9, z + 0.32], 0.025, "brass");
    }
    for (const side of [-1, 1])
      pipe(
        [side * 0.55, y + 0.9, z + 0.32],
        [side * 1.28, y + 0.9, z + 0.32],
        0.025,
        "brass",
      );
    pipe([-1.28, y + 0.2, z + 0.32], [1.28, y + 0.2, z + 0.32], 0.025, "iron");
  }
  flush();
  parent = root;
  // North skyline: boiler sheds grow around the railway, with a gasometer above the old mill.
  for (const { x, z, width: w, height: h } of INDUSTRIAL_PARCELS.filter(
    (p) => p.kind === "mill",
  )) {
    box(x, h / 2, z, w, h, 7, "brick");
    for (let dx = -w / 2; dx <= w / 2; dx += 2) {
      box(x + dx, h / 2, z + 3.57, 0.12, h, 0.14, "iron");
      box(x + dx, h * 0.62, z + 3.59, 1.35, 2.4, 0.025, "green");
      for (let gy = 0; gy < 3; gy++)
        box(
          x + dx,
          h * 0.62 - 0.8 + gy * 0.8,
          z + 3.62,
          1.35,
          0.045,
          0.035,
          "brass",
        );
    }
    for (let dx = -w / 2 + 2; dx < w / 2; dx += 4) {
      box(x + dx, h + 0.7, z, 4.2, 0.15, 7.3, "iron", 0.3);
      box(x + dx + 1.9, h + 0.7, z, 0.12, 1.3, 7, "green");
      for (let k = -3.4; k < 3.6; k += 0.48)
        pipe(
          [x + dx - 2, h + 0.12, z + k],
          [x + dx + 2, h + 1.32, z + k],
          0.022,
          "rust",
          6,
        );
    }
    for (let dx = -w / 2 + 0.5; dx < w / 2; dx += 1.5) {
      for (const y of [0.35, h - 0.3])
        pipe([x + dx, y, z + 3.55], [x + dx, y, z + 3.63], 0.035, "brass", 6);
    }
    pipe([x - w / 2, 2, z + 3.8], [x + w / 2, 2, z + 3.8], 0.13, "brass");
    pipe(
      [x - w / 2 + 0.6, 2, z + 3.8],
      [x - w / 2 + 0.6, h + 2, z + 3.8],
      0.13,
      "brass",
    );
    for (let py = 2; py < h; py += 0.7)
      ring(x - w / 2 + 0.6, py, z + 3.8, 0.18, "iron", "y");
    box(x, 0.2, z + 3.85, w + 0.4, 0.4, 0.7, "stone");
    for (const dx of [-w / 2 + 1, w / 2 - 1]) {
      pipe([x + dx, h - 0.1, z - 1], [x + dx, h + 6, z - 1], 0.48, "rust");
      for (let cy = h; cy < h + 6; cy += 1)
        ring(x + dx, cy, z - 1, 0.5, "iron", "y");
      pipe([x + dx, h + 5.8, z - 1], [x + dx, h + 6.1, z - 1], 0.62, "iron");
      vents.push([x + dx, h + 6.15, z - 1, 1.4]);
    }
    sign(
      x === -31
        ? "THE COMMON ENGINE\nHEAT BELONGS TO EVERYONE"
        : "NIGHT SHIFT · EIGHT HOURS",
      x,
      h - 1,
      z + 3.66,
      w * 0.75,
      1.35,
    );
    gear(x, h * 0.52, z + 3.8, 1.3);
  }
  // Large ringed pressure vessel and open iron ribs break the domestic roof silhouette.
  const tankParcel = INDUSTRIAL_PARCELS.find((p) => p.kind === "tank");
  const tank = [tankParcel.x, 0, tankParcel.z];
  pipe([tank[0], 0, tank[2]], [tank[0], 9, tank[2]], 3, "green", 24);
  for (let y = 0.5; y < 13; y += 3) ring(tank[0], y, tank[2], 3.4, "iron", "y");
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5,
      x = tank[0] + 3.4 * Math.cos(a),
      z = tank[2] + 3.4 * Math.sin(a);
    pipe([x, 0, z], [x, 13, z], 0.1, "rust");
  }
  // A visible steam main follows the rail with articulated elbows and brass compression bands.
  for (let x = -62; x < -7; x += 4) {
    const a = railPoint(x),
      b = railPoint(x + 4);
    pipe([a.x, 8.7, a.z - 2.6], [b.x, 8.7, b.z - 2.6], 0.22, "brass");
    pipe([a.x, 0, a.z - 2.6], [a.x, 8.8, a.z - 2.6], 0.08, "iron");
    box(a.x, 0.12, a.z - 2.6, 0.42, 0.24, 0.42, "stone");
    ring(a.x, 8.7, a.z - 2.6, 0.3, "rust");
  }
  for (const [x, wallZ, inletY] of [[-62, -23.5, 5.3], [-30, -19.5, 4.5], [-6, -22.5, 5.6]]) {
    const main = railPoint(x), elbowZ = wallZ + 0.4;
    pipe([x, 8.7, main.z - 2.6], [x, 8.7, elbowZ], 0.22);
    pipe([x, 8.7, elbowZ], [x, inletY, elbowZ], 0.22);
    pipe([x, inletY, elbowZ], [x, inletY, wallZ - 0.12], 0.22);
    for (const y of [8.7, inletY]) {
      const elbow = new THREE.SphereGeometry(0.22, 12, 8);
      elbow.translate(x, y, elbowZ); add(elbow, "brass");
    }
    ring(x, inletY, wallZ + 0.03, 0.34, "iron");
  }
  // Each civic quarter acquires a different industrial function and landmark.
  const themes = {
    scene03: "THE COPPER STAG\nWORKERS' ASSEMBLY",
    scene04: "REPAIR · REUSE · RECLAIM",
    scene06: "NOT SCRAP. SPARE PARTS.",
    scene07: "THE NIGHT PRESS\nOUR CITY · OUR VOICE",
    scene08: "AERONAUTS CO-OPERATIVE",
  };
  for (const s of EXPANSION_SCENES) {
    if (!themes[s.id]) continue;
    const { x, z, height: y } = s;
    // Back-of-house gantries leave the central court, doors and stairs unobstructed.
    frame(x, z - 7.3, y, 17, y + 10.5);
    pipe(
      [x - 8.4, y + 9.7, z - 7.3],
      [x + 8.4, y + 9.7, z - 7.3],
      0.18,
      "brass",
    );
    sign(
      themes[s.id],
      x,
      y + 9.65,
      z - 7.16,
      6,
      1.3,
      s.id === "scene07" ? "#dfb0a0" : "#ccb986",
    );
    for (const side of [-1, 1]) {
      const px = x + side * 8.5;
      obstacles.push({
        minX: px - 0.1,
        maxX: px + 0.1,
        minZ: z - 7.4,
        maxZ: z - 7.2,
      });
      for (let h = y + 1; h < y + 9; h += 1.4) ring(px, h, z - 7.3, 0.16);
    }
    if (s.id === "scene04" || s.id === "scene08")
      gear(x + 7.9, y + 9, z - 7.2, 0.9);
    if (s.id === "scene06") {
      pipe([x + 8.4, y, z - 7.3], [x + 8.4, y + 12, z - 7.3], 0.35, "rust");
      pipe([x + 8.4, y + 11, z - 7.3], [x + 3, y + 10, z - 7.3], 0.13, "iron");
      pipe([x + 3, y + 10, z - 7.3], [x + 3, y + 7.7, z - 7.3], 0.035, "iron");
      ring(x + 3, y + 7.3, z - 7.3, 0.4, "rust");
      vents.push([x + 8.4, y + 12, z - 7.3, 1.1]);
    }
    if (s.id === "scene03" || s.id === "scene07") {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 3.1, 4, 8),
        materials.red,
      );
      flag.position.set(x - 7.8, y + 8.1, z - 7.05);
      root.add(flag);
      flags.push(flag);
    }
  }
  flush();
  // Only the small animated parts retain separate draws; structures batch by local quarter/material.
  return {
    root,
    obstacles,
    vents,
    lifts,
    update(time, dt, transit, player) {
      const state = transit.state();
      for (const stop of TRANSIT_STOPS) {
        const lift = lifts.get(stop.id),
          transfer =
            state.passenger?.stop === stop.id &&
            state.passenger.stage !== "riding";
        const target = transfer
          ? transit.liftHeights.get(stop.id)
          : stop.height + 0.04;
        lift.position.y = transfer
          ? target
          : THREE.MathUtils.damp(lift.position.y, target, 0.8, dt);
      }
      for (let i = 0; i < rotors.length; i++)
        rotors[i].rotation.z = time * (i % 2 ? 0.18 : -0.22);
      for (const flag of flags) {
        const p = flag.geometry.attributes.position;
        for (let i = 0; i < p.count; i++)
          p.setZ(
            i,
            (Math.sin(time * 1.3 + p.getY(i) * 2) * 0.12 * (1.55 - p.getY(i))) /
              3.1,
          );
        p.needsUpdate = true;
        flag.geometry.computeVertexNormals();
      }
    },
  };
}
