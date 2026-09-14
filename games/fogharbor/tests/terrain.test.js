import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import {
  canWalk,
  canTraverse,
  route,
  heightAt,
  move,
} from "../src/movement.js";
import {
  TERRACES,
  COURT_LANES,
  STAIRS,
  CITY_PLOTS,
  COURTYARD_PROPS,
  TERRACE_DESTINATIONS,
  plotHeight,
  plotObstacle,
  insidePolygon,
  createTerrain,
  createLandscapeGeometry,
  landscapeHeightAt,
  LANDSCAPE_GRID,
  stairHeight,
} from "../src/terrain.js";
const world = createNeighborhood(new THREE.Scene()),
  districts = createDistricts(new THREE.Scene());
const obstacles = [...world.obstacles, ...districts.obstacles];
const terrain = createTerrain();
terrain.root.updateMatrixWorld(true);

test("every raised courtyard is reachable from the story street via its shared stairs", () => {
  const origin = { x: -6, z: 3.4 };
  for (const [name, target] of Object.entries(TERRACE_DESTINATIONS)) {
    assert.ok(canWalk(target.x, target.z, obstacles), name);
    const path = route(origin, target, obstacles);
    assert.ok(path.length, name);
    let previous = origin;
    for (const point of path) {
      assert.ok(
        canTraverse(previous, point, obstacles),
        `${name}: ${JSON.stringify([previous, point])}`,
      );
      previous = point;
    }
    assert.ok(
      path.some((p) =>
        STAIRS.some(
          (s) => p.z > s.z0 && p.z < s.z1 && Math.abs(p.x - s.x) < s.width / 2,
        ),
      ),
      `${name} must use stairs`,
    );
    assert.ok(heightAt(target.x, target.z) > 0);
    if (name === "chapelcourt")
      assert.ok(
        path.some((p) => p.z > 34.4 && p.z < 38 && Math.abs(p.x - 4) < 1.2),
        "chapel upper court uses second flight",
      );
  }
});

test("WASD climbs each real tread in both directions, without climbing stair sidewalls", () => {
  for (const stair of STAIRS) {
    const p = { x: stair.x, z: stair.z0 - 0.08 };
    const walkSteps = Math.ceil((stair.z1 - stair.z0 + 0.3) / 0.05);
    for (let i = 0; i < walkSteps; i++)
      move(p, { x: 0, z: 1 }, 0.05, obstacles);
    assert.ok(p.z > stair.z1 + 0.1, stair.id);
    assert.ok(Math.abs(heightAt(p.x, p.z) - stair.top) < 1e-8, stair.id);
    for (let i = 0; i < walkSteps; i++)
      move(p, { x: 0, z: -1 }, 0.05, obstacles);
    assert.ok(p.z < stair.z0, stair.id);
    const middle = { x: stair.x, z: (stair.z0 + stair.z1) / 2 };
    assert.equal(
      canTraverse(
        { x: stair.x + stair.width / 2 + 0.35, z: middle.z },
        middle,
        obstacles,
      ),
      false,
      stair.id,
    );
  }
  // Both ends are navigable, but they are on different terraces separated by a retaining wall.
  const lower = { x: 2, z: 37.5 },
    upper = { x: 2, z: 38.5 };
  assert.ok(canWalk(lower.x, lower.z, obstacles));
  assert.ok(canWalk(upper.x, upper.z, obstacles));
  assert.equal(canTraverse(lower, upper, obstacles), false);
});

test("all rotated courtyard building footprints sit on their declared terrace and block traversal", () => {
  for (const plot of CITY_PLOTS.filter((p) => p.terrace)) {
    const terrace = TERRACES.find((t) => t.id === plot.terrace),
      bounds = plotObstacle(plot);
    assert.equal(plotHeight(plot), terrace.height);
    for (const [x, z] of [
      [bounds.minX, bounds.minZ],
      [bounds.maxX, bounds.minZ],
      [bounds.minX, bounds.maxZ],
      [bounds.maxX, bounds.maxZ],
    ])
      assert.ok(
        insidePolygon(x, z, terrace.polygon),
        `${plot.name} footprint off ${terrace.id}: ${x},${z}`,
      );
    assert.equal(canWalk(plot.x, plot.z, obstacles), false, plot.name);
  }
});

