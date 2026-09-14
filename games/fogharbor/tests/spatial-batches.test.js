import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { readModel } from "./helpers/gltf-geometry.js";
import { installCityKit } from "../src/sculpted-districts.js";
import { createAuthoredTrees } from "../src/sculpted-environment.js";
import {
  CITY_PLOTS,
  TREE_PLOTS,
  COURTYARD_PROPS,
  plotHeight,
  terrainHeightAt,
  landscapeHeightAt,
} from "../src/terrain.js";

const matrixKey = (matrix) =>
  Array.from(new Float32Array(matrix.elements)).join(",");
function placementMatrix(position, scale, yaw) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw),
    new THREE.Vector3(...scale),
  );
}
function record(geometry, material) {
  return { geometry, material, matrices: [], anchors: new Map(), batches: [] };
}
function remember(expected, matrix, x, z) {
  const key = matrixKey(matrix);
  expected.matrices.push(key);
  expected.anchors.set(key, [x, z]);
}
function verifyBatches(records, windFor) {
  let totalInstances = 0;
  let largestHorizontalBound = 0;
  for (const expected of records) {
    const actualMatrices = [];
    for (const batch of expected.batches) {
      assert.equal(
        batch.geometry,
        expected.batches[0].geometry,
        "cells share one geometry",
      );
      assert.equal(
        batch.material,
        expected.material,
        "cells share the original material",
      );
      assert.equal(batch.frustumCulled, true);
      assert.ok(
        batch.matrix.equals(new THREE.Matrix4()),
        "no batch-origin rebasing",
      );
      const cells = new Set();
      const box = new THREE.Box3();
      const matrix = new THREE.Matrix4();
      let largestScale = 0;
      expected.geometry.computeBoundingBox();
      expected.geometry.computeBoundingSphere();
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const key = matrixKey(matrix);
        actualMatrices.push(key);
        assert.ok(
          expected.anchors.has(key),
          "instance matrix exactly matches the unbatched placement",
        );
        const [x, z] = expected.anchors.get(key);
        cells.add(`${Math.floor(x / 18)},${Math.floor(z / 18)}`);
        box.union(expected.geometry.boundingBox.clone().applyMatrix4(matrix));
        largestScale = Math.max(largestScale, matrix.getMaxScaleOnAxis());
        const sphere = expected.geometry.boundingSphere
          .clone()
          .applyMatrix4(matrix);
        assert.ok(
          batch.boundingSphere.center.distanceTo(sphere.center) +
            sphere.radius <=
            batch.boundingSphere.radius + 1e-5,
          "culling sphere contains every transformed source sphere",
        );
      }
      assert.equal(
        cells.size,
        1,
        "one 18 m cell per batch, including negative coordinates",
      );
      const margin = windFor(batch) ? 0.03 * largestScale : 0;
      box.expandByScalar(margin);
      assert.ok(box.min.distanceTo(batch.boundingBox.min) < 1e-5);
      assert.ok(box.max.distanceTo(batch.boundingBox.max) < 1e-5);
      const savedSphere = batch.boundingSphere.clone();
      batch.computeBoundingSphere();
      assert.ok(
        Math.abs(savedSphere.radius - batch.boundingSphere.radius - margin) <
          1e-5,
      );
      batch.boundingSphere.copy(savedSphere);
      const size = box.getSize(new THREE.Vector3());
      largestHorizontalBound = Math.max(largestHorizontalBound, size.x, size.z);
      totalInstances += batch.count;
    }
    assert.deepEqual(
      actualMatrices.sort(),
      expected.matrices.sort(),
      "no omitted or duplicated placements",
    );
  }
  return {
    sourceParts: records.length,
    batches: records.reduce(
      (sum, expected) => sum + expected.batches.length,
      0,
    ),
    instances: totalInstances,
    largestHorizontalBound,
  };
}

