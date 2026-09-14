import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

function mergeStraightEdges(edges) {
  const lines = new Map();
  for (const edge of edges) {
    let direction = edge.b.map((v, i) => v - edge.a[i]);
    const length = Math.hypot(...direction);
    if (length < 0.001) continue;
    direction = direction.map((v) => v / length);
    if (
      direction[0] < -1e-6 ||
      (Math.abs(direction[0]) < 1e-6 && direction[2] < 0)
    )
      direction = direction.map((v) => -v);
    const t0 = dot(edge.a, direction),
      t1 = dot(edge.b, direction);
    const origin = edge.a.map((v, i) => v - direction[i] * t0);
    const key = [
      ...direction.map((v) => Math.round(v * 100000)),
      ...origin.map((v) => Math.round(v * 1000)),
      edge.railing,
      edge.stairs,
    ].join(",");
    if (!lines.has(key)) lines.set(key, { direction, origin, spans: [] });
    lines
      .get(key)
      .spans.push({ ...edge, start: Math.min(t0, t1), end: Math.max(t0, t1) });
  }
  const merged = [];
  for (const { direction, origin, spans } of lines.values()) {
    spans.sort((a, b) => a.start - b.start);
    const emit = (span) =>
      merged.push({
        ...span,
        a: origin.map((v, i) => v + direction[i] * span.start),
        b: origin.map((v, i) => v + direction[i] * span.end),
      });
    let current = null;
    for (const span of spans) {
      if (current && span.start <= current.end + 0.002) {
        current.end = Math.max(current.end, span.end);
        if (span.kind === "court") current.kind = "court";
      } else {
        if (current) emit(current);
        current = { ...span };
      }
    }
    if (current) emit(current);
  }
  return merged;
}

/** Keep only the exposed boundary of the connected walking surfaces. Internal
 * road joins and courtyard mouths must never receive a curb or a railing. */
export function createExpansionBoundaries({
  roads,
  courts,
  halfWidth,
  halfDepth,
  surfaceAt,
  nearBuilding,
}) {
  const edges = [];
  function candidate(a, b, source, kind, stairs = false) {
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      length = Math.hypot(dx, dz);
    const nx = -dz / length,
      nz = dx / length;
    const count = Math.max(1, Math.ceil(length / 0.1));
    for (let i = 0; i < count; i++) {
      const start = mix(a, b, i / count),
        end = mix(a, b, (i + 1) / count);
      const p = mix(start, end, 0.5);
      const leftSurface = surfaceAt(p[0] + nx * 0.09, p[2] + nz * 0.09);
      const rightSurface = surfaceAt(p[0] - nx * 0.09, p[2] - nz * 0.09);
      // A slope changing height on both sides is still one surface, not a fence line.
      if (
        leftSurface &&
        rightSurface &&
        Math.abs(leftSurface.height - rightSurface.height) < 0.31
      )
        continue;
      const supportedHeight = Math.max(
        leftSurface?.height ?? -Infinity,
        rightSurface?.height ?? -Infinity,
      );
      if (Math.abs(supportedHeight - p[1]) > (stairs ? 0.19 : 0.1)) continue;
      const left = leftSurface && Math.abs(leftSurface.height - p[1]) < 0.19;
      const right = rightSurface && Math.abs(rightSurface.height - p[1]) < 0.19;
      if (Boolean(left) === Boolean(right)) continue;
      const building = nearBuilding(p[0], p[2], p[1]);
      if (building && kind === "road") continue;
      edges.push({
        a: start,
        b: end,
        source,
        kind,
        stairs,
        inward: [nx * (left ? 1 : -1), nz * (left ? 1 : -1)],
        railing: (stairs || Math.max(start[1], end[1]) > 3.5) && !building,
      });
    }
  }
  for (const road of roads) {
    const dx = road.b[0] - road.a[0],
      dz = road.b[1] - road.a[1];
    const length = Math.hypot(dx, dz),
      nx = -dz / length,
      nz = dx / length;
    const point = ([x, z, y], side) => [
      x + ((nx * road.width) / 2) * side,
      y,
      z + ((nz * road.width) / 2) * side,
    ];
    for (const side of [-1, 1])
      candidate(
        point(road.a, side),
        point(road.b, side),
        road.id,
        "road",
        road.stairs,
      );
    // roadSample uses round ends; follow those real ends as well as the straight sides.
    if (!road.stairs)
      for (const [endpoint, [x, z, y]] of [road.a, road.b].entries()) {
        if (endpoint === 0 ? road.flatStart : road.flatEnd) continue;
        for (let i = 0; i < 24; i++) {
          const arc = (t) => [
            x + (Math.cos(t) * road.width) / 2,
            y,
            z + (Math.sin(t) * road.width) / 2,
          ];
          candidate(
            arc((i * Math.PI) / 12),
            arc(((i + 1) * Math.PI) / 12),
            road.id,
            "road",
          );
        }
      }
  }
  for (const court of courts) {
    const corners = [
      [court.x - halfWidth, court.height, court.z - halfDepth],
      [court.x + halfWidth, court.height, court.z - halfDepth],
      [court.x + halfWidth, court.height, court.z + halfDepth],
      [court.x - halfWidth, court.height, court.z + halfDepth],
    ];
    for (let i = 0; i < 4; i++)
      candidate(corners[i], corners[(i + 1) % 4], court.id, "court");
  }
  return mergeStraightEdges(edges);
}

