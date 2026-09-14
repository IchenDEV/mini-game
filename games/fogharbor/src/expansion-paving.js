import * as THREE from "three";
import {
  EXPANSION_ROADS,
  EXPANSION_GARDENS,
  EXPANSION_SCENES,
  COURT_HALF_WIDTH,
  COURT_HALF_DEPTH,
  roadSample,
  expansionSurfaceAt,
} from "./expansion-layout.js";

import { TERRACES, GROUND_PATHS, COURT_LANES, STAIRS } from "./terrain.js";

// Keep the existing walk meshes authoritative at the old/new city seam. Grass
// and retaining-wall tops are deliberately absent: they cannot replace paving.
function historicPavingClipper() {
  const grid = new Map();
  const cellSize = 8;
  const heightTolerance = 0.035;
  const epsilon = 1e-8;
  const value = (plane, point) => plane[0] * point[0] + plane[1] * point[1] + plane[2] * point[2] + plane[3];
  const bounds = (points) => ({
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[2])),
    maxZ: Math.max(...points.map((p) => p[2])),
  });
  function cells(box, visit) {
    for (let x = Math.floor(box.minX / cellSize); x <= Math.floor(box.maxX / cellSize); x++)
      for (let z = Math.floor(box.minZ / cellSize); z <= Math.floor(box.maxZ / cellSize); z++)
        visit(`${x},${z}`);
  }
  function addSurface(points) {
    // Match the actual Float32 walking vertices, including concave terrace edges.
    points = points.map((point) => point.map(Math.fround));
    const outline = points.map(([x, , z]) => new THREE.Vector2(x, z));
    for (const face of THREE.ShapeUtils.triangulateShape(outline, [])) {
      let [a, b, c] = face.map((i) => points[i]);
      let area = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      if (Math.abs(area) < epsilon) continue;
      if (area < 0) { [b, c] = [c, b]; area = -area; }
      const slopeX = ((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])) / area;
      const slopeZ = ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / area;
      const intercept = a[1] - slopeX * a[0] - slopeZ * a[2];
      const triangle = [a, b, c];
      const edges = triangle.map((p, i) => {
        const q = triangle[(i + 1) % 3], dx = q[0] - p[0], dz = q[2] - p[2];
        return [-dz, 0, dx, dz * p[0] - dx * p[2]];
      });
      const surface = {
        ...bounds(triangle), edges,
        height: (point) => slopeX * point[0] + slopeZ * point[2] + intercept,
        planes: [...edges,
          [-slopeX, 1, -slopeZ, heightTolerance - intercept],
          [slopeX, -1, slopeZ, heightTolerance + intercept]],
      };
      cells(surface, (key) => {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(surface);
      });
    }
  }
  // createGround's south pavement is x ±110, z 16..22, at y .028.
  addSurface([[-110, .028, 16], [-110, .028, 22], [110, .028, 22], [110, .028, 16]]);
  for (const polygon of GROUND_PATHS) addSurface(polygon.map(([x, z]) => [x, .028, z]));
  for (const terrace of TERRACES) addSurface(terrace.polygon.map(([x, z]) => [x, terrace.height, z]));
  for (const lane of COURT_LANES) {
    const [a, b] = [lane.a, lane.b];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const nx = -(b[2] - a[2]) / length * lane.width / 2;
    const nz = (b[0] - a[0]) / length * lane.width / 2;
    addSurface([[a[0] - nx, a[1], a[2] - nz], [a[0] + nx, a[1], a[2] + nz],
      [b[0] + nx, b[1], b[2] + nz], [b[0] - nx, b[1], b[2] - nz]]);
  }
  for (const stair of STAIRS) {
    const halfWidth = (stair.width + .05) / 2;
    for (let i = 0; i < stair.steps; i++) {
      const y = stair.bottom + (stair.top - stair.bottom) * (i + 1) / stair.steps;
      const z0 = stair.z0 + (stair.z1 - stair.z0) * i / stair.steps;
      const z1 = stair.z0 + (stair.z1 - stair.z0) * (i + 1) / stair.steps;
      addSurface([[stair.x - halfWidth, y, z0], [stair.x - halfWidth, y, z1],
        [stair.x + halfWidth, y, z1], [stair.x + halfWidth, y, z0]]);
    }
  }
  function split(polygon, plane) {
    const inside = [], outside = [];
    let previous = polygon.at(-1), previousValue = value(plane, previous);
    for (const point of polygon) {
      const currentValue = value(plane, point);
      const beforeInside = previousValue >= -epsilon, nowInside = currentValue >= -epsilon;
      if (beforeInside !== nowInside) {
        const t = previousValue / (previousValue - currentValue);
        const crossing = point.map((coordinate, axis) => previous[axis] + (coordinate - previous[axis]) * t);
        inside.push(crossing);
        outside.push(crossing);
      }
      (nowInside ? inside : outside).push(point);
      previous = point;
      previousValue = currentValue;
    }
    return [inside, outside];
  }
  return (triangle) => {
    const box = bounds(triangle);
    // Vertical risers have no walking footprint to subtract.
    if (box.maxX - box.minX < epsilon || box.maxZ - box.minZ < epsilon) return [triangle];
    const candidates = new Set();
    cells(box, (key) => {
      for (const surface of grid.get(key) ?? [])
        if (surface.maxX >= box.minX && surface.minX <= box.maxX && surface.maxZ >= box.minZ && surface.minZ <= box.maxZ)
          candidates.add(surface);
    });
    let polygons = [triangle];
    for (const surface of candidates) {
      polygons = polygons.flatMap((polygon) => {
        let remainder = polygon;
        const visible = [];
        for (const plane of surface.planes) {
          const [inside, outside] = split(remainder, plane);
          if (outside.length >= 3) visible.push(outside);
          remainder = inside;
          if (remainder.length < 3) break;
        }
        return visible;
      });
      if (!polygons.length) break;
    }
    // Weld surviving cut-edge vertices to the authoritative old floor, so the
    // .02 new-paving lift does not leave a tiny vertical crack at the seam.
    return polygons.map((polygon) => polygon.map((point) => {
      let y = point[1], distance = heightTolerance + epsilon;
      for (const surface of candidates) {
        const height = surface.height(point), delta = Math.abs(height - point[1]);
        if (delta <= distance && surface.edges.every((edge) => value(edge, point) >= -epsilon)) {
          y = height;
          distance = delta;
        }
      }
      return [point[0], y, point[2]];
    }));
  };
}

