import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { followSun } from "../src/render-stability.js";
import { createGround } from "../src/ground.js";

test("street paving never stacks nearly coplanar opaque floor sheets", () => {
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  const scene = new THREE.Scene();
  try {
    createGround(scene, { capabilities: { getMaxAnisotropy: () => 8 } });
  } finally {
    THREE.TextureLoader.prototype.load = originalLoad;
  }
  const floors = scene.children.filter((o) => o.isMesh && o.position.y > 0);
  const bounds = floors.map((o) => new THREE.Box3().setFromObject(o));
  for (let i = 0; i < floors.length; i++)
    for (let j = i + 1; j < floors.length; j++) {
      const a = bounds[i],
        b = bounds[j];
      const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
      const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
      assert.ok(
        overlapX <= 0.001 ||
          overlapZ <= 0.001 ||
          Math.abs(floors[i].position.y - floors[j].position.y) >= 0.02,
        `paving sheets ${i}/${j} compete over ${(overlapX * overlapZ).toFixed(1)} square metres`,
      );
    }
});

test("following the player preserves the shadow texel phase on stationary masonry", () => {
  const sun = new THREE.DirectionalLight();
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -25,
    right: 25,
    top: 25,
    bottom: -25,
    near: 0.1,
    far: 85,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const masonry = new THREE.Vector3(-6.6, 4, -3.76);
  let initial;
  for (let i = 0; i < 100; i++) {
    followSun(sun, new THREE.Vector3(i * 0.013, 2.3, i * -0.009));
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const p = masonry
      .clone()
      .applyMatrix4(sun.shadow.matrix)
      .multiplyScalar(2048);
    initial ??= p.clone();
    for (const axis of ["x", "y"]) {
      const delta = p[axis] - initial[axis];
      assert.ok(
        Math.abs(delta - Math.round(delta)) < 1e-6,
        `stationary wall slides by ${delta.toFixed(4)} shadow texels during camera movement`,
      );
    }
  }
});

test("reflection reuse never delays a moving or zooming camera", () => {
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  let renders = 0,
    currentTarget = null;
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => currentTarget,
    setRenderTarget: (target) => {
      currentTarget = target;
    },
    clear() {},
    render() {
      renders++;
    },
  };
  let ground;
  try {
    ground = createGround(new THREE.Scene(), renderer);
  } finally {
    THREE.TextureLoader.prototype.load = originalLoad;
  }
  const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 150),
    focus = new THREE.Vector3();
  camera.position.set(15, 18, 15);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
  ground.reflect(camera, focus);
  assert.equal(renders, 2);
  ground.reflect(camera, focus);
  assert.equal(
    renders,
    3,
    "steady camera refreshes the water independently",
  );
  ground.reflect(camera, focus);
  assert.equal(renders, 3, "quiet frame reuses both reflection images");
  camera.position.x += 0.2;
  camera.updateMatrixWorld(true);
  ground.reflect(camera, focus);
  assert.equal(renders, 5, "camera movement refreshes immediately");
  ground.reflect(camera, focus);
  camera.left = -9;
  camera.updateProjectionMatrix();
  ground.reflect(camera, focus);
  assert.equal(renders, 8, "zoom refreshes immediately");
  assert.equal(currentTarget, null);
  assert.equal(renderer.shadowMap.autoUpdate, true);
});
