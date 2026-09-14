import { expansionSurfaceAt } from "./expansion-layout.js";
import * as THREE from "three";
import { createCanalWater } from "./canal-water.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NORTH_PAVING, insidePolygon } from "./terrain.js";

function pavingMap(renderer) {
  const map = new THREE.TextureLoader().load(
    "./textures/yorkstone-paving-v1.png",
  );
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
function pavingPlane(width, depth, x, z) {
  const geometry = new THREE.PlaneGeometry(width, depth),
    uv = geometry.attributes.uv,
    position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (position.getX(i) + x) / 2.6, (z - position.getY(i)) / 2.6);
  return geometry;
}

export function createGround(scene, renderer) {
  const map = pavingMap(renderer);
  const floorReflection = new THREE.WebGLRenderTarget(768, 576, {
    type: THREE.HalfFloatType,
    samples: 2,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const waterReflection = new THREE.WebGLRenderTarget(1024, 768, {
    type: THREE.HalfFloatType,
    samples: 2,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const floorMatrix = { value: new THREE.Matrix4() },
    waterMatrix = { value: new THREE.Matrix4() },
    clock = { value: 0 },
    floorLevel = { value: 0 };
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    name: "Rain-wet quay paving",
    color: 0xb5b8b8,
    map,
    bumpMap: map,
    bumpScale: 0.022,
    roughness: 0.85,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.22,
  });
  floorMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uMirror: { value: floorReflection.texture },
      uMirrorMatrix: floorMatrix,
      uClock: clock,
      uFloorLevel: floorLevel,
    });
    shader.vertexShader =
      "uniform mat4 uMirrorMatrix;varying vec4 vMirror;varying vec3 vGround;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvGround=(modelMatrix*vec4(transformed,1.)).xyz;vMirror=uMirrorMatrix*vec4(vGround,1.);",
    );
    shader.fragmentShader =
      `uniform sampler2D uMirror;uniform float uClock;uniform float uFloorLevel;varying vec4 vMirror;varying vec3 vGround;
  float rainWet(vec2 p){
    vec2 q=p+vec2(.35*sin(p.y*1.7)+.22*sin(p.x*2.1),.45*sin(p.x*.73)+.16*sin(p.y*4.));
    float d=min(length((q-vec2(-53.,2.8))/vec2(7.,1.7)),min(length((q-vec2(-29.,2.5))/vec2(8.,1.8)),length((q-vec2(-4.,3.))/vec2(6.,2.))));
    float islands=smoothstep(-.30,.38,sin(q.x*1.4+sin(q.y*2.3))*.65+cos(q.y*2.5-q.x*.3)*.45);
    float pools=(1.-smoothstep(.72,1.03,d))*islands;
    float drainage=1.-smoothstep(.18,.55,abs(p.y-4.9+sin(p.x*.44)*.22));
    float upperStreet=step(52.,p.y)*islands*.28;
    return clamp(max(upperStreet,max(pools*.95,drainage*.52*islands)),0.,1.);
  }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor=mix(.72,.32,rainWet(vGround.xz));",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb*=.92;\ndiffuseColor.rgb*=1.-rainWet(vGround.xz)*.15;\nif(vGround.z<-9.) diffuseColor.rgb*=vec3(.76,.79,.77);\nif(vGround.x>-61.&&vGround.x<-46.&&vGround.z>-12.8&&vGround.z<-3.4) diffuseColor.rgb*=vec3(.82,.85,.82);",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
   float wet=rainWet(vGround.xz)*(1.-smoothstep(.1,.25,abs(vGround.y-uFloorLevel)));
   #ifdef USE_MAP
     float stone=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
     wet*=smoothstep(.016,.075,stone);
   #endif
   vec2 uv=vMirror.xy/vMirror.w+vec2(sin(vGround.z*1.2+uClock*.6),cos(vGround.x*.8+uClock*.5))*.0006;
   // Filter the reflection before it is magnified into wet-paving patches.
   vec3 mirror=textureLod(uMirror,uv,1.0).rgb;
   gl_FragColor.rgb=mix(gl_FragColor.rgb,mirror*.95,wet*.62);
  `,
    );
  };
  const floor = new THREE.Mesh(pavingPlane(220, 15, 0, -1.5), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.028, -1.5);
  floor.receiveShadow = true;
  scene.add(floor);
  const southFloor = new THREE.Mesh(pavingPlane(220, 6, 0, 19), floorMaterial);
  southFloor.rotation.x = -Math.PI / 2;
  southFloor.position.set(0, 0.028, 19);
  southFloor.receiveShadow = true;
  scene.add(southFloor);
  // Continue the same material through the engine hall and both background streets.
  const streetFloors = [floor, southFloor];
  // A union of rear-block yards and the railway service strip replaces the paving rectangle.
  // Each tile is emitted once even where parcels join, keeping the surface free of z-fighting.
  const rearVertices = [],
    rearUV = [];
  const step = 0.5;
  for (let x = -74; x < 29; x += step) {
    for (let z = -42; z < -9; z += step) {
      if (
        !(
          z > -18 ||
          NORTH_PAVING.some((p) => insidePolygon(x + step / 2, z + step / 2, p))
        )
      )
        continue;
      for (const [dx, dz] of [
        [0, 0],
        [0, step],
        [step, 0],
        [step, 0],
        [0, step],
        [step, step],
      ]) {
        rearVertices.push(x + dx, 0.026, z + dz);
        rearUV.push((x + dx) / 2.6, (z + dz) / 2.6);
      }
    }
  }
  const rearGeometry = new THREE.BufferGeometry();
  rearGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(rearVertices, 3),
  );
  rearGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(rearUV, 2));
  rearGeometry.computeVertexNormals();
  const rearFloor = new THREE.Mesh(rearGeometry, floorMaterial);
  rearFloor.name = "connected rear lanes and service yards";
  rearFloor.receiveShadow = true;
  scene.add(rearFloor);
  streetFloors.push(rearFloor);
  // Carry the canal's edge beyond the story area instead of ending on exposed substrate.
  const extensionParts = { stone: [], iron: [] };
  const edgeBox = (x, y, z, w, h, d, key) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    extensionParts[key].push(geometry);
  };
  for (const [start, end] of [
    [-110, -64],
    [14, 110],
  ])
    for (const z of [6.2, 15.9]) {
      edgeBox((start + end) / 2, -0.62, z, end - start, 1.3, 0.35, "stone");
      edgeBox((start + end) / 2, 0.09, z, end - start, 0.16, 0.51, "stone");
      for (const h of [0.46, 0.92])
        edgeBox((start + end) / 2, h, z, end - start, 0.035, 0.035, "iron");
      for (let x = start + 0.15; x < end; x += 0.85) {
        edgeBox(x, 0.52, z, 0.045, 0.86, 0.045, "iron");
        edgeBox(x, 0.97, z, 0.085, 0.06, 0.085, "iron");
      }
    }
  for (const [key, geometries] of Object.entries(extensionParts)) {
    const material = new THREE.MeshStandardMaterial({
      color: key === "stone" ? 0xaaa68e : 0x293b38,
      roughness: key === "stone" ? 0.86 : 0.55,
      metalness: key === "stone" ? 0 : 0.55,
    });
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.name = "extended canal " + key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  const waterMaterial = createCanalWater(
    waterReflection.texture,
    waterMatrix,
    clock,
  );
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    waterMaterial,
  );
  water.receiveShadow = true;
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.78;
  scene.add(water);
  const mirrorCamera = new THREE.OrthographicCamera(),
    mirrorTarget = new THREE.Vector3(),
    clipPlane = new THREE.Plane(),
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
  function renderReflection(camera, target, level, rt, matrix) {
    mirrorCamera.position.set(
      camera.position.x,
      2 * level - camera.position.y,
      camera.position.z,
    );
    mirrorTarget.set(target.x, 2 * level - target.y, target.z);
    mirrorCamera.up.set(0, -1, 0);
    mirrorCamera.lookAt(mirrorTarget);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.updateMatrixWorld();
    matrix.value
      .copy(bias)
      .multiply(mirrorCamera.projectionMatrix)
      .multiply(mirrorCamera.matrixWorldInverse);
    clipPlane
      .set(new THREE.Vector3(0, 1, 0), -level - 0.01)
      .applyMatrix4(mirrorCamera.matrixWorldInverse);
    clip.set(
      clipPlane.normal.x,
      clipPlane.normal.y,
      clipPlane.normal.z,
      clipPlane.constant,
    );
    q.set(Math.sign(clip.x), Math.sign(clip.y), 1, 1).applyMatrix4(
      mirrorCamera.projectionMatrix.clone().invert(),
    );
    clip.multiplyScalar(2 / clip.dot(q));
    const e = mirrorCamera.projectionMatrix.elements;
    e[2] = clip.x - e[3];
    e[6] = clip.y - e[7];
    e[10] = clip.z - e[11];
    e[14] = clip.w - e[15];
    mirrorCamera.projectionMatrixInverse
      .copy(mirrorCamera.projectionMatrix)
      .invert();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, mirrorCamera);
  }
  let reflectionFrame = 0;
  const previousView = new THREE.Matrix4(),
    previousProjection = new THREE.Matrix4();
  return {
    floorMaterial,
    registerFloor(mesh) {
      streetFloors.push(mesh);
    },
    update(t) {
      clock.value = t;
    },
    reflect(camera, target) {
      floorLevel.value = expansionSurfaceAt(target.x, target.z)?.height ?? 0;
      waterMaterial.userData.uniforms.uWaterCamera.value.copy(camera.position);
      camera.getWorldDirection(
        waterMaterial.userData.uniforms.uWaterDirection.value,
      );
      // With a stationary camera, only slow scenery changes in the reflected image.
      // Water updates on alternate frames; quiet pavement needs one in four.
      // A moving camera refreshes both immediately.
      const steady =
        camera.matrixWorld.elements.every(
          (value, index) =>
            Math.abs(value - previousView.elements[index]) < 1e-5,
        ) &&
        camera.projectionMatrix.elements.every(
          (value, index) =>
            Math.abs(value - previousProjection.elements[index]) < 1e-5,
        );
      const captureFloor = !steady || reflectionFrame % 4 === 0;
      const captureWater = !steady || reflectionFrame % 2 === 1;
      reflectionFrame++;
      if (!captureFloor && !captureWater) return;
      previousView.copy(camera.matrixWorld);
      previousProjection.copy(camera.projectionMatrix);
      const oldTarget = renderer.getRenderTarget(),
        shadowUpdate = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      water.visible = false;
      streetFloors.forEach((surface) => {
        surface.visible = false;
      });
      if (captureFloor)
        renderReflection(
          camera,
          target,
          floorLevel.value,
          floorReflection,
          floorMatrix,
        );
      streetFloors.forEach((surface) => {
        surface.visible = true;
      });
      if (captureWater)
        renderReflection(camera, target, -0.78, waterReflection, waterMatrix);
      water.visible = true;
      renderer.setRenderTarget(oldTarget);
      renderer.shadowMap.autoUpdate = shadowUpdate;
    },
    resize(w, h) {
      const s = Math.min(1, 768 / w);
      floorReflection.setSize(Math.round(w * s), Math.round(h * s));
      const waterScale = Math.min(1, 1024 / w);
      waterReflection.setSize(
        Math.round(w * waterScale),
        Math.round(h * waterScale),
      );
    },
  };
}
