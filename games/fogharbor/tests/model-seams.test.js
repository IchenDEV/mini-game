import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Matrix4, Quaternion, Vector3 } from "three";

// Audit the shipped geometry, not the dimensions written in the authoring script.
function trianglesFor(filename, materialName, rootName) {
  const bytes = readFileSync(new URL(`../public/models/${filename}`, import.meta.url));
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const binaryStart = 28 + jsonSize;
  function accessor(index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const dimensions = a.type === "VEC3" ? 3 : 1;
    const componentBytes = a.componentType === 5123 ? 2 : 4;
    const stride = view.byteStride ?? dimensions * componentBytes;
    const offset = binaryStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const read = a.componentType === 5126 ? "readFloatLE" :
      a.componentType === 5123 ? "readUInt16LE" : "readUInt32LE";
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: dimensions }, (_, j) => bytes[read](offset + i * stride + j * componentBytes)));
  }
  const triangles = [];
  function visit(index, parent) {
    const node = gltf.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new Vector3().fromArray(node.scale ?? [1, 1, 1]),
    );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (gltf.materials[primitive.material].name !== materialName) continue;
      const points = accessor(primitive.attributes.POSITION).map(p => new Vector3().fromArray(p).applyMatrix4(world));
      const indices = accessor(primitive.indices).flat();
      for (let i = 0; i < indices.length; i += 3) triangles.push({
        mesh: node.name, index: i / 3, points: indices.slice(i, i + 3).map(j => points[j]),
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  }
  for (const index of gltf.scenes[gltf.scene].nodes) {
    if (!rootName || gltf.nodes[index].name === rootName) visit(index, new Matrix4());
  }
  return triangles;
}

function facesAt(triangles, axis, sample, outward = Math.sign(sample[axis])) {
  const otherAxes = ["x", "y", "z"].filter(a => a !== axis);
  return triangles.filter(({ points }) => {
    if (!points.every(p => Math.abs(p[axis] - sample[axis]) < 1e-5)) return false;
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    if (normal[axis] * outward < .999) return false;
    const sides = points.map((a, i) => {
      const b = points[(i + 1) % 3], [u, v] = otherAxes;
      return (b[u] - a[u]) * (sample[v] - a[v]) - (b[v] - a[v]) * (sample[u] - a[u]);
    });
    return sides.every(value => value >= -1e-7) || sides.every(value => value <= 1e-7);
  });
}

const corners = [
  { file: "workshop-v1.glb", material: "Warm weathered brick", x: 4.1, y: 2.137, z: -2.441317 },
  { file: "soup-house-v1.glb", material: "Limestone trim", x: 3, y: 1.777, z: -2.231317 },
  { file: "civic-details-v1.glb", material: "Warm weathered brick", x: 2.25, y: 2.137, z: -1.631317 },
];
for (const corner of corners) test(`${corner.file}: masonry corners expose one opaque face`, () => {
  const triangles = trianglesFor(corner.file, corner.material);
  for (const sign of [-1, 1]) {
    const sample = { x: corner.x * sign, y: corner.y, z: corner.z };
    const hits = facesAt(triangles, "x", sample);
    assert.equal(hits.length, 1,
      `${corner.file} at ${JSON.stringify(sample)} has ${hits.length} coplanar outward faces: ` +
      hits.map(hit => `${hit.mesh} triangle ${hit.index}`).join(", "));
  }
  if (corner.file === "civic-details-v1.glb") for (const x of [-2.12, 2.12]) {
    const sample = { x, y: 2.137, z: -1.75 };
    assert.equal(facesAt(triangles, "z", sample).length, 1,
      `Watergate rear at ${JSON.stringify(sample)} must not duplicate the side-wall end cap`);
  }
  if (corner.file === "civic-details-v1.glb") for (const x of [-2.25, 2.25]) {
    const sample = { x, y: 2.137, z: 1.681317 };
    assert.equal(facesAt(triangles, "x", sample).length, 1,
      `Watergate front at ${JSON.stringify(sample)} must not overlap the loadbearing pier`);
  }
});

test("all three wharf houses have non-overlapping front and rear corner infill", () => {
  for (const [x, z, width, depth, height, material] of [
    [-37, -6, 5.4, 4.5, 5.9, "Limestone trim"],
    [-29.85, -6.35, 6.1, 3.8, 4.4, "Warm weathered brick"],
    [-22.5, -5.9, 5.6, 4.8, 6.5, "Limestone trim"],
  ]) {
    const triangles = trianglesFor("wharf-v1.glb", material);
    for (const sign of [-1, 1]) for (const depthSample of [z - depth / 2 + .131317, z + depth / 2 - .111317]) {
      const sample = { x: x + sign * width / 2, y: (height + 3.08) / 2, z: depthSample };
      assert.equal(facesAt(triangles, "x", sample, sign).length, 1,
        `Wharf house ${x} exposes overlapping masonry at ${JSON.stringify(sample)}`);
    }
  }
});

test("pumpworks exterior corner skins remain single-faced", () => {
  const triangles = trianglesFor("pumpworks-v1.glb", "Warm weathered brick");
  for (const x of [-7.65, 7.65]) for (const z of [-4.4, 4.4]) {
    assert.equal(facesAt(triangles, "x", { x, y: 2.137, z }).length, 1);
  }
});

test("all six city-kit avoid duplicate faces on their canonical exterior planes", () => {
  for (const [root, width, depth, material] of [
    ["City_Terrace", 4, 4, "Warm weathered brick"],
    ["City_CornerInn", 5.5, 4.5, "Warm weathered brick"],
    ["City_Warehouse", 5.5, 5, "Warm weathered brick"],
    ["City_Townhouse", 4.8, 4.5, "Limestone trim"],
    ["City_PostOffice", 6, 4.5, "Warm weathered brick"],
    ["City_Chapel", 6, 6, "Limestone trim"],
  ]) {
    const triangles = trianglesFor("city-kit-v1.glb", material, root);
    for (const sign of [-1, 1]) {
      const side = { x: sign * (width / 2 + .12), y: 2.137, z: -depth / 2 + .32 };
      const rear = { x: sign * (width / 2 - .15), y: 2.137, z: -depth / 2 - .03 };
      assert.ok(triangles.length > 0, `${root}: missing masonry geometry`);
      assert.ok(facesAt(triangles, "x", side).length <= 1, `${root}: overlapping side skin`);
      assert.ok(facesAt(triangles, "z", rear).length <= 1, `${root}: overlapping rear skin`);
    }
  }
});
