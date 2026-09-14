import { readFileSync } from "node:fs";
import * as THREE from "three";

// Load actual exported vertices and node transforms without a browser image decoder.
export function readModel(name) {
  const bytes = readFileSync(
    new URL(`../../public/models/${name}.glb`, import.meta.url),
  );
  const jsonSize = bytes.readUInt32LE(12),
    document = JSON.parse(bytes.subarray(20, 20 + jsonSize));
  const binary = bytes.subarray(28 + jsonSize);
  const readAccessor = (index) => {
    const a = document.accessors[index],
      v = document.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const step =
      a.componentType === 5123 ? 2 : a.componentType === 5121 ? 1 : 4;
    const read =
      a.componentType === 5126
        ? "readFloatLE"
        : a.componentType === 5123
          ? "readUInt16LE"
          : a.componentType === 5121
            ? "readUInt8"
            : "readUInt32LE";
    const stride = v.byteStride ?? size * step,
      offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      values = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < size; j++)
        values.push(binary[read](offset + i * stride + j * step) /
          (a.normalized ? (a.componentType === 5121 ? 255 : 65535) : 1));
    return { values, size };
  };
  const materials = document.materials.map(
    (m) =>
      new THREE.MeshStandardMaterial({
        name: m.name,
        transparent: m.alphaMode === "BLEND",
      }),
  );
  const nodes = document.nodes.map((n) => {
    const node = new THREE.Group();
    node.name = n.name ?? "";
    node.userData = n.extras ?? {};
    if (n.matrix)
      new THREE.Matrix4()
        .fromArray(n.matrix)
        .decompose(node.position, node.quaternion, node.scale);
    else {
      node.position.fromArray(n.translation ?? [0, 0, 0]);
      node.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1]);
      node.scale.fromArray(n.scale ?? [1, 1, 1]);
    }
    if (n.mesh !== undefined)
      for (const primitive of document.meshes[n.mesh].primitives) {
        const geometry = new THREE.BufferGeometry();
        for (const [semantic, name] of [
          ["POSITION", "position"],
          ["NORMAL", "normal"],
          ["TEXCOORD_0", "uv"],
          ["COLOR_0", "color"],
        ]) {
          if (primitive.attributes[semantic] === undefined) continue;
          const a = readAccessor(primitive.attributes[semantic]);
          geometry.setAttribute(
            name,
            new THREE.Float32BufferAttribute(a.values, a.size),
          );
        }
        if (primitive.indices !== undefined)
          geometry.setIndex(readAccessor(primitive.indices).values);
        node.add(new THREE.Mesh(geometry, materials[primitive.material]));
      }
    return node;
  });
  document.nodes.forEach((n, i) => {
    for (const child of n.children ?? []) nodes[i].add(nodes[child]);
  });
  const scene = new THREE.Group();
  for (const index of document.scenes[document.scene ?? 0].nodes)
    scene.add(nodes[index]);
  scene.updateMatrixWorld(true);
  return { scene, document };
}
