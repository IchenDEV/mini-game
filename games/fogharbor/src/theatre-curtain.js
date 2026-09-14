import * as THREE from "three";

const HEIGHT = 10;
const COLS = 80;
const ROWS = 36;
const clamp = THREE.MathUtils.clamp;
const smooth = (value) => value * value * (3 - 2 * value);

function fabricGeometry(columns, rows) {
  const geometry = new THREE.PlaneGeometry(1, 1, columns, rows);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

/** An independent transparent theatre layer; the host owns its animation loop. */
export async function createTheatreCurtain(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 30);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);
  const resources = new Set();
  const own = (resource) => (resources.add(resource), resource);
  const loader = new THREE.TextureLoader();
  async function texture(url, color = false) {
    try {
      const map = own(await loader.loadAsync(url));
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(4, 2.5);
      map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      if (color) map.colorSpace = THREE.SRGBColorSpace;
      return map;
    } catch {
      // The dimensional pleats and velvet material remain usable offline.
      return null;
    }
  }
  const [map, normalMap, roughnessMap] = await Promise.all([
    texture("./theatre/velvet-diff.jpg", true),
    texture("./theatre/velvet-normal.jpg"),
    texture("./theatre/velvet-rough.jpg"),
  ]);
  const velvet = own(new THREE.MeshPhysicalMaterial({
    color: 0x6b102b,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughnessMap,
    roughness: 0.94,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xa3454d),
    sheenRoughness: 0.66,
    side: THREE.DoubleSide,
  }));
  const gold = own(new THREE.MeshStandardMaterial({
    color: 0xb48b47,
    metalness: 0.65,
    roughness: 0.46,
    emissive: 0x382109,
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  }));
  scene.add(new THREE.AmbientLight(0xb6a2a0, 0.72));
  const key = new THREE.DirectionalLight(0xffdcba, 2.8);
  key.position.set(-7, 5, 7);
  scene.add(key);
  const grazing = new THREE.DirectionalLight(0xe4c8d1, 1.55);
  grazing.position.set(9, 1, 3);
  scene.add(grazing);
  const footlight = new THREE.PointLight(0xffbb70, 18, 22, 2);
  footlight.position.set(0, -5.3, 5);
  scene.add(footlight);

  const panels = [-1, 1].map((side) => {
    const geometry = own(fabricGeometry(COLS, ROWS));
    const mesh = new THREE.Mesh(geometry, velvet);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const borderGeometry = own(fabricGeometry(1, ROWS));
    const border = new THREE.Mesh(borderGeometry, gold);
    border.frustumCulled = false;
    scene.add(border);
    return { side, geometry, borderGeometry };
  });

  // A scalloped pelmet stays above the stage while the full-height cloth gathers.
  const swagColumns = 128;
  const swagRows = 10;
  const swagGeometry = own(fabricGeometry(swagColumns, swagRows));
  const swag = new THREE.Mesh(swagGeometry, velvet);
  swag.frustumCulled = false;
  scene.add(swag);
  const fringeGeometry = own(fabricGeometry(swagColumns, 1));
  const fringe = new THREE.Mesh(fringeGeometry, gold);
  fringe.frustumCulled = false;
  scene.add(fringe);
  const tasselGeometry = own(new THREE.ConeGeometry(0.034, 0.17, 5));
  const tassels = new THREE.InstancedMesh(tasselGeometry, gold, 108);
  tassels.frustumCulled = false;
  scene.add(tassels);
  const matrix = new THREE.Matrix4();
  let halfWidth = 8;
  let currentProgress = 0;
  let currentTime = 0;
  let disposed = false;
  let previousProgress = null;

  function swagHem(u) {
    return 4.48 - 0.26 * Math.pow(Math.sin(u * Math.PI * 3), 2);
  }

  function sizePelmet() {
    const positions = swagGeometry.attributes.position;
    for (let row = 0; row <= swagRows; row++) {
      const v = row / swagRows;
      for (let column = 0; column <= swagColumns; column++) {
        const u = column / swagColumns;
        const x = (u * 2 - 1) * (halfWidth + 0.25);
        const y = THREE.MathUtils.lerp(5.4, swagHem(u), v);
        const z = 0.73 + Math.sin(u * Math.PI * 60) * 0.085 + v * 0.10;
        positions.setXYZ(row * (swagColumns + 1) + column, x, y, z);
      }
    }
    positions.needsUpdate = true;
    swagGeometry.computeVertexNormals();
    const fringePositions = fringeGeometry.attributes.position;
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column <= swagColumns; column++) {
        const u = column / swagColumns;
        fringePositions.setXYZ(
          row * (swagColumns + 1) + column,
          (u * 2 - 1) * (halfWidth + 0.25),
          swagHem(u) - row * 0.037,
          0.86 + Math.sin(u * Math.PI * 60) * 0.085,
        );
      }
    }
    fringePositions.needsUpdate = true;
    fringeGeometry.computeVertexNormals();
    for (let i = 0; i < tassels.count; i++) {
      const u = i / (tassels.count - 1);
      matrix.makeRotationZ(Math.PI);
      matrix.setPosition(
        (u * 2 - 1) * (halfWidth + 0.25),
        swagHem(u) - 0.10,
        0.86 + Math.sin(u * Math.PI * 60) * 0.085,
      );
      tassels.setMatrixAt(i, matrix);
    }
    tassels.instanceMatrix.needsUpdate = true;
  }

  function clothPoint(u, v, side, opening, time) {
    const outer = halfWidth + 0.32;
    // Keep the two leading hems overlapping until opening begins.
    const inner = THREE.MathUtils.lerp(-0.13, halfWidth * 0.895, opening);
    const gather = Math.pow(u, 0.92 + opening * 0.5);
    const widthPosition = THREE.MathUtils.lerp(outer, inner, gather);
    const rippleEnvelope = Math.sin(opening * Math.PI) * Math.sin(v * Math.PI);
    const sway = Math.sin(time * 2.4 - v * 4.2) * 0.055 * rippleEnvelope;
    const x = side * (widthPosition + sway);
    const lift = opening * 0.78 * Math.pow(u, 3) * Math.pow(v, 3);
    const y = 5.34 - v * 10.78 + lift;
    // Real surface depth: broad soft folds with smaller irregular velvet creases.
    const fold = Math.sin(u * Math.PI * 28 + 0.13 * Math.sin(v * 5.2));
    const fine = Math.sin(u * Math.PI * 56 + v * 0.9) * 0.025;
    const depth = 0.18 + opening * 0.04;
    const z = 0.08 + fold * depth + fine + Math.pow(v, 4) * 0.05
      + Math.sin(time * 2.1 - v * 5 + u) * rippleEnvelope * 0.035;
    return [x, y, z];
  }

  function update(progress = currentProgress, time = currentTime) {
    if (disposed) return;
    currentProgress = clamp(progress, 0, 1);
    currentTime = time;
    if (previousProgress === currentProgress && (currentProgress === 0 || currentProgress === 1)) return;
    previousProgress = currentProgress;
    const opening = smooth(currentProgress);
    for (const panel of panels) {
      const positions = panel.geometry.attributes.position;
      for (let row = 0; row <= ROWS; row++) {
        const v = row / ROWS;
        for (let column = 0; column <= COLS; column++) {
          const [x, y, z] = clothPoint(column / COLS, v, panel.side, opening, time);
          positions.setXYZ(row * (COLS + 1) + column, x, y, z);
        }
      }
      positions.needsUpdate = true;
      panel.geometry.computeVertexNormals();
      const border = panel.borderGeometry.attributes.position;
      for (let row = 0; row <= ROWS; row++) {
        for (let column = 0; column < 2; column++) {
          const [x, y, z] = clothPoint(1 - column * 0.0035, row / ROWS, panel.side, opening, time);
          border.setXYZ(row * 2 + column, x, y, z + 0.018);
        }
      }
      border.needsUpdate = true;
      panel.borderGeometry.computeVertexNormals();
    }
  }

  function resize(width, height) {
    if (disposed) return;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    halfWidth = (HEIGHT * safeWidth) / safeHeight / 2;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.updateProjectionMatrix();
    renderer.setSize(safeWidth, safeHeight, false);
    sizePelmet();
    previousProgress = null;
    update();
  }

  resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  return {
    update,
    resize,
    render() {
      if (!disposed) renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      tassels.dispose();
      scene.clear();
      renderer.dispose();
    },
  };
}
