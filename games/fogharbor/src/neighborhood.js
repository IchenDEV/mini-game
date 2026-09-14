import * as THREE from "three";
import {
  RAILWAY,
  tramPoseAt,
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

// Salt-rust Lane: an individually authored, cutaway canal neighbourhood.
// Static details share one mesh per material; only appliances and scenery move.
export function createNeighborhood(scene, { railPreviewTime = null } = {}) {
  const railKeyframe = Number.isFinite(railPreviewTime) ? railPreviewTime : null;
  const root = new THREE.Group();
  root.name = "Salt-rust Lane";
  scene.add(root);
  let defaultParent = root,
    workshopAsset = null;
  const colors = {
    limestone: "#c4b99b",
    stoneLight: "#ded2af",
    stoneDark: "#9c947f",
    mortar: "#817d6b",
    brick: "#92654f",
    brickLight: "#9c7058",
    brickDark: "#865d4b",
    slate: "#566064",
    slateLight: "#707677",
    roof: "#683840",
    roofLight: "#81454c",
    roofDark: "#4c3038",
    copper: "#a46e3f",
    copperLight: "#d79b51",
    patina: "#527e6e",
    brass: "#bc994c",
    brassLight: "#e2bd70",
    iron: "#303e3e",
    ironLight: "#526163",
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
    blueLinen: "#899fab",
    valveRed: "#973f35",
  };
  const materials = Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness:
          { copper: 0.36, copperLight: 0.28, brass: 0.39, brassLight: 0.3 }[
            key
          ] ?? 0.86,
        metalness: ["copper", "copperLight", "brass", "brassLight"].includes(
          key,
        )
          ? 0.82
          : ["iron", "ironLight"].includes(key)
            ? 0.65
            : 0.03,
        flatShading: false,
        ...(key === "warm"
          ? { emissive: "#ffb753", emissiveIntensity: 0.75 }
          : {}),
      }),
    ]),
  );
  if (typeof document !== "undefined") {
    const weather = new THREE.TextureLoader().load("./textures/limestone.png");
    weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
    weather.anisotropy = 4;
    const mineral = new Set([
      "limestone",
      "stoneLight",
      "stoneDark",
      "brick",
      "brickLight",
      "brickDark",
      "slate",
      "slateLight",
      "roof",
      "roofLight",
      "roofDark",
      "mortar",
    ]);
    const metal = new Set([
      "copper",
      "copperLight",
      "brass",
      "brassLight",
      "iron",
      "ironLight",
    ]);
    for (const [name, material] of Object.entries(materials)) {
      if (!mineral.has(name) && !metal.has(name)) continue;
      const isMetal = metal.has(name),
        isIron = name.startsWith("iron");
      if (isMetal && !isIron) material.envMapIntensity = 2.1;
      material.customProgramCacheKey = () =>
        isMetal ? `weathered-metal-${isIron}` : "mineral-grain";
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uWeather = { value: weather };
        shader.vertexShader =
          "varying vec3 vSurface;varying vec3 vSurfaceNormal;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvSurface=(modelMatrix*vec4(transformed,1.)).xyz;vSurfaceNormal=normalize(mat3(modelMatrix)*normal);",
        );
        shader.fragmentShader =
          `uniform sampler2D uWeather;varying vec3 vSurface;varying vec3 vSurfaceNormal;
        float surfaceGrain(float scale){vec3 n=abs(vSurfaceNormal);n/=n.x+n.y+n.z;vec3 p=vSurface*scale;return dot(vec3(texture2D(uWeather,p.yz).r,texture2D(uWeather,p.xz).r,texture2D(uWeather,p.xy).r),n);}
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float grain=surfaceGrain(.7);float age=smoothstep(.57,.77,surfaceGrain(.12));
          ${isMetal ? `diffuseColor.rgb=mix(diffuseColor.rgb,${isIron ? "vec3(.055,.073,.068)" : "vec3(.10,.19,.145)"},age*.28);` : "diffuseColor.rgb*=mix(.72,1.20,grain);"}
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>\n${isMetal ? `roughnessFactor=mix(${isIron ? ".32" : ".19"},.62,age);` : "roughnessFactor=clamp(roughnessFactor+(grain-.6)*.22,.55,1.);"}`,
        );
      };
    }
  }
  materials.roofSlate = slateMaterial();
  for (const name of ["leaf", "leafLight", "leafDark"])
    materials[name].side = THREE.DoubleSide;
  materials.ashlar = masonryMaterial();
  materials.terracotta = masonryMaterial(true);
  const batches = new Map();
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const foliage = foliageGeometry();
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const obstacles = [];
  let seed = 94731;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function group(name, parent = defaultParent) {
    const g = new THREE.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  function geometry(
    geo,
    mat,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = [0, 0, 0],
    parent = defaultParent,
  ) {
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    const transformed = geo.clone().applyMatrix4(matrix);
    const key = `${parent.uuid}:${mat}`;
    if (!batches.has(key)) batches.set(key, { parent, mat, geometries: [] });
    batches.get(key).geometries.push(transformed);
  }
  function box(
    x,
    y,
    z,
    w,
    h,
    d,
    mat,
    rotation = [0, 0, 0],
    parent = defaultParent,
  ) {
    geometry(
      mat.startsWith("leaf") ? foliage : unitBox,
      mat,
      x,
      y,
      z,
      w,
      h,
      d,
      rotation,
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
    rotation = [0, 0, 0],
    parent = defaultParent,
    segments = 24,
    r2 = r,
  ) {
    const geo = new THREE.CylinderGeometry(
      r2,
      r,
      h,
      segments,
      1,
      false,
    ).toNonIndexed();
    geometry(geo, mat, x, y, z, 1, 1, 1, rotation, parent);
    geo.dispose();
  }
  function ring(
    x,
    y,
    z,
    r,
    tube,
    mat,
    rotation = [0, 0, 0],
    parent = defaultParent,
    arc = Math.PI * 2,
  ) {
    const geo = new THREE.TorusGeometry(r, tube, 10, 64, arc).toNonIndexed();
    geometry(geo, mat, x, y, z, 1, 1, 1, rotation, parent);
    geo.dispose();
  }
  function line(a, b, r, mat, parent = defaultParent, square = false) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      direction = end.clone().sub(start);
    const geo = square
      ? new THREE.BoxGeometry(r * 2, direction.length(), r * 2).toNonIndexed()
      : new THREE.CylinderGeometry(r, r, direction.length(), 16).toNonIndexed();
    const transform = new THREE.Matrix4().compose(
      start.add(end).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    geo.applyMatrix4(transform);
    geometry(geo, mat, 0, 0, 0, 1, 1, 1, [0, 0, 0], parent);
    geo.dispose();
  }
  function solid(x, z, w, d) {
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  function masonry(
    x,
    y,
    z,
    w,
    h,
    d,
    palette = ["limestone", "stoneLight", "stoneDark"],
    unit = 0.46,
    parent = defaultParent,
  ) {
    const mat = palette[0].startsWith("brick") ? "terracotta" : "ashlar";
    box(x, y + h / 2, z, w, h, d, mat, [0, 0, 0], parent);
  }
  function sideMasonry(
    x,
    y,
    z,
    w,
    h,
    d,
    palette = ["limestone", "stoneLight", "stoneDark"],
    parent = defaultParent,
    facing = -1,
  ) {
    const holder = group("side masonry", parent);
    holder.position.set(x, 0, z);
    holder.rotation.y = (facing * Math.PI) / 2;
    masonry(0, y, 0, d, h, w, palette, 0.48, holder);
  }
  function plaque(text, x, y, z, w, h, parent = defaultParent) {
    box(x, y, z, w + 0.14, h + 0.12, 0.13, "woodDark", [0, 0, 0], parent);
    box(x, y, z + 0.078, w, h, 0.025, "woodDark", [0, 0, 0], parent);
    for (const dx of [-w / 2, w / 2])
      for (const dy of [-h / 2, h / 2])
        cylinder(
          x + dx,
          y + dy,
          z + 0.098,
          0.022,
          0.017,
          "brass",
          [Math.PI / 2, 0, 0],
          parent,
          6,
        );
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const context = canvas.getContext("2d");
    context.fillStyle = "#282d27";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ad965c";
    context.lineWidth = 3;
    context.strokeRect(10, 10, 1004, canvas.height - 20);
    context.fillStyle = "#e6cd91";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lines = text.split("\n"),
      lineHeight = canvas.height / (lines.length + 1);
    context.font = `600 ${Math.round(lineHeight * 0.89)}px Georgia, "Times New Roman", serif`;
    lines.forEach((value, index) =>
      context.fillText(value, 512, lineHeight * (index + 1), 950),
    );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.06, h - 0.025),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z + 0.097);
    parent.add(mesh);
  }
  function windowAt(x, y, z, w = 1, h = 1.45, parent = defaultParent) {
    box(x, y, z, w + 0.18, h + 0.18, 0.12, "stoneDark", [0, 0, 0], parent);
    box(x, y, z + 0.075, w, h, 0.045, "window", [0, 0, 0], parent);
    box(x, y, z + 0.11, 0.067, h, 0.09, "woodLight", [0, 0, 0], parent);
    for (const yy of [-h / 2, h / 2, 0])
      box(
        x,
        y + yy,
        z + 0.13,
        w + 0.08,
        0.073,
        0.13,
        "limestone",
        [0, 0, 0],
        parent,
      );
    for (const xx of [-w / 2, w / 2])
      box(x + xx, y, z + 0.11, 0.085, h, 0.14, "stoneLight", [0, 0, 0], parent);
    box(
      x,
      y - h / 2 - 0.1,
      z + 0.16,
      w + 0.33,
      0.17,
      0.42,
      "stoneLight",
      [0, 0, 0],
      parent,
    );
    box(
      x - 0.17,
      y + 0.23,
      z + 0.104,
      w * 0.25,
      h * 0.29,
      0.009,
      "glass",
      [0, 0, 0],
      parent,
    );
  }
  function archedWindowAt(x, y, z, w = 1, h = 1.7, parent = defaultParent) {
    const spring = h / 2 - w / 2,
      shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(-w / 2, spring);
    shape.absarc(0, spring, w / 2, Math.PI, 0, true);
    shape.lineTo(w / 2, -h / 2);
    shape.closePath();
    const pane = new THREE.ShapeGeometry(shape, 12).toNonIndexed();
    geometry(pane, "window", x, y, z + 0.074, 1, 1, 1, [0, 0, 0], parent);
    pane.dispose();
    for (const dx of [-w / 2 - 0.06, w / 2 + 0.06])
      box(
        x + dx,
        y + (spring - h / 2) / 2,
        z + 0.13,
        0.14,
        spring + h / 2 + 0.03,
        0.21,
        "limestone",
        [0, 0, 0],
        parent,
      );
    const arch = archMouldingGeometry(w / 2 + 0.015, 0.115, 0.16);
    geometry(
      arch,
      "stoneLight",
      x,
      y + spring,
      z + 0.06,
      1,
      1,
      1,
      [0, 0, 0],
      parent,
    );
    arch.dispose();
    // A single keystone articulates the arch without a ring of cuboid blocks.
    box(
      x,
      y + spring + w / 2 + 0.09,
      z + 0.17,
      0.12,
      0.19,
      0.17,
      "limestone",
      [0, 0, 0],
      parent,
    );
    box(x, y, z + 0.115, 0.052, h, 0.075, "iron", [0, 0, 0], parent);
    for (const offset of [-0.32, spring])
      box(x, y + offset, z + 0.118, w, 0.045, 0.075, "iron", [0, 0, 0], parent);
    for (const a of [Math.PI / 4, (Math.PI * 3) / 4])
      line(
        [x, y + spring, z + 0.118],
        [
          x + Math.cos(a) * w * 0.46,
          y + spring + Math.sin(a) * w * 0.46,
          z + 0.118,
        ],
        0.021,
        "iron",
        parent,
      );
    box(
      x,
      y - h / 2 - 0.07,
      z + 0.14,
      w + 0.4,
      0.16,
      0.4,
      "stoneLight",
      [0, 0, 0],
      parent,
    );
    box(
      x - 0.2,
      y - 0.13,
      z + 0.091,
      w * 0.19,
      h * 0.35,
      0.015,
      "glass",
      [0, 0, 0],
      parent,
    );
  }
  function pot(x, y, z, r = 0.28, parent = defaultParent, flowers = false) {
    cylinder(x, y + 0.23, z, r, 0.46, "brick", [0, 0, 0], parent, 8, r * 0.77);
    cylinder(
      x,
      y + 0.45,
      z,
      r * 1.06,
      0.09,
      "brickLight",
      [0, 0, 0],
      parent,
      8,
    );
    cylinder(x, y + 0.5, z, r * 0.83, 0.025, "woodDark", [0, 0, 0], parent, 8);
    for (let i = 0; i < 18; i++) {
      const angle = random() * Math.PI * 2,
        radius = random() * r * 1.4;
      const xx = x + Math.cos(angle) * radius,
        zz = z + Math.sin(angle) * radius,
        yy = y + 0.57 + random() * 0.46;
      box(
        xx,
        yy,
        zz,
        0.13 + random() * 0.16,
        0.14 + random() * 0.19,
        0.14 + random() * 0.18,
        ["leaf", "leafLight", "leafDark"][i % 3],
        [0, random(), 0],
        parent,
      );
      if (flowers && i % 3 === 0)
        box(
          xx,
          yy + 0.14,
          zz,
          0.1,
          0.07,
          0.1,
          i % 2 ? "cream" : "roofLight",
          [0, 0, 0],
          parent,
        );
    }
  }
  function crate(x, y, z, w = 0.65, parent = defaultParent) {
    box(x, y + 0.28, z, w, 0.53, w, "woodDark", [0, 0, 0], parent);
    for (let i = 0; i < 4; i++)
      for (const face of [-1, 1]) {
        box(
          x,
          y + 0.08 + i * 0.135,
          z + face * (w / 2 + 0.01),
          w,
          0.09,
          0.045,
          "woodLight",
          [0, 0, 0],
          parent,
        );
        box(
          x + face * (w / 2 + 0.01),
          y + 0.08 + i * 0.135,
          z,
          0.045,
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
        y + 0.28,
        z + w / 2 + 0.043,
        0.075,
        0.56,
        0.065,
        "wood",
        [0, 0, 0],
        parent,
      );
  }
  function lantern(x, y, z, parent = defaultParent) {
    line([x, y + 0.17, z], [x, y + 0.82, z], 0.045, "iron", parent);
    box(x, y, z, 0.3, 0.42, 0.3, "warm", [0, 0, 0], parent);
    for (const dx of [-0.17, 0.17])
      for (const dz of [-0.17, 0.17])
        box(x + dx, y, z + dz, 0.045, 0.49, 0.045, "iron", [0, 0, 0], parent);
    box(x, y - 0.27, z, 0.41, 0.085, 0.41, "iron", [0, 0, 0], parent);
    cylinder(x, y + 0.33, z, 0.31, 0.18, "iron", [0, 0, 0], parent, 4, 0.13);
    cylinder(x, y + 0.46, z, 0.055, 0.12, "brass", [0, 0, 0], parent, 8);
  }
  function lampPost(x, z, h = 2.5) {
    cylinder(x, 0.15, z, 0.18, 0.3, "iron");
    cylinder(x, h / 2, z, 0.072, h, "iron");
    for (const y of [0.35, 0.55, h - 0.45])
      cylinder(x, y, z, 0.115, 0.08, "ironLight");
    line([x, h - 0.06, z], [x + 0.36, h + 0.22, z], 0.05, "iron");
    lantern(x + 0.36, h - 0.09, z);
    solid(x, z, 0.35, 0.35);
  }
  function valveAt(x, y, z, r = 0.22, parent = defaultParent) {
    ring(x, y, z, r, 0.026, "valveRed", [0, 0, 0], parent);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      line(
        [x, y, z],
        [x + Math.cos(a) * r, y + Math.sin(a) * r, z],
        0.018,
        "valveRed",
        parent,
      );
    }
    cylinder(x, y, z, 0.065, 0.1, "brass", [Math.PI / 2, 0, 0], parent, 8);
  }
  function pressureGauge(x, y, z, r = 0.22, parent = defaultParent) {
    cylinder(x, y, z, r, 0.14, "brass", [Math.PI / 2, 0, 0], parent, 16);
    cylinder(
      x,
      y,
      z + 0.079,
      r * 0.86,
      0.02,
      "cream",
      [Math.PI / 2, 0, 0],
      parent,
      16,
    );
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI * 0.7 + (i * Math.PI * 1.4) / 10;
      box(
        x + Math.sin(a) * r * 0.67,
        y + Math.cos(a) * r * 0.67,
        z + 0.094,
        0.012,
        r * 0.16,
        0.012,
        "iron",
        [0, 0, -a],
        parent,
      );
    }
    line(
      [x, y, z + 0.106],
      [x + r * 0.34, y + r * 0.37, z + 0.106],
      0.012,
      "iron",
      parent,
    );
    cylinder(
      x,
      y,
      z + 0.113,
      0.025,
      0.012,
      "copper",
      [Math.PI / 2, 0, 0],
      parent,
      8,
    );
  }
  function railing(
    x1,
    z1,
    x2,
    z2,
    height = 0.8,
    yBase = 0,
    parent = defaultParent,
  ) {
    const length = Math.hypot(x2 - x1, z2 - z1),
      n = Math.ceil(length / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        x = x1 + (x2 - x1) * t,
        z = z1 + (z2 - z1) * t;
      cylinder(
        x,
        yBase + height / 2,
        z,
        0.055,
        height,
        "iron",
        [0, 0, 0],
        parent,
      );
      cylinder(
        x,
        yBase + height + 0.025,
        z,
        0.083,
        0.07,
        "ironLight",
        [0, 0, 0],
        parent,
      );
    }
    for (const h of [0.32, height - 0.07])
      line([x1, yBase + h, z1], [x2, yBase + h, z2], 0.039, "iron", parent);
  }

  // The quay belongs to a city, with continuous land beneath the railway and
  // both canal banks. Only the narrow canal remains below the water surface.
  const banks = group("connected city banks");
  box(0, -1.04, -69, 220, 2, 120, "stoneDark", [0, 0, 0], banks);
  box(-62, -1.04, -1.5, 96, 2, 15, "stoneDark", [0, 0, 0], banks);
  box(62, -1.04, -1.5, 96, 2, 15, "stoneDark", [0, 0, 0], banks);
  box(0, -1.04, 76, 220, 2, 120, "stoneDark", [0, 0, 0], banks);
  // Setts are strongest along actual routes; the dense rear city sits on land.
  for (let x = -31; x < 32; x += 0.65)
    for (const [start, end] of [
      [-16, -9.15],
      [16.15, 20.15],
    ]) {
      for (let z = start; z < end; z += 0.56)
        box(
          x + (Math.round(z / 0.56) % 2) * 0.28,
          -0.015,
          z,
          0.617,
          0.065,
          0.526,
          random() > 0.7 ? "limestone" : "stoneDark",
          [0, 0, 0],
          banks,
        );
    }
  for (const side of [1]) {
    for (let x = 14.3; x < 24; x += 0.58)
      for (let z = -8.7; z < 5.7; z += 0.52) {
        box(
          side * x,
          -0.018,
          z,
          0.552,
          0.065,
          0.493,
          random() > 0.88 ? "limestone" : "stoneDark",
          [0, 0, 0],
          banks,
        );
      }
    // Repeated planted street bays frame the local block without scattered props.
    for (const z of [-6.6, -1.7, 3.2]) {
      const x = side * 19.7;
      box(x, 0.13, z, 1.58, 0.33, 2.1, "stoneDark", [0, 0, 0], banks);
      box(x, 0.315, z, 1.28, 0.06, 1.8, "woodDark", [0, 0, 0], banks);
      for (const dx of [-0.72, 0.72])
        box(x + dx, 0.34, z, 0.16, 0.17, 2.08, "limestone", [0, 0, 0], banks);
      for (const dz of [-0.97, 0.97])
        box(x, 0.34, z + dz, 1.58, 0.17, 0.16, "limestone", [0, 0, 0], banks);
      line([x, 0.35, z], [x, 2.9, z], 0.1, "wood", banks, true);
      line([x, 1.4, z], [x - 0.48, 2.52, z + 0.24], 0.065, "wood", banks, true);
      line([x, 1.7, z], [x + 0.48, 2.63, z - 0.25], 0.055, "wood", banks, true);
      for (let tier = 0; tier < 4; tier++)
        for (let j = 0; j < 9; j++) {
          const a = (j * Math.PI * 2) / 9,
            r = (0.72 - tier * 0.1) * (j % 2 ? 0.77 : 1);
          box(
            x + Math.cos(a) * r,
            2.02 + tier * 0.35,
            z + Math.sin(a) * r,
            0.42,
            0.45,
            0.43,
            (j + tier) % 3 ? "leaf" : "leafLight",
            [0, a, 0],
            banks,
          );
        }
      box(
        x - side * 1.73,
        0.55,
        z,
        0.52,
        0.12,
        1.44,
        "woodLight",
        [0, 0, 0],
        banks,
      );
      for (const dz of [-0.52, 0.52])
        box(
          x - side * 1.73,
          0.29,
          z + dz,
          0.43,
          0.52,
          0.1,
          "iron",
          [0, 0, 0],
          banks,
        );
    }
  }
  for (const [x, w] of [
    [-23.1, 18],
    [23.8, 19.4],
  ]) {
    masonry(
      x,
      -1.66,
      6.15,
      w,
      1.61,
      0.53,
      ["stoneDark", "limestone", "mortar"],
      0.62,
      banks,
    );
    for (let xx = x - w / 2; xx < x + w / 2; xx += 0.63)
      box(xx, 0.03, 6.11, 0.6, 0.2, 0.66, "limestone", [0, 0, 0], banks);
    railing(x - w / 2, 5.95, x + w / 2, 5.95, 0.8, 0, banks);
  }
  const opposite = group("opposite canal quay", banks);
  opposite.position.z = 16;
  opposite.rotation.y = Math.PI;
  masonry(
    0,
    -1.66,
    0,
    67,
    1.61,
    0.52,
    ["stoneDark", "limestone", "mortar"],
    0.62,
    opposite,
  );
  for (let x = -33; x < 34; x += 0.64) {
    if ((x > -12 && x < -8) || x < -32.1) continue;
    box(x, 0.03, 16, 0.61, 0.2, 0.66, "limestone", [0, 0, 0], banks);
  }
  railing(-32.1, 16.14, -12.1, 16.14, 0.82, 0, banks);
  railing(-7.9, 16.14, 33, 16.14, 0.82, 0, banks);
  // Continuous canal edge, masonry piles, tide marks and a gently crowned bridge.
  for (const [x, w] of [
    [-13.15, 1.7],
    [2.45, 22.7],
  ]) {
    masonry(
      x,
      -1.65,
      6.17,
      w,
      1.58,
      0.5,
      ["stoneDark", "limestone", "mortar"],
      0.61,
    );
    for (let i = 0; i < w / 0.63; i++)
      box(
        x - w / 2 + i * 0.63 + 0.3,
        -0.005,
        6.1,
        0.6,
        0.22,
        0.65,
        "stoneLight",
      );
  }
  // Two continuous tide-darkened courses follow the actual bonded quay stones.
  // Hairline moss stays in the joints, with stronger seepage at structural joints.
  const tideBand = group("continuous damp quay courses");
  for (let course = 0; course < 2; course++) {
    const y = -0.69 + course * 0.27;
    for (let column = 0; column < 109; column++) {
      const x = -32.85 + column * 0.61 - (course % 2) * 0.305;
      if (x > -12.05 && x < -7.95) continue;
      if (x > 11.35 && x < 12.87) continue;
      box(x, y, 6.497, 0.584, 0.237, 0.036, "stoneDark", [0, 0, 0], tideBand);
      box(
        x,
        y - 0.127,
        6.515,
        0.603,
        0.018,
        0.019,
        "mortar",
        [0, 0, 0],
        tideBand,
      );
      box(
        x + 0.301,
        y,
        6.515,
        0.016,
        0.253,
        0.019,
        "mortar",
        [0, 0, 0],
        tideBand,
      );
      const nearSeepage =
        Math.abs(x + 12.12) < 1.35 ||
        Math.abs(x + 7.95) < 1.35 ||
        Math.abs(x - 12.1) < 2.05;
      if (column % 7 === 2 || (nearSeepage && column % 2 === 0)) {
        box(
          x - 0.09,
          y - 0.112,
          6.535,
          0.17 + (column % 3) * 0.045,
          0.027,
          0.012,
          "leafDark",
          [0, 0, 0],
          tideBand,
        );
      }
      if (course === 1 && (column % 11 === 4 || nearSeepage)) {
        box(
          x + 0.22,
          -0.33,
          6.524,
          0.031,
          0.21 + (column % 3) * 0.06,
          0.01,
          "mortar",
          [0, 0, 0],
          tideBand,
        );
      }
    }
  }
  for (const x of [-13.4, -7.55, -2.5, 2.6, 7.6, 12.9]) {
    for (const xx of [-0.12, 0.12])
      box(x + xx, -0.8, 6.63, 0.18, 1.9, 0.22, "wood");
    for (const y of [-1.35, -0.35]) box(x, y, 6.77, 0.59, 0.09, 0.07, "iron");
  }
  railing(-13.8, 5.93, -12.05, 5.93);
  railing(-7.95, 5.93, 13.8, 5.93);
  for (const x of [-13.8, -7.95, 13.8]) {
    masonry(x, 0, 6, 0.48, 0.95, 0.5);
    box(x, 1, 6, 0.63, 0.14, 0.67, "stoneLight");
  }
  const bridge = group("crowned stone footbridge");
  for (let i = 0; i < 40; i++) {
    const z = 6 + (i + 0.5) * 0.25,
      elevation = 0.55 * Math.sin((Math.PI * (z - 6)) / 10);
    for (let j = 0; j < 7; j++)
      box(
        -11.8 + ((j + 0.5) * 3.6) / 7,
        elevation - 0.09,
        z,
        3.6 / 7 - 0.022,
        0.18,
        0.232,
        ["stoneDark", "limestone", "stoneLight"][Math.floor(random() * 3)],
        [0, 0, 0],
        bridge,
      );
    for (const x of [-11.91, -8.09]) {
      box(
        x,
        elevation + 0.14,
        z,
        0.31,
        0.35,
        0.238,
        "limestone",
        [0, 0, 0],
        bridge,
      );
      const underside = -1.4 + 1.45 * Math.sin((Math.PI * (z - 6)) / 10),
        top = elevation + 0.015;
      box(
        x,
        (top + underside) / 2,
        z,
        0.32,
        top - underside,
        0.238,
        i % 3 ? "stoneDark" : "mortar",
        [0, 0, 0],
        bridge,
      );
    }
  }
  for (const x of [-11.99, -8.01])
    for (let i = 0; i < 24; i++) {
      const z = 6 + ((i + 0.5) * 10) / 24,
        t = (z - 6) / 10,
        underside = -1.4 + 1.45 * Math.sin(Math.PI * t);
      box(
        x,
        underside + 0.135,
        z,
        0.49,
        0.285,
        0.399,
        i % 3 ? "limestone" : "stoneLight",
        [-Math.atan(((1.45 * Math.PI) / 10) * Math.cos(Math.PI * t)), 0, 0],
        bridge,
      );
    }
  for (const x of [-11.98, -8.02]) {
    // Proud springing blocks and bonded spandrels make the arch legible at water level.
    for (const z of [6.32, 15.68])
      for (let row = 0; row < 4; row++) {
        box(
          x,
          -0.64 + row * 0.19,
          z,
          0.58,
          0.171,
          0.65,
          row % 2 ? "stoneLight" : "limestone",
          [0, 0, 0],
          bridge,
        );
      }
    for (let i = 0; i < 28; i++) {
      const z = 6.2 + (i * 9.6) / 27,
        deck = 0.55 * Math.sin((Math.PI * (z - 6)) / 10);
      box(
        x,
        deck - 0.035,
        z,
        0.415,
        0.17,
        0.324,
        i % 3 ? "limestone" : "stoneLight",
        [0, 0, 0],
        bridge,
      );
    }
    box(x, 0.37, 11, 0.55, 0.38, 0.42, "stoneLight", [0, 0, 0], bridge);
    for (const z of [6.32, 15.68]) {
      const outside = x < -10 ? x - 0.302 : x + 0.302;
      for (let course = 0; course < 2; course++) {
        box(
          outside,
          -0.64 + course * 0.19,
          z,
          0.018,
          0.167,
          0.638,
          "stoneDark",
          [0, 0, 0],
          bridge,
        );
        box(
          outside,
          -0.728 + course * 0.19,
          z,
          0.024,
          0.019,
          0.638,
          "mortar",
          [0, 0, 0],
          bridge,
        );
      }
      box(
        outside,
        -0.39,
        z - 0.11,
        0.027,
        0.029,
        0.28,
        "leafDark",
        [0, 0, 0],
        bridge,
      );
      box(
        outside,
        -0.25,
        z + 0.16,
        0.023,
        0.32,
        0.035,
        "mortar",
        [0, 0, 0],
        bridge,
      );
    }
  }
  for (const x of [-11.94, -8.06]) {
    for (let i = 0; i <= 10; i++) {
      const z = 6 + i,
        y = 0.55 * Math.sin((Math.PI * i) / 10);
      cylinder(x, y + 0.7, z, 0.057, 0.95, "iron", [0, 0, 0], bridge);
      cylinder(x, y + 1.18, z, 0.089, 0.065, "ironLight", [0, 0, 0], bridge);
      if (i < 10) {
        const next = 0.55 * Math.sin((Math.PI * (i + 1)) / 10);
        line([x, y + 1.09, z], [x, next + 1.09, z + 1], 0.044, "iron", bridge);
        line([x, y + 0.66, z], [x, next + 0.66, z + 1], 0.025, "iron", bridge);
      }
    }
  }

  // Keep the legacy model isolated so the authored GLB can replace it as a unit.
  const legacyWorkshop = group("legacy repair workshop");
  defaultParent = legacyWorkshop;
  // Repair house: occupied work floor, recessed windows and a removable mansard.
  const shop = group("limestone repair house");
  masonry(-6.6, 0, -6.43, 8.2, 6.25, 0.22, undefined, 0.49, shop);
  sideMasonry(-10.58, 0, -3.78, 0.24, 6.25, 5.4, undefined, shop);
  sideMasonry(-2.62, 0, -4.8, 0.24, 3.2, 3.35, undefined, shop, 1);
  sideMasonry(-2.62, 3.24, -3.78, 0.24, 3.04, 5.4, undefined, shop, 1);
  masonry(-6.6, 3.24, -1.14, 8.2, 3.04, 0.26, undefined, 0.47, shop);
  for (const x of [-10.43, -2.77])
    masonry(x, 0, -1.11, 0.5, 3.24, 0.57, undefined, 0.4, shop);
  for (const y of [0.14, 3.2, 3.52, 6.28]) {
    box(-6.6, y, -1.0, 8.7, 0.2, 0.57, "stoneLight", [0, 0, 0], shop);
    box(-10.64, y, -3.8, 0.42, 0.2, 5.65, "limestone", [0, 0, 0], shop);
    box(-2.56, y, -3.8, 0.42, 0.2, 5.65, "limestone", [0, 0, 0], shop);
  }
  for (const x of [-10.43, -2.77]) {
    box(x, 4.9, -0.94, 0.22, 2.55, 0.1, "stoneLight", [0, 0, 0], shop);
    for (const [y, width, height, depth] of [
      [3.7, 0.38, 0.12, 0.18],
      [6.1, 0.37, 0.13, 0.19],
      [6.2, 0.47, 0.07, 0.25],
    ])
      box(x, y, -0.91, width, height, depth, "limestone", [0, 0, 0], shop);
  }
  for (const x of [-9, -6.5, -4.0]) {
    archedWindowAt(x, 4.88, -0.93, 1.02, 1.72, shop);
    for (const side of [-1, 1]) {
      box(
        x + side * 0.76,
        4.88,
        -0.89,
        0.35,
        1.51,
        0.09,
        "wood",
        [0, 0, 0],
        shop,
      );
      for (let slat = 0; slat < 10; slat++)
        box(
          x + side * 0.76,
          4.23 + slat * 0.145,
          -0.823,
          0.34,
          0.038,
          0.045,
          "woodLight",
          [0, 0, 0],
          shop,
        );
    }
    box(x, 3.98, -0.74, 1.22, 0.23, 0.45, "green", [0, 0, 0], shop);
    for (let i = 0; i < 7; i++) {
      box(
        x - 0.48 + i * 0.16,
        4.17 + random() * 0.14,
        -0.71,
        0.19,
        0.23,
        0.29,
        i % 2 ? "leaf" : "leafLight",
        [0, random(), 0],
        shop,
      );
      if (i % 2)
        box(
          x - 0.48 + i * 0.16,
          4.34,
          -0.59,
          0.08,
          0.07,
          0.09,
          "cream",
          [0, 0, 0],
          shop,
        );
    }
    for (let i = 0; i < 11; i++) {
      const xx = x - 0.54 + i * 0.108,
        yy = 4.27 + Math.sin(i * 1.7) * 0.06,
        zz = -0.49 + (i % 3) * 0.047;
      box(
        xx,
        yy - 0.1,
        zz,
        0.18,
        0.22,
        0.2,
        i % 3 ? "leaf" : "leafLight",
        [0, i * 0.23, 0],
        shop,
      );
      if (i % 2 === 0) {
        box(xx, yy + 0.065, zz, 0.115, 0.06, 0.054, "cream", [0, 0, 0], shop);
        box(xx, yy + 0.065, zz, 0.054, 0.06, 0.115, "cream", [0, 0, 0], shop);
        box(xx, yy + 0.101, zz, 0.035, 0.019, 0.035, "ochre", [0, 0, 0], shop);
      }
      if (i === 2 || i === 8) {
        line(
          [xx, 4.12, -0.46],
          [xx + 0.05, 3.77, -0.44],
          0.014,
          "leafDark",
          shop,
        );
        for (let j = 0; j < 3; j++)
          box(
            xx + (j % 2 ? 0.08 : -0.025),
            4.01 - j * 0.105,
            -0.435,
            0.1,
            0.105,
            0.12,
            "leaf",
            [0, j * 0.3, 0],
            shop,
          );
      }
    }
  }
  const sideWindows = group("west windows", shop);
  sideWindows.position.set(-10.73, 0, -3.75);
  sideWindows.rotation.y = -Math.PI / 2;
  for (const z of [-1.35, 1.35])
    archedWindowAt(z, 4.9, 0.03, 1.03, 1.72, sideWindows);
  const eastWindows = group("east-facing workshop windows", shop);
  eastWindows.position.set(-2.47, 0, -3.8);
  eastWindows.rotation.y = Math.PI / 2;
  for (const x of [-1.32, 1.23]) {
    archedWindowAt(x, 4.9, 0.03, 0.97, 1.7, eastWindows);
    for (const side of [-1, 1]) {
      box(
        x + side * 0.7,
        4.9,
        0.065,
        0.29,
        1.42,
        0.08,
        "green",
        [0, 0, 0],
        eastWindows,
      );
      for (let i = 0; i < 9; i++)
        box(
          x + side * 0.7,
          4.28 + i * 0.15,
          0.119,
          0.27,
          0.035,
          0.03,
          "greenLight",
          [0, 0, 0],
          eastWindows,
        );
    }
    box(x, 4.02, 0.2, 1.13, 0.19, 0.35, "wood", [0, 0, 0], eastWindows);
    for (let i = 0; i < 6; i++)
      box(
        x - 0.43 + i * 0.17,
        4.21 + random() * 0.11,
        0.24,
        0.19,
        0.22,
        0.26,
        i % 2 ? "leaf" : "leafLight",
        [0, random(), 0],
        eastWindows,
      );
  }
  for (const z of [-1.22, -6.34])
    box(-2.456, 4.9, z, 0.08, 2.55, 0.22, "stoneLight", [0, 0, 0], shop);
  // Ground-level bracing leaves the passage and open repair floor unobstructed.
  box(-2.42, 2.87, -4.8, 0.14, 0.19, 3.6, "wood", [0, 0, 0], shop);
  const eastNotice = group("workshop side notice", shop);
  eastNotice.position.set(-2.39, 0, -4.8);
  eastNotice.rotation.y = Math.PI / 2;
  plaque("BOILER\nINSPECTION", 0, 1.72, 0.05, 1.05, 0.65, eastNotice);
  for (let x = -10.2; x < -2.9; x += 0.55)
    for (let z = -6.1; z < -0.9; z += 0.48)
      box(
        x,
        0.035,
        z,
        0.525,
        0.075,
        0.455,
        random() > 0.5 ? "limestone" : "stoneDark",
        [0, 0, 0],
        shop,
      );
  box(-6.6, 3.0, -3.65, 7.65, 0.12, 5.15, "woodDark", [0, 0, 0], shop);
  for (let x = -10; x < -3; x += 1.4)
    box(x, 2.91, -3.7, 0.14, 0.23, 5.2, "wood", [0, 0, 0], shop);
  // Back shelves are visible through the ground-floor opening.
  for (const y of [0.8, 1.6, 2.38]) {
    box(-6.7, y, -6.02, 6.3, 0.12, 0.64, "woodLight", [0, 0, 0], shop);
    for (let i = 0; i < 12; i++) {
      const x = -9.45 + i * 0.51,
        r = 0.085 + random() * 0.06;
      cylinder(
        x,
        y + 0.18,
        -5.97,
        r,
        0.25,
        ["brass", "copper", "cream", "green"][i % 4],
        [0, 0, 0],
        shop,
        8,
      );
      cylinder(
        x,
        y + 0.325,
        -5.97,
        r * 0.7,
        0.05,
        "woodDark",
        [0, 0, 0],
        shop,
        8,
      );
    }
  }
  for (const x of [-9.75, -6.8, -3.6])
    box(x, 1.55, -6.12, 0.11, 2.8, 0.11, "wood", [0, 0, 0], shop);
  // This partition sits within the actual visible workshop bay, not behind the
  // upstairs sightline. Both side passages remain open to the deeper store room.
  const toolWall = group("recessed working tool wall", shop);
  toolWall.position.z = 0.66;
  box(-6.42, 1.5, -2.64, 3.56, 2.75, 0.16, "woodDark", [0, 0, 0], toolWall);
  for (let i = 0; i < 15; i++)
    box(
      -8.07 + i * 0.235,
      1.68,
      -2.538,
      0.212,
      2.35,
      0.055,
      i % 3 ? "wood" : "woodLight",
      [0, 0, 0],
      toolWall,
    );
  for (const y of [0.62, 2.59])
    box(-6.42, y, -2.48, 3.65, 0.115, 0.115, "woodDark", [0, 0, 0], toolWall);
  box(-6.42, 1.38, -2.3, 3.69, 0.12, 0.54, "woodLight", [0, 0, 0], toolWall);
  for (let i = 0; i < 6; i++) {
    const x = -7.94 + i * 0.6;
    box(x, 0.83, -2.49, 0.51, 0.81, 0.28, "green", [0, 0, 0], toolWall);
    box(x, 0.89, -2.327, 0.15, 0.055, 0.049, "brass", [0, 0, 0], toolWall);
  }
  for (const [x, h] of [
    [-7.83, 0.66],
    [-7.36, 0.78],
    [-6.89, 0.6],
  ]) {
    box(
      x,
      2.05 - h * 0.2,
      -2.4,
      0.07,
      h * 0.64,
      0.052,
      "ironLight",
      [0, 0, 0],
      toolWall,
    );
    ring(
      x,
      2.05 + h * 0.19,
      -2.4,
      0.115,
      0.032,
      "ironLight",
      [0, 0, Math.PI * 0.18],
      toolWall,
      Math.PI * 1.5,
    );
    ring(
      x,
      2.05 - h * 0.55,
      -2.4,
      0.075,
      0.025,
      "ironLight",
      [0, 0, 0],
      toolWall,
    );
    cylinder(
      x,
      2.43,
      -2.449,
      0.025,
      0.055,
      "brass",
      [Math.PI / 2, 0, 0],
      toolWall,
      6,
    );
  }
  for (const x of [-6.33, -5.76]) {
    for (const side of [-1, 1]) {
      line(
        [x + side * 0.13, 1.75, -2.4],
        [x - side * 0.043, 2.13, -2.4],
        0.035,
        "ironLight",
        toolWall,
        true,
      );
      line(
        [x - side * 0.043, 2.13, -2.4],
        [x + side * 0.068, 2.33, -2.4],
        0.036,
        "ironLight",
        toolWall,
        true,
      );
      line(
        [x + side * 0.13, 1.75, -2.4],
        [x + side * 0.095, 1.89, -2.4],
        0.046,
        "woodDark",
        toolWall,
      );
    }
    cylinder(
      x,
      2.08,
      -2.356,
      0.047,
      0.045,
      "brass",
      [Math.PI / 2, 0, 0],
      toolWall,
      8,
    );
  }
  box(
    -5.17,
    2.08,
    -2.39,
    0.065,
    0.68,
    0.07,
    "woodLight",
    [0, 0, 0.1],
    toolWall,
  );
  box(-5.2, 2.36, -2.39, 0.36, 0.13, 0.16, "iron", [0, 0, 0.1], toolWall);
  for (const x of [-8.75, -4.16]) {
    for (const dx of [-0.57, 0.57])
      box(
        x + dx,
        1.39,
        -2.76,
        0.085,
        2.68,
        0.09,
        "woodDark",
        [0, 0, 0],
        toolWall,
      );
    for (const y of [0.53, 1.23, 2.02]) {
      box(x, y, -2.55, 1.24, 0.1, 0.67, "woodLight", [0, 0, 0], toolWall);
      if (y < 1) {
        for (const dx of [-0.29, 0.29]) {
          crate(x + dx, y + 0.06, -2.54, 0.43, toolWall);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const xx = x - 0.38 + i * 0.37;
          cylinder(
            xx,
            y + 0.2,
            -2.53,
            0.11,
            0.3,
            i % 2 ? "copper" : "green",
            [0, 0, 0],
            toolWall,
            8,
          );
          cylinder(
            xx,
            y + 0.365,
            -2.53,
            0.075,
            0.065,
            "brass",
            [0, 0, 0],
            toolWall,
            8,
          );
          line(
            [xx, y + 0.36, -2.53],
            [xx + 0.09, y + 0.54, -2.53],
            0.019,
            "brass",
            toolWall,
          );
          ring(
            xx - 0.125,
            y + 0.21,
            -2.53,
            0.076,
            0.015,
            "iron",
            [0, 0, 0],
            toolWall,
            Math.PI * 1.5,
          );
        }
      }
    }
  }
  // A fully reachable bench on the threshold keeps the kettle visible while playing.
  const bench = group("green repair workbench");
  box(-6.3, 0.68, -1.08, 2.65, 1.22, 0.89, "green", [0, 0, 0], bench);
  for (const x of [-7.53, -5.07])
    box(x, 0.64, -0.68, 0.12, 1.25, 0.13, "greenLight", [0, 0, 0], bench);
  box(-6.3, 1.34, -1.08, 2.92, 0.16, 1.07, "woodLight", [0, 0, 0], bench);
  for (const x of [-7.11, -6.3, -5.49]) {
    box(x, 0.88, -0.61, 0.74, 0.53, 0.055, "greenLight", [0, 0, 0], bench);
    box(x, 0.33, -0.61, 0.74, 0.43, 0.055, "green", [0, 0, 0], bench);
    box(x, 0.95, -0.56, 0.18, 0.047, 0.06, "brass", [0, 0, 0], bench);
    box(x, 0.39, -0.56, 0.12, 0.05, 0.06, "brass", [0, 0, 0], bench);
  }
  box(-7.35, 1.49, -1.1, 0.28, 0.2, 0.31, "iron", [0, 0, 0], bench);
  box(-7.35, 1.62, -1.04, 0.47, 0.1, 0.12, "ironLight", [0, 0, 0], bench);
  line([-7.35, 1.45, -0.82], [-7.35, 1.45, -0.47], 0.025, "brass", bench);
  cylinder(-7.35, 1.45, -0.47, 0.045, 0.21, "iron", [0, 0, 0], bench, 6);
  for (let i = 0; i < 4; i++)
    box(
      -5.2 + i * 0.08,
      1.44,
      -1.17,
      0.045,
      0.055,
      0.32,
      "ironLight",
      [0, 0.2 * i, 0],
      bench,
    );
  cylinder(-5.32, 1.59, -1.45, 0.15, 0.33, "copper", [0, 0, 0], bench, 8);
  for (let i = 0; i < 5; i++)
    line(
      [-5.4 + i * 0.045, 1.64, -1.45],
      [-5.44 + i * 0.05, 1.99 + random() * 0.1, -1.48],
      0.015,
      "iron",
      bench,
    );
  const workLamp = group("bench gas task lamp", bench);
  cylinder(-7.03, 1.46, -1.32, 0.145, 0.095, "iron", [0, 0, 0], workLamp, 10);
  cylinder(-7.03, 1.66, -1.32, 0.045, 0.35, "brass", [0, 0, 0], workLamp, 8);
  cylinder(-7.03, 1.86, -1.32, 0.095, 0.16, "copper", [0, 0, 0], workLamp, 10);
  cylinder(
    -7.03,
    2.01,
    -1.32,
    0.055,
    0.18,
    "warm",
    [0, 0, 0],
    workLamp,
    8,
    0.02,
  );
  for (const dx of [-0.092, 0.092])
    line(
      [-7.03 + dx, 1.9, -1.32],
      [-7.03 + dx, 2.21, -1.32],
      0.017,
      "iron",
      workLamp,
    );
  cylinder(
    -7.03,
    2.24,
    -1.32,
    0.205,
    0.13,
    "green",
    [0, 0, 0],
    workLamp,
    12,
    0.062,
  );
  cylinder(-7.03, 2.35, -1.32, 0.056, 0.11, "brass", [0, 0, 0], workLamp, 8);
  line([-7.03, 1.56, -1.32], [-7.27, 1.56, -1.66], 0.018, "copper", workLamp);
  solid(-6.24, -1.46, 2.9, 1.05);
  for (const x of [-9.38, -3.59]) {
    crate(x, 0, -2.7, 0.64, shop);
    pot(x, 0.56, -2.7, 0.25, shop);
  }
  for (const x of [-10.4, -2.75]) {
    line([x, 2.78, -0.98], [x, 2.78, -0.53], 0.05, "iron", shop);
    lantern(x, 2.43, -0.46, shop);
  }
  // Slender iron shopfront columns carry the masonry rather than ornamental gears.
  for (const x of [-10.11, -3.04]) {
    box(x, 1.49, -0.73, 0.17, 2.88, 0.18, "iron", [0, 0, 0], shop);
    for (const y of [0.19, 2.72])
      box(x, y, -0.73, 0.34, 0.14, 0.32, "ironLight", [0, 0, 0], shop);
    box(x, 1.46, -0.612, 0.045, 2.37, 0.035, "ironLight", [0, 0, 0], shop);
    const direction = x < -6 ? 1 : -1;
    line(
      [x, 2.18, -0.75],
      [x + direction * 0.53, 2.96, -0.75],
      0.05,
      "iron",
      shop,
    );
    ring(
      x + direction * 0.18,
      2.72,
      -0.74,
      0.16,
      0.024,
      "iron",
      [0, 0, 0],
      shop,
      Math.PI,
    );
  }
  box(-6.6, 2.97, -0.73, 7.2, 0.19, 0.19, "iron", [0, 0, 0], shop);
  for (let x = -10; x < -3; x += 0.45)
    cylinder(
      x,
      2.97,
      -0.612,
      0.025,
      0.03,
      "brass",
      [Math.PI / 2, 0, 0],
      shop,
      6,
    );
  plaque("XU’S REPAIR WORKS", -6.5, 3.37, -0.664, 4.1, 0.39, shop);
  plaque("XU’S\nREPAIR\nWORKS", -9.7, 5.05, -1.39, 0.8, 1.16, shop);
  line([-9.7, 5.87, -1.5], [-9.7, 5.87, -0.73], 0.05, "iron", shop);
  // Two real faces share a single hanging sign. Its turn is the chapter's finish.
  line([-4.17, 2.95, -0.96], [-4.17, 2.95, -0.44], 0.035, "iron", shop);
  const hoursSign = group("hanging opening-hours sign", shop);
  hoursSign.position.set(-4.17, 2.77, -0.39);
  for (const x of [-0.23, 0.23])
    line([x, 0, 0], [x, -0.18, 0], 0.014, "iron", hoursSign);
  plaque("CLOSED", 0, -0.47, 0.012, 0.87, 0.45, hoursSign);
  const openFace = group("OPEN sign reverse", hoursSign);
  openFace.rotation.y = Math.PI;
  plaque("OPEN", 0, -0.47, 0.012, 0.87, 0.45, openFace);
  const roof = group("workshop mansard roof");
  const mansard = hipRoofGeometry(8.84, 5.9, 1.92, 1.02);
  geometry(mansard, "roofSlate", -6.6, 6.43, -3.76, 1, 1, 1, [0, 0, 0], roof);
  mansard.dispose();
  const crown = hipRoofGeometry(6.8, 3.86, 0.38, 0.48);
  geometry(crown, "roofSlate", -6.6, 8.35, -3.76, 1, 1, 1, [0, 0, 0], roof);
  crown.dispose();
  // Lead flashing follows only the hips; individual slate courses stay in the PBR surface.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      line(
        [-6.6 + sx * 4.42, 6.46, -3.76 + sz * 2.95],
        [-6.6 + sx * 3.4, 8.39, -3.76 + sz * 1.93],
        0.025,
        "ironLight",
        roof,
      );
  // Fine fascia, shadow line and cast-iron gutter give the eaves a real section.
  for (const [y, w, d, h, mat] of [
    [6.28, 8.67, 5.72, 0.1, "stoneLight"],
    [6.36, 8.82, 5.88, 0.07, "limestone"],
    [6.415, 8.96, 6.01, 0.045, "iron"],
  ])
    box(-6.6, y, -3.76, w, h, d, mat, [0, 0, 0], roof);
  const bracketProfile = new THREE.Shape();
  bracketProfile.moveTo(0, 0);
  bracketProfile.lineTo(0.25, 0);
  bracketProfile.lineTo(0.25, -0.09);
  bracketProfile.bezierCurveTo(0.04, -0.07, 0.18, -0.31, 0, -0.35);
  bracketProfile.closePath();
  const corbel = new THREE.ExtrudeGeometry(bracketProfile, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  for (let x = -10.3; x < -2.8; x += 0.56)
    geometry(
      corbel,
      "limestone",
      x,
      6.29,
      -0.86,
      1,
      1,
      1,
      [0, -Math.PI / 2, 0],
      shop,
    );
  corbel.dispose();
  for (const x of [-8.6, -4.78]) {
    box(x, 7.22, -1.25, 1.1, 1.37, 0.82, "ashlar", [0, 0, 0], roof);
    archedWindowAt(x, 7.3, -0.81, 0.66, 1.08, roof);
    const pediment = hipRoofGeometry(1.39, 1.04, 0.42, 0.5);
    geometry(pediment, "patina", x, 7.91, -1.29, 1, 1, 1, [0, 0, 0], roof);
    pediment.dispose();
    box(x, 7.9, -0.82, 1.35, 0.075, 0.16, "stoneLight", [0, 0, 0], roof);
  }
  // A narrow rooflight belongs to the workshop below, with brass glazing bars.
  box(-6.6, 8.76, -3.8, 2.35, 0.075, 1.45, "iron", [0, 0, 0], roof);
  box(-6.6, 8.802, -3.8, 2.18, 0.035, 1.3, "glass", [0, 0, 0], roof);
  for (let x = -7.62; x < -5.5; x += 0.43)
    box(x, 8.83, -3.8, 0.025, 0.04, 1.36, "patina", [0, 0, 0], roof);
  // One signature copper chimney, bent twice, with riveted collar flanges.
  const pipePoints = [
    [-2.02, 2.9, -1.87],
    [-2.02, 5.5, -1.87],
    [-1.68, 6.02, -1.87],
    [-1.48, 6.39, -1.87],
    [-1.48, 8.92, -1.87],
    [-1.78, 9.36, -1.87],
    [-2.43, 9.45, -1.87],
  ];
  for (let i = 0; i < pipePoints.length - 1; i++) {
    line(pipePoints[i], pipePoints[i + 1], 0.3, "copper");
    const midpoint = pipePoints[i].map(
      (v, k) => (v + pipePoints[i + 1][k]) / 2,
    );
    line(
      midpoint,
      midpoint.map(
        (v, k) => v + (pipePoints[i + 1][k] - pipePoints[i][k]) * 0.07,
      ),
      0.345,
      "copperLight",
    );
  }
  for (const y of [3.18, 4.35, 5.4, 6.68, 7.95, 8.75]) {
    const x = y > 6 ? -1.48 : -2.02;
    cylinder(x, y, -1.87, 0.35, 0.105, "copperLight");
    for (let i = 0; i < 8; i++)
      box(
        x + Math.sin((i * Math.PI) / 4) * 0.35,
        y,
        -1.87 + Math.cos((i * Math.PI) / 4) * 0.35,
        0.065,
        0.07,
        0.065,
        "brass",
      );
  }
  cylinder(-2.45, 9.45, -1.87, 0.26, 0.07, "woodDark", [0, 0, Math.PI / 2]);
  for (const y of [3.7, 5.1, 7.05])
    line([-2.57, y, -1.87], [y > 6 ? -1.48 : -2.02, y, -1.87], 0.06, "iron");
  const workshopBoiler = group("riveted repair-works boiler");
  box(-2.02, 0.35, -1.91, 0.99, 0.7, 0.94, "iron", [0, 0, 0], workshopBoiler);
  cylinder(
    -2.02,
    1.81,
    -1.91,
    0.44,
    2.22,
    "copper",
    [0, 0, 0],
    workshopBoiler,
    14,
    0.42,
  );
  cylinder(
    -2.02,
    2.99,
    -1.91,
    0.42,
    0.18,
    "copperLight",
    [0, 0, 0],
    workshopBoiler,
    14,
    0.29,
  );
  for (const y of [0.77, 1.24, 2.32, 2.81]) {
    cylinder(
      -2.02,
      y,
      -1.91,
      0.474,
      0.1,
      "copperLight",
      [0, 0, 0],
      workshopBoiler,
      14,
    );
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI) / 7;
      box(
        -2.02 + Math.cos(a) * 0.475,
        y,
        -1.91 + Math.sin(a) * 0.475,
        0.045,
        0.056,
        0.045,
        "brass",
        [0, a, 0],
        workshopBoiler,
      );
    }
  }
  box(
    -2.02,
    0.39,
    -1.414,
    0.49,
    0.35,
    0.055,
    "woodDark",
    [0, 0, 0],
    workshopBoiler,
  );
  for (let i = 0; i < 5; i++)
    box(
      -2.2 + i * 0.09,
      0.39,
      -1.372,
      0.026,
      0.28,
      0.026,
      "ironLight",
      [0, 0, 0],
      workshopBoiler,
    );
  line(
    [-2.29, 0.86, -1.58],
    [-2.29, 2.16, -1.58],
    0.036,
    "brass",
    workshopBoiler,
  );
  line(
    [-2.29, 1.2, -1.58],
    [-2.29, 1.91, -1.58],
    0.019,
    "water",
    workshopBoiler,
  );
  pressureGauge(-2.01, 2.3, -1.41, 0.285, workshopBoiler);
  for (const y of [1.24, 2.32, 2.81]) {
    cylinder(
      -2.02,
      y + 0.065,
      -1.91,
      0.48,
      0.028,
      "brassLight",
      [0, 0, 0],
      workshopBoiler,
      14,
    );
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI) / 6;
      box(
        -2.02 + Math.cos(a) * 0.485,
        y,
        -1.91 + Math.sin(a) * 0.485,
        0.055,
        0.061,
        0.055,
        "brassLight",
        [0, a, 0],
        workshopBoiler,
      );
    }
  }
  valveAt(-2.03, 1.58, -1.37, 0.18, workshopBoiler);
  for (let y = 1; y < 6; y += 0.8)
    box(-10.76, y, -1.32, 0.065, 0.65, 0.065, "patina");
  for (let i = 0; i < 70; i++) {
    const y = 0.65 + random() * 5.7,
      z = -1.7 - random() * 0.6;
    box(-10.83, y, z, 0.14, 0.16, 0.16, i % 3 ? "leaf" : "leafLight");
  }
  const frontageVine = group("connected workshop climbing vine", shop);
  const climbingPoints = [];
  for (let i = 0; i < 20; i++)
    climbingPoints.push([
      -10.25 + Math.sin(i * 0.72) * 0.11,
      0.32 + i * 0.29,
      -0.675,
    ]);
  for (let i = 0; i < climbingPoints.length - 1; i++) {
    const [x, y, z] = climbingPoints[i];
    line(climbingPoints[i], climbingPoints[i + 1], 0.025, "wood", frontageVine);
    for (const side of [-1, 1]) {
      const leafX = x + side * (0.13 + (i % 3) * 0.04),
        leafY = y + 0.11;
      line(
        [x, y, z],
        [leafX, leafY, z + 0.025],
        0.012,
        "leafDark",
        frontageVine,
      );
      box(
        leafX,
        leafY,
        z + 0.043,
        0.2,
        0.15,
        0.105,
        i % 3 ? "leaf" : "leafLight",
        [0, 0, side * 0.35],
        frontageVine,
      );
      if (i % 5 === 1 && side === 1) {
        box(
          leafX,
          leafY + 0.08,
          z + 0.1,
          0.09,
          0.055,
          0.05,
          "cream",
          [0, 0, 0],
          frontageVine,
        );
        box(
          leafX,
          leafY + 0.08,
          z + 0.1,
          0.05,
          0.055,
          0.09,
          "cream",
          [0, 0, 0],
          frontageVine,
        );
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    const z = -0.73 - i * 0.21;
    if (i < 7)
      line(
        [-10.3, 5.71, z],
        [-10.72, 5.68, z - 0.21],
        0.023,
        "wood",
        frontageVine,
      );
    box(
      -10.75,
      5.64 + (i % 2) * 0.15,
      z,
      0.16,
      0.22,
      0.26,
      i % 2 ? "leaf" : "leafLight",
      [0, i * 0.18, 0],
      frontageVine,
    );
  }
  // Repair stock stays stacked in the existing left interior storage pocket.
  const repairStock = group("stacked repair stock", shop);
  crate(-9.43, 0.58, -2.7, 0.52, repairStock);
  crate(-9.77, 0, -2.42, 0.43, repairStock);
  box(-9.42, 1.16, -2.7, 0.61, 0.12, 0.44, "woodLight", [0, 0, 0], repairStock);
  for (let i = 0; i < 4; i++) {
    cylinder(
      -9.63 + i * 0.14,
      1.3,
      -2.72,
      0.046,
      0.52,
      i % 2 ? "copper" : "ironLight",
      [Math.PI / 2, 0, 0],
      repairStock,
      8,
    );
    ring(
      -9.63 + i * 0.14,
      1.3,
      -2.449,
      0.036,
      0.01,
      "woodDark",
      [0, 0, 0],
      repairStock,
    );
  }
  for (const x of [-9.65, -9.19])
    box(x, 1.27, -2.69, 0.038, 0.24, 0.45, "iron", [0, 0, 0], repairStock);
  solid(-6.6, -6.42, 8.2, 0.35);
  solid(-10.6, -3.8, 0.35, 5.4);
  solid(-2.63, -4.8, 0.35, 3.35);
  solid(-10.43, -1.11, 0.6, 0.6);
  solid(-2.77, -1.11, 0.6, 0.6);
  // Authored curved bay and enlarged flywheel project beyond the old facade.
  solid(-9.87, -1.3, 1.6, 2.4);
  solid(-1.98, -1.18, 3.1, 0.46);

  // Freestanding order slate and barrel flowers; its front is deliberately clear.
  const board = group("orders slate");
  board.position.set(-10.2, 0, 1.1);
  for (const x of [-0.49, 0.49]) {
    box(x, 0.64, 0, 0.085, 1.28, 0.085, "wood", [0, 0, -x * 0.08], board);
    line([x, 0.95, 0], [x, 0, -0.43], 0.044, "wood", board, true);
  }
  plaque("REPAIR\nORDERS", 0, 0.79, 0.048, 0.91, 0.89, board);
  box(0, 0.2, 0.09, 1.08, 0.1, 0.13, "woodLight", [0, 0, 0], board);
  solid(-10.2, 1.0, 1.12, 0.45);
  pot(-9.25, 0, 1.1, 0.36, root, true);
  solid(-9.25, 1.1, 0.8, 0.8);
  pot(-2.64, 0, -0.19, 0.36, root, true);
  solid(-2.64, -0.19, 0.68, 0.68);

  defaultParent = root;
  const legacySoup = group("legacy soup house");
  defaultParent = legacySoup;
  // Soup shop, a low terracotta building with a folded striped canvas awning.
  const soup = group("terracotta soup kitchen");
  masonry(
    5.1,
    0,
    -3.77,
    6,
    3.65,
    0.24,
    ["brick", "brickLight", "brickDark"],
    0.44,
    soup,
  );
  sideMasonry(
    2.2,
    0,
    -1.4,
    0.24,
    3.65,
    4.8,
    ["brick", "brickLight", "brickDark"],
    soup,
  );
  sideMasonry(
    8,
    0,
    -1.4,
    0.24,
    3.65,
    4.8,
    ["brick", "brickLight", "brickDark"],
    soup,
    1,
  );
  for (const x of [2.4, 7.8])
    masonry(
      x,
      0,
      1.01,
      0.62,
      3.65,
      0.39,
      ["brick", "brickLight", "brickDark"],
      0.38,
      soup,
    );
  masonry(
    5.1,
    2.65,
    1.0,
    5.1,
    1,
    0.28,
    ["brick", "brickLight", "brickDark"],
    0.44,
    soup,
  );
  for (const y of [0.18, 3.6, 3.82])
    box(5.1, y, -1.4, 6.47, 0.16, 5.16, "stoneLight", [0, 0, 0], soup);
  box(5.1, 3.93, -1.4, 6.36, 0.16, 5.05, "slate", [0, 0, 0], soup);
  for (let x = 2.05; x < 8.22; x += 0.36)
    for (let z = -3.82; z < 1.13; z += 0.43)
      box(
        x,
        4.045 + random() * 0.025,
        z,
        0.34,
        0.08,
        0.41,
        random() > 0.75 ? "slateLight" : "slate",
        [0, 0, 0],
        soup,
      );
  // Lead-lined parapet channel drains to the existing rear corner of the shop.
  box(5.05, 4.1, 0.62, 5.52, 0.033, 0.23, "iron", [0, 0, 0], soup);
  for (const z of [0.493, 0.747])
    box(5.05, 4.14, z, 5.57, 0.065, 0.028, "patina", [0, 0, 0], soup);
  box(7.91, 4.1, -1.37, 0.2, 0.034, 4.18, "iron", [0, 0, 0], soup);
  for (const x of [7.796, 8.024])
    box(x, 4.14, -1.37, 0.026, 0.063, 4.18, "patina", [0, 0, 0], soup);
  line([7.91, 4.12, -3.42], [8.17, 3.89, -3.42], 0.075, "patina", soup);
  line([8.17, 3.89, -3.42], [8.17, 0.19, -3.42], 0.075, "patina", soup);
  for (const y of [0.57, 2.07, 3.54]) {
    cylinder(8.17, y, -3.42, 0.098, 0.07, "iron", [0, 0, 0], soup, 8);
    box(8.105, y, -3.42, 0.2, 0.085, 0.07, "iron", [0, 0, 0], soup);
  }
  // A single service cluster of capped vents, with individual flashing and seams.
  for (const [x, z, h] of [
    [4.13, -1.48, 0.43],
    [4.76, -1.62, 0.68],
    [5.37, -1.47, 0.5],
  ]) {
    box(x, 4.112, z, 0.47, 0.046, 0.46, "ironLight", [0, 0, 0], soup);
    cylinder(x, 4.16 + h / 2, z, 0.122, h, "patina", [0, 0, 0], soup, 10);
    cylinder(x, 4.17, z, 0.162, 0.079, "iron", [0, 0, 0], soup, 10);
    for (const y of [4.23, 4.12 + h])
      cylinder(x, y, z, 0.145, 0.044, "ironLight", [0, 0, 0], soup, 10);
    cylinder(x, 4.22 + h, z, 0.216, 0.11, "slate", [0, 0, 0], soup, 10, 0.065);
    for (const dx of [-0.13, 0.13])
      line([x + dx, 4.1 + h, z], [x + dx, 4.21 + h, z], 0.018, "iron", soup);
  }
  for (const z of [-3.88, 0.95]) {
    masonry(
      5.1,
      4.04,
      z,
      6.2,
      0.38,
      0.25,
      ["brick", "brickLight", "brickDark"],
      0.42,
      soup,
    );
    for (let x = 2.02; x < 8.25; x += 0.43)
      box(x, 4.47, z, 0.405, 0.12, 0.43, "stoneDark", [0, 0, 0], soup);
  }
  sideMasonry(
    8.15,
    4.04,
    -1.45,
    0.25,
    0.38,
    4.83,
    ["brick", "brickLight", "brickDark"],
    soup,
    1,
  );
  sideMasonry(
    2.05,
    4.04,
    -1.45,
    0.25,
    0.38,
    4.83,
    ["brick", "brickLight", "brickDark"],
    soup,
  );
  for (const x of [2.05, 8.15])
    for (let z = -3.75; z < 1; z += 0.44)
      box(x, 4.47, z, 0.43, 0.12, 0.415, "stoneDark", [0, 0, 0], soup);
  for (let i = 0; i < 30; i++) {
    const x = 2.24 + random() * 5.7,
      z = -3.64 + random() * 4.3;
    if (i % 3 === 0)
      box(x, 4.105, z, 0.12, 0.035, 0.13, "leaf", [0, 0, 0], soup);
  }
  masonry(
    7.12,
    4.02,
    -2.65,
    0.75,
    1.25,
    0.72,
    ["brick", "brickLight", "brickDark"],
    0.32,
    soup,
  );
  box(7.12, 5.3, -2.65, 0.96, 0.14, 0.91, "stoneLight", [0, 0, 0], soup);
  cylinder(7.12, 5.5, -2.65, 0.17, 0.4, "copper", [0, 0, 0], soup);
  for (let i = 0; i < 5; i++) crate(3.07 + i * 0.77, 4.11, -2.88, 0.6, soup);
  crate(3.47, 4.64, -2.88, 0.63, soup);
  pot(7.13, 4.1, -0.29, 0.37, soup);
  plaque("THE COPPER KETTLE", 5.1, 3.11, 1.19, 3.82, 0.59, soup);
  box(5.1, 0.77, 1.03, 4.73, 1.04, 0.65, "woodDark", [0, 0, 0], soup);
  for (let i = 0; i < 19; i++)
    box(
      2.88 + i * 0.245,
      0.77,
      1.4,
      0.217,
      1.01,
      0.067,
      i % 3 ? "wood" : "woodLight",
      [0, 0, 0],
      soup,
    );
  box(5.1, 1.33, 1.15, 5.15, 0.16, 0.95, "woodLight", [0, 0, 0], soup);
  for (const x of [2.9, 7.3])
    box(x, 1.78, 1.04, 0.095, 2.36, 0.12, "woodLight", [0, 0, 0], soup);
  for (const x of [2.88, 7.33]) {
    box(x, 1.55, 2.3, 0.092, 2.83, 0.092, "iron", [0, 0, 0], soup);
    box(x, 0.22, 2.3, 0.21, 0.17, 0.21, "ironLight", [0, 0, 0], soup);
    box(x, 2.89, 2.3, 0.21, 0.12, 0.21, "ironLight", [0, 0, 0], soup);
    line([x, 2.28, 2.3], [x, 2.86, 1.81], 0.033, "iron", soup);
    ring(
      x,
      2.61,
      2.03,
      0.17,
      0.024,
      "iron",
      [0, Math.PI / 2, 0],
      soup,
      Math.PI,
    );
  }
  box(5.1, 2.88, 2.3, 4.56, 0.075, 0.085, "iron", [0, 0, 0], soup);
  for (const x of [2.38, 7.82]) {
    box(x, 1.62, 1.24, 0.35, 2.94, 0.17, "green", [0, 0, 0], soup);
    for (const y of [0.19, 2.84])
      box(x, y, 1.25, 0.49, 0.15, 0.21, "woodDark", [0, 0, 0], soup);
    box(x, 1.64, 1.34, 0.06, 2.34, 0.045, "greenLight", [0, 0, 0], soup);
  }
  for (const x of [3.41, 4.26, 5.11, 5.96, 6.81]) {
    box(x, 0.81, 1.449, 0.73, 0.69, 0.024, "green", [0, 0, 0], soup);
    for (const dx of [-0.35, 0.35])
      box(
        x + dx,
        0.81,
        1.475,
        0.035,
        0.69,
        0.026,
        "woodLight",
        [0, 0, 0],
        soup,
      );
    for (const y of [0.48, 1.14])
      box(x, y, 1.475, 0.73, 0.035, 0.026, "woodLight", [0, 0, 0], soup);
  }
  for (let i = 0; i < 12; i++) {
    const x = 2.47 + ((i + 0.5) * 5.26) / 12,
      mat = i % 2 ? "cream" : "ochre";
    box(x, 2.53, 1.6, 5.26 / 12 - 0.008, 0.052, 1.35, mat, [0.33, 0, 0], soup);
    box(x, 2.28, 2.25, 5.26 / 12 - 0.008, 0.28, 0.055, mat, [0, 0, 0], soup);
  }
  line([2.42, 2.64, 1.05], [2.42, 2.27, 2.24], 0.04, "wood", soup);
  line([7.76, 2.64, 1.05], [7.76, 2.27, 2.24], 0.04, "wood", soup);
  for (const x of [3.22, 4.16, 6.56, 7.15]) {
    cylinder(x, 1.48, 1.33, 0.21, 0.14, "cream", [0, 0, 0], soup, 12, 0.28);
    cylinder(x, 1.558, 1.33, 0.237, 0.012, "ochre", [0, 0, 0], soup, 12);
    ring(x, 1.562, 1.33, 0.257, 0.02, "stoneLight", [Math.PI / 2, 0, 0], soup);
    cylinder(x, 1.428, 1.33, 0.29, 0.025, "cream", [0, 0, 0], soup, 14);
    line(
      [x + 0.23, 1.57, 1.31],
      [x + 0.39, 1.565, 1.55],
      0.014,
      "ironLight",
      soup,
    );
    cylinder(
      x + 0.23,
      1.573,
      1.31,
      0.037,
      0.011,
      "ironLight",
      [0, 0, 0],
      soup,
      8,
    );
    for (const offset of [-0.065, 0.057])
      box(
        x + offset,
        1.572,
        1.34 + offset * 0.3,
        0.054,
        0.018,
        0.036,
        "leaf",
        [0, 0.3, 0],
        soup,
      );
  }
  // Cups, saucers and a serving jug make the counter read as an occupied café.
  for (const x of [3.72, 6.07]) {
    cylinder(x, 1.44, 1.41, 0.185, 0.027, "cream", [0, 0, 0], soup, 14);
    cylinder(x, 1.545, 1.41, 0.104, 0.19, "cream", [0, 0, 0], soup, 12, 0.12);
    cylinder(x, 1.645, 1.41, 0.098, 0.011, "woodDark", [0, 0, 0], soup, 12);
    ring(x + 0.14, 1.55, 1.41, 0.066, 0.019, "cream", [0, 0, 0], soup);
    ring(x, 1.65, 1.41, 0.114, 0.013, "stoneLight", [Math.PI / 2, 0, 0], soup);
  }
  cylinder(7.44, 1.57, 0.91, 0.135, 0.31, "cream", [0, 0, 0], soup, 12, 0.104);
  cylinder(7.44, 1.745, 0.91, 0.105, 0.05, "cream", [0, 0, 0], soup, 12, 0.12);
  ring(7.59, 1.59, 0.91, 0.097, 0.025, "cream", [0, 0, 0], soup);
  box(7.34, 1.76, 0.91, 0.12, 0.045, 0.11, "cream", [0, 0, -0.22], soup);
  for (let i = 0; i < 4; i++)
    cylinder(
      3.0,
      1.44 + i * 0.036,
      0.82,
      0.18,
      0.025,
      "cream",
      [0, 0, 0],
      soup,
      14,
    );
  cylinder(5.66, 1.61, 0.96, 0.37, 0.45, "copper", [0, 0, 0], soup, 12);
  cylinder(5.66, 1.85, 0.96, 0.39, 0.07, "brass", [0, 0, 0], soup, 12);
  cylinder(5.66, 1.94, 0.96, 0.075, 0.12, "woodDark", [0, 0, 0], soup);
  for (const x of [3.23, 4.17, 6.84]) {
    box(x, 0.68, 2.63, 0.63, 0.11, 0.6, "woodLight", [0, 0, 0], soup);
    for (const dx of [-0.23, 0.23])
      for (const dz of [-0.2, 0.2])
        line(
          [x + dx, 0.64, 2.63 + dz],
          [x + dx * 1.17, 0, 2.63 + dz * 1.17],
          0.045,
          "wood",
          soup,
          true,
        );
    box(x, 0.24, 2.63, 0.53, 0.065, 0.06, "wood", [0, 0, 0], soup);
    solid(x, 2.63, 0.68, 0.66);
  }
  box(5.1, 1.28, -3.43, 4.5, 0.13, 0.62, "woodLight", [0, 0, 0], soup);
  for (const y of [1.93, 2.64]) {
    box(5.1, y, -3.41, 4.5, 0.11, 0.6, "woodLight", [0, 0, 0], soup);
    for (let i = 0; i < 10; i++)
      cylinder(
        3.15 + i * 0.41,
        y + 0.17,
        -3.4,
        0.13,
        0.26,
        i % 3 ? "cream" : "green",
        [0, 0, 0],
        soup,
        8,
      );
  }
  lantern(2.27, 2.74, 1.45, soup);
  pot(8.2, 0, 1.36, 0.35, root, true);
  crate(7.96, 0, 2.36, 0.55);
  const canopyClimber = group("canopy climbing jasmine", soup);
  for (const [x, direction] of [
    [2.88, 1],
    [7.33, -1],
  ]) {
    for (let i = 0; i < 10; i++) {
      const y = 0.51 + i * 0.23,
        xx = x + Math.sin(i * 0.9) * 0.06;
      if (i < 9)
        line(
          [xx, y, 2.35],
          [x + Math.sin((i + 1) * 0.9) * 0.06, y + 0.23, 2.35],
          0.018,
          "wood",
          canopyClimber,
        );
      const leafX = xx + direction * (i % 2 ? 0.13 : -0.08);
      box(
        leafX,
        y + 0.07,
        2.37,
        0.16,
        0.17,
        0.1,
        i % 3 ? "leaf" : "leafLight",
        [0, 0, i % 2 ? 0.3 : -0.3],
        canopyClimber,
      );
      if (i === 3 || i === 7) {
        box(
          leafX,
          y + 0.16,
          2.4,
          0.083,
          0.055,
          0.045,
          "cream",
          [0, 0, 0],
          canopyClimber,
        );
        box(
          leafX,
          y + 0.16,
          2.4,
          0.045,
          0.055,
          0.083,
          "cream",
          [0, 0, 0],
          canopyClimber,
        );
      }
    }
    for (let i = 0; i < 5; i++) {
      const xx = x + direction * i * 0.17;
      if (i < 4)
        line(
          [xx, 2.93, 2.34],
          [xx + direction * 0.17, 2.93, 2.34],
          0.018,
          "wood",
          canopyClimber,
        );
      box(
        xx,
        2.89 + (i % 2) * 0.07,
        2.39,
        0.21,
        0.135,
        0.12,
        i % 2 ? "leafLight" : "leaf",
        [0, 0, i * 0.16],
        canopyClimber,
      );
    }
  }
  solid(5.1, -1.4, 6, 4.8);
  solid(5.1, 1.15, 5.15, 0.95);
  solid(8.2, 1.36, 0.7, 0.7);
  solid(7.96, 2.36, 0.55, 0.55);

  defaultParent = root;
  // Exposed laundry apparatus in the passage, with two hand-cranked rollers.
  const laundry = group("linen and wringer");
  for (const x of [-1.1, 0.7])
    box(x, 0.62, -3.2, 0.09, 1.25, 0.1, "wood", [0, 0, 0], laundry);
  box(-0.2, 0.57, -3.2, 1.9, 0.15, 0.73, "wood", [0, 0, 0], laundry);
  for (const y of [0.91, 1.17])
    cylinder(
      -0.2,
      y,
      -3.2,
      0.11,
      1.55,
      "cream",
      [0, 0, Math.PI / 2],
      laundry,
      10,
    );
  for (const x of [-1.07, 0.68])
    box(x, 1.08, -3.2, 0.12, 0.64, 0.19, "iron", [0, 0, 0], laundry);
  ring(0.86, 1.16, -3.2, 0.28, 0.028, "iron", [0, Math.PI / 2, 0], laundry);
  line([0.86, 1.16, -3.2], [0.86, 1.41, -3.2], 0.025, "iron", laundry);
  line([0.86, 1.41, -3.2], [1.06, 1.41, -3.2], 0.032, "woodLight", laundry);
  cylinder(-0.35, 0.24, -2.98, 0.43, 0.4, "wood", [0, 0, 0], laundry, 12, 0.49);
  for (const y of [0.1, 0.35])
    ring(-0.35, y, -2.98, 0.455, 0.027, "iron", [Math.PI / 2, 0, 0], laundry);
  for (const x of [-1.4, 1.22])
    box(x, 1.95, -3.97, 0.1, 3.9, 0.1, "wood", [0, 0, 0], laundry);
  line([-1.4, 3.82, -3.97], [1.22, 3.82, -3.97], 0.018, "iron", laundry);
  const linens = [];
  for (let i = 0; i < 4; i++) {
    const cloth = group("hanging linen", laundry);
    cloth.position.set(-1.12 + i * 0.65, 3.75, -3.97);
    const h = i % 2 ? 1.02 : 1.37;
    for (let j = 0; j < 6; j++)
      box(
        -0.23 + j * 0.092,
        -h / 2,
        -0.035 + Math.sin(j * 1.3) * 0.035,
        0.094,
        h,
        0.032,
        i % 2 ? "blueLinen" : "linen",
        [0, 0, 0],
        cloth,
      );
    for (const x of [-0.2, 0.2])
      box(x, 0.03, 0, 0.04, 0.13, 0.055, "woodLight", [0, 0, 0], cloth);
    linens.push(cloth);
  }
  solid(-0.2, -3.2, 2.2, 0.86);

  // Brick watergate: a clearly mechanical iron flywheel, not a clock face.
  const gate = group("east watergate");
  for (const x of [9.17, 12.83])
    masonry(
      x,
      0,
      -3.04,
      0.6,
      5.55,
      0.9,
      ["brick", "brickLight", "brickDark"],
      0.43,
      gate,
    );
  masonry(
    11,
    3.85,
    -4.82,
    4.3,
    1.8,
    3.3,
    ["brick", "brickLight", "brickDark"],
    0.43,
    gate,
  );
  sideMasonry(
    13.02,
    0,
    -4.89,
    0.35,
    5.45,
    3.9,
    ["brick", "brickLight", "brickDark"],
    gate,
    1,
  );
  box(11, 5.68, -4.82, 4.72, 0.25, 4.16, "stoneLight", [0, 0, 0], gate);
  box(11, 5.86, -4.82, 4.39, 0.13, 3.9, "slate", [0, 0, 0], gate);
  for (let x = 8.99; x < 13.2; x += 0.37)
    for (let z = -6.63; z < -3; z += 0.42)
      box(
        x,
        5.965,
        z,
        0.35,
        0.06,
        0.398,
        random() > 0.7 ? "slateLight" : "slate",
        [0, 0, 0],
        gate,
      );
  for (const z of [-6.81, -2.91]) {
    masonry(
      11,
      5.94,
      z,
      4.48,
      0.45,
      0.29,
      ["brick", "brickLight", "brickDark"],
      0.43,
      gate,
    );
    for (let x = 8.9; x < 13.3; x += 0.44)
      box(x, 6.44, z, 0.418, 0.12, 0.46, "stoneLight", [0, 0, 0], gate);
  }
  for (const x of [8.88, 13.12]) {
    sideMasonry(
      x,
      5.94,
      -4.86,
      0.29,
      0.45,
      3.77,
      ["brick", "brickLight", "brickDark"],
      gate,
      x > 11 ? 1 : -1,
    );
    for (let z = -6.63; z < -2.9; z += 0.44)
      box(x, 6.44, z, 0.46, 0.12, 0.418, "stoneLight", [0, 0, 0], gate);
  }
  const gateSide = group("watergate side recesses", gate);
  gateSide.position.set(13.22, 0, -4.85);
  gateSide.rotation.y = Math.PI / 2;
  windowAt(0, 3.5, 0.04, 0.74, 1.05, gateSide);
  for (const y of [0.25, 2.19, 5.4])
    box(13.25, y, -4.86, 0.19, 0.15, 4.16, "stoneLight", [0, 0, 0], gate);
  for (let y = 0.6; y < 5.4; y += 0.43)
    for (const z of [-6.7, -3.0])
      box(13.26, y, z, 0.17, 0.2, 0.49, "limestone", [0, 0, 0], gate);
  for (let i = 0; i < 40; i++) {
    const y = 0.5 + random() * 4.6,
      z = -3.12 - random() * 0.39;
    box(
      13.36,
      y,
      z,
      0.12,
      0.16,
      0.17,
      i % 3 ? "leaf" : "leafLight",
      [0, random(), 0],
      gate,
    );
  }
  for (let i = 0; i < 11; i++) {
    const angle = (Math.PI * i) / 10,
      x = 11 + Math.cos(angle) * 1.39,
      y = 2.55 + Math.sin(angle) * 1.4;
    box(
      x,
      y,
      -2.75,
      0.4,
      0.38,
      0.57,
      "stoneLight",
      [0, 0, angle - Math.PI / 2],
      gate,
    );
  }
  for (const x of [9.48, 12.52])
    box(x, 1.32, -2.99, 0.28, 2.64, 0.3, "stoneDark", [0, 0, 0], gate);
  for (let i = 0; i < 12; i++)
    box(
      9.6 + i * 0.255,
      1.19,
      -3.16,
      0.22,
      2.35,
      0.15,
      "patina",
      [0, 0, 0],
      gate,
    );
  for (const y of [0.4, 1.35, 2.15])
    box(11, y, -3.04, 3.15, 0.13, 0.15, "iron", [0, 0, 0], gate);
  const wheel = group("iron flywheel");
  wheel.position.set(11, 3.19, -2.36);
  ring(0, 0, 0, 1.84, 0.15, "iron", [0, 0, 0], wheel);
  ring(0, 0, 0.24, 1.84, 0.075, "ironLight", [0, 0, 0], wheel);
  ring(0, 0, 0, 1.32, 0.09, "iron", [0, 0, 0], wheel);
  cylinder(0, 0, 0.22, 0.33, 0.67, "iron", [Math.PI / 2, 0, 0], wheel, 12);
  cylinder(0, 0, 0.61, 0.18, 0.16, "brass", [Math.PI / 2, 0, 0], wheel, 10);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    line(
      [Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.08],
      [Math.sin(a) * 1.82, Math.cos(a) * 1.82, 0.08],
      0.075,
      "iron",
      wheel,
      true,
    );
    box(
      Math.sin(a) * 1.8,
      Math.cos(a) * 1.8,
      0.09,
      0.27,
      0.2,
      0.49,
      "ironLight",
      [0, 0, -a],
      wheel,
    );
    cylinder(
      Math.sin(a) * 1.83,
      Math.cos(a) * 1.83,
      0.36,
      0.043,
      0.055,
      "brass",
      [Math.PI / 2, 0, 0],
      wheel,
      6,
    );
  }
  for (let i = 0; i < 48; i++) {
    const a = (i * Math.PI) / 24;
    box(
      Math.sin(a) * 2,
      Math.cos(a) * 2,
      0,
      0.14,
      0.19,
      0.23,
      "iron",
      [0, 0, -a],
      wheel,
    );
  }
  const gear = group("pump pinion");
  gear.position.set(12.81, 1.57, -2.02);
  ring(0, 0, 0, 0.52, 0.1, "copper", [0, 0, 0], gear);
  cylinder(0, 0, 0, 0.18, 0.3, "iron", [Math.PI / 2, 0, 0], gear);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    box(
      Math.sin(a) * 0.59,
      Math.cos(a) * 0.59,
      0,
      0.15,
      0.17,
      0.22,
      "iron",
      [0, 0, -a],
      gear,
    );
    if (i % 4 === 0)
      line(
        [0, 0, 0.03],
        [Math.sin(a) * 0.49, Math.cos(a) * 0.49, 0.03],
        0.045,
        "iron",
        gear,
      );
  }
  // The exposed reduction train has meshing pitch circles and journal bearings.
  // It projects above the existing frontage, leaving the walking route unchanged.
  const gearFrame = group("waterworks reduction gear frame", gate);
  line(
    [11.0, 3.19, -2.15],
    [13.92, 4.71, -2.15],
    0.105,
    "iron",
    gearFrame,
    true,
  );
  line(
    [12.24, 2.36, -2.15],
    [12.24, 4.72, -2.15],
    0.09,
    "iron",
    gearFrame,
    true,
  );
  line(
    [13.88, 2.36, -2.15],
    [13.88, 4.92, -2.15],
    0.09,
    "iron",
    gearFrame,
    true,
  );
  line(
    [12.24, 2.36, -2.15],
    [13.88, 4.75, -2.15],
    0.071,
    "iron",
    gearFrame,
    true,
  );
  box(13.05, 2.38, -2.15, 1.94, 0.15, 0.25, "iron", [0, 0, 0], gearFrame);
  line(
    [13.88, 2.45, -2.15],
    [12.8, 2.45, -3.06],
    0.075,
    "iron",
    gearFrame,
    true,
  );
  const reductionGears = [];
  for (const [index, [x, y, r, teeth]] of [
    [11, 3.19, 0.42, 14],
    [12.23, 3.42, 0.82, 28],
    [13.6, 3.74, 0.59, 20],
    [13.88, 4.68, 0.39, 13],
  ].entries()) {
    const cog = group(`reduction gear ${index + 1}`, gate);
    cog.position.set(x, y, -1.83);
    const shape = new THREE.Shape(),
      rootRadius = r - 0.047,
      tipRadius = r + 0.042;
    for (let i = 0; i < teeth; i++)
      for (const [phase, radius] of [
        [-0.5, rootRadius],
        [-0.28, tipRadius],
        [0.28, tipRadius],
        [0.5, rootRadius],
      ]) {
        const angle = ((i + phase) * Math.PI * 2) / teeth,
          xx = Math.cos(angle) * radius,
          yy = Math.sin(angle) * radius;
        if (i === 0 && phase === -0.5) shape.moveTo(xx, yy);
        else shape.lineTo(xx, yy);
      }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, r * 0.5, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.011,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 20,
    });
    geometry(geo, "ironLight", 0, 0, 0, 1, 1, 1, [0, 0, 0], cog);
    geo.dispose();
    ring(
      0,
      0,
      0.145,
      r * 0.73,
      0.019,
      index % 2 ? "copperLight" : "brass",
      [0, 0, 0],
      cog,
    );
    for (let j = 0; j < 6; j++) {
      const angle = (j * Math.PI) / 3;
      line(
        [0, 0, 0.065],
        [Math.cos(angle) * r * 0.61, Math.sin(angle) * r * 0.61, 0.065],
        r * 0.052,
        "iron",
        cog,
        true,
      );
      cylinder(
        Math.cos(angle) * r * 0.77,
        Math.sin(angle) * r * 0.77,
        0.16,
        0.023,
        0.025,
        "brassLight",
        [Math.PI / 2, 0, 0],
        cog,
        6,
      );
    }
    cylinder(0, 0, 0.09, r * 0.19, 0.27, "iron", [Math.PI / 2, 0, 0], cog, 10);
    cylinder(
      0,
      0,
      0.246,
      r * 0.12,
      0.07,
      "brass",
      [Math.PI / 2, 0, 0],
      cog,
      10,
    );
    // The stationary bearing is fixed to the frame, rather than spinning with teeth.
    box(x, y, -2.045, r * 0.57, r * 0.56, 0.18, "iron", [0, 0, 0], gearFrame);
    for (const side of [-1, 1])
      cylinder(
        x + side * r * 0.2,
        y,
        -1.935,
        0.03,
        0.025,
        "brassLight",
        [Math.PI / 2, 0, 0],
        gearFrame,
        6,
      );
    cylinder(
      x,
      y,
      -1.99,
      r * 0.14,
      0.64,
      "copper",
      [Math.PI / 2, 0, 0],
      gearFrame,
      10,
    );
    reductionGears.push({
      group: cog,
      ratio: ((index % 2 ? -1 : 1) * 0.42) / r,
    });
  }
  for (const x of [9.33, 12.67]) {
    masonry(
      x,
      5.86,
      -5.83,
      0.59,
      1.05,
      0.6,
      ["brick", "brickLight", "brickDark"],
      0.29,
      gate,
    );
    box(x, 6.94, -5.83, 0.77, 0.12, 0.8, "stoneLight", [0, 0, 0], gate);
  }
  pot(11.45, 5.91, -5.55, 0.53, gate);
  plaque("RIVENPORT\nWATERWORKS", 11, 1.37, -2.62, 2.55, 0.65, gate);
  for (const x of [9.12, 13.12]) lantern(x, 2.06, -2.1, gate);
  line([10.04, 0.6, -1.83], [10.04, 1.3, -1.83], 0.13, "patina", gate);
  line([10.04, 1.3, -1.83], [10.65, 1.3, -1.83], 0.13, "patina", gate);
  ring(10.08, 1.57, -1.67, 0.21, 0.027, "brass", [0, 0, 0], gate);
  for (const angle of [0, Math.PI / 2])
    box(10.08, 1.57, -1.67, 0.36, 0.035, 0.035, "brass", [0, 0, angle], gate);
  // A vertical pressure vessel and reciprocating rod drive the waterworks train.
  // Its footprint stays inside the existing watergate volume.
  const gateBoiler = group("waterworks pressure vessel", gate);
  box(12.72, 0.44, -2.98, 0.91, 0.87, 0.82, "iron", [0, 0, 0], gateBoiler);
  cylinder(
    12.72,
    2.78,
    -2.98,
    0.37,
    3.75,
    "copper",
    [0, 0, 0],
    gateBoiler,
    14,
    0.35,
  );
  cylinder(
    12.72,
    4.73,
    -2.98,
    0.35,
    0.17,
    "copperLight",
    [0, 0, 0],
    gateBoiler,
    14,
    0.23,
  );
  for (const y of [1.02, 1.58, 3.34, 4.54]) {
    cylinder(
      12.72,
      y,
      -2.98,
      0.404,
      0.093,
      "ironLight",
      [0, 0, 0],
      gateBoiler,
      14,
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(
        12.72 + Math.sin(a) * 0.406,
        y,
        -2.98 + Math.cos(a) * 0.406,
        0.049,
        0.055,
        0.049,
        "brass",
        [0, a, 0],
        gateBoiler,
      );
    }
    cylinder(
      12.72,
      y + 0.055,
      -2.98,
      0.41,
      0.026,
      "brassLight",
      [0, 0, 0],
      gateBoiler,
      14,
    );
  }
  pressureGauge(12.72, 3.91, -2.593, 0.24, gateBoiler);
  box(13.01, 5.26, -2.36, 1.21, 0.64, 0.15, "iron", [0, 0, 0], gateBoiler);
  for (const x of [12.67, 13.34]) {
    line([x, 4.7, -2.72], [x, 5.25, -2.36], 0.039, "copper", gateBoiler);
    pressureGauge(x, 5.27, -2.245, 0.247, gateBoiler);
  }
  valveAt(12.72, 2.93, -2.51, 0.24, gateBoiler);
  line([12.4, 1.52, -2.72], [12.4, 3.52, -2.72], 0.035, "brass", gateBoiler);
  line([12.4, 1.77, -2.72], [12.4, 3.08, -2.72], 0.016, "water", gateBoiler);
  cylinder(
    12.01,
    0.77,
    -2.42,
    0.23,
    1.55,
    "iron",
    [0, 0, Math.PI / 2],
    gateBoiler,
    12,
  );
  for (const x of [11.27, 12.75])
    cylinder(
      x,
      0.77,
      -2.42,
      0.29,
      0.09,
      "brass",
      [0, 0, Math.PI / 2],
      gateBoiler,
      12,
    );
  const pistonRod = group("waterworks connecting rod", gate);
  box(11.73, 0.78, -2.09, 1.85, 0.07, 0.09, "ironLight", [0, 0, 0], pistonRod);
  ring(12.56, 0.78, -2.08, 0.104, 0.035, "brass", [0, 0, 0], pistonRod);
  line([12.56, 0.78, -2.08], [12.81, 1.57, -2.04], 0.052, "iron", gate);

  // An elevated steam main makes the buildings one working industrial system.
  // All crossing runs are above head height; brackets attach to existing walls.
  const steamMain = group("continuous district steam main");
  const steamRoute = [
    [-2.02, 2.91, -1.91],
    [-1.75, 3.35, -1.91],
    [-1.5, 3.42, -2.72],
    [1.14, 3.42, -2.72],
    [1.38, 3.75, -2.72],
    [1.38, 4.84, -2.72],
    [8.4, 4.84, -2.72],
    [8.71, 5.12, -2.72],
    [12.72, 5.12, -2.72],
    [12.72, 4.74, -2.98],
  ];
  for (let i = 0; i < steamRoute.length - 1; i++) {
    const a = steamRoute[i],
      b = steamRoute[i + 1];
    line(a, b, 0.115, "copper", steamMain);
    const length = Math.hypot(...b.map((value, k) => value - a[k])),
      pieces = Math.max(1, Math.floor(length / 1.5));
    for (let j = 0; j < pieces; j++) {
      const t = (j + 0.5) / pieces,
        center = a.map((value, k) => value + (b[k] - value) * t),
        direction = b.map((value, k) => (value - a[k]) / length);
      line(
        center.map((value, k) => value - direction[k] * 0.039),
        center.map((value, k) => value + direction[k] * 0.039),
        0.17,
        j % 2 ? "ironLight" : "copperLight",
        steamMain,
      );
    }
  }
  for (const x of [2.35, 4.75, 7.3]) {
    line([x, 4.84, -2.72], [x, 4.11, -2.72], 0.045, "iron", steamMain);
    box(x, 4.17, -2.72, 0.32, 0.07, 0.32, "iron", [0, 0, 0], steamMain);
    line([x - 0.3, 4.11, -2.72], [x, 4.63, -2.72], 0.035, "iron", steamMain);
  }
  line([-0.16, 3.42, -2.72], [-0.16, 1.3, -3.2], 0.07, "patina", steamMain);
  line([5.65, 4.84, -2.72], [5.65, 2.5, -2.72], 0.075, "copper", steamMain);
  line([5.65, 2.5, -2.72], [5.65, 2.5, -1.6], 0.075, "copper", steamMain);
  valveAt(1.14, 3.45, -2.5, 0.19, steamMain);
  valveAt(8.45, 4.91, -2.46, 0.23, steamMain);
  pressureGauge(4.7, 5.1, -2.64, 0.15, steamMain);
  solid(11, -4.8, 4.5, 3.5);
  solid(11, -2.9, 4.1, 0.7);
  // The waterworks discharge travels under the pedestrian street. Flush service
  // covers trace its line to the quay; no pipe or channel crosses the walkway.
  const sluice = group("under-street waterworks outfall");
  for (const z of [-1.38, 1.11, 3.55, 5.08]) {
    box(12.11, 0.033, z, 0.66, 0.034, 0.85, "iron", [0, 0, 0], sluice);
    for (let i = 0; i < 7; i++)
      box(
        12.11,
        0.058,
        z - 0.32 + i * 0.108,
        0.55,
        0.012,
        0.034,
        "ironLight",
        [0, 0, 0],
        sluice,
      );
    for (const x of [11.82, 12.4])
      box(x, 0.059, z, 0.026, 0.013, 0.75, "brass", [0, 0, 0], sluice);
  }
  box(12.11, -0.58, 6.562, 1.15, 0.83, 0.065, "woodDark", [0, 0, 0], sluice);
  for (const x of [11.44, 12.78]) {
    for (let course = 0; course < 3; course++)
      box(
        x,
        -0.84 + course * 0.245,
        6.57,
        0.24,
        0.224,
        0.29,
        course % 2 ? "limestone" : "stoneLight",
        [0, 0, 0],
        sluice,
      );
  }
  for (let i = 0; i < 11; i++) {
    const a = ((i + 0.5) * Math.PI) / 11;
    box(
      12.11 + Math.cos(a) * 0.655,
      -0.76 + Math.sin(a) * 0.655,
      6.57,
      0.19,
      0.22,
      0.32,
      i === 5 ? "stoneLight" : "limestone",
      [0, 0, a - Math.PI / 2],
      sluice,
    );
  }
  box(12.11, -0.84, 6.72, 1.29, 0.12, 0.56, "stoneDark", [0, 0, 0], sluice);
  for (const x of [11.83, 12.11, 12.39])
    box(x, -0.51, 6.609, 0.039, 0.54, 0.04, "iron", [0, 0, 0], sluice);
  for (const x of [11.45, 12.77])
    for (let i = 0; i < 5; i++)
      box(
        x,
        -0.16 - i * 0.14,
        6.754,
        0.11,
        0.11,
        0.027,
        i % 2 ? "patina" : "leaf",
        [0, 0, 0],
        sluice,
      );
  const discharge = group("falling sluice water");
  // Thin stepped ribbons fall from the mouth onto the canal at y=-.78.
  for (let i = 0; i < 8; i++) {
    const x = 11.71 + i * 0.112;
    line([x, -0.43, 6.64], [x, -0.47, 6.91], 0.043, "water", discharge, true);
    line([x, -0.47, 6.91], [x, -0.63, 7.12], 0.042, "water", discharge, true);
    line([x, -0.63, 7.12], [x, -0.77, 7.23], 0.038, "water", discharge, true);
    if (i % 3 === 0)
      line([x, -0.45, 6.72], [x, -0.57, 7.06], 0.013, "cream", discharge);
  }
  const outfallFoam = group("outfall foam");
  outfallFoam.position.set(12.11, -0.747, 7.25);
  for (let i = 0; i < 21; i++) {
    const angle = i * 2.39996,
      r = 0.13 + ((i * 7) % 17) * 0.025;
    box(
      Math.cos(angle) * r,
      0,
      Math.sin(angle) * r * 0.66,
      0.054 + (i % 3) * 0.018,
      0.012,
      0.033 + (i % 2) * 0.016,
      i % 3 ? "water" : "cream",
      [0, angle, 0],
      outfallFoam,
    );
  }

  // Street furniture makes the connected pavement feel occupied, not empty.
  for (const [x, z] of [
    [-12.7, 3.8],
    [-7, 5.52],
    [0.6, 5.49],
    [9.1, 5.44],
  ])
    lampPost(x, z);
  for (const [x, z] of [
    [-0.9, 4.55],
    [0.35, 4.72],
    [11.9, 4.82],
    [-12.3, -4.1],
  ]) {
    pot(x, 0, z, 0.28, root, true);
    solid(x, z, 0.57, 0.57);
  }
  for (const [x, z] of [
    [-1.5, 3.3],
    [7.9, 4.4],
    [-11.65, -0.45],
  ]) {
    box(x, 0.028, z, 1.05, 0.08, 0.59, "iron");
    for (let i = 0; i < 9; i++)
      box(x - 0.46 + i * 0.115, 0.074, z, 0.047, 0.015, 0.48, "ironLight");
  }
  const bicycle = group("delivery bicycle");
  bicycle.position.set(5.55, 0, 5.18);
  for (const x of [-0.65, 0.65]) {
    ring(x, 0.46, 0, 0.43, 0.034, "iron", [0, 0, 0], bicycle);
    ring(x, 0.46, 0.02, 0.37, 0.016, "ironLight", [0, 0, 0], bicycle);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      line(
        [x, 0.46, 0.015],
        [x + Math.sin(a) * 0.38, 0.46 + Math.cos(a) * 0.38, 0.015],
        0.007,
        "ironLight",
        bicycle,
      );
    }
  }
  for (const [a, b] of [
    [
      [-0.65, 0.46, 0],
      [-0.18, 0.96, 0],
    ],
    [
      [-0.18, 0.96, 0],
      [0.22, 0.46, 0],
    ],
    [
      [0.22, 0.46, 0],
      [-0.65, 0.46, 0],
    ],
    [
      [-0.18, 0.96, 0],
      [0.48, 1.03, 0],
    ],
    [
      [0.48, 1.03, 0],
      [0.22, 0.46, 0],
    ],
    [
      [0.48, 1.03, 0],
      [0.65, 0.46, 0],
    ],
  ])
    line(a, b, 0.032, "roofLight", bicycle);
  box(-0.2, 1.07, 0, 0.3, 0.09, 0.17, "woodDark", [0, 0, 0], bicycle);
  line([0.48, 1.03, 0], [0.43, 1.3, 0], 0.027, "iron", bicycle);
  line([0.43, 1.3, -0.18], [0.43, 1.3, 0.18], 0.03, "iron", bicycle);
  crate(-0.62, 0.96, 0.02, 0.45, bicycle);
  solid(5.55, 5.18, 1.8, 0.5);

  // Rooftops continue beyond the block; a working elevated tram crosses behind.
  const distant = group("extended canal city");
  const legacySkyline = group("legacy eastern city buildings", distant);
  for (let i = 0; i < 14; i++) {
    const x = -25 + i * 3.85,
      z = -19 - (i % 3) * 2.4,
      w = 2.8 + random(),
      d = 3.2 + random() * 2,
      h = 4 + random() * 5;
    const facade =
      i % 3
        ? ["stoneDark", "limestone", "stoneDark"]
        : ["brick", "brickLight", "brickDark"];
    masonry(x, 0, z, w, h, d, facade, 0.47, legacySkyline);
    sideMasonry(x + w / 2 + 0.02, 0, z, 0.045, h, d, facade, legacySkyline, 1);
    for (const yy of [0.2, h * 0.5, h])
      box(
        x,
        yy,
        z,
        w + 0.22,
        0.13,
        d + 0.22,
        "limestone",
        [0, 0, 0],
        legacySkyline,
      );
    for (let y = 1.2; y < h - 0.5; y += 1.6)
      for (let xx = -w / 2 + 0.55; xx < w / 2 - 0.2; xx += 0.94) {
        box(
          x + xx,
          y,
          z + d / 2 + 0.012,
          0.48,
          0.91,
          0.075,
          "window",
          [0, 0, 0],
          legacySkyline,
        );
        box(
          x + xx,
          y - 0.51,
          z + d / 2 + 0.085,
          0.65,
          0.12,
          0.25,
          "limestone",
          [0, 0, 0],
          legacySkyline,
        );
        box(
          x + xx,
          y,
          z + d / 2 + 0.07,
          0.04,
          0.9,
          0.05,
          "stoneLight",
          [0, 0, 0],
          legacySkyline,
        );
      }
    const cityRoof = hipRoofGeometry(w + 0.4, d + 0.32, 1.2, 0.65);
    geometry(
      cityRoof,
      "roofSlate",
      x,
      h + 0.12,
      z,
      1,
      1,
      1,
      [0, 0, 0],
      legacySkyline,
    );
    cityRoof.dispose();
    for (const dx of [-w * 0.28, w * 0.28]) {
      box(
        x + dx,
        h + 1.36,
        z - 0.55,
        0.43,
        0.95,
        0.48,
        "brick",
        [0, 0, 0],
        legacySkyline,
      );
      box(
        x + dx,
        h + 1.85,
        z - 0.55,
        0.56,
        0.13,
        0.61,
        "stoneLight",
        [0, 0, 0],
        legacySkyline,
      );
      cylinder(
        x + dx,
        h + 2.08,
        z - 0.55,
        0.115,
        0.4,
        "copper",
        [0, 0, 0],
        legacySkyline,
        8,
      );
    }
  }
  const easternRail = group("legacy eastern railway", distant);
  const easternRailSupports = group(
    "eastern railway support details",
    easternRail,
  );
  for (let i = 0; i < 10; i++) {
    const x = -23 + i * 5.2;
    box(
      x,
      2.26,
      -12.65,
      0.64,
      4.55,
      1.05,
      "stoneDark",
      [0, 0, 0],
      easternRailSupports,
    );
    box(
      x,
      4.28,
      -12.65,
      1.25,
      0.33,
      1.42,
      "limestone",
      [0, 0, 0],
      easternRailSupports,
    );
    for (const dx of [-1, 1])
      line(
        [x, 3.27, -12.7],
        [x + dx * 1.8, 4.62, -12.7],
        0.15,
        "iron",
        easternRailSupports,
      );
    if (i < 9)
      line(
        [x, 3.7, -12.74],
        [x + 5.2, 4.6, -12.74],
        0.08,
        "iron",
        easternRailSupports,
      );
    // The exposed face carries paired cast-iron knees and riveted gusset plates.
    for (const z of [-11.69, -13.61]) {
      box(x, 3.4, z, 0.21, 1.78, 0.16, "iron", [0, 0, 0], easternRailSupports);
      for (const direction of [-1, 1]) {
        line(
          [x, 2.89, z],
          [x + direction * 1.51, 4.43, z],
          0.095,
          "iron",
          easternRailSupports,
          true,
        );
        line(
          [x, 3.28, z],
          [x + direction * 0.95, 4.43, z],
          0.041,
          "ironLight",
          easternRailSupports,
          true,
        );
        box(
          x + direction * 0.26,
          3.18,
          z,
          0.48,
          0.39,
          0.075,
          "iron",
          [0, 0, direction * 0.28],
          easternRailSupports,
        );
        for (let j = 0; j < 3; j++)
          cylinder(
            x + direction * (0.12 + j * 0.13),
            3.11 + j * 0.11,
            z + 0.062,
            0.026,
            0.03,
            "brass",
            [Math.PI / 2, 0, 0],
            easternRailSupports,
            6,
          );
      }
      box(x, 4.39, z, 3.33, 0.16, 0.23, "iron", [0, 0, 0], easternRailSupports);
      if (i < 9) {
        const archStart = x + 0.53,
          span = 4.14;
        for (let j = 0; j < 12; j++) {
          const t = j / 12,
            next = (j + 1) / 12,
            ay = 3.34 + 1.08 * Math.sin(t * Math.PI),
            by = 3.34 + 1.08 * Math.sin(next * Math.PI);
          line(
            [archStart + t * span, ay, z],
            [archStart + next * span, by, z],
            0.071,
            "iron",
            easternRailSupports,
            true,
          );
          if (j % 2 === 1)
            line(
              [archStart + t * span, ay, z],
              [archStart + t * span, 4.49, z],
              0.028,
              "ironLight",
              easternRailSupports,
            );
        }
      }
    }
  }
  for (const batch of batches.values()) {
    if (batch.parent === easternRailSupports)
      for (const geo of batch.geometries)
        alignRailSupportGeometry(geo, () => -12.65);
  }
  addRailRunningSurface(
    -25,
    RAILWAY.endX,
    (geo, mat) => {
      geometry(geo, mat, 0, 0, 0, 1, 1, 1, [0, 0, 0], easternRail);
      geo.dispose();
    },
    (...args) => box(...args, easternRail),
    (x, y, z, r, h, mat) =>
      cylinder(x, y, z, r, h, mat, [0, 0, 0], easternRail),
    (a, b, r, mat) => line(a, b, r, mat, easternRail),
  );
  const tram = group("canal tram");
  tram.position.set(2, RAILWAY.headY + 0.06, -12.65);
  box(0, 0.82, 0, 4.53, 1.39, 1.26, "roof", [0, 0, 0], tram);
  box(0, 1.63, 0, 4.83, 0.2, 1.55, "slate", [0, 0, 0], tram);
  for (const y of [0.22, 0.65, 1.41])
    box(0, y, 0.656, 4.58, 0.06, 0.06, "brass", [0, 0, 0], tram);
  for (let i = 0; i < 7; i++) {
    box(
      -1.88 + i * 0.63,
      1.03,
      0.66,
      0.47,
      0.58,
      0.035,
      "warm",
      [0, 0, 0],
      tram,
    );
    box(
      -1.88 + i * 0.63,
      1.03,
      0.695,
      0.03,
      0.59,
      0.015,
      "woodDark",
      [0, 0, 0],
      tram,
    );
  }
  for (const x of [-2.285, 2.285]) {
    box(x, 1.04, 0, 0.035, 0.62, 0.96, "window", [0, 0, 0], tram);
    box(x, 0.49, 0.35, 0.065, 0.15, 0.18, "warm", [0, 0, 0], tram);
  }
  const tramWheels = [];
  const tramAxles = ["rear", "front"].map((end, index) => {
    const axle = group(`tram ${end} axle`, tram);
    axle.position.set(((index ? 1 : -1) * RAILWAY.wheelBase) / 2, 0.15, 0);
    cylinder(0, 0, 0, 0.034, 1.14, "iron", [Math.PI / 2, 0, 0], axle, 16);
    for (const [side, z] of [
      ["left", -RAILWAY.gauge / 2],
      ["right", RAILWAY.gauge / 2],
    ]) {
      const rolling = group(`tram ${end} ${side} wheel`, axle);
      rolling.position.z = z;
      cylinder(
        0,
        0,
        0,
        RAILWAY.wheelRadius,
        0.12,
        "iron",
        [Math.PI / 2, 0, 0],
        rolling,
        24,
      );
      tramWheels.push(rolling);
    }
    return axle;
  });
  function setTramPose(time) {
    const pose = tramPoseAt(railKeyframe ?? time),
      c = Math.cos(pose.yaw),
      s = Math.sin(pose.yaw);
    tram.position.set(pose.position.x, pose.position.y, pose.position.z);
    tram.rotation.y = pose.yaw;
    pose.axles.forEach((p, index) => {
      const dx = p.position.x - pose.position.x,
        dz = p.position.z - pose.position.z;
      tramAxles[index].position.set(
        c * dx - s * dz,
        p.position.y - pose.position.y,
        s * dx + c * dz,
      );
      tramAxles[index].rotation.y = p.yaw - pose.yaw;
    });
    for (const wheel of tramWheels) wheel.rotation.z = pose.wheelAngle;
  }
  setTramPose(0);
  line([-0.45, 1.77, 0], [0, 2.17, 0], 0.026, "iron", tram);
  line([0, 2.17, 0], [0.45, 1.77, 0], 0.026, "iron", tram);

  // A fine, brass-lit airship silhouette, authored from tapered hull sections.
  const airship = group("distant brass airship");
  airship.position.set(2.5, 11.4, -10.8);
  const hullRadius = [0.16, 0.47, 0.69, 0.83, 0.9, 0.91, 0.87, 0.76, 0.55, 0.2];
  for (let i = 0; i < hullRadius.length - 1; i++)
    cylinder(
      -3.05 + (i + 0.5) * 0.68,
      0,
      0,
      hullRadius[i],
      0.69,
      "stoneDark",
      [0, 0, -Math.PI / 2],
      airship,
      12,
      hullRadius[i + 1],
    );
  for (let i = 1; i < 9; i++)
    ring(
      -3.05 + i * 0.68,
      0,
      0,
      hullRadius[i] + 0.015,
      0.021,
      "brass",
      [0, Math.PI / 2, 0],
      airship,
    );
  box(0.3, -1.1, 0, 1.42, 0.29, 0.38, "woodDark", [0, 0, 0], airship);
  for (const x of [-0.27, 0.08, 0.43, 0.78])
    box(x, -1.06, 0.202, 0.2, 0.14, 0.025, "warm", [0, 0, 0], airship);
  for (const x of [-0.35, 0.83])
    line([x, -0.51, 0], [x, -1, 0], 0.021, "iron", airship);
  box(-3.19, 0.26, 0, 0.67, 1.05, 0.055, "slate", [0, 0, -0.2], airship);
  box(-3.19, 0, 0, 0.67, 0.055, 1.25, "slate", [0, 0.13, 0], airship);

  // Independent story appliance. Dynamic transforms never rebuild scene geometry.
  const kettle = group("Molly’s brass kettle");
  const kettleParts = {
    body: group("kettle body", kettle),
    lid: group("kettle lid", kettle),
    spout: group("kettle spout", kettle),
  };
  const kettleHome = new THREE.Vector3(-6.24, 1.435, -1.46),
    kettleDelivered = new THREE.Vector3(5.61, 1.375, 1.11);
  kettle.position.copy(kettleHome);
  cylinder(
    0,
    0.2,
    0,
    0.235,
    0.33,
    "brass",
    [0, 0, 0],
    kettleParts.body,
    14,
    0.205,
  );
  cylinder(0, 0.05, 0, 0.25, 0.07, "copper", [0, 0, 0], kettleParts.body, 14);
  cylinder(
    0,
    0.39,
    0,
    0.213,
    0.065,
    "brassLight",
    [0, 0, 0],
    kettleParts.lid,
    14,
    0.145,
  );
  cylinder(0, 0.46, 0, 0.07, 0.08, "woodDark", [0, 0, 0], kettleParts.lid, 10);
  ring(0, 0.37, -0.015, 0.3, 0.044, "woodDark", [0, 0, 0], kettle, Math.PI);
  for (const x of [-0.29, 0.29])
    cylinder(
      x,
      0.3,
      -0.015,
      0.055,
      0.06,
      "brass",
      [Math.PI / 2, 0, 0],
      kettle,
      8,
    );
  const spout = [
    [-0.2, 0.14, 0.01],
    [-0.34, 0.18, 0.01],
    [-0.43, 0.29, 0.01],
    [-0.47, 0.42, 0.01],
    [-0.58, 0.46, 0.01],
  ];
  for (let i = 0; i < spout.length - 1; i++)
    line(
      spout[i],
      spout[i + 1],
      0.056 - i * 0.005,
      "brassLight",
      kettleParts.spout,
    );
  cylinder(
    -0.59,
    0.46,
    0.01,
    0.043,
    0.029,
    "woodDark",
    [0, 0, Math.PI / 2],
    kettleParts.spout,
    10,
  );
  ring(
    0.224,
    0.16,
    0,
    0.047,
    0.012,
    "copper",
    [0, Math.PI / 2, 0],
    kettleParts.body,
  );
  const patch = group("new gasket", kettle);
  ring(0.236, 0.16, 0, 0.047, 0.018, "woodDark", [0, Math.PI / 2, 0], patch);
  patch.visible = false;
  const cup = group("repair water cup");
  cup.position.set(-6.88, 1.43, -0.84);
  cylinder(0, 0.075, 0, 0.107, 0.15, "cream", [0, 0, 0], cup, 12, 0.13);
  cylinder(0, 0.155, 0, 0.113, 0.012, "water", [0, 0, 0], cup, 12);
  ring(0.135, 0.085, 0, 0.065, 0.016, "cream", [0, 0, 0], cup);
  const drops = [];
  for (let i = 0; i < 5; i++) {
    const drop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.025, 0),
      materials.water,
    );
    root.add(drop);
    drops.push(drop);
  }
  const feedback = group("repair glint", kettle);
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    box(
      Math.cos(a) * 0.43,
      0.27 + Math.sin(a) * 0.28,
      0.04,
      0.018,
      0.1,
      0.02,
      "brassLight",
      [0, 0, a],
      feedback,
    );
  }
  feedback.visible = false;
  const steam = [];
  const steamMaterial = new THREE.MeshBasicMaterial({
    color: "#eee8d9",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (let i = 0; i < 8; i++) {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.055, 0),
      steamMaterial,
    );
    root.add(puff);
    steam.push(puff);
  }

  // Background tones are independent copies: hero masonry and appliance finishes
  // retain their full warmth while distant streets sit behind the repair house.
  const subduedMaterials = Object.fromEntries(
    Object.entries(materials).map(([name, material]) => {
      const muted = material.clone();
      muted.onBeforeCompile = material.onBeforeCompile;
      muted.customProgramCacheKey = material.customProgramCacheKey;
      muted.color.lerp(new THREE.Color("#667778"), 0.29).multiplyScalar(0.77);
      return [name, muted];
    }),
  );
  const bankMaterials = Object.fromEntries(
    Object.entries(materials).map(([name, material]) => {
      const muted = material.clone();
      muted.onBeforeCompile = material.onBeforeCompile;
      muted.customProgramCacheKey = material.customProgramCacheKey;
      muted.color.lerp(new THREE.Color("#686f63"), 0.2).multiplyScalar(0.79);
      return [name, muted];
    }),
  );
  function inside(parent, ancestor) {
    for (let item = parent; item; item = item.parent)
      if (item === ancestor) return true;
    return false;
  }
  // Bake static facade groups together; keep only moving or hideable assemblies separate.
  const movable = new Set([
    legacyWorkshop,
    legacySoup,
    legacySkyline,
    bridge,
    gate,
    roof,
    wheel,
    gear,
    pistonRod,
    gearFrame,
    gateBoiler,
    easternRail,
    tram,
    ...tramAxles,
    ...tramWheels,
    airship,
    hoursSign,
    kettle,
    discharge,
    outfallFoam,
    ...Object.values(kettleParts),
    patch,
    feedback,
    ...linens,
    ...reductionGears.map((item) => item.group),
  ]);
  root.updateMatrixWorld(true);
  const consolidated = new Map();
  let primitiveCount = 0;
  for (const { parent, mat, geometries } of batches.values()) {
    primitiveCount += geometries.length;
    let anchor = parent;
    while (anchor !== root && !movable.has(anchor)) anchor = anchor.parent;
    const palette = inside(parent, distant)
      ? subduedMaterials
      : inside(parent, banks)
        ? bankMaterials
        : materials;
    const material = palette[mat],
      key = `${anchor.uuid}:${material.uuid}`;
    const local = new THREE.Matrix4()
      .copy(anchor.matrixWorld)
      .invert()
      .multiply(parent.matrixWorld);
    if (!consolidated.has(key))
      consolidated.set(key, { anchor, material, geometries: [] });
    for (const geo of geometries)
      consolidated.get(key).geometries.push(geo.applyMatrix4(local));
  }
  for (const { anchor, material, geometries } of consolidated.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${anchor.name}: static surfaces`;
    anchor.add(mesh);
    for (const geo of geometries) geo.dispose();
  }
  unitBox.dispose();
  let currentState = {},
    lastStep = -1,
    lastDelivered = false,
    feedbackUntil = 0,
    elapsed = 0;
  function setState(state = {}) {
    const step = state.repairStep ?? 0,
      delivered = Boolean(state.delivered);
    if (step !== lastStep || delivered !== lastDelivered)
      feedbackUntil = elapsed + 1.5;
    currentState = state;
    lastStep = step;
    lastDelivered = delivered;
    patch.visible = step >= 2;
    kettle.position.copy(delivered ? kettleDelivered : kettleHome);
    kettle.rotation.set(0, delivered ? -0.4 : 0, 0);
  }
  function update(time, dt = 1 / 60, state = currentState) {
    elapsed = time;
    if (
      state !== currentState ||
      (state.repairStep ?? 0) !== lastStep ||
      Boolean(state.delivered) !== lastDelivered
    )
      setState(state);
    const step = state.repairStep ?? 0,
      delivered = Boolean(state.delivered);
    // The post-delivery hesitation is deliberate: the next chapter's watergate clue.
    const phase = time % 8.6,
      pause = delivered && !state.pumpRestored && phase > 5.7 && phase < 6.6;
    wheel.rotation.z -= pause ? 0 : dt * 0.18;
    gear.rotation.z += pause ? 0 : dt * 0.58;
    reductionGears.forEach(({ group: cog, ratio }) => {
      cog.rotation.z = wheel.rotation.z * ratio;
    });
    discharge.scale.x = 1 + Math.sin(time * 2.1) * 0.006;
    outfallFoam.scale.set(
      1 + Math.sin(time * 1.31) * 0.09,
      1,
      1 + Math.cos(time * 1.08) * 0.09,
    );
    pistonRod.position.x = Math.sin(gear.rotation.z) * 0.16;
    setTramPose(time);
    airship.position.x = 2.5 + Math.sin(time * 0.025) * 4.5;
    airship.position.y = 11.4 + Math.sin(time * 0.13) * 0.08;
    linens.forEach((cloth, i) => {
      cloth.rotation.x = Math.sin(time * 1.4 + i * 0.7) * 0.065;
      cloth.rotation.z = Math.sin(time * 0.7 + i) * 0.027;
    });
    hoursSign.rotation.y = THREE.MathUtils.damp(
      hoursSign.rotation.y,
      state.chapterComplete ? Math.PI : 0,
      4,
      dt,
    );
    hoursSign.rotation.z = Math.sin(time * 1.07) * 0.016;
    if (!delivered && step === 3)
      kettle.rotation.z =
        Math.sin(
          (Math.min(Math.max(0, 1.5 - (feedbackUntil - time)), 1.5) / 1.5) *
            Math.PI,
        ) * 0.48;
    else kettle.rotation.z = 0;
    feedback.visible = time < feedbackUntil && step >= 2;
    feedback.rotation.z = time * 0.6;
    drops.forEach((drop, i) => {
      const progress = (time * 1.2 + i * 0.21) % 1;
      drop.visible = step < 2 && !delivered;
      drop.position.set(
        kettleHome.x + 0.25,
        kettleHome.y + 0.17 - progress * 0.67,
        kettleHome.z + 0.03,
      );
      drop.scale.set(0.7, 1.25 + progress * 0.6, 0.7);
    });
    steam.forEach((puff, i) => {
      const p = (time * 0.3 + i / 8) % 1;
      puff.position.set(
        5.66 + Math.sin(p * 5 + i) * 0.09,
        1.97 + p * 0.9,
        0.96 + Math.cos(p * 4 + i) * 0.07,
      );
      puff.scale.setScalar(0.45 + p * 1.3);
      puff.visible = p < 0.93;
    });
  }
  setState({ repairStep: 0, delivered: false });
  root.userData.primitiveCount = primitiveCount;
  return {
    root,
    installTransport(asset) {
      easternRail.visible = false;
      tram.visible = false;
      airship.visible = false;
      root.add(asset);
    },
    getRailwayState() {
      tram.updateWorldMatrix(true, true);
      return {
        position: tram.position.toArray(),
        yaw: tram.rotation.y,
        axles: tramAxles.map((axle) => ({
          name: axle.name,
          position: axle.getWorldPosition(new THREE.Vector3()).toArray(),
          yaw: tram.rotation.y + axle.rotation.y,
        })),
        wheelAngles: tramWheels.map((wheel) => ({
          name: wheel.name,
          angle: wheel.rotation.z,
        })),
      };
    },
    replaceSkyline() {
      legacySkyline.visible = false;
    },
    replaceBridge(asset) {
      bridge.visible = false;
      root.add(asset);
    },
    installWatergate(asset) {
      // Keep the animated transmission and its bearings when replacing the shell.
      for (const part of [
        gearFrame,
        gateBoiler,
        pistonRod,
        ...reductionGears.map((cog) => cog.group),
      ])
        root.attach(part);
      gate.visible = false;
      root.add(asset);
    },
    installSoup(asset) {
      legacySoup.visible = false;
      root.add(asset);
    },
    installWorkshop(asset) {
      legacyWorkshop.visible = false;
      workshopAsset = asset;
      root.add(asset);
    },
    obstacles,
    kettle,
    kettleParts,
    update,
    setState,
    setWorkshopFocus(active) {
      roof.visible = !active;
      // The authored bench sits at street level; only its front panels obscure it.
      const storefront = workshopAsset?.getObjectByName("Workshop_Storefront");
      if (storefront) storefront.visible = !active;
    },
    spots: {
      workbench: { x: -6.3, z: 1 },
      orders: { x: -10.2, z: 2.2 },
      molly: { x: 5.3, z: 3.5 },
      pump: { x: 10.2, z: 0.2 },
      laundry: { x: 0.25, z: -0.55 },
    },
  };
}
