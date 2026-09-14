import { transformLODGeometry, splitInstanceBatches } from "./model-lod.js";
import * as THREE from "three";
import {
  retainingEdges,
  COURTYARD_PROPS,
  UNDERGROWTH_PATCHES,
  NORTH_PAVING,
  CITY_PLOTS,
  plotObstacle,
  insidePolygon,
  terrainSurfaceAt,
  TREE_PLOTS,
  terrainHeightAt,
  landscapeHeightAt,
} from "./terrain.js";

function meshFor(asset, name) {
  const node = asset.getObjectByName(name);
  const mesh = node?.isMesh
    ? node
    : node?.children.length === 1
      ? node.children[0]
      : null;
  if (!mesh?.isMesh) throw new Error(`Missing environment mesh ${name}`);
  return mesh;
}
function instances(source, placements, name) {
  const mesh = new THREE.InstancedMesh(
    source.geometry,
    source.material,
    placements.length,
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion();
  placements.forEach(({ position, scale = [1, 1, 1], yaw = 0 }, index) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    matrix.compose(
      new THREE.Vector3(...position),
      q,
      new THREE.Vector3(...scale),
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

export function createMasonryDetails(asset) {
  const root = new THREE.Group();
  root.name = "authored retaining masonry and canal edges";
  const panels = [],
    caps = [],
    buttresses = [],
    drains = [];
  function wall(a, b, outward, height, base = 0, bank = false) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz),
      yaw = Math.atan2(outward[0], outward[1]);
    const pieces = Math.ceil(length / 2),
      width = length / pieces,
      rows = bank ? 2 : Math.ceil(height / 1.4 - 1e-6),
      rowHeight = height / rows;
    for (let i = 0; i < pieces; i++) {
      const t = (i + 0.5) / pieces,
        x = a[0] + dx * t,
        z = a[1] + dz * t;
      for (let row = 0; row < rows; row++)
        panels.push({
          position: [
            x + outward[0] * 0.105,
            base + row * rowHeight,
            z + outward[1] * 0.105,
          ],
          scale: [width / 2, 0.995 * rowHeight, 1],
          yaw,
        });
      caps.push({
        position: [
          x + outward[0] * 0.07,
          base + height - 0.05,
          z + outward[1] * 0.07,
        ],
        scale: [width / 2, 1, 1],
        yaw,
      });
    }
    if (!bank && length > 3.5) {
      for (let distance = 1.3; distance < length - 1; distance += 6.5) {
        const t = distance / length,
          x = a[0] + dx * t,
          z = a[1] + dz * t;
        buttresses.push({
          position: [x + outward[0] * 0.27, base, z + outward[1] * 0.27],
          scale: [1, height / 2.7, 1],
          yaw,
        });
      }
    }
    if (length > 5) {
      const x = (a[0] + b[0]) / 2,
        z = (a[1] + b[1]) / 2;
      drains.push({
        position: [
          x + outward[0] * 0.295,
          bank ? -0.26 : base + 0.42,
          z + outward[1] * 0.295,
        ],
        yaw,
      });
    }
  }
  for (const edge of retainingEdges())
    wall(edge.a, edge.b, edge.outward, edge.terrace.height);
  for (const [z, outward] of [
    [6.42, [0, 1]],
    [15.71, [0, -1]],
  ]) {
    for (const [left, right] of [
      [-78, -60.1],
      [-55.9, -36.1],
      [-31.9, -12.1],
      [-7.9, 27],
    ])
      wall([left, z], [right, z], outward, 1.58, -1.5, true);
  }
  for (const [name, placements] of [
    ["Masonry_Panel", panels],
    ["Masonry_Coping", caps],
    ["Masonry_Buttress", buttresses],
    ["Masonry_Drain", drains],
  ])
    root.add(...splitInstanceBatches(instances(meshFor(asset, name), placements, name)));
  const materials = new Set();
  root.traverse((mesh) => {
    if (mesh.isMesh) materials.add(mesh.material);
  });
  for (const material of materials) {
    if (/iron/i.test(material.name)) continue;
    material.customProgramCacheKey = () => "harbor-damp-masonry-1";
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 vMasonryWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 masonryPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        masonryPosition=instanceMatrix*masonryPosition;
        #endif
        vMasonryWorld=(modelMatrix*masonryPosition).xyz;
      `,
      );
      shader.fragmentShader =
        "varying vec3 vMasonryWorld;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float dampBase=1.-smoothstep(-.7,.65,vMasonryWorld.y);
        float tide=(1.-smoothstep(.03,.22,abs(vMasonryWorld.y+.72)))*(.7+.3*sin(vMasonryWorld.x*2.1));
        diffuseColor.rgb*=mix(vec3(1.),vec3(.56,.62,.55),dampBase*.65+tide*.35);
      `,
      );
    };
  }
  return root;
}

