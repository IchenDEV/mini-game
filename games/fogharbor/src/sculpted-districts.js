import { loadModelWithLOD } from "./model-lod.js";
import * as THREE from "three";
import { createArchitectureAccents } from "./architecture-accents.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { finishAuthoredModel } from "./sculpted-workshop.js";

import {
  createMasonryDetails,
  createAuthoredTrees,
} from "./sculpted-environment.js";
import { CITY_PLOTS, plotHeight, createTerrain } from "./terrain.js";

export function installCityKit(scene, asset) {
  finishAuthoredModel(asset);
  asset.updateMatrixWorld(true);
  const district = new THREE.Group();
  district.name = "authored city streets";
  const cellSize = 18;
  const transform = new THREE.Matrix4(),
    rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(),
    position = new THREE.Vector3();
  for (const name of new Set(CITY_PLOTS.map((plot) => plot.name))) {
    const source = asset.getObjectByName(`City_${name}`);
    if (!source) throw new Error(`Missing city model: ${name}`);
    const cells = new Map();
    for (const plot of CITY_PLOTS.filter((plot) => plot.name === name)) {
      const cell = `${Math.floor(plot.x / cellSize)},${Math.floor(plot.z / cellSize)}`;
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(plot);
    }
    const inverse = source.matrixWorld.clone().invert();
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const local = inverse.clone().multiply(mesh.matrixWorld);
      for (const [cell, placements] of cells) {
        const instances = new THREE.InstancedMesh(
          mesh.geometry,
          mesh.material,
          placements.length,
        );
        instances.name = `${name} · ${mesh.name} · cell ${cell}`;
        instances.castShadow = mesh.castShadow;
        instances.receiveShadow = true;
        placements.forEach((plot, index) => {
          const { x, z, size, yaw = 0 } = plot;
          position.set(x, plotHeight(plot), z);
          scale.set(size, size * (plot.heightScale ?? 1), size);
          rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
          // Keep the original world matrices; only the culling batch changes.
          transform.compose(position, rotation, scale).multiply(local);
          instances.setMatrixAt(index, transform);
        });
        instances.computeBoundingBox();
        instances.computeBoundingSphere();
        district.add(instances);
      }
    });
  }
  scene.add(district);
  return district;
}

export async function loadSculptedDistricts(world, districts) {
  const loader = new GLTFLoader();
  const [wharf, pump, kit, civic, masonry, trees, accents] = await Promise.all([
    loadModelWithLOD(loader, "./models/wharf-v1.glb", "./models/wharf-v1-lod.glb"),
    loadModelWithLOD(loader, "./models/pumpworks-v1.glb", "./models/pumpworks-v1-lod.glb"),
    loadModelWithLOD(loader, "./models/city-kit-v1.glb", "./models/city-kit-v1-lod.glb"),
    loader.loadAsync("./models/civic-details-v1.glb"),
    loadModelWithLOD(loader, "./models/masonry-v1.glb", "./models/masonry-v1-lod.glb"),
    loadModelWithLOD(loader, "./models/trees-v1.glb", "./models/trees-v1-lod.glb"),
    loadModelWithLOD(loader, "./models/architecture-accents-v1.glb", "./models/architecture-accents-v1-lod.glb"),
  ]);
  for (const asset of [wharf.scene, pump.scene, civic.scene])
    finishAuthoredModel(asset);
  districts.installWharf(wharf.scene);
  pump.scene.position.set(-53.5, 0, -8.1);
  districts.installPump(pump.scene);
  world.replaceSkyline();
  districts.replaceSkyline();
  const city = installCityKit(world.root, kit.scene);
  const terrainMaterials = {};
  kit.scene.traverse((node) => {
    if (!node.isMesh) return;
    const material = node.material;
    const name = material.name?.toLowerCase() ?? "";
    if (name.includes("limestone")) terrainMaterials.stone = material;
    if (name.includes("brick")) terrainMaterials.brick = material;
    if (name.includes("iron")) terrainMaterials.iron = material;
    if (name.includes("satin brass")) terrainMaterials.brass = material;
    if (name.includes("walnut")) terrainMaterials.wood = material;
  });
  const textureLoader = new THREE.TextureLoader();
  const map = await textureLoader.loadAsync(
    "./textures/yorkstone-paving-v1.png",
  );
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;
  terrainMaterials.paving = new THREE.MeshPhysicalMaterial({
    name: "Terrace wet paving",
    color: 0xb5b8b8,
    map,
    bumpMap: map,
    bumpScale: 0.022,
    roughness: 0.8,
    clearcoat: 0.28,
    clearcoatRoughness: 0.2,
  });
  const grassMaps = await Promise.all(
    [
      "./textures/grass-diff.jpg",
      "./textures/grass-nor_gl.jpg",
      "./textures/grass-rough.jpg",
    ].map((url) => textureLoader.loadAsync(url)),
  );
  for (const texture of grassMaps) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  grassMaps[0].colorSpace = THREE.SRGBColorSpace;
  terrainMaterials.grass = new THREE.MeshStandardMaterial({
    name: "Rain-soaked grass and earth",
    color: 0x6d8271,
    map: grassMaps[0],
    normalMap: grassMaps[1],
    roughnessMap: grassMaps[2],
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.96,
  });
  const { root: terrain, walkSurfaces } = createTerrain(terrainMaterials, {
    authoredEnvironment: true,
  });
  const treeScene = createAuthoredTrees(trees.scene);
  terrain.add(
    createMasonryDetails(masonry.scene),
    treeScene.root,
    createArchitectureAccents(accents.scene),
  );
  world.root.add(terrain);
  const gate = civic.scene.getObjectByName("Watergate_Structure");
  const bridge = civic.scene.getObjectByName("Civic_Bridge");
  if (!gate || !bridge)
    throw new Error("Missing civic bridge or watergate model");
  gate.removeFromParent();
  gate.position.set(11, 0, -4.8);
  world.installWatergate(gate);
  districts.replaceBridges();
  for (const x of [-10, -34, -58]) {
    const model = bridge.clone(true);
    model.position.set(x, 0, 11);
    if (x === -10) world.replaceBridge(model);
    else districts.root.add(model);
  }
  return {
    city,
    terrain,
    walkSurfaces,
    update: treeScene.update,
    vents: [
      [-27.68, 4.79, -4.735],
      [-38.73, 8.41, -6.75],
      [-20.84, 9.44, -6.65],
      [-60.2, 9.2, -11.2],
      [-59.73, 3.2, -10.8],
      [-57.93, 3.2, -10.8],
    ],
  };
}
