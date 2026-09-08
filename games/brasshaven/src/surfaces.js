import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function stoneTextures(renderer) {
  const random = seeded(1893),
    size = 1024;
  const canvases = Array.from({ length: 3 }, () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  });
  const [color, bump, rough] = canvases.map((c) => c.getContext("2d"));
  color.fillStyle = "#151c1c";
  color.fillRect(0, 0, size, size);
  bump.fillStyle = "#191919";
  bump.fillRect(0, 0, size, size);
  rough.fillStyle = "#444444";
  rough.fillRect(0, 0, size, size);
  for (let row = 0; row < 32; row++)
    for (let col = -1; col < 17; col++) {
      const x = col * 64 + (row % 2) * 32 + 2,
        y = row * 32 + 2,
        w = 59 + random() * 2,
        h = 27 + random() * 2;
      const v = 108 + random() * 48;
      color.fillStyle = `rgb(${v * 1.04},${v},${v * 0.92})`;
      color.beginPath();
      color.roundRect(x, y, w, h, 2 + random() * 3);
      color.fill();
      color.fillStyle = "#a5aaa01f";
      color.fillRect(x + 3, y + 1, w - 6, 1);
      const b = 115 + random() * 80;
      bump.fillStyle = `rgb(${b},${b},${b})`;
      bump.beginPath();
      bump.roundRect(x, y, w, h, 3);
      bump.fill();
      bump.strokeStyle = "#797979";
      bump.lineWidth = 2;
      bump.stroke();
      const r = 90 + random() * 90;
      rough.fillStyle = `rgb(${r},${r},${r})`;
      rough.fillRect(x, y, w, h);
      for (let j = 0; j < 24; j++) {
        color.fillStyle = random() > 0.5 ? "#bbbd9912" : "#00000027";
        color.fillRect(
          x + random() * w,
          y + random() * h,
          1 + random() * 4,
          1 + random() * 2,
        );
      }
      if (random() > 0.65) {
        color.strokeStyle = "#101b1b";
        color.lineWidth = 0.7;
        color.beginPath();
        color.moveTo(x + w * 0.6, y);
        color.lineTo(x + w * 0.4, y + h * 0.45);
        color.lineTo(x + w * 0.54, y + h * 0.6);
        color.lineTo(x + w * 0.45, y + h);
        color.stroke();
      }
    }
  return canvases.map((c, i) => {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3.5);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (!i) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

export function createSurfaces(scene, renderer) {
  const reflection = new THREE.WebGLRenderTarget(1024, 768, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  const reflectionMatrix = { value: new THREE.Matrix4() },
    time = { value: 0 };
  const [map, bumpMap, roughnessMap] = stoneTextures(renderer);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xc9c7ba,
    map,
    bumpMap,
    bumpScale: 0.065,
    roughnessMap,
    roughness: 0.62,
    metalness: 0.12,
    clearcoat: 0.35,
    clearcoatRoughness: 0.36,
  });
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uReflection = { value: reflection.texture };
    shader.uniforms.uReflectionMatrix = reflectionMatrix;
    shader.uniforms.uTime = time;
    shader.vertexShader =
      "uniform mat4 uReflectionMatrix; varying vec4 vReflection; varying vec3 vGroundWorld;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvGroundWorld=(modelMatrix*vec4(transformed,1.0)).xyz; vReflection=uReflectionMatrix*vec4(vGroundWorld,1.0);",
    );
    shader.fragmentShader =
      "uniform sampler2D uReflection; uniform float uTime; varying vec4 vReflection; varying vec3 vGroundWorld;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
      vec2 uvR=vReflection.xy/vReflection.w;
      float pools=sin(vGroundWorld.x*1.65+sin(vGroundWorld.z*1.8)*2.0)*sin(vGroundWorld.z*1.6+vGroundWorld.x*.41);
      float wet=smoothstep(.38,.65,pools)*smoothstep(.22,.42,texture2D(bumpMap,vBumpMapUv).r);
      vec2 ripple=vec2(sin(vGroundWorld.z*3.0+uTime*.6),cos(vGroundWorld.x*2.5+uTime*.4))*.0002;
      vec3 reflected=texture2D(uReflection,uvR+ripple).rgb;
      reflected+=texture2D(uReflection,uvR+ripple+vec2(.0014,0.0)).rgb;
      reflected+=texture2D(uReflection,uvR+ripple-vec2(.0014,0.0)).rgb;
      reflected/=3.0;
      gl_FragColor.rgb=mix(gl_FragColor.rgb,reflected, .035+wet*.3);
    `,
    );
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 35), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.015, -5.5);
  floor.receiveShadow = true;
  scene.add(floor);

  const stone = new THREE.MeshStandardMaterial({
    color: 0x666d63,
    roughness: 0.66,
    metalness: 0.17,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x162628,
    roughness: 0.48,
    metalness: 0.65,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0x927044,
    roughness: 0.4,
    metalness: 0.75,
  });
  const parts = new Map([
    [stone, []],
    [dark, []],
    [brass, []],
  ]);
  function box(x, y, z, w, h, d, mat = stone, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.get(mat).push(g);
  }
  box(0, -0.77, 0, 30, 1.5, 24, dark);
  box(0, -0.77, -17.5, 30, 1.5, 11, dark);
  for (let layer = 0; layer < 4; layer++) {
    for (let x = -15; x < 15; x += 1.2) {
      box(
        x + 0.6 + (layer % 2) * 0.3,
        -0.16 - layer * 0.37,
        12,
        1.16,
        0.33,
        0.35,
      );
      box(
        x + 0.6 + (layer % 2) * 0.3,
        -0.16 - layer * 0.37,
        -12,
        1.16,
        0.33,
        0.35,
      );
    }
    for (let z = -12; z < 12; z += 1.2) {
      box(-15, -0.16 - layer * 0.37, z + 0.6, 0.35, 0.33, 1.16);
      box(15, -0.16 - layer * 0.37, z + 0.6, 0.35, 0.33, 1.16);
    }
  }
  for (let x = -14.5; x < 15; x += 1) {
    box(x, 0.08, 11.8, 0.94, 0.18, 0.42);
    box(x, 0.08, -11.8, 0.94, 0.18, 0.42);
  }
  for (let z = -11.5; z < 12; z++) {
    box(-14.8, 0.08, z, 0.42, 0.18, 0.94);
    box(14.8, 0.08, z, 0.42, 0.18, 0.94);
  }
  // Inlaid drainage channels, riveted covers and a line of old freight rails.
  for (const x of [-11.9, 11.9]) {
    box(x, 0.027, 3.5, 0.3, 0.018, 16, dark);
    for (let z = -4; z < 11; z += 0.23)
      box(x, 0.041, z, 0.27, 0.016, 0.035, brass);
  }
  for (const x of [-2.8, -1.1]) box(x, 0.035, 0, 0.08, 0.025, 23, brass);
  for (let z = -11; z < 11; z += 1.1) {
    box(-1.95, 0.03, z, 2.4, 0.02, 0.17, dark);
  }
  // Small service bridge over the foreground canal, entirely hand-built.
  for (let z = 12; z < 21; z += 0.4) box(-8, -0.05, z, 4, 0.24, 0.37, dark);
  for (const x of [-9.9, -6.1]) {
    box(x, -0.35, 16.5, 0.24, 0.5, 9, brass);
    box(x, 1.04, 16.5, 0.09, 0.09, 9, brass);
    box(x, 0.43, 16.5, 0.06, 0.06, 9, dark);
    for (let z = 12; z <= 21; z += 1.5) {
      box(x, 0.55, z, 0.13, 1.2, 0.13, brass);
      box(x, 0.07, z, 0.32, 0.22, 0.32);
    }
  }
  for (const [material, geos] of parts) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    geos.forEach((g) => g.dispose());
  }

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uReflection: { value: reflection.texture },
      uReflectionMatrix: reflectionMatrix,
      uTime: time,
      uFog: { value: new THREE.Color(0x98c3df) },
      uWaterColor: { value: new THREE.Color(0x247980) },
      uClouds: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
    },
    vertexShader: `uniform mat4 uReflectionMatrix; varying vec4 vRef; varying vec3 vWorld; void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;vRef=uReflectionMatrix*p;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform sampler2D uReflection; uniform float uTime; uniform vec3 uFog; uniform vec3 uWaterColor; uniform float uClouds; uniform vec3 uCamera; varying vec4 vRef; varying vec3 vWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float sea(vec2 p){return sin(dot(p,vec2(.7,.3))*7.+uTime*.7)*.32+sin(dot(p,vec2(-.6,.8))*13.-uTime)*.14+noise(p*5.+uTime*.12)*.4+noise(p*15.-uTime*.1)*.1;}
      void main(){vec2 p=vWorld.xz;vec2 uv=vRef.xy/vRef.w;
      float wave=sea(p);vec2 slope=vec2(sea(p+vec2(.025,0))-wave,sea(p+vec2(0,.025))-wave);
      vec2 distort=slope*.012;
      float inside=step(.002,uv.x)*step(.002,uv.y)*step(uv.x,.998)*step(uv.y,.998);
      vec3 refl=mix(vec3(.48,.65,.72),texture2D(uReflection,clamp(uv+distort,vec2(.002),vec2(.998))).rgb,inside);
      vec3 normal=normalize(vec3(-slope.x*2.5,1.,-slope.y*2.5));vec3 view=normalize(uCamera-vWorld);
      vec3 halfDir=normalize(normalize(vec3(-24.,30.,10.))+view);
      float shimmer=pow(max(0.,dot(normal,halfDir)),60.)*.3;
      float fresnel=.2+pow(1.-max(0.,dot(normal,view)),5.)*.5;
      vec3 col=mix(uWaterColor*(1.+wave*.08),refl,fresnel)+vec3(1.,.85,.6)*shimmer;
      col=mix(col,mix(vec3(.66,.78,.84),vec3(.98,.98,.92),noise(p*.16+uTime*.025)),uClouds*.9);
      float fog=smoothstep(73.,110.,length(uCamera-vWorld));col=mix(col,uFog,fog);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.86;
  scene.add(water);

  const mirrorCam = new THREE.OrthographicCamera();
  const mirrorTarget = new THREE.Vector3(),
    plane = new THREE.Plane(),
    clip = new THREE.Vector4(),
    q = new THREE.Vector4();
  const bias = new THREE.Matrix4().set(
    0.5,
    0,
    0,
    0.5,
    0,
    0.5,
    0,
    0.5,
    0,
    0,
    0.5,
    0.5,
    0,
    0,
    0,
    1,
  );
  function reflect(camera, target) {
    waterMat.uniforms.uCamera.value.copy(camera.position);
    mirrorCam.position.copy(camera.position);
    mirrorCam.position.y = -camera.position.y + 0.03;
    mirrorTarget.copy(target);
    mirrorTarget.y = -target.y + 0.03;
    mirrorCam.up.set(0, -1, 0);
    mirrorCam.lookAt(mirrorTarget);
    mirrorCam.near = camera.near;
    mirrorCam.far = camera.far;
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.updateMatrixWorld();
    reflectionMatrix.value
      .copy(bias)
      .multiply(mirrorCam.projectionMatrix)
      .multiply(mirrorCam.matrixWorldInverse);
    // General oblique clipping works for the orthographic camera as well as perspective.
    plane
      .set(new THREE.Vector3(0, 1, 0), -0.018)
      .applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    q.set(Math.sign(clip.x), Math.sign(clip.y), 1, 1).applyMatrix4(
      mirrorCam.projectionMatrix.clone().invert(),
    );
    clip.multiplyScalar(2 / clip.dot(q));
    const e = mirrorCam.projectionMatrix.elements;
    e[2] = clip.x - e[3];
    e[6] = clip.y - e[7];
    e[10] = clip.z - e[11];
    e[14] = clip.w - e[15];
    mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
    floor.visible = water.visible = false;
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(reflection);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = shadowUpdate;
    floor.visible = water.visible = true;
  }
  return {
    setTheme(region) {
      floorMat.color.set(region.floor);
      stone.color.set(region.floor).multiplyScalar(0.65);
      waterMat.uniforms.uFog.value.set(region.fog);
      waterMat.uniforms.uWaterColor.value
        .set(region.water)
        .multiplyScalar(0.65);
      waterMat.uniforms.uClouds.value = region.id === "skyport" ? 1 : 0;
    },
    update(t) {
      time.value = t;
    },
    reflect,
    reflection,
    resize(w, h) {
      const s = Math.min(1, 960 / w);
      reflection.setSize(Math.round(w * s), Math.round(h * s));
    },
  };
}