test("city cell batches preserve all original plot × model-part matrices and tight bounds", () => {
  const asset = readModel("city-kit-v1").scene;
  const expected = new Map();
  asset.updateMatrixWorld(true);
  for (const name of new Set(CITY_PLOTS.map((plot) => plot.name))) {
    const source = asset.getObjectByName(`City_${name}`);
    const inverse = source.matrixWorld.clone().invert();
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const part = record(mesh.geometry, mesh.material);
      expected.set(mesh.geometry, part);
      const local = inverse.clone().multiply(mesh.matrixWorld);
      for (const plot of CITY_PLOTS.filter((plot) => plot.name === name)) {
        const matrix = placementMatrix(
          [plot.x, plotHeight(plot), plot.z],
          [plot.size, plot.size * (plot.heightScale ?? 1), plot.size],
          plot.yaw ?? 0,
        ).multiply(local);
        remember(part, matrix, plot.x, plot.z);
      }
    });
  }
  const root = installCityKit(new THREE.Group(), asset);
  for (const batch of root.children) {
    assert.ok(
      expected.has(batch.geometry),
      "original city geometry is reused directly",
    );
    expected.get(batch.geometry).batches.push(batch);
  }
  const summary = verifyBatches([...expected.values()], () => false);
  assert.ok(
    summary.batches > summary.sourceParts,
    "world-spanning source batches were subdivided",
  );
  assert.ok(
    summary.largestHorizontalBound < 32,
    "city bounds remain at street-block scale",
  );
  console.info("City spatial batches:", summary);
});

function geometryKey(geometry, material) {
  const hash = createHash("sha256");
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name];
    hash.update(name);
    hash.update(
      Buffer.from(
        attribute.array.buffer,
        attribute.array.byteOffset,
        attribute.array.byteLength,
      ),
    );
  }
  if (geometry.index)
    hash.update(
      Buffer.from(
        geometry.index.array.buffer,
        geometry.index.array.byteOffset,
        geometry.index.array.byteLength,
      ),
    );
  return material.uuid + ":" + hash.digest("hex");
}

test("tree and planter cells retain global variation indices, shared baked geometry and wind clearance", () => {
  const asset = readModel("trees-v1").scene;
  const expected = new Map();
  for (const [kind, name] of ["Tree_Plane", "Tree_Hornbeam"].entries()) {
    const source = asset.getObjectByName(name);
    source.updateWorldMatrix(true, true);
    const inverse = source.matrixWorld.clone().invert();
    // This is the original unbatched species/index assignment, before cell grouping.
    const trees = TREE_PLOTS.filter((p, index) =>
      p[2]
        ? kind === 1
        : index % 3 === (kind === 0 ? 0 : 1) || (kind === 0 && index % 3 === 2),
    );
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      const part = record(geometry, mesh.material);
      expected.set(geometryKey(geometry, mesh.material), part);
      trees.forEach(([x, z, shrubScale], i) => {
        const size = shrubScale ?? (kind === 0 ? 1.18 : 1) + (i % 4) * 0.05;
        remember(
          part,
          placementMatrix(
            [
              x,
              terrainHeightAt(x, z) ?? Math.max(0, landscapeHeightAt(x, z)),
              z,
            ],
            [size, size, size],
            i * 2.399,
          ),
          x,
          z,
        );
      });
      if (kind === 1)
        COURTYARD_PROPS.filter((prop) => prop.kind === "planter").forEach(
          (prop, i) => {
            remember(
              part,
              placementMatrix(
                [prop.x, terrainHeightAt(prop.x, prop.z) + 0.36, prop.z],
                [0.48, 0.48, 0.48],
                i * 2.399,
              ),
              prop.x,
              prop.z,
            );
          },
        );
    });
  }
  const { root, update } = createAuthoredTrees(asset);
  const batches = root.children.filter((batch) =>
    /^(Tree_|potted hornbeam)/.test(batch.name),
  );
  const keys = new Map();
  for (const batch of batches) {
    if (!keys.has(batch.geometry))
      keys.set(batch.geometry, geometryKey(batch.geometry, batch.material));
    const key = keys.get(batch.geometry);
    assert.ok(
      expected.has(key),
      "baked vertices, normals, UVs and indices are unchanged",
    );
    expected.get(key).batches.push(batch);
  }
  const summary = verifyBatches([...expected.values()], (batch) =>
    /leaf|foliage/i.test(batch.material.name),
  );
  assert.ok(summary.batches > summary.sourceParts);
  assert.ok(
    summary.largestHorizontalBound < 34,
    "tree bounds remain local after allowing canopy width",
  );
  const leaf = batches.find((batch) =>
    /leaf|foliage/i.test(batch.material.name),
  );
  const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>" };
  leaf.material.onBeforeCompile(shader);
  update(12.5);
  assert.equal(
    shader.uniforms.uTreeWind.value,
    12.5,
    "all cells retain the existing shared wind clock",
  );
  console.info("Tree spatial batches:", summary);
});
