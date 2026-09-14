import { splitInstanceBatches } from "./model-lod.js";
import * as THREE from "three";
import { CITY_PLOTS, plotHeight } from "./terrain.js";
import { finishAuthoredModel } from "./sculpted-workshop.js";

const UP = new THREE.Vector3(0, 1, 0);
const WALLS = {
  Terrace: { width: 4, depth: 4, windowX: 1 },
  Townhouse: { width: 4.8, depth: 4.5, windowX: 1.23 },
  Warehouse: { width: 5.5, depth: 5.2 },
};
function houseMatrix(plot) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(plot.x, plotHeight(plot), plot.z),
    new THREE.Quaternion().setFromAxisAngle(UP, plot.yaw),
    new THREE.Vector3(plot.size, plot.size * (plot.heightScale ?? 1), plot.size),
  );
}
function attached(plot, position, scale = [1, 1, 1]) {
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromAxisAngle(UP, Math.PI),
    new THREE.Vector3(...scale),
  );
  return houseMatrix(plot).multiply(local);
}

export function accentPlacements() {
  const placements = new Map([
    ["Accent_BayWindow", []], ["Accent_Balcony", []],
    ["Accent_SteamRiser", []], ["Accent_Gallery", []],
  ]);
  CITY_PLOTS.forEach((plot, index) => {
    const wall = WALLS[plot.name];
    if (!wall) return;
    // Rear-facing homes gain occupied upper floors; doors and ground lanes remain clear.
    const visibleRear = plot.terrace && Math.cos(plot.yaw) < -.45;
    const verticalScale = plot.size * (plot.heightScale ?? 1);
    if (visibleRear && plot.name === "Townhouse" && verticalScale >= .66) {
      placements.get("Accent_BayWindow").push(attached(
        plot, [-wall.windowX, 3.42, -wall.depth / 2 - .025], [.74, .76, 1],
      ));
    }
    if (visibleRear && plot.name === "Terrace" && verticalScale >= .80) {
      placements.get("Accent_Balcony").push(attached(
        plot, [wall.windowX, 3.35, -wall.depth / 2 - .025], [.64, 1, 1],
      ));
    }
    if ((plot.terrace && index % 2 === 0) || plot.name === "Warehouse") {
      placements.get("Accent_SteamRiser").push(attached(
        plot, [wall.width / 2 - .38, .18, -wall.depth / 2 - .015], [.85, 1, .85],
      ));
    }
  });
  // The sealed galleries connect upstairs windows across existing northern service yards.
  // They have no public doors: the street below keeps its full clearance.
  for (const [frontX, rearX, height] of [[-42.2, -42.5, 3.25], [-16.4, -16.8, 3.18]]) {
    const front = CITY_PLOTS.find((plot) => plot.x === frontX && plot.z < 0);
    const rear = CITY_PLOTS.find((plot) => plot.x === rearX && plot.z < 0);
    if (!front || !rear) continue;
    const a = new THREE.Vector3(-WALLS[front.name].windowX, 0, -WALLS[front.name].depth / 2 + .10).applyMatrix4(houseMatrix(front));
    const b = new THREE.Vector3(WALLS[rear.name].windowX, 0, -WALLS[rear.name].depth / 2 + .10).applyMatrix4(houseMatrix(rear));
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    placements.get("Accent_Gallery").push(new THREE.Matrix4().compose(
      new THREE.Vector3((a.x + b.x) / 2, height, (a.z + b.z) / 2),
      new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(a.z - b.z, b.x - a.x)),
      new THREE.Vector3(length / 4, .94, 1),
    ));
  }
  return placements;
}

export function createArchitectureAccents(asset) {
  finishAuthoredModel(asset);
  asset.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = "inhabited upper floors and service galleries";
  for (const [name, matrices] of accentPlacements()) {
    const source = asset.getObjectByName(name);
    if (!source) throw new Error(`Missing architecture accent ${name}`);
    const inverse = source.matrixWorld.clone().invert();
    source.traverse((mesh) => {
      if (!mesh.isMesh || matrices.length === 0) return;
      const local = inverse.clone().multiply(mesh.matrixWorld);
      const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length);
      instances.name = `${name} · ${mesh.name}`;
      instances.castShadow = mesh.castShadow;
      instances.receiveShadow = true;
      matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix.clone().multiply(local)));
      instances.computeBoundingSphere();
      root.add(...splitInstanceBatches(instances));
    });
  }
  return root;
}
