import { loadModelWithLOD, splitInstanceBatches } from "./model-lod.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { finishAuthoredModel } from "./sculpted-workshop.js";
import {
  RAILWAY,
  railPoint,
  railTravelAt,
  railVehiclePoseAt,
  addRailRunningSurface,
} from "./railway.js";

const up = new THREE.Vector3(0, 1, 0);
const along = new THREE.Vector3(1, 0, 0);
function required(root, name) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Missing transport part: ${name}`);
  return node;
}

export function createSteamTrain(asset, { railPreviewTime = null } = {}) {
  const root = new THREE.Group();
  root.name = "authored steam train";
  const definitions = [
    { name: "Coach", radius: 0.24, wheelBase: 2.2 },
    { name: "Locomotive", radius: 0.32, wheelBase: 1.8 },
  ];
  const vehicles = definitions.map((definition) => {
    const body = required(asset, definition.name);
    body.removeFromParent();
    root.add(body);
    body.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(body, true);
    const axles = ["Rear", "Front"].map((end) => {
      const node = required(body, `${definition.name}_Axle_${end}`);
      return {
        node,
        wheels: ["Left", "Right"].map((side) =>
          required(node, `${node.name}_Wheel_${side}`),
        ),
      };
    });
    return { ...definition, body, bounds, axles, offset: 0 };
  });
  const couplingGap = 0.12;
  const formationLength = vehicles.reduce(
    (sum, v) => sum + v.bounds.max.x - v.bounds.min.x,
    couplingGap,
  );
  let tail = -formationLength / 2;
  for (const vehicle of vehicles) {
    vehicle.offset = tail - vehicle.bounds.min.x;
    tail += vehicle.bounds.max.x - vehicle.bounds.min.x + couplingGap;
  }
  const engine = vehicles[1];
  const outlet = required(engine.body, "Locomotive_Steam_Outlet");
  engine.body.updateWorldMatrix(true, true);
  const outletLocal = engine.body.worldToLocal(
    outlet.getWorldPosition(new THREE.Vector3()),
  );
  const rods = ["Left", "Right"].map((side) => ({
    rod: required(engine.body, `Locomotive_Rod_${side}`),
    pins: ["Rear", "Front"].map((end) =>
      required(engine.body, `Locomotive_Crank_${end}_${side}`),
    ),
  }));
  const coupling = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 1, 8),
    new THREE.MeshStandardMaterial({
      color: 0x343936,
      metalness: 0.75,
      roughness: 0.46,
    }),
  );
  coupling.name = "articulated carriage coupling";
  coupling.castShadow = true;
  root.add(coupling);
  const couplingEnds = [
    required(vehicles[0].body, "Coach_Coupler_Front"),
    required(engine.body, "Locomotive_Coupler_Rear"),
  ];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    direction = new THREE.Vector3();
  let lastTime = 0;
  function update(time) {
    lastTime = railPreviewTime ?? time;
    const travel = railTravelAt(lastTime, formationLength);
    for (const vehicle of vehicles) {
      const pose = railVehiclePoseAt(
        travel.distance + vehicle.offset,
        vehicle.wheelBase,
        vehicle.radius,
      );
      vehicle.body.position.set(
        pose.position.x,
        pose.position.y,
        pose.position.z,
      );
      vehicle.body.rotation.y = pose.yaw;
      const c = Math.cos(pose.yaw),
        s = Math.sin(pose.yaw);
      vehicle.axles.forEach(({ node, wheels }, index) => {
        const axle = pose.axles[index],
          dx = axle.position.x - pose.position.x,
          dz = axle.position.z - pose.position.z;
        node.position.set(
          c * dx - s * dz,
          axle.position.y - pose.position.y,
          s * dx + c * dz,
        );
        node.rotation.y = axle.yaw - pose.yaw;
        wheels.forEach((wheel, side) => {
          wheel.rotation.z =
            pose.wheelAngle +
            (vehicle.name === "Locomotive" && side === 1 ? Math.PI / 2 : 0);
        });
      });
    }
    root.updateMatrixWorld(true);
    for (const { rod, pins } of rods) {
      engine.body.worldToLocal(pins[0].getWorldPosition(a));
      engine.body.worldToLocal(pins[1].getWorldPosition(b));
      rod.position.copy(a).add(b).multiplyScalar(0.5);
      direction.copy(b).sub(a);
      rod.quaternion.setFromUnitVectors(along, direction.clone().normalize());
      rod.scale.x = direction.length() / 1.8;
    }
    couplingEnds[0].getWorldPosition(a);
    couplingEnds[1].getWorldPosition(b);
    coupling.position.copy(a).add(b).multiplyScalar(0.5);
    direction.copy(b).sub(a);
    coupling.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    coupling.scale.y = direction.length();
    root.updateMatrixWorld(true);
  }
  const smoke = [0, 0, 0, 0.85];
  function steamAt(time) {
    const travel = railTravelAt(railPreviewTime ?? time, formationLength);
    const pose = railVehiclePoseAt(
      travel.distance + engine.offset,
      engine.wheelBase,
      engine.radius,
    );
    const c = Math.cos(pose.yaw),
      s = Math.sin(pose.yaw);
    smoke[0] = pose.position.x + c * outletLocal.x + s * outletLocal.z;
    smoke[1] = pose.position.y + outletLocal.y;
    smoke[2] = pose.position.z - s * outletLocal.x + c * outletLocal.z;
    return smoke;
  }
  update(0);
  return {
    root,
    vehicles,
    formationLength,
    update,
    steamAt,
    state() {
      root.updateMatrixWorld(true);
      return {
        time: lastTime,
        formationLength,
        vehicles: vehicles.map((v) => ({
          name: v.name,
          position: v.body.position.toArray(),
          yaw: v.body.rotation.y,
          radius: v.radius,
          axles: v.axles.map(({ node, wheels }) => ({
            position: node.getWorldPosition(new THREE.Vector3()).toArray(),
            wheels: wheels.map((w) => ({
              position: w.getWorldPosition(new THREE.Vector3()).toArray(),
              angle: w.rotation.z,
            })),
          })),
        })),
      };
    },
  };
}

export function createAirship(asset) {
  const root = required(asset, "Airship");
  root.removeFromParent();
  root.scale.setScalar(1.3);
  const propellers = [
    required(root, "Propeller_Port"),
    required(root, "Propeller_Starboard"),
  ];
  const rudder = required(root, "Airship_Rudder");
  root.traverse((object) => {
    if (object.isLight) {
      object.distance = 2.4;
      object.intensity = Math.min(object.intensity, 3);
    }
  });
  function update(time) {
    root.position.set(
      3.5 + Math.sin(time * 0.025) * 3.5,
      13.4 + Math.sin(time * 0.13) * 0.08,
      -13.8,
    );
    root.rotation.set(
      0.012 * Math.sin(time * 0.11),
      Math.PI + 0.35 + 0.055 * Math.sin(time * 0.04),
      0.018 * Math.sin(time * 0.17),
    );
    propellers.forEach((p, i) => {
      p.rotation.x = time * (i ? -26 : 26);
    });
    rudder.rotation.y = 0.08 * Math.sin(time * 0.19);
  }
  const smoke = [0, 0, 0, 0.3];
  const exhaust = new THREE.Vector3();
  const exhaustRotation = new THREE.Euler();
  function steamAt(time) {
    // A small exhaust behind the machinery, distinct from the large fabric envelope.
    exhaustRotation.set(
      0.012 * Math.sin(time * 0.11),
      Math.PI + 0.35 + 0.055 * Math.sin(time * 0.04),
      0.018 * Math.sin(time * 0.17),
    );
    exhaust.set(-0.4, -1.05, 0).multiplyScalar(1.3).applyEuler(exhaustRotation);
    smoke[0] = 3.5 + Math.sin(time * 0.025) * 3.5 + exhaust.x;
    smoke[1] = 13.4 + Math.sin(time * 0.13) * 0.08 + exhaust.y;
    smoke[2] = -13.8 + exhaust.z;
    return smoke;
  }
  update(0);
  return { root, propellers, rudder, update, steamAt };
}

function modelMeshes(prototype) {
  prototype.updateWorldMatrix(true, true);
  const inverse = prototype.matrixWorld.clone().invert(),
    result = [];
  prototype.traverse((mesh) => {
    if (mesh.isMesh)
      result.push({
        geometry: mesh.geometry,
        material: mesh.material,
        local: inverse.clone().multiply(mesh.matrixWorld),
      });
  });
  return result;
}
export function createAuthoredRailway(asset, sleeperMaterial = null) {
  const root = new THREE.Group();
  root.name = "authored elevated railway";
  const materialList = [];
  asset.traverse((mesh) => {
    if (mesh.isMesh && !materialList.includes(mesh.material))
      materialList.push(mesh.material);
  });
  const find = (text, fallback) =>
    materialList.find((m) => m.name.toLowerCase().includes(text)) ??
    new THREE.MeshStandardMaterial({
      color: fallback,
      roughness: 0.55,
      metalness: 0.6,
    });
  const materials = {
    iron: find("blackened", 0x283536),
    ironLight: find("running steel", 0x7c8987),
    wood: find("walnut", 0x66513b),
  };
  materials.wood = sleeperMaterial?.clone() ?? materials.wood;
  materials.wood.metalness = 0;
  materials.wood.roughness = 0.85;
  materials.wood.color.multiplyScalar(0.7);
  const batches = new Map();
  const add = (geometry, material) => {
    const actual =
      typeof material === "string" ? materials[material] : material;
    if (!batches.has(actual)) batches.set(actual, []);
    batches
      .get(actual)
      .push(geometry.index ? geometry.toNonIndexed() : geometry);
  };
  const box = (x, y, z, w, h, d, material, rotation = [0, 0, 0]) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)),
    );
    geometry.translate(x, y, z);
    add(geometry, material);
  };
  const cylinder = (x, y, z, r, h, material) => {
    const g = new THREE.CylinderGeometry(r, r, h, 8);
    g.translate(x, y, z);
    add(g, material);
  };
  const line = (a, b, r, material) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(r, r, delta.length(), 8);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()),
    );
    g.translate(...from.add(to).multiplyScalar(0.5).toArray());
    add(g, material);
  };
  addRailRunningSurface(
    RAILWAY.startX,
    RAILWAY.endX,
    add,
    box,
    cylinder,
    line,
    { deckThickness: 0.025, contactWire: false },
  );
  function instances(prototype, placements) {
    for (const part of modelMeshes(prototype)) {
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        placements.length,
      );
      mesh.name = prototype.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      placements.forEach((matrix, index) =>
        mesh.setMatrixAt(index, matrix.clone().multiply(part.local)),
      );
      mesh.computeBoundingSphere();
      root.add(...splitInstanceBatches(mesh));
    }
  }
  const spans = Math.ceil((RAILWAY.endX - RAILWAY.startX) / 5.2),
    step = (RAILWAY.endX - RAILWAY.startX) / spans;
  const pierMatrices = [];
  for (let i = 0; i <= spans; i++) {
    const p = railPoint(RAILWAY.startX + i * step);
    pierMatrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, 0, p.z),
        new THREE.Quaternion().setFromAxisAngle(up, p.yaw),
        new THREE.Vector3(1, 1, 1),
      ),
    );
  }
  instances(required(asset, "Rail_Pier"), pierMatrices);
  const spanParts = modelMeshes(required(asset, "Rail_Span"));
  for (let i = 0; i < spans; i++) {
    const center = RAILWAY.startX + (i + 0.5) * step;
    for (const part of spanParts) {
      const geometry = part.geometry.clone().applyMatrix4(part.local),
        position = geometry.getAttribute("position");
      for (let j = 0; j < position.count; j++) {
        const p = railPoint(
          center + (position.getX(j) * step) / 5.2,
          position.getZ(j),
        );
        position.setXYZ(j, p.x, position.getY(j), p.z);
      }
      geometry.computeVertexNormals();
      add(geometry, part.material);
    }
  }
  const fasteners = [];
  for (
    let x = RAILWAY.startX;
    x < RAILWAY.endX - 1e-6;
    x += RAILWAY.sleeperSpacing
  ) {
    const p = railPoint(x);
    fasteners.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, RAILWAY.headY, p.z),
        new THREE.Quaternion().setFromAxisAngle(up, p.yaw),
        new THREE.Vector3(1, 1, 1),
      ),
    );
  }
  instances(required(asset, "Rail_Sleeper_Detail"), fasteners);
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false),
      mesh = new THREE.Mesh(geometry, material);
    mesh.name = "continuous railway surfaces";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  return root;
}

export async function loadSculptedTransport(world, districts, options = {}) {
  const loader = new GLTFLoader();
  const [trainAsset, airshipAsset, railAsset] = await Promise.all([
    loader.loadAsync("./models/train-v1.glb"),
    loader.loadAsync("./models/airship-v1.glb"),
    loadModelWithLOD(loader, "./models/railway-kit-v1.glb", "./models/railway-kit-v1-lod.glb"),
  ]);
  for (const asset of [trainAsset, airshipAsset, railAsset])
    finishAuthoredModel(asset.scene);
  const train = createSteamTrain(trainAsset.scene, options),
    airship = createAirship(airshipAsset.scene);
  let sleeperMaterial;
  train.vehicles[0].body.traverse((mesh) => {
    if (mesh.isMesh && mesh.material.name === "Train walnut panels")
      sleeperMaterial = mesh.material;
  });
  const railway = createAuthoredRailway(railAsset.scene, sleeperMaterial);
  const root = new THREE.Group();
  root.name = "Fogharbor transport";
  root.add(railway, train.root, airship.root);
  world.installTransport(root);
  districts.replaceRailway();
  return {
    root,
    train,
    airship,
    railway,
    vents: [train.steamAt, airship.steamAt],
    update(time) {
      train.update(time);
      airship.update(time);
    },
  };
}
