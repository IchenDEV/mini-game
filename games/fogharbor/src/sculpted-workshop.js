import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function finishSurface(material) {
  const brick = material.name === "Warm weathered brick";
  const stone = material.name === "Limestone trim";
  const brass = ["Aged satin brass", "Polished brass rims"].includes(
    material.name,
  );
  const paint = material.name === "Oxidised green joinery";
  if (!brick && !stone && !brass && !paint) return;
  material.customProgramCacheKey = () =>
    `fogharbor-surface-${brick ? "brick" : stone ? "stone" : brass ? "brass" : "paint"}`;
  material.onBeforeCompile = (shader) => {
    if (brick || stone) {
      // Compress the photographed brick's albedo contrast at this miniature scale.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #include <map_fragment>
        ${stone ? "diffuseColor.rgb = mix(diffuse * .38, diffuseColor.rgb, .65);" : "diffuseColor.rgb = mix(vec3(.17, .075, .043), diffuseColor.rgb, .75);"}
      `,
      );
      return;
    }
    // Local coordinates keep the finish attached to moving wheels and door panels.
    shader.vertexShader =
      "varying vec3 vFinishPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      vFinishPosition = position;
    `,
    );
    shader.fragmentShader =
      "varying vec3 vFinishPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      #include <roughnessmap_fragment>
      float wear = sin(vFinishPosition.x * 8. + sin(vFinishPosition.z * 6.))
                 * sin(vFinishPosition.y * 5.);
      float grain = sin(vFinishPosition.y * 900.)
                  / (1. + length(fwidth(vFinishPosition)) * 600.);
      roughnessFactor = clamp(roughnessFactor + wear * .045 + grain * .008, ${brass ? ".23, .46" : ".46, .68"});
    `,
    );
  };
}

export function finishAuthoredModel(model) {
  const finishedMaterials = new Set();
  model.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (finishedMaterials.has(material)) continue;
      finishSurface(material);
      if (material.map) material.map.anisotropy = 4;
      finishedMaterials.add(material);
    }
    object.castShadow = !materials.every((material) => material.transparent);
    object.receiveShadow = true;
  });
}

export async function loadSculptedWorkshop(world) {
  const loader = new GLTFLoader();
  const [{ scene: model }, { scene: soup }] = await Promise.all([
    loader.loadAsync("./models/workshop-v1.glb"),
    loader.loadAsync("./models/soup-house-v1.glb"),
  ]);
  model.name = "authored repair workshop";
  model.position.set(-6.6, 0, -3.76);
  soup.name = "authored soup house";
  soup.position.set(5.1, 0, -1.4);
  for (const building of [model, soup]) finishAuthoredModel(building);
  world.installWorkshop(model);
  world.installSoup(soup);
  const wheel = model.getObjectByName("Workshop_Flywheel");
  const worldVents = (building, positions) =>
    positions.map((p) =>
      new THREE.Vector3(...p).add(building.position).toArray(),
    );
  const vents = [
    ...worldVents(model, [
      [4.68, 6.18, 0.96],
      [-2.84, 9.56, -1.13],
      [2.84, 9.56, -1.13],
    ]),
    ...worldVents(soup, [
      [2.77, 4.7, 1.1],
      [-1.93, 5.495, -0.7],
    ]),
    [11.5, 7.31, -5],
    [-1.85, 2.8, -2.55],
  ];
  return {
    model,
    soup,
    vents,
    update(time, dt, state) {
      // This engine shares the same supply interruption as the watergate.
      const waiting =
        state.delivered &&
        !state.pumpRestored &&
        time % 8.6 > 5.7 &&
        time % 8.6 < 6.6;
      if (wheel && !waiting) wheel.rotation.z -= dt * 0.42;
    },
  };
}
