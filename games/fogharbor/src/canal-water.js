import * as THREE from "three";
import { QUAY_GAS_LAMPS } from "./environment-lighting.js";

const waterNoise = `
  float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),f.x),mix(waterHash(i+vec2(0.,1.)),waterHash(i+1.),f.x),f.y);}
  float waterHeight(vec2 p){
    vec2 flow=vec2(uWaterTime*.10,uWaterTime*.012);
    return sin(p.x*2.1+p.y*.55-uWaterTime*.65)*.0138
      +sin(p.x*4.9-p.y*1.1+uWaterTime*.4)*.0066
      +(waterNoise(p*3.8-flow)-.5)*.028
      +(waterNoise(p*1.27+flow*.38)-.5)*.052;
  }
`;

export function createCanalWater(reflection, matrix, time) {
  const material = new THREE.MeshPhysicalMaterial({
    name: "Deep tidal canal water",
    color: 0x293d3b,
    roughness: 0.19,
    metalness: 0.04,
    clearcoat: 0.5,
    clearcoatRoughness: 0.14,
  });
  const uniforms = {
    uWaterReflection: { value: reflection },
    uWaterMatrix: matrix,
    uWaterTime: time,
    uWaterCamera: { value: new THREE.Vector3() },
    uWaterDirection: { value: new THREE.Vector3(-0.57, -0.57, -0.57) },
    uGasLights: {
      value: QUAY_GAS_LAMPS.map(([x, z]) => new THREE.Vector3(x, 2.45, z)),
    },
  };
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => "fogharbor-tidal-water-1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "uniform mat4 uWaterMatrix;varying vec3 vCanalWorld;varying vec4 vCanalReflection;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vCanalWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vCanalReflection=uWaterMatrix*vec4(vCanalWorld,1.);
    `,
    );
    shader.fragmentShader =
      `uniform sampler2D uWaterReflection;uniform float uWaterTime;uniform vec3 uWaterCamera;uniform vec3 uWaterDirection;uniform vec3 uGasLights[${QUAY_GAS_LAMPS.length}];varying vec3 vCanalWorld;varying vec4 vCanalReflection;\n` +
      waterNoise +
      "\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <shadowmap_pars_fragment>",
      "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float wh=waterHeight(vCanalWorld.xz);
      vec2 slope=vec2(waterHeight(vCanalWorld.xz+vec2(.025,0.))-wh,waterHeight(vCanalWorld.xz+vec2(0.,.025))-wh)/.025;
      vec3 canalNormal=normalize(vec3(-slope.x,1.,-slope.y));
      normal=normalize(mat3(viewMatrix)*canalNormal);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float bankDistance=min(abs(vCanalWorld.z-6.45),abs(vCanalWorld.z-15.68));
      diffuseColor.rgb*=mix(.60,1.,smoothstep(0.,1.2,bankDistance));
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      vec2 waterUv=vCanalReflection.xy/vCanalReflection.w+slope*.007;
      vec3 reflection=textureLod(uWaterReflection,clamp(waterUv,.002,.998),.5).rgb;
      vec3 waterView=normalize(uWaterCamera-vCanalWorld);
      float fresnel=.40+pow(1.-max(dot(canalNormal,waterView),0.),3.)*.5;
      float contactShadow=mix(.58,1.,getShadowMask());
      outgoingLight=mix(outgoingLight,reflection*vec3(.88,.94,.92)*contactShadow,fresnel*.9);
      float bank=min(abs(vCanalWorld.z-6.45),abs(vCanalWorld.z-15.68));
      float edgeRipple=(1.-smoothstep(.02,.22,bank))*smoothstep(.35,.72,waterNoise(vec2(vCanalWorld.x*3.-uWaterTime*.15,bank*4.)));
      outgoingLight+=vec3(.16,.19,.16)*edgeRipple*.24;
      vec2 reflectionAxis=normalize(uWaterDirection.xz);
      vec2 crossAxis=vec2(-reflectionAxis.y,reflectionAxis.x);
      for(int lamp=0;lamp<11;lamp++) {
        vec3 source=uGasLights[lamp];
        vec2 center=source.xz+(uWaterDirection.xz/uWaterDirection.y)*(source.y+.78);
        vec2 delta=vCanalWorld.xz-center;
        float along=dot(delta,reflectionAxis),across=dot(delta,crossAxis);
        float streak=exp(-abs(along)*.85-across*across/(.035+.024*abs(along)));
        float breakup=smoothstep(.25,.68,waterNoise(vec2(vCanalWorld.x*9.,vCanalWorld.z*14.-uWaterTime*.6)));
        outgoingLight+=vec3(.78,.38,.085)*streak*(.20+.80*breakup)*contactShadow;
      }
      #include <opaque_fragment>
    `,
    );
  };
  return material;
}