function upwardHits(x, z) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 20, z),
    new THREE.Vector3(0, -1, 0),
  );
  return ray
    .intersectObject(terrain.root, true)
    .filter((hit) => hit.face.normal.y > 0.5);
}
test("rendered treads match heightAt and have no exposed coplanar backing faces", () => {
  for (const stair of STAIRS)
    for (let i = 0; i < stair.steps; i++) {
      const z = stair.z0 + ((stair.z1 - stair.z0) * (i + 0.5)) / stair.steps;
      const hits = upwardHits(stair.x, z);
      const tread = hits.find((h) => h.object.userData.walkSurface);
      assert.ok(tread, stair.id);
      assert.ok(
        Math.abs(tread.point.y - stairHeight(stair, z)) < 1e-5,
        stair.id,
      );
      assert.ok(
        Math.abs(tread.point.y - heightAt(stair.x, z)) < 1e-5,
        stair.id,
      );
      assert.equal(
        hits.some(
          (h) =>
            !h.object.userData.walkSurface &&
            Math.abs(h.point.y - tread.point.y) < 1e-5,
        ),
        false,
        `${stair.id} backing must end below tread`,
      );
    }
  for (const terrace of TERRACES) {
    const a = terrace.polygon[0],
      b = terrace.polygon[1],
      x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2;
    const hits = upwardHits(x, z);
    assert.ok(
      hits.some((h) => Math.abs(h.point.y - (terrace.height + 0.03)) < 1e-4),
      "coping sits above terrace floor",
    );
  }
  for (const plot of CITY_PLOTS.filter(
    (p) => !p.terrace && plotHeight(p) > 0,
  )) {
    const hits = upwardHits(plot.x, plot.z),
      height = plotHeight(plot);
    assert.ok(hits.some((h) => Math.abs(h.point.y - height) < 1e-5));
    assert.equal(
      new Set(
        hits
          .filter((h) => Math.abs(h.point.y - height) < 1e-5)
          .map((h) => h.object),
      ).size,
      1,
      `${plot.name} foundation has one exposed top`,
    );
  }
});

test("courtyard furnishings have shared collision footprints and leave all destinations open", () => {
  for (const prop of COURTYARD_PROPS)
    assert.equal(canWalk(prop.x, prop.z, obstacles), false, prop.kind);
  for (const point of Object.values(TERRACE_DESTINATIONS))
    assert.ok(canWalk(point.x, point.z, obstacles));
});

test("actual city-kit roots meet their declared foundation height without floating", () => {
  const bytes = readFileSync(
    new URL("../public/models/city-kit-v1.glb", import.meta.url),
  );
  const asset = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  const roots = new Map(asset.nodes.map((node, index) => [node.name, index]));
  const localMatrix = (node) =>
    node.matrix
      ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(
          new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
          new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
        );
  const minimums = new Map();
  for (const name of new Set(CITY_PLOTS.map((p) => p.name))) {
    const root = asset.nodes[roots.get(`City_${name}`)];
    assert.ok(root, name);
    let minimum = Infinity;
    const visit = (index, parent) => {
      const node = asset.nodes[index],
        matrix = parent.clone().multiply(localMatrix(node));
      if (node.mesh !== undefined)
        for (const primitive of asset.meshes[node.mesh].primitives) {
          const accessor = asset.accessors[primitive.attributes.POSITION];
          for (const x of [accessor.min[0], accessor.max[0]])
            for (const y of [accessor.min[1], accessor.max[1]])
              for (const z of [accessor.min[2], accessor.max[2]])
                minimum = Math.min(
                  minimum,
                  new THREE.Vector3(x, y, z).applyMatrix4(matrix).y,
                );
        }
      for (const child of node.children ?? []) visit(child, matrix);
    };
    for (const child of root.children ?? []) visit(child, new THREE.Matrix4());
    minimums.set(name, minimum);
  }
  for (const plot of CITY_PLOTS) {
    const bottom = plotHeight(plot) + minimums.get(plot.name) * plot.size;
    assert.ok(
      bottom <= plotHeight(plot) + 0.025,
      `${plot.name} floats above foundation by ${bottom - plotHeight(plot)}`,
    );
    assert.ok(bottom >= plotHeight(plot) - 0.2, `${plot.name} sinks too far`);
  }
});

test("low surrounding soil leaves the town's retaining walls exposed", () => {
  for (let x = -70; x <= 22; x += 1.1)
    for (let z = 25; z <= 60; z += 1.1) {
      if (TERRACES.every((t) => !insidePolygon(x, z, t.polygon)))
        assert.ok(landscapeHeightAt(x, z) <= 0.121);
    }
  assert.ok(landscapeHeightAt(6, 44) > landscapeHeightAt(-52, 39) + 0.4);
  for (let x = -70; x <= 20; x += 2.5)
    assert.ok(landscapeHeightAt(x, 62) < -0.08);
});