export function createAuthoredTrees(asset) {
  const root = new THREE.Group();
  root.name = "authored plane trees and hornbeams";
  const wind = { value: 0 },
    finished = new Set();
  function addTreeCells(source, placements, name, hasWind) {
    const cells = new Map();
    for (const placement of placements) {
      const [x, , z] = placement.position;
      const cell = `${Math.floor(x / 18)},${Math.floor(z / 18)}`;
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(placement);
    }
    for (const [cell, localPlacements] of cells) {
      const batch = instances(
        source,
        localPlacements,
        `${name} · cell ${cell}`,
      );
      batch.computeBoundingBox();
      if (hasWind) {
        const largestScale = localPlacements.reduce(
          (largest, placement) => Math.max(largest, ...placement.scale),
          0,
        );
        // Covers the shader's 1.8 cm / 1.2 cm sway after instance scaling.
        const windMargin = 0.03 * largestScale;
        batch.boundingBox.expandByScalar(windMargin);
        batch.boundingSphere.radius += windMargin;
      }
      root.add(batch);
    }
  }
  for (const [kind, name] of ["Tree_Plane", "Tree_Hornbeam"].entries()) {
    const source = asset.getObjectByName(name);
    if (!source) throw new Error(`Missing tree ${name}`);
    source.updateWorldMatrix(true, true);
    const inverse = source.matrixWorld.clone().invert();
    const placements = TREE_PLOTS.filter((p, index) =>
      p[2]
        ? kind === 1
        : index % 3 === (kind === 0 ? 0 : 1) || (kind === 0 && index % 3 === 2),
    );
    // Compute variation before bucketing so the original index still drives it.
    const treePlacements = placements.map(([x, z, shrubScale], i) => {
      const size = shrubScale ?? (kind === 0 ? 1.18 : 1) + (i % 4) * 0.05;
      return {
        position: [
          x,
          terrainHeightAt(x, z) ?? Math.max(0, landscapeHeightAt(x, z)),
          z,
        ],
        scale: [size, size, size],
        yaw: i * 2.399,
      };
    });
    const planterPlacements =
      kind === 1
        ? COURTYARD_PROPS.filter((prop) => prop.kind === "planter").map(
            (prop, index) => ({
              position: [
                prop.x,
                terrainHeightAt(prop.x, prop.z) + 0.36,
                prop.z,
              ],
              scale: [0.48, 0.48, 0.48],
              yaw: index * 2.399,
            }),
          )
        : [];
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const material = mesh.material;
      if (!finished.has(material)) {
        finished.add(material);
        if (/leaf|foliage/i.test(material.name)) {
          material.color.multiplyScalar(0.82);
          material.customProgramCacheKey = () => "harbor-leaf-breeze-1";
          material.onBeforeCompile = (shader) => {
            shader.uniforms.uTreeWind = wind;
            shader.vertexShader =
              "uniform float uTreeWind;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
              float branchWeight=smoothstep(1.5,6.,position.y);
              transformed.x+=sin(uTreeWind*.7+position.x*2.+position.y)*.018*branchWeight;
              transformed.z+=cos(uTreeWind*.55+position.z*2.)*.012*branchWeight;
            `,
            );
          };
        }
      }
      const local = inverse.clone().multiply(mesh.matrixWorld),
        geometry = transformLODGeometry(mesh.geometry, local);
      const proxy = { geometry, material };
      const hasWind = /leaf|foliage/i.test(material.name);
      addTreeCells(proxy, treePlacements, name + " · " + mesh.name, hasWind);
      addTreeCells(
        proxy,
        planterPlacements,
        "potted hornbeam · " + mesh.name,
        hasWind,
      );
    });
  }
  // Sparse folded grass blades give selected wet-soil pockets actual silhouette and depth.
  const bladePositions = [],
    bladeColors = [];
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * 2.4,
      height = 0.28 + (blade % 3) * 0.065;
    const vertices = [];
    for (let row = 0; row <= 3; row++) {
      const t = row / 3,
        width = 0.028 * (1 - t) + 0.002,
        bend = t * t * 0.1;
      for (const side of [-1, 1])
        vertices.push(
          new THREE.Vector3(
            Math.cos(angle) * bend + Math.sin(angle) * side * width,
            t * height,
            Math.sin(angle) * bend - Math.cos(angle) * side * width,
          ),
        );
    }
    for (let row = 0; row < 3; row++)
      for (const i of [
        row * 2,
        row * 2 + 1,
        row * 2 + 2,
        row * 2 + 1,
        row * 2 + 3,
        row * 2 + 2,
      ]) {
        const v = vertices[i];
        bladePositions.push(v.x, v.y, v.z);
        bladeColors.push(0.18 + v.y * 0.14, 0.23 + v.y * 0.2, 0.11 + v.y * 0.1);
      }
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(bladePositions, 3),
  );
  grassGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(bladeColors, 3),
  );
  grassGeometry.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({
    name: "Harbor undergrowth blades",
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const growth = [];
  for (const [cx, cz, rx, rz] of UNDERGROWTH_PATCHES)
    for (let i = 0; i < 100; i++) {
      const a = i * 2.399,
        r = Math.sqrt((i + 0.5) / 100),
        x = cx + Math.cos(a) * r * rx,
        z = cz + Math.sin(a) * r * rz;
      if (
        terrainSurfaceAt(x, z) ||
        NORTH_PAVING.some((p) => insidePolygon(x, z, p))
      )
        continue;
      if (
        CITY_PLOTS.some((plot) => {
          const b = plotObstacle(plot);
          return (
            x > b.minX - 0.2 &&
            x < b.maxX + 0.2 &&
            z > b.minZ - 0.2 &&
            z < b.maxZ + 0.2
          );
        })
      )
        continue;
      const scale = 0.8 + (i % 7) * 0.09;
      growth.push({
        position: [x, Math.max(0, landscapeHeightAt(x, z)), z],
        scale: [scale, scale, scale],
        yaw: a,
      });
    }
  root.add(
    instances(
      { geometry: grassGeometry, material: grassMaterial },
      growth,
      "grass and wet-soil pockets",
    ),
  );
  const ivySource = asset.getObjectByName(
    "Tree_Hornbeam_Tree_foliage_shaded_olive",
  );
  if (ivySource?.isMesh) {
    ivySource.geometry.computeBoundingBox();
    const center = ivySource.geometry.boundingBox.getCenter(new THREE.Vector3());
    const transform = new THREE.Matrix4().makeScale(0.28, 0.48, 0.19)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    const geometry = transformLODGeometry(ivySource.geometry, transform);
    const placements = retainingEdges()
      .filter(
        (edge, index) =>
          index % 4 === 1 &&
          Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) > 2.5,
      )
      .map((edge) => ({
        position: [
          edge.a[0] + (edge.b[0] - edge.a[0]) * 0.28 + edge.outward[0] * 0.42,
          edge.terrace.height - 0.62,
          edge.a[1] + (edge.b[1] - edge.a[1]) * 0.28 + edge.outward[1] * 0.42,
        ],
        yaw: Math.atan2(edge.outward[0], edge.outward[1]),
      }));
    root.add(
      ...splitInstanceBatches(instances(
        { geometry, material: ivySource.material },
        placements,
        "wall ivy",
      )),
    );
  }
  return {
    root,
    update(time) {
      wind.value = time;
    },
  };
}
