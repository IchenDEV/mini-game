import { loadModelWithLOD, splitInstanceBatches } from "./model-lod.js";
import { createBoundaryCopingGeometry } from "./expansion-boundaries.js";
import {
  createExpansionPavingGeometry,
  createExpansionLandscapeGeometry,
} from "./expansion-paving.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { finishAuthoredModel } from "./sculpted-workshop.js";
import {
  EXPANSION_SCENES,
  EXPANSION_BUILDINGS,
  EXPANSION_ROADS,
  EXPANSION_BOUNDARIES,
  EXPANSION_STREET_PROPS,
  EXPANSION_GARDENS,
  buildingPoint,
  buildingLocal,
  expansionBuildingAt,
  expansionSurfaceAt,
} from "./expansion-layout.js";

export async function createExpansionWorld(scene, ground) {
  const loader = new GLTFLoader();
  const [exteriors, interiors, trees, streetProps] = await Promise.all([
    loadModelWithLOD(loader, "./models/expansion-buildings-v1.glb", "./models/expansion-buildings-v1-lod.glb"),
    loader.loadAsync("./models/expansion-interiors-v1.glb"),
    loadModelWithLOD(loader, "./models/trees-v1.glb", "./models/trees-v1-lod.glb"),
    loader.loadAsync("./models/street-life-props-v1.glb"),
  ]);
  const root = new THREE.Group();
  root.name = "Ten living city quarters";
  scene.add(root);
  const floorRoot = new THREE.Group();
  root.add(floorRoot);
  const texture = new THREE.TextureLoader().load("./textures/limestone.png");
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const stone = new THREE.MeshStandardMaterial({
    color: 0x8c8b78,
    map: texture,
    roughness: 0.9,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x273631,
    metalness: 0.65,
    roughness: 0.52,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0x9e7740,
    metalness: 0.8,
    roughness: 0.38,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x625345,
    roughness: 0.88,
  });
  const floorWoodMap = new THREE.TextureLoader().load(
    "./textures/wood-table-diff.jpg",
  );
  floorWoodMap.colorSpace = THREE.SRGBColorSpace;
  floorWoodMap.wrapS = floorWoodMap.wrapT = THREE.RepeatWrapping;
  floorWoodMap.repeat.set(1, 1);
  const floorWood = new THREE.MeshStandardMaterial({
    map: floorWoodMap,
    color: 0x987653,
    roughness: 0.84,
    vertexColors: true,
  });
  // Individual 22 cm boards share one geometry and material across the rooms.
  const boards = [];
  for (let row = 0; row < 28; row++) {
    const width = 6.25 / 28;
    for (let column = -1; column < 5; column++) {
      const start = Math.max(
        -3.625,
        -3.625 + column * 1.82 + (row % 3) * 0.607,
      );
      const end = Math.min(
        3.625,
        -3.625 + (column + 1) * 1.82 + (row % 3) * 0.607,
      );
      if (end - start < 0.01) continue;
      const board = new THREE.PlaneGeometry(end - start - 0.007, width - 0.009);
      board.rotateX(-Math.PI / 2);
      board.translate((start + end) / 2, 0.033, -3.125 + (row + 0.5) * width);
      const tone = 0.86 + ((row * 7 + column * 13 + 100) % 11) * 0.014;
      const colors = new Float32Array(board.attributes.position.count * 3).fill(
        tone,
      );
      board.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      boards.push(board);
    }
  }
  const roomFloorGeometry = mergeGeometries(boards, false);
  boards.forEach((board) => board.dispose());
  const floorJoints = new THREE.MeshStandardMaterial({
    color: 0x30271e,
    roughness: 1,
  });
  const batches = new Map();
  function add(g, material) {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(g);
  }
  function box(p, size, mat) {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...p);
    add(g, mat);
  }
  function rod(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(
      new THREE.Vector3(...b),
      new THREE.Vector3(...a),
    );
    const g = new THREE.CylinderGeometry(r, r, d.length(), 6);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.normalize(),
      ),
    );
    g.translate(...a.map((v, i) => (v + b[i]) / 2));
    add(g, mat);
  }
  for (const s of EXPANSION_SCENES) {
    // Public benches stay outside the entrance and central route.
    for (const dx of [-1.55, 1.55]) {
      for (let k = 0; k < 3; k++)
        box(
          [s.x + dx, s.height + 0.47, s.z + 6.75 + k * 0.13],
          [1.55, 0.065, 0.1],
          wood,
        );
      for (const x of [-0.6, 0.6])
        rod(
          [s.x + dx + x, s.height, s.z + 6.9],
          [s.x + dx + x, s.height + 0.45, s.z + 6.9],
          0.04,
          iron,
        );
    }
  }
  for (const r of EXPANSION_ROADS.filter((road) => road.stairs)) {
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      length = Math.hypot(dx, dz),
      nx = -dz / length,
      nz = dx / length;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const t0 = i / count,
        t1 = (i + 1) / count;
      const y0 = r.a[2] + (r.b[2] - r.a[2]) * (r.stairs ? t1 : t0),
        y1 = r.a[2] + (r.b[2] - r.a[2]) * t1;
      const a = [r.a[0] + dx * t0, y0, r.a[1] + dz * t0],
        b = [r.a[0] + dx * t1, y1, r.a[1] + dz * t1],
        w = r.width / 2;
      // Nosings share the exact eighteen tread heights.
      if (r.stairs) {
        rod(
          [a[0] - nx * w, a[1] - 0.05, a[2] - nz * w],
          [a[0] + nx * w, a[1] - 0.05, a[2] + nz * w],
          0.07,
          stone,
        );
      }
    }
  }
  add(createBoundaryCopingGeometry(EXPANSION_BOUNDARIES), stone);
  const emittedPosts = new Set();
  for (const edge of EXPANSION_BOUNDARIES) {
    const dx = edge.b[0] - edge.a[0],
      dz = edge.b[2] - edge.a[2];
    const length = Math.hypot(dx, dz);
    if (edge.kind === "court") {
      const wallHeight = Math.max(0.45, edge.a[1] + 0.3);
      const wall = new THREE.BoxGeometry(length, wallHeight, 0.38);
      wall.rotateY(-Math.atan2(dz, dx));
      wall.translate(
        (edge.a[0] + edge.b[0]) / 2,
        edge.a[1] - wallHeight / 2,
        (edge.a[2] + edge.b[2]) / 2,
      );
      add(wall, stone);
    } else if (!edge.stairs) {
      rod(
        [edge.a[0], edge.a[1] + 0.08, edge.a[2]],
        [edge.b[0], edge.b[1] + 0.08, edge.b[2]],
        0.065,
        stone,
      );
    }
    if (edge.railing) {
      rod(
        [edge.a[0], edge.a[1] + 0.95, edge.a[2]],
        [edge.b[0], edge.b[1] + 0.95, edge.b[2]],
        0.026,
        iron,
      );
      const posts = Math.max(1, Math.ceil(length / 1.5));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts,
          x = edge.a[0] + dx * t,
          z = edge.a[2] + dz * t;
        const height = edge.a[1] + (edge.b[1] - edge.a[1]) * t;
        const floor =
          expansionSurfaceAt(
            x + edge.inward[0] * 0.04,
            z + edge.inward[1] * 0.04,
          )?.height ?? height;
        const key = [x, floor, z, height]
          .map((v) => Math.round(v * 1000))
          .join(",");
        if (!emittedPosts.has(key)) {
          emittedPosts.add(key);
          rod([x, floor + 0.015, z], [x, height + 0.95, z], 0.033, iron);
        }
      }
    }
  }
  const mergedFloor = new THREE.Mesh(
    createExpansionPavingGeometry(),
    ground.floorMaterial,
  );
  mergedFloor.receiveShadow = true;
  mergedFloor.userData.walkSurface = true;
  floorRoot.add(mergedFloor);
  ground.registerFloor(mergedFloor);
  for (const g of EXPANSION_GARDENS) {
    const cx = (g.x0 + g.x1) / 2,
      cz = (g.z0 + g.z1) / 2;
    for (const z of [g.z0, g.z1])
      box([cx, g.height + 0.04, z], [g.x1 - g.x0, 0.13, 0.15], stone);
    for (const x of [g.x0, g.x1])
      box([x, g.height + 0.04, cz], [0.15, 0.13, g.z1 - g.z0], stone);
  }
  for (const [mat, geometries] of batches) {
    const mesh = new THREE.Mesh(
      mergeGeometries(
        geometries.map((g) => (g.index ? g.toNonIndexed() : g)),
        false,
      ),
      mat,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  // A sloped soil surface supports the courtyards, instead of floating rectangular islands.
  const land = createExpansionLandscapeGeometry();
  const grassMap = new THREE.TextureLoader().load("./textures/grass-diff.jpg");
  grassMap.colorSpace = THREE.SRGBColorSpace;
  grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.repeat.set(1, 1);
  const landMesh = new THREE.Mesh(
    land,
    new THREE.MeshStandardMaterial({
      map: grassMap,
      color: 0x65745c,
      roughness: 1,
    }),
  );
  landMesh.receiveShadow = true;
  root.add(landMesh);
  const outerGround = new THREE.PlaneGeometry(600, 300);
  outerGround.rotateX(-Math.PI / 2);
  outerGround.translate(-10, -0.02, 204);
  for (let i = 0; i < outerGround.attributes.uv.count; i++)
    outerGround.attributes.uv.setXY(
      i,
      outerGround.attributes.position.getX(i) / 4.4,
      outerGround.attributes.position.getZ(i) / 4.4,
    );
  const horizonGround = new THREE.Mesh(outerGround, landMesh.material);
  horizonGround.receiveShadow = true;
  root.add(horizonGround);

  for (const name of new Set(EXPANSION_STREET_PROPS.map((p) => p.model))) {
    const source = streetProps.scene.getObjectByName(name);
    if (!source) throw Error(`Missing street asset ${name}`);
    source.updateMatrixWorld(true);
    const inverse = source.matrixWorld.clone().invert(),
      placements = EXPANSION_STREET_PROPS.filter((p) => p.model === name);
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const local = inverse.clone().multiply(mesh.matrixWorld),
        copies = new THREE.InstancedMesh(
          mesh.geometry,
          mesh.material,
          placements.length,
        ),
        pose = new THREE.Object3D();
      placements.forEach((p, i) => {
        pose.position.set(p.x, p.height, p.z);
        pose.updateMatrix();
        copies.setMatrixAt(i, pose.matrix.clone().multiply(local));
      });
      copies.castShadow = true;
      copies.receiveShadow = true;
      root.add(copies);
    });
  }
  const gardenSoil = new THREE.MeshStandardMaterial({
    map: grassMap,
    bumpMap: grassMap,
    bumpScale: 0.07,
    color: 0x6b7150,
    roughness: 1,
  });
  const yardSoil = new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.045,
    color: 0x716858,
    roughness: 1,
  });
  for (const g of EXPANSION_GARDENS) {
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(g.x1 - g.x0, g.z1 - g.z0),
      g.service ? yardSoil : gardenSoil,
    );
    const bedUV = bed.geometry.attributes.uv;
    for (let i = 0; i < bedUV.count; i++)
      bedUV.setXY(
        i,
        (bedUV.getX(i) * (g.x1 - g.x0)) / 1.6,
        (bedUV.getY(i) * (g.z1 - g.z0)) / 1.6,
      );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set((g.x0 + g.x1) / 2, g.height - 0.025, (g.z0 + g.z1) / 2);
    bed.receiveShadow = true;
    root.add(bed);
  }
  // Planted borders and working yards have different uses, kept behind the public route.
  const paleStones = [];
  const shrubSource = trees.scene.getObjectByName("Tree_Hornbeam");
  shrubSource.updateMatrixWorld(true);
  const shrubInverse = shrubSource.matrixWorld.clone().invert();
  for (const [index, g] of EXPANSION_GARDENS.entries()) {
    if (g.service) {
      for (let i = 0; i < 3; i++) {
        const source = streetProps.scene.getObjectByName(
          i === 0 ? "Street_CrateStack" : "Street_AshBox",
        );
        const prop = source.clone(true);
        prop.position.set(
          g.x0 + 0.8 + (i % 2) * 1.5,
          g.height,
          g.z0 + 1.1 + i * 1.3,
        );
        prop.rotation.y = index * 0.35 + i * 0.22;
        root.add(prop);
      }
      continue;
    }
    const shrubPoses = [];
    for (let i = 0; i < 9; i++) {
      const x = g.x0 + 0.6 + ((i % 3) * (g.x1 - g.x0 - 1.2)) / 2;
      const z = g.z0 + 0.6 + Math.floor(i / 3) * 2.45;
      const pose = new THREE.Object3D();
      pose.position.set(x, g.height - 0.3, z);
      pose.scale.set(0.32 + (i % 2) * 0.055, 0.22 + (i % 3) * 0.035, 0.34);
      pose.rotation.y = i * 1.73 + index * 0.4;
      pose.updateMatrix();
      shrubPoses.push(pose.matrix.clone());
      if (index < 2 && i % 3 === 1) {
        const marker = new THREE.BoxGeometry(0.5, 0.72, 0.12);
        marker.translate(x, g.height + 0.36, z + 0.58);
        paleStones.push(marker);
      }
    }
    // Use the authored leaf clusters, with the tree trunk omitted for low planting.
    shrubSource.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material.name.includes("foliage")) return;
      const local = shrubInverse.clone().multiply(mesh.matrixWorld);
      const shrubs = new THREE.InstancedMesh(
        mesh.geometry,
        mesh.material,
        shrubPoses.length,
      );
      shrubPoses.forEach((pose, i) =>
        shrubs.setMatrixAt(i, pose.clone().multiply(local)),
      );
      shrubs.castShadow = shrubs.receiveShadow = true;
      shrubs.computeBoundingSphere();
      root.add(shrubs);
    });
  }
  for (const [parts, material] of [[paleStones, stone]]) {
    if (!parts.length) continue;
    const plants = new THREE.Mesh(mergeGeometries(parts, false), material);
    plants.castShadow = plants.receiveShadow = true;
    root.add(plants);
    parts.forEach((part) => part.dispose());
  }
  const signNames = [
    "ST CANDLE",
    "VICARAGE",
    "CHOIR SCHOOL",
    "RIVERBEND INFIRMARY",
    "APOTHECARY",
    "STEAM LAUNDRY",
    "THE COPPER STAG",
    "STAG BREWERY",
    "LANTERN THEATRE",
    "IRON ARCADE",
    "BAKER & SONS",
    "FRESH FISH",
    "CARRIAGE OFFICE",
    "LIVERY STABLES",
    "WHEELWRIGHT",
    "ASH COLLECTION",
    "OLD & USEFUL",
    "PUBLIC WASHHOUSE",
    "ROYAL POST",
    "THE DAILY PRESS",
    "BOOKBINDER",
    "PRECISION INSTRUMENTS",
    "CLOCKMAKER",
    "APPRENTICES LODGING",
    "BONDED WAREHOUSE",
    "CUSTOMS HOUSE",
    "ROPE & SAIL",
    "WINTER GARDEN",
    "WEATHER OBSERVATORY",
    "GARDENERS COTTAGE",
  ];
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 2048;
  signCanvas.height = 1024;
  const ink = signCanvas.getContext("2d");
  signNames.forEach((name, i) => {
    const x = (i % 4) * 512,
      y = Math.floor(i / 4) * 128;
    ink.fillStyle = "#203b34";
    ink.fillRect(x, y, 512, 128);
    ink.strokeStyle = "#ac8854";
    ink.lineWidth = 3;
    ink.strokeRect(x + 9, y + 9, 494, 110);
    ink.fillStyle = "#e2ce9f";
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.font = "bold 32px Georgia";
    ink.fillText(name, x + 256, y + 66, 472);
  });
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshStandardMaterial({
    map: signTexture,
    roughness: 0.8,
  });
  const buildings = [],
    vents = [];
  for (const b of EXPANSION_BUILDINGS) {
    const shell = exteriors.scene.getObjectByName(b.id),
      room = interiors.scene.getObjectByName(`Interior_${b.id}`);
    if (!shell || !room)
      throw Error(`Missing authored expansion building ${b.id}`);
    for (const outlet of shell.userData.vents ?? []) {
      const point = buildingPoint(b, outlet[0], outlet[2]);
      vents.push([
        point.x,
        b.height + outlet[1],
        point.z,
        0.52 + (Number(b.id.slice(1)) % 4) * 0.14,
      ]);
    }
    const holder = new THREE.Group();
    holder.position.set(b.x, b.height, b.z);
    holder.rotation.y = b.yaw;
    shell.removeFromParent();
    room.removeFromParent();
    holder.add(shell, room);
    root.add(holder);
    const signIndex = Number(b.id.slice(1)) - 1,
      signGeometry = new THREE.PlaneGeometry(3.05, 0.65),
      signUV = signGeometry.attributes.uv;
    for (let i = 0; i < signUV.count; i++)
      signUV.setXY(
        i,
        ((signIndex % 4) + signUV.getX(i)) / 4,
        1 - (Math.floor(signIndex / 4) + 1 - signUV.getY(i)) / 8,
      );
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(0, 3.06, 3.512);
    shell.getObjectByName(`${b.id}_Front`).add(sign);
    finishAuthoredModel(holder);
    const fading = [];
    const cutMask = new THREE.Plane(new THREE.Vector3(0, 0, -1), -1e6);
    const cutPlane = new THREE.Plane(
      new THREE.Vector3(0, -1, 0),
      b.height + 20,
    );
    shell.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.clippingPlanes = [cutPlane, cutMask];
        m.clipIntersection = true;
      }
    });
    for (const suffix of ["Roof", "Front"])
      shell.getObjectByName(`${b.id}_${suffix}`)?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => {
          m.userData.originalOpacity = m.opacity;
          m.clippingPlanes = [cutPlane, cutMask];
          m.clipIntersection = true;
        });
        fading.push(o);
      });
    // Room flooring reads as warm dry timber, bounded inside the real exterior walls.
    const floor = new THREE.Mesh(roomFloorGeometry, floorWood);
    const subfloor = new THREE.Mesh(
      new THREE.BoxGeometry(7.25, 0.025, 6.25),
      floorJoints,
    );
    subfloor.position.y = 0.016;
    holder.add(subfloor);
    floor.receiveShadow = true;
    holder.add(floor);
    floor.userData.walkSurface = true;
    buildings.push({
      data: b,
      holder,
      room,
      fading,
      fade: 1,
      cutPlane,
      cutMask,
      bounds: new THREE.Box3().setFromObject(holder),
    });
  }
  const treeSource = trees.scene.getObjectByName("Tree_Hornbeam");
  if (treeSource) {
    treeSource.updateMatrixWorld(true);
    const inverse = treeSource.matrixWorld.clone().invert();
    treeSource.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const local = inverse.clone().multiply(mesh.matrixWorld);
      const copies = new THREE.InstancedMesh(
        mesh.geometry,
        mesh.material,
        EXPANSION_SCENES.length * 2,
      );
      const pose = new THREE.Object3D();
      EXPANSION_SCENES.forEach((s, i) => {
        for (let j = 0; j < 2; j++) {
          pose.position.set(s.x + (j ? 8.8 : -8.8), s.height - 0.2, s.z - 7.2);
          pose.scale.setScalar(0.75);
          pose.rotation.y = i;
          pose.updateMatrix();
          copies.setMatrixAt(i * 2 + j, pose.matrix.clone().multiply(local));
        }
      });
      copies.castShadow = true;
      root.add(...splitInstanceBatches(copies));
    });
  }
  const roomLight = new THREE.PointLight(0xffcf91, 18, 10, 2);
  scene.add(roomLight);
  const barLight = new THREE.PointLight(0xffc279, 32, 5.5, 2);
  const pub = EXPANSION_BUILDINGS.find((building) => building.id === "B07");
  const barPosition = buildingPoint(pub, -2, -0.8);
  barLight.position.set(barPosition.x, pub.height + 2.3, barPosition.z);
  scene.add(barLight);
  let current = null;
  const sight = new THREE.Ray(),
    sightTarget = new THREE.Vector3(),
    sightHit = new THREE.Vector3();
  return {
    root,
    floorRoot,
    buildings,
    vents,
    update(dt, player, camera) {
      current = expansionBuildingAt(player.x, player.z);
      // Flying above a roof must not open the room as though Nora entered its door.
      if (current && Math.abs(player.y - current.height) > 1.5) current = null;
      sightTarget.set(
        current?.x ?? player.x,
        (current?.height ?? player.y) + 1.3,
        current?.z ?? player.z,
      );
      sight.set(
        camera.position,
        sightTarget.clone().sub(camera.position).normalize(),
      );
      const sightLength = camera.position.distanceTo(sightTarget);
      for (const b of buildings) {
        const distance = Math.hypot(b.data.x - player.x, b.data.z - player.z);
        b.holder.visible = distance < 100 || camera.top > 30;
        const inside = current?.id === b.data.id;
        const occluding =
          !!current &&
          !inside &&
          sight.intersectBox(b.bounds, sightHit) &&
          camera.position.distanceTo(sightHit) < sightLength - 3;
        if (inside) {
          const dx = camera.position.x - b.data.x,
            dz = camera.position.z - b.data.z,
            length = Math.hypot(dx, dz);
          b.cutMask.normal.set(-dx / length, 0, -dz / length);
          b.cutMask.constant = (dx * b.data.x + dz * b.data.z) / length;
        } else b.cutMask.constant = -1e6;
        b.cutPlane.constant = THREE.MathUtils.damp(
          b.cutPlane.constant,
          b.data.height + (inside || occluding ? 1.25 : 20),
          8,
          dt,
        );
        const local = buildingLocal(b.data, player.x, player.z);
        const approach = Math.abs(local.x) < 2 && local.z > 2.5 && local.z < 6;
        const target = inside ? 0 : approach ? 0.22 : 1;
        b.fade = THREE.MathUtils.damp(b.fade, target, 8, dt);
        b.room.visible = inside || approach;
        for (const mesh of b.fading) {
          mesh.visible = b.fade > 0.025;
          mesh.castShadow = b.fade > 0.95;
          for (const m of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            m.transparent = b.fade < 0.99 || m.userData.originalOpacity < 1;
            m.opacity = m.userData.originalOpacity * b.fade;
            m.depthWrite = b.fade > 0.95;
          }
        }
      }
      roomLight.visible = !!current;
      barLight.visible = current?.id === "B07";
      if (current)
        roomLight.position.set(
          current.x,
          current.height + 2.8,
          current.z + 0.4,
        );
    },
    state() {
      return {
        buildingCount: buildings.length,
        interior: current?.id ?? null,
        sceneCount: EXPANSION_SCENES.length,
      };
    },
  };
}