test("rendered hill triangles stay below every court, stair tread, building and original river walk", () => {
  const geometry = createLandscapeGeometry(),
    position = geometry.getAttribute("position");
  const { minX, minZ, maxX, maxZ, spacing } = LANDSCAPE_GRID;
  const columns = Math.round((maxX - minX) / spacing) + 1;
  const meshHeight = (x, z) => {
    if (x < minX || x >= maxX || z < minZ || z >= maxZ) return -Infinity;
    const column = Math.floor((x - minX) / spacing),
      row = Math.floor((z - minZ) / spacing);
    const u = (x - minX) / spacing - column,
      v = (z - minZ) / spacing - row,
      index = row * columns + column;
    const a = position.getY(index),
      b = position.getY(index + 1),
      c = position.getY(index + columns),
      d = position.getY(index + columns + 1);
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  for (const terrace of TERRACES) {
    const xs = terrace.polygon.map((p) => p[0]),
      zs = terrace.polygon.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 0.23)
      for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.23)
        if (insidePolygon(x, z, terrace.polygon))
          assert.ok(
            meshHeight(x, z) <= terrace.height - 0.079,
            `${terrace.id} hill penetrates paving at ${x},${z}`,
          );
  }
  for (const stair of STAIRS)
    for (let z = stair.z0; z < stair.z1; z += 0.11)
      for (const x of [
        stair.x - stair.width * 0.49,
        stair.x,
        stair.x + stair.width * 0.49,
      ])
        assert.ok(
          meshHeight(x, z) <= stairHeight(stair, z) - 0.079,
          `${stair.id} buried tread at ${x},${z}`,
        );
  for (const plot of CITY_PLOTS.filter((p) => p.terrace)) {
    const bounds = plotObstacle(plot);
    for (let x = bounds.minX; x < bounds.maxX; x += 0.31)
      for (let z = bounds.minZ; z < bounds.maxZ; z += 0.31)
        assert.ok(
          meshHeight(x, z) < plotHeight(plot) - 0.079,
          "landscape penetrates building base",
        );
  }
  for (const x of [-58, -34, -10])
    for (const z of [11, 16, 19, 21.7])
      assert.equal(
        meshHeight(x, z),
        -Infinity,
        "landscape must not overlap bridge or riverside paving",
      );
  geometry.dispose();
});

test("both new hillside passages are continuously walkable and match rendered paving", () => {
  for (const lane of COURT_LANES) {
    let previous = { x: lane.a[0], z: lane.a[2] };
    for (let step = 0; step <= 100; step++) {
      const t = step / 100,
        point = {
          x: lane.a[0] + (lane.b[0] - lane.a[0]) * t,
          z: lane.a[2] + (lane.b[2] - lane.a[2]) * t,
        };
      assert.ok(canTraverse(previous, point, obstacles), `${lane.id} at ${t}`);
      assert.ok(
        Math.abs(
          heightAt(point.x, point.z) - heightAt(previous.x, previous.z),
        ) < 0.035,
        `${lane.id} height discontinuity`,
      );
      const ray = new THREE.Raycaster(
        new THREE.Vector3(point.x, 10, point.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = ray.intersectObjects(terrain.walkSurfaces, true);
      if (step > 0 && step < 100)
        assert.ok(
          hits.some(
            (h) => Math.abs(h.point.y - heightAt(point.x, point.z)) < 0.002,
          ),
          `${lane.id} visual floor diverges`,
        );
      previous = point;
    }
  }
});

test("the three southern courts connect behind the waterfront without descending to the towpath", () => {
  const start = TERRACE_DESTINATIONS.inncourt,
    end = TERRACE_DESTINATIONS.chapelcourt;
  const path = route(start, end, obstacles);
  assert.ok(path.length);
  assert.ok(
    path.every((point) => point.z > 25),
    "route must use the connected hillside lanes",
  );
  let previous = start;
  for (const point of path) {
    assert.ok(canTraverse(previous, point, obstacles));
    previous = point;
  }
});

test("rearranged city buildings keep separate footprints rather than interpenetrating", () => {
  for (let i = 0; i < CITY_PLOTS.length; i++)
    for (let j = i + 1; j < CITY_PLOTS.length; j++) {
      const a = plotObstacle(CITY_PLOTS[i]),
        b = plotObstacle(CITY_PLOTS[j]);
      const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
        z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      assert.ok(
        x < 0.1 || z < 0.1,
        `${i}/${j} buildings overlap ${x} by ${z} metres`,
      );
    }
});

test("retaining walls leave physical openings where the hillside passages meet their courts", () => {
  for (const lane of COURT_LANES) {
    const direction = new THREE.Vector3(
      lane.b[0] - lane.a[0],
      0,
      lane.b[2] - lane.a[2],
    ).normalize();
    for (const end of [lane.a, lane.b]) {
      const center = new THREE.Vector3(...end).add(
        new THREE.Vector3(0, 0.45, 0),
      );
      const ray = new THREE.Raycaster(
        center.clone().addScaledVector(direction, -0.8),
        direction,
        0,
        1.6,
      );
      const hits = ray.intersectObject(terrain.root, true);
      assert.equal(
        hits.length,
        0,
        `${lane.id} has a solid wall across its entrance`,
      );
    }
  }
});
