import * as THREE from "three";

// Roofs have continuous pitched faces. Tile joints belong to the surface,
// rather than determining the silhouette of the building.
export function hipRoofGeometry(width, depth, height, inset) {
  const ix = Math.min(inset, width / 2 - 0.05);
  const iz = Math.min(inset, depth / 2 - 0.05);
  const bottom = [
    [-width / 2, 0, -depth / 2],
    [width / 2, 0, -depth / 2],
    [width / 2, 0, depth / 2],
    [-width / 2, 0, depth / 2],
  ];
  const top = bottom.map(([x, , z]) => [
    Math.sign(x) * (width / 2 - ix),
    height,
    Math.sign(z) * (depth / 2 - iz),
  ]);
  const positions = [],
    uvs = [];
  function face(a, b, c, d) {
    const origin = new THREE.Vector3(...a);
    const u = new THREE.Vector3(...b).sub(origin).normalize();
    const v = new THREE.Vector3(...d).sub(origin);
    v.addScaledVector(u, -v.dot(u)).normalize();
    for (const point of [a, b, c, a, c, d]) {
      positions.push(...point);
      const local = new THREE.Vector3(...point).sub(origin);
      uvs.push(local.dot(u) / 3, local.dot(v) / 3);
    }
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face(bottom[j], bottom[i], top[i], top[j]);
  }
  face(top[3], top[2], top[1], top[0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function archMouldingGeometry(radius, width = 0.11, depth = 0.15) {
  const outline = new THREE.Shape();
  outline.absarc(0, 0, radius + width, 0, Math.PI, false);
  outline.lineTo(-radius, 0);
  outline.absarc(0, 0, radius, Math.PI, 0, true);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, {
    depth,
    steps: 1,
    curveSegments: 32,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
}

export function masonryMaterial(brick = false) {
  const material = new THREE.MeshStandardMaterial({
    color: brick ? "#96715a" : "#c9c1ad",
    roughness: 0.88,
    metalness: 0,
  });
  material.customProgramCacheKey = () => `continuous-masonry-${brick}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vMasonryPosition; varying vec3 vMasonryNormal;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvMasonryPosition=(modelMatrix*vec4(transformed,1.)).xyz;vMasonryNormal=normalize(mat3(modelMatrix)*normal);",
    );
    shader.fragmentShader =
      "varying vec3 vMasonryPosition; varying vec3 vMasonryNormal;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 wallUV=abs(vMasonryNormal.x)>.5?vMasonryPosition.zy:vMasonryPosition.xy;
      float age=sin(wallUV.x*2.1+sin(wallUV.y*.7))*sin(wallUV.y*1.3)*.012;
      diffuseColor.rgb*=1.+age;
      ${
        brick
          ? `
      vec2 course=wallUV/vec2(.25,.09);
      course.x+=mod(floor(course.y),2.)*.5;
      vec2 seamDistance=min(fract(course),1.-fract(course));
      vec2 aa=max(fwidth(course),vec2(.001));
      vec2 filled=smoothstep(vec2(.02)-aa,vec2(.02)+aa,seamDistance);
      float joint=1.-filled.x*filled.y;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.12,joint*.6);
      `
          : ""
      }
    `,
    );
  };
  return material;
}

export function slateMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#acbbc4",
    roughness: 0.9,
    metalness: 0,
  });
  if (typeof document === "undefined") return material;
  const loader = new THREE.TextureLoader();
  const texture = (url, color = false) => {
    const map = loader.load(url);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    return map;
  };
  material.map = texture("./textures/roof-slates-diff.jpg", true);
  material.normalMap = texture("./textures/roof-slates-nor_gl.jpg");
  material.roughnessMap = texture("./textures/roof-slates-rough.jpg");
  material.normalScale.set(0.35, 0.35);
  return material;
}

export function foliageGeometry() {
  // Small pointed leaves replace the old cubic clumps, retaining open space.
  const points = [],
    uvs = [];
  const center = new THREE.Vector3(0, 0, 0.08);
  const edge = [
    new THREE.Vector3(0, -0.5, 0),
    new THREE.Vector3(-0.23, 0, 0),
    new THREE.Vector3(0, 0.5, 0),
    new THREE.Vector3(0.23, 0, 0),
  ];
  for (let leaf = 0; leaf < 6; leaf++) {
    const angle = (leaf * Math.PI) / 3;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(
        Math.cos(angle) * 0.21,
        ((leaf % 3) - 1) * 0.13,
        Math.sin(angle) * 0.21,
      ),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.35 + leaf * 0.27, angle, 0.6),
      ),
      new THREE.Vector3(0.74, 0.78, 0.74),
    );
    for (let i = 0; i < 4; i++)
      for (const vertex of [edge[i], edge[(i + 1) % 4], center]) {
        const point = vertex.clone().applyMatrix4(transform);
        points.push(...point.toArray());
        uvs.push(vertex.x + 0.5, vertex.y + 0.5);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
