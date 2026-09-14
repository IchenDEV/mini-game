import * as THREE from "three";
import { COURTYARD_PROPS, UNDERGROWTH_PATCHES } from "./terrain.js";

// Positions of existing gas mantles: a fixed low-resolution light field gives the
// entire quay warm pools without adding dozens of dynamic point-light passes.
export const QUAY_GAS_LAMPS = [
  [-12.34, 3.8],
  [-6.64, 5.52],
  [0.96, 5.49],
  [9.46, 5.44],
  [-39.22, 4.8],
  [-27.72, 5.1],
  [-18.82, 4.9],
  [-43.07, 3.8],
  [-62.29, 2.2],
  [-46.19, 3.1],
  [-54.82, 4.8],
];
const gasLamps = [
  ...QUAY_GAS_LAMPS,
  ...COURTYARD_PROPS.filter((p) => p.kind === "lamp").map((p) => [p.x, p.z]),
];
const fieldBounds = new THREE.Vector4(-80, -42, 120, 103);
function gaslightField() {
  const width = 512,
    height = 440,
    values = new Float32Array(width * height);
  for (const [x, z] of gasLamps) {
    const px = ((x - fieldBounds.x) / fieldBounds.z) * width,
      pz = ((z - fieldBounds.y) / fieldBounds.w) * height;
    const radius = 3.8,
      rx = (radius / fieldBounds.z) * width,
      rz = (radius / fieldBounds.w) * height;
    for (
      let j = Math.max(0, Math.floor(pz - rz));
      j < Math.min(height, pz + rz);
      j++
    )
      for (
        let i = Math.max(0, Math.floor(px - rx));
        i < Math.min(width, px + rx);
        i++
      ) {
        const d = ((i - px) / rx) ** 2 + ((j - pz) / rz) ** 2;
        values[j * width + i] += Math.exp(-d * 4.5) * Math.max(0, 1 - d);
      }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < values.length; i++) {
    pixels[i * 4] = Math.min(255, values[i] * 255);
    pixels[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function finishEnvironmentLighting(scene) {
  const field = gaslightField(),
    materials = new Set();
  scene.traverse((object) => {
    if (object.isMesh)
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
  });
  for (const material of materials) {
    if (!material.isMeshStandardMaterial || material.userData.environmentFinish)
      continue;
    material.userData.environmentFinish = true;
    if (material.emissive && material.emissive.getHex() !== 0) {
      material.emissiveIntensity = Math.min(
        4.0,
        Math.max(material.emissiveIntensity * 3.6, 1.2),
      );
    }
    const paving = /paving/i.test(material.name);
    const earth = /grass and earth|planted banks/i.test(material.name);
    const previous = material.onBeforeCompile,
      previousKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () =>
      previousKey + `|harbor-atmosphere-3|paving:${paving}|earth:${earth}`;
    material.onBeforeCompile = (shader) => {
      previous(shader);
      shader.vertexShader =
        "varying vec3 vEnvironmentWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 environmentPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          environmentPosition=instanceMatrix*environmentPosition;
        #endif
        vEnvironmentWorld=(modelMatrix*environmentPosition).xyz;
      `,
      );
      shader.fragmentShader =
        "varying vec3 vEnvironmentWorld;\n" + shader.fragmentShader;
      const fog = THREE.ShaderChunk.fog_fragment.replace(
        "gl_FragColor.rgb",
        `
        float distantFog=1.-smoothstep(-59.,-39.,vEnvironmentWorld.z);
        float lowFog=max(smoothstep(48.,72.,vEnvironmentWorld.z),max(1.-smoothstep(-85.,-67.,vEnvironmentWorld.x),smoothstep(24.,48.,vEnvironmentWorld.x)));
        float lowLayer=1.-smoothstep(0.,7.,vEnvironmentWorld.y);
        float gaps=.68+.32*sin(vEnvironmentWorld.x*.14+sin(vEnvironmentWorld.z*.12));
        fogFactor=max(fogFactor,max(distantFog*.82,lowFog*.48*lowLayer*gaps));
        gl_FragColor.rgb`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        fog,
      );
      if (earth) {
        shader.uniforms.uSoilPatches = {
          value: UNDERGROWTH_PATCHES.map((p) => new THREE.Vector4(...p)),
        };
        shader.fragmentShader =
          "uniform vec4 uSoilPatches[4];\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float soil=0.;
          for(int soilIndex=0;soilIndex<4;soilIndex++) {
            vec4 area=uSoilPatches[soilIndex];
            vec2 p=(vEnvironmentWorld.xz-area.xy)/(area.zw*1.45);
            float edge=length(p)+sin(vEnvironmentWorld.x*1.3)*sin(vEnvironmentWorld.z*1.7)*.14;
            soil=max(soil,1.-smoothstep(.4,1.,edge));
          }
          float meadow=sin(vEnvironmentWorld.x*.18+sin(vEnvironmentWorld.z*.12))*sin(vEnvironmentWorld.z*.21);
          diffuseColor.rgb*=1.+meadow*.12;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.78,.72,.66),soil);
        `,
        );
      }
      if (paving) {
        shader.uniforms.uGaslightField = { value: field };
        shader.uniforms.uGaslightBounds = { value: fieldBounds };
        shader.fragmentShader =
          "uniform sampler2D uGaslightField;uniform vec4 uGaslightBounds;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          if(vEnvironmentWorld.y>.2) {
            float terraceWet=smoothstep(-.2,.65,sin(vEnvironmentWorld.x*.41+sin(vEnvironmentWorld.z*.27))*sin(vEnvironmentWorld.z*.57));
            roughnessFactor=mix(roughnessFactor,.18,terraceWet*.72);
          }
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          vec2 gasUv=(vEnvironmentWorld.xz-uGaslightBounds.xy)/uGaslightBounds.zw;
          float mottling=.78+.22*sin(vEnvironmentWorld.x*3.1+sin(vEnvironmentWorld.z*2.2))*sin(vEnvironmentWorld.z*4.3);
          #ifdef USE_MAP
            mottling*=smoothstep(.018,.09,dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722)));
          #endif
          totalEmissiveRadiance+=texture2D(uGaslightField,gasUv).r*vec3(.88,.36,.08)*mottling;
        `,
        );
      }
    };
    material.needsUpdate = true;
  }
  return field;
}