// A single paved union avoids stacking opaque court, turning-circle and road sheets.
export function createExpansionPavingGeometry() {
  const clipHistoric = historicPavingClipper();
  const vertices = [],
    uv = [];
  const stairs = EXPANSION_ROADS.filter((r) => r.stairs);
  const cuts = stairs.map((r) => [
    r.a[0] - r.width / 2,
    Math.min(r.a[1], r.b[1]),
    r.a[0] + r.width / 2,
    Math.max(r.a[1], r.b[1]),
  ]);
  for (const g of EXPANSION_GARDENS) cuts.push([g.x0, g.z0, g.x1, g.z1]);
  function subtract(rect, cut) {
    const [x0, z0, x1, z1] = rect,
      [a, b, c, d] = cut;
    if (c <= x0 || a >= x1 || d <= z0 || b >= z1) return [rect];
    const left = Math.max(x0, a),
      right = Math.min(x1, c),
      low = Math.max(z0, b),
      high = Math.min(z1, d);
    return [
      [x0, z0, left, z1],
      [right, z0, x1, z1],
      [left, z0, right, low],
      [left, high, right, z1],
    ].filter((r) => r[2] - r[0] > 1e-6 && r[3] - r[1] > 1e-6);
  }
  function quad(points) {
    for (const corners of [[0, 1, 2], [0, 2, 3]]) {
      for (const polygon of clipHistoric(corners.map((i) => points[i]))) {
        for (let i = 1; i < polygon.length - 1; i++) {
          for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
            vertices.push(...p);
            uv.push(p[0] / 2.6, p[2] / 2.6);
          }
        }
      }
    }
  }
  const cell = 0.35;
  for (let x = -87; x < 65; x += cell)
    for (let z = 18; z < 128; z += cell) {
      let rects = [[x, z, x + cell, z + cell]];
      for (const cut of cuts)
        if (cut[0] < x + cell && cut[2] > x && cut[1] < z + cell && cut[3] > z)
          rects = rects.flatMap((r) => subtract(r, cut));
      for (const [x0, z0, x1, z1] of rects) {
        const center = expansionSurfaceAt((x0 + x1) / 2, (z0 + z1) / 2);
        if (!center || center.kind === "stairs") continue;
        const points = [
          [x0, z0],
          [x0, z1],
          [x1, z1],
          [x1, z0],
        ].map(([px, pz]) => {
          const sample = expansionSurfaceAt(px, pz);
          const height =
            sample &&
            sample.kind !== "stairs" &&
            Math.abs(sample.height - center.height) < 0.22
              ? sample.height
              : center.height;
          return [px, height + 0.02, pz];
        });
        quad(points);
      }
    }
  for (const r of stairs) {
    const length = r.b[1] - r.a[1],
      rise = r.b[2] - r.a[2],
      left = r.a[0] - r.width / 2,
      right = r.a[0] + r.width / 2;
    for (let i = 0; i < 18; i++) {
      const z0 = r.a[1] + (length * i) / 18,
        z1 = r.a[1] + (length * (i + 1)) / 18,
        y = r.a[2] + (rise * (i + 1)) / 18 + 0.02,
        previous = r.a[2] + (rise * i) / 18 + 0.02;
      quad([
        [left, y, z0],
        [left, y, z1],
        [right, y, z1],
        [right, y, z0],
      ]);
      // Solid risers meet each tread rather than leaving floating horizontal strips.
      quad([
        [right, previous, z0],
        [left, previous, z0],
        [left, y, z0],
        [right, y, z0],
      ]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function createExpansionLandscapeGeometry() {
  const geometry = new THREE.PlaneGeometry(154, 84, 257, 140);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(-10, 0, 96);
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    let h = 0.08,
      ceiling = Infinity;
    for (const s of EXPANSION_SCENES) {
      const d = Math.hypot(
        Math.max(0, Math.abs(x - s.x) - COURT_HALF_WIDTH),
        Math.max(0, Math.abs(z - s.z) - COURT_HALF_DEPTH),
      );
      h = Math.max(h, s.height - 1 - d * 0.45);
      if (d < 0.9) ceiling = Math.min(ceiling, s.height - 0.2);
    }
    for (const road of EXPANSION_ROADS) {
      const sample = roadSample(road, x, z),
        outside = Math.max(0, sample.distance - road.width / 2),
        grade =
          Math.abs(road.b[2] - road.a[2]) /
          Math.hypot(road.b[0] - road.a[0], road.b[1] - road.a[1]);
      if (outside < 4) h = Math.max(h, sample.height - 0.3 - outside * 0.6);
      if (outside < 0.9)
        ceiling = Math.min(
          ceiling,
          sample.height - 0.2 - grade * 0.9 - (road.stairs ? 0.16 : 0),
        );
    }
    p.setY(i, Math.min(h, ceiling));
    uv.setXY(i, x / 4.4, z / 4.4);
  }
  geometry.computeVertexNormals();
  return geometry;
}
