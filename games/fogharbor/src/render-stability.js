import * as THREE from "three";

const sunOffset = new THREE.Vector3(-18, 28, 17);
const lightBasis = new THREE.Matrix4().lookAt(
  sunOffset,
  new THREE.Vector3(),
  THREE.Object3D.DEFAULT_UP,
);
const right = new THREE.Vector3().setFromMatrixColumn(lightBasis, 0);
const up = new THREE.Vector3().setFromMatrixColumn(lightBasis, 1);

export function followSun(sun, focus) {
  // Move the shadow window in whole light-space texels, not fractions of them.
  // Geometry stays on the same samples while the camera eases behind the player.
  const target = sun.target.position.set(focus.x, 0, focus.z);
  const camera = sun.shadow.camera;
  const width = (camera.right - camera.left) / sun.shadow.mapSize.x;
  const height = (camera.top - camera.bottom) / sun.shadow.mapSize.y;
  const x = target.dot(right),
    y = target.dot(up);
  target.addScaledVector(right, Math.round(x / width) * width - x);
  target.addScaledVector(up, Math.round(y / height) * height - y);
  sun.position.copy(target).add(sunOffset);
}
