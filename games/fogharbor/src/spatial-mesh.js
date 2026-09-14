import * as THREE from "three";

// Partition triangles without simplifying or moving their vertices. Rail contact
// surfaces, paving joins, UVs and normals stay identical across cell boundaries.
export function splitStaticMesh(source, cellSize = 24) {
  const geometry = source.geometry;
  const attributes = Object.entries(geometry.attributes);
  const position = geometry.attributes.position;
  const indices = geometry.index;
  const count = indices?.count ?? position.count;
  const start = geometry.drawRange.start;
  const end = Math.min(count, start + geometry.drawRange.count);
  const cells = new Map(), center = new THREE.Vector3(), point = new THREE.Vector3();
  for (let i = start; i + 2 < end; i += 3) {
    const face = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
    center.set(0, 0, 0);
    for (const vertex of face)
      center.add(point.fromBufferAttribute(position, vertex));
    center.multiplyScalar(1 / 3).applyMatrix4(source.matrixWorld);
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, { vertices: new Map(), indices: [], data: attributes.map(() => []) });
    const cell = cells.get(key);
    for (const vertex of face) {
      if (!cell.vertices.has(vertex)) {
        cell.vertices.set(vertex, cell.vertices.size);
        attributes.forEach(([, attribute], a) => {
          for (let c = 0; c < attribute.itemSize; c++)
            cell.data[a].push(attribute.getComponent(vertex, c));
        });
      }
      cell.indices.push(cell.vertices.get(vertex));
    }
  }
  return [...cells].map(([key, cell]) => {
    const chunk = new THREE.BufferGeometry();
    attributes.forEach(([name, attribute], a) =>
      chunk.setAttribute(name, new THREE.Float32BufferAttribute(cell.data[a], attribute.itemSize)));
    chunk.setIndex(cell.indices);
    chunk.computeBoundingBox();
    chunk.computeBoundingSphere();
    const mesh = new THREE.Mesh().copy(source, false);
    mesh.geometry = chunk;
    mesh.name = `${source.name || source.parent?.name || "static surface"} · cell ${key}`;
    return mesh;
  });
}

export function partitionStaticSurfaces(scene, { exclude = () => false, onChunk = () => {} } = {}) {
  scene.updateMatrixWorld(true);
  const sources = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || Array.isArray(mesh.material) || exclude(mesh)) return;
    const geometry = mesh.geometry;
    if (Object.keys(geometry.morphAttributes).length || (geometry.index?.count ?? geometry.attributes.position.count) < 12000) return;
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z) > 30) sources.push(mesh);
  });
  let chunks = 0;
  for (const source of sources) {
    const pieces = splitStaticMesh(source);
    source.parent.add(...pieces);
    for (const piece of pieces) onChunk(piece, source);
    source.removeFromParent();
    chunks += pieces.length;
  }
  return { sources: sources.length, chunks };
}
