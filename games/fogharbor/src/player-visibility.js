import * as THREE from "three";

// GreaterDepth reveals only the pixels hidden by foreground architecture.
// The dedicated camera layer excludes the cue from reflections and shadows.
export function addPlayerVisibilityCue(player) {
  const parts = [];
  player.traverse((object) => { if (object.isMesh) parts.push(object); });
  const material = new THREE.MeshBasicMaterial({
    color: 0xefcc86,
    transparent: true,
    opacity: .58,
    depthTest: true,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    toneMapped: false,
  });
  const foregroundMaterials = new Map();
  return parts.map((part) => {
    const foreground = (source) => {
      if (!foregroundMaterials.has(source)) {
        const copy = source.clone();
        // Draw the opaque-looking character after the cue, so its own limbs
        // do not appear as occluders in the cue's depth comparison.
        copy.transparent = true;
        copy.depthWrite = true;
        foregroundMaterials.set(source, copy);
      }
      return foregroundMaterials.get(source);
    };
    part.material = Array.isArray(part.material)
      ? part.material.map(foreground) : foreground(part.material);
    part.renderOrder = 1001;
    const cue = new THREE.Mesh(part.geometry, material);
    cue.name = "occluded player silhouette";
    cue.layers.set(1);
    cue.renderOrder = 1000;
    cue.castShadow = cue.receiveShadow = false;
    part.add(cue);
    return cue;
  });
}