/** Spatial capsule checks use the same physical edges that are drawn. */
export function createBoundaryCollision(edges) {
  const cells = new Map(),
    radius = 0.615,
    cellSize = 8;
  for (const edge of edges) {
    if (!edge.railing && edge.kind !== "court") continue;
    for (
      let x = Math.floor((Math.min(edge.a[0], edge.b[0]) - radius) / cellSize);
      x <= Math.floor((Math.max(edge.a[0], edge.b[0]) + radius) / cellSize);
      x++
    )
      for (
        let z = Math.floor(
          (Math.min(edge.a[2], edge.b[2]) - radius) / cellSize,
        );
        z <= Math.floor((Math.max(edge.a[2], edge.b[2]) + radius) / cellSize);
        z++
      ) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(edge);
      }
  }
  return (x, z, footHeight) => {
    for (const edge of cells.get(
      `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`,
    ) ?? []) {
      const dx = edge.b[0] - edge.a[0],
        dz = edge.b[2] - edge.a[2];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - edge.a[0]) * dx + (z - edge.a[2]) * dz) / (dx * dx + dz * dz),
        ),
      );
      const height = edge.a[1] + (edge.b[1] - edge.a[1]) * t;
      const bottom = edge.kind === "court" ? -0.3 : height + 0.02;
      const top = height + (edge.railing ? 0.98 : 0.08);
      if (footHeight >= top || footHeight + 1.7 <= bottom) continue;
      const length = Math.hypot(dx, dz);
      const along = ((x - edge.a[0]) * dx + (z - edge.a[2]) * dz) / length;
      const across = ((x - edge.a[0]) * -dz + (z - edge.a[2]) * dx) / length;
      const halfWidth =
        edge.kind === "court" ? 0.265 : edge.stairs ? 0.033 : 0.065;
      // Stone strips have flat ends. A radius-expanded line would falsely plug nearby openings.
      const distance = Math.hypot(
        Math.max(0, Math.abs(across) - halfWidth),
        Math.max(0, -along, along - length),
      );
      if (distance < 0.35) return true;
      if (
        edge.railing &&
        Math.min(
          Math.hypot(x - edge.a[0], z - edge.a[2]),
          Math.hypot(x - edge.b[0], z - edge.b[2]),
        ) < 0.383
      )
        return true;
    }
    return false;
  };
}

export function createBoundaryCopingGeometry(edges) {
  const courts = edges.filter((edge) => edge.kind === "court");
  const key = (point) =>
    point.map((value) => Math.round(value * 1000)).join(",");
  const junctions = new Map();
  for (const edge of courts) {
    const direction = [edge.b[0] - edge.a[0], edge.b[2] - edge.a[2]];
    const length = Math.hypot(...direction);
    for (const point of [edge.a, edge.b]) {
      if (!junctions.has(key(point)))
        junctions.set(key(point), { point, directions: [] });
      junctions
        .get(key(point))
        .directions.push(direction.map((value) => value / length));
    }
  }
  const corners = new Map(
    [...junctions].filter(([, junction]) =>
      junction.directions.some((a, i) =>
        junction.directions
          .slice(i + 1)
          .some((b) => Math.abs(a[0] * b[1] - a[1] * b[0]) > 0.1),
      ),
    ),
  );
  const parts = [];
  for (const edge of courts) {
    const dx = edge.b[0] - edge.a[0],
      dz = edge.b[2] - edge.a[2];
    const length = Math.hypot(dx, dz);
    const from = corners.has(key(edge.a)) ? 0.265 : 0;
    const to = length - (corners.has(key(edge.b)) ? 0.265 : 0);
    if (to - from < 0.001) continue;
    const cap = new THREE.BoxGeometry(to - from, 0.09, 0.53);
    cap.rotateY(-Math.atan2(dz, dx));
    cap.translate(
      edge.a[0] + (dx * (from + to)) / 2 / length,
      edge.a[1] + 0.045,
      edge.a[2] + (dz * (from + to)) / 2 / length,
    );
    parts.push(cap.toNonIndexed());
    cap.dispose();
  }
  // One corner stone replaces intersecting strip ends, so the top is single-layered.
  for (const { point } of corners.values()) {
    const corner = new THREE.BoxGeometry(0.53, 0.09, 0.53);
    corner.translate(point[0], point[1] + 0.045, point[2]);
    parts.push(corner.toNonIndexed());
    corner.dispose();
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return geometry;
}
