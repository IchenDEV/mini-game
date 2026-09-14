import * as THREE from "three";

// A small loft keeps the silhouette readable when a gull crosses a roof.
function bodyGeometry() {
  const vertices = [], indices = [];
  const rings = [
    [-.32, .006], [-.19, .06], [0, .09], [.19, .057],
    [.29, .047], [.36, .018], [.47, .002],
  ];
  rings.forEach(([z, radius]) => {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius * .72, z);
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = ring * 8 + i, b = ring * 8 + (i + 1) % 8;
      indices.push(a, b, b + 8, a, b + 8, a + 8);
    }
  }
  const tail = vertices.length / 3;
  vertices.push(-.12, 0, -.38, .12, 0, -.38, 0, .025, -.19);
  indices.push(tail, tail + 1, tail + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wingGeometry() {
  const geometry = new THREE.BufferGeometry();
  const points = [
    [0, 0, .10], [.33, .055, .14], [.67, .035, -.03],
    [.93, -.02, -.27], [.78, -.016, -.31], [.43, .025, -.17], [0, 0, -.16],
  ];
  const colors = points.flatMap((_, index) =>
    index === 3 || index === 4 ? [.15, .19, .19] : [.65, .70, .68],
  );
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex([0, 1, 5, 1, 2, 5, 2, 3, 4, 2, 4, 5, 0, 5, 6]);
  geometry.computeVertexNormals();
  return geometry;
}

export function createSeabirds(scene) {
  const bodies = new THREE.InstancedMesh(
    bodyGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xbfc7c2, roughness: .9, side: THREE.DoubleSide,
    }),
    3,
  );
  const wings = new THREE.InstancedMesh(
    wingGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .9, side: THREE.DoubleSide,
    }),
    6,
  );
  bodies.name = "gull bodies and tapered tails";
  wings.name = "gull tapered wings with dark tips";
  bodies.frustumCulled = wings.frustumCulled = false;
  scene.add(bodies, wings);
  const bird = new THREE.Object3D(), wing = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  return {
    update(time) {
      for (let b = 0; b < 3; b++) {
        const angle = time * .065 + b * .21;
        bird.position.set(
          Math.cos(angle) * 17 + b,
          11 + b * .4 + Math.sin(angle),
          -10 + Math.sin(angle) * 13,
        );
        bird.rotation.set(0, -angle, 0);
        bird.updateMatrix();
        bodies.setMatrixAt(b, bird.matrix);
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? -1 : 1;
          wing.position.set(sign * .05, 0, 0);
          wing.rotation.set(0, 0, Math.sin(time * 4 + b) * .38 * sign);
          wing.scale.set(sign, 1, 1);
          wing.updateMatrix();
          matrix.multiplyMatrices(bird.matrix, wing.matrix);
          wings.setMatrixAt(b * 2 + side, matrix);
        }
      }
      bodies.instanceMatrix.needsUpdate = wings.instanceMatrix.needsUpdate = true;
    },
  };
}
