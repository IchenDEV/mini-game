import * as THREE from "three";
import { createSeabirds } from "./seabirds.js";
export function createAmbience(scene) {
  const sources = [
    [-1.92, 6.18, -2.8],
    [-9.44, 9.56, -4.89],
    [-3.76, 9.56, -4.89],
    [11.5, 5.6, -5],
    [5.7, 2.4, 1],
    [-1.85, 2.8, -2.55],
  ];
  const count = 720;
  const position = new Float32Array(count * 3),
    seed = new Float32Array(count);
  const strength = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    position.set(sources[i % sources.length], i * 3);
    seed[i] = i * 0.618033;
    strength[i] = i % sources.length === 5 ? 0.55 : 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aStrength", new THREE.BufferAttribute(strength, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: `uniform float uTime;uniform float uScale;attribute float aSeed;attribute float aStrength;
    varying float vAlpha;varying float vSeed;varying float vAge;
    void main(){float age=fract(uTime*.14+aSeed);vAge=age;vSeed=aSeed;
      float pulse=.82+.18*sin(uTime*.85+aSeed*.3);
      float sourceVariation=.7+.6*fract(sin(dot(position.xz,vec2(12.9898,78.233)))*43758.5453);
      float curl=sin(age*13.+aSeed*8.);
      vec3 p=position+vec3(age*age*2.2+curl*age*.24,age*3.6*aStrength*sourceVariation,age*.45+sin(age*9.+aSeed)*age*.22);
      vAlpha=smoothstep(0.,.10,age)*(1.-smoothstep(.42,1.,age))*aStrength*pulse*(.68+.32*sin(age*18.+aSeed*2.));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      gl_PointSize=(13.+age*86.)*uScale*aStrength;
    }`,
    fragmentShader: `uniform float uTime;varying float vAlpha;varying float vSeed;varying float vAge;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
    void main(){vec2 p=gl_PointCoord-.5;float a=vSeed*6.28; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
      float n=noise(p*6.+vec2(vSeed,vAge)*4.);n+=noise(p*12.-vAge*2.)*.4;
      float edge=length(p)+(.55-n)*.1;
      float density=(1.-smoothstep(.08,.49,edge))*(.58+n*.3);
      gl_FragColor=vec4(.91,.93,.91,density*vAlpha*.098);
    }`,
  });
  const steam = new THREE.Points(geometry, material);
  steam.frustumCulled = false;
  scene.add(steam);
  const birds = createSeabirds(scene);
  return {
    setWorkshopVents(vents) {
      sources.splice(0, sources.length, ...vents);
      for (let i = 0; i < count; i++) {
        const source = sources[i % sources.length];
        const p = typeof source === "function" ? source(0) : source;
        for (let axis = 0; axis < 3; axis++) position[i * 3 + axis] = p[axis];
        strength[i] = p[3] ?? (p[1] < 3 ? 0.55 : 1);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aStrength.needsUpdate = true;
    },
    update(t, height, viewHeight) {
      material.uniforms.uTime.value = t;
      material.uniforms.uScale.value = height / viewHeight / 32;
      let moving = false;
      for (let i = 0; i < count; i++) {
        const source = sources[i % sources.length];
        if (typeof source !== "function") continue;
        const age = (t * 0.14 + seed[i]) % 1;
        const p = source(t - age / 0.14);
        for (let axis = 0; axis < 3; axis++) position[i * 3 + axis] = p[axis];
        moving = true;
      }
      if (moving) geometry.attributes.position.needsUpdate = true;
      birds.update(t);
    },
  };
}
