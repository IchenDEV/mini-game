import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { REGIONS } from "../src/game-state.js";
import { createCollectible, createRegulator } from "../src/prop-models.js";

test("all regional props have grounded, bounded, opaque batched geometry and isolated animation hooks", () => {
  const signatures = [new Set(), new Set()];
  const materials = new Set();
  for (const region of REGIONS) {
    for (const [kind, create] of [createCollectible, createRegulator].entries()) {
      for (let id = 0; id < 3; id++) {
        const root = create(region, id);
        assert.ok(root instanceof THREE.Group);
        assert.deepEqual(root.position.toArray(), [0, 0, 0]);
        const box = new THREE.Box3().setFromObject(root, true);
        assert.ok(Math.abs(box.min.y) < 1e-6, `${root.name} foot at y=0`);
        assert.ok(box.max.y <= 1.95 && box.max.y > 1.5);
        assert.ok(box.min.x >= -0.7 && box.max.x <= 0.7);
        assert.ok(box.min.z >= -0.7 && box.max.z <= 0.7);
        let meshes = 0, vertices = 0;
        const ownedMaterials = new Set();
        root.traverse((object) => {
          if (object.isGroup) {
            const batch = object.children.filter((child) => child.isMesh);
            assert.equal(new Set(batch.map((mesh) => mesh.material)).size, batch.length,
              "One mesh per material per assembly");
          }
          if (!object.isMesh) return;
          meshes++;
          vertices += object.geometry.attributes.position.count;
          assert.ok(object.castShadow && object.receiveShadow);
          assert.equal(object.material.transparent, false);
          assert.equal(object.material.opacity, 1);
          assert.ok(object.material.emissiveIntensity <= 0.5);
          assert.ok(object.geometry.index.count > 0);
          for (const attribute of Object.values(object.geometry.attributes))
            assert.ok(attribute.array.every(Number.isFinite));
          assert.ok(!materials.has(object.material), "Materials are not shared between props");
          ownedMaterials.add(object.material);
        });
        for (const material of ownedMaterials) materials.add(material);
        assert.ok(meshes <= 8, `${root.name}: ${meshes} draw calls`);
        assert.ok(vertices < 18000, `${root.name}: ${vertices} vertices`);
        if (kind === 0) {
          const spinner = root.userData.spinner;
          assert.ok(spinner instanceof THREE.Group && spinner.parent === root);
          assert.deepEqual(spinner.position.toArray(), [0, 1.35, 0]);
          const center = new THREE.Box3().setFromObject(spinner, true).getCenter(new THREE.Vector3());
          assert.ok(Math.abs(center.y - 1.35) < 0.025);
          for (let step = 0; step < 8; step++) {
            spinner.rotation.y = step * Math.PI / 4;
            spinner.position.y = 1.35 + Math.sin(step) * 0.1;
            const animated = new THREE.Box3().setFromObject(root, true);
            assert.ok(animated.min.y >= -1e-6 && animated.max.y <= 1.95);
            assert.ok(Math.max(Math.abs(animated.min.x), Math.abs(animated.max.x),
              Math.abs(animated.min.z), Math.abs(animated.max.z)) < 0.7);
          }
        } else {
          assert.ok(root.name.includes(region.labels[id]));
          assert.equal(root.userData.needle.parent, root);
          assert.ok(ownedMaterials.has(root.userData.lamp));
          root.userData.needle.rotation.z = 0.5;
          root.userData.lamp.emissive.set(0x33bc8e);
        }
        if (id === 0) signatures[kind].add(`${vertices}:${box.getSize(new THREE.Vector3()).toArray()}`);
        root.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
        for (const material of ownedMaterials) material.dispose();
      }
    }
  }
  assert.deepEqual(signatures.map((set) => set.size), [6, 6], "Regional art must not be recolored copies");
});

test("factories accept region IDs and reject invalid region/item IDs", () => {
  for (const create of [createCollectible, createRegulator]) {
    assert.ok(create("brasshaven", 0).isGroup);
    assert.throws(() => create("missing", 0), RangeError);
    for (const id of [-1, 3, 0.5, undefined])
      assert.throws(() => create(REGIONS[0], id), RangeError);
  }
});
