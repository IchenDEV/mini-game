import {
  expansionSurfaceAt,
  expansionCanWalk,
  expansionBoundaryBlocks,
  EXPANSION_SCENES,
} from "./expansion-layout.js";
import {
  terrainHeightAt,
  terrainSurfaceAt,
  terrainCanWalk,
  terrainCanTraverse,
  TERRAIN_OBSTACLES,
  TERRACES,
} from "./terrain.js";
export function dampAngle(current, target, rate, dt) {
  return (
    current +
    Math.atan2(Math.sin(target - current), Math.cos(target - current)) *
      (1 - Math.exp(-rate * dt))
  );
}
export const BRIDGES = [-10, -34, -58];
export const CITY_BOUNDS = {
  minX: -86,
  maxX:
    Math.max(63, ...TERRACES.flatMap((t) => t.polygon.map((p) => p[0]))) + 1,
  minZ: -13,
  maxZ: 128,
};
export function districtAt(x, z) {
  const district = EXPANSION_SCENES.find(
    (s) => Math.hypot(s.x - x, s.z - z) < 17,
  );
  if (district)
    return { id: district.id, name: district.name, english: district.english };
  if (z > 15)
    return { id: "riverside", name: "南岸步道", english: "RIVERSIDE WALK" };
  if (x < -42)
    return { id: "pumpworks", name: "老泵站", english: "OLD PUMP WORKS" };
  if (x < -16)
    return { id: "wharf", name: "第七码头", english: "SEVENTH WHARF" };
  return { id: "saltlane", name: "盐锈巷", english: "SALT-RUST LANE" };
}
export function heightAt(x, z) {
  const terrainHeight =
    expansionSurfaceAt(x, z)?.height ?? terrainHeightAt(x, z);
  if (terrainHeight !== null) return terrainHeight;
  return z >= 6 && z <= 16 && BRIDGES.some((cx) => Math.abs(x - cx) <= 1.7)
    ? 0.55 * Math.sin((Math.PI * (z - 6)) / 10)
    : 0;
}
export function canWalk(x, z, obstacles = []) {
  const street = x >= -64 && x <= 13.5 && z >= -8.5 && z <= 5.6;
  const bridge =
    z >= 5.2 && z <= 16.5 && BRIDGES.some((cx) => Math.abs(x - cx) <= 1.43);
  const riverside = x >= -64 && x <= 13.5 && z >= 16 && z <= 21.7;
  const hall = x >= -61 && x <= -46 && z >= -12.5 && z <= -8;
  return (
    (expansionSurfaceAt(x, z)
      ? expansionCanWalk(x, z)
      : terrainSurfaceAt(x, z)
        ? terrainCanWalk(x, z)
        : street || bridge || riverside || hall) &&
    !expansionBoundaryBlocks(x, z, heightAt(x, z)) &&
    !TERRAIN_OBSTACLES.some(
      (o) =>
        x > o.minX - 0.27 &&
        x < o.maxX + 0.27 &&
        z > o.minZ - 0.27 &&
        z < o.maxZ + 0.27,
    ) &&
    !obstacles.some(
      (o) =>
        x > o.minX - 0.27 &&
        x < o.maxX + 0.27 &&
        z > o.minZ - 0.27 &&
        z < o.maxZ + 0.27,
    )
  );
}
const navigationGrids = new WeakMap();
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
export function direction(keys, yaw) {
  let x =
    Number(keys.has("d") || keys.has("arrowright")) -
    Number(keys.has("a") || keys.has("arrowleft"));
  let z =
    Number(keys.has("s") || keys.has("arrowdown")) -
    Number(keys.has("w") || keys.has("arrowup"));
  const l = Math.hypot(x, z);
  if (!l) return { x: 0, z: 0 };
  x /= l;
  z /= l;
  return {
    x: Math.cos(yaw) * x + Math.sin(yaw) * z,
    z: -Math.sin(yaw) * x + Math.cos(yaw) * z,
  };
}
export function canTraverse(from, target, obstacles = []) {
  const distance = Math.hypot(target.x - from.x, target.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const point = {
      x: from.x + ((target.x - from.x) * i) / steps,
      z: from.z + ((target.z - from.z) * i) / steps,
    };
    if (
      !canWalk(point.x, point.z, obstacles) ||
      !heightTransitionAllowed(previous, point)
    )
      return false;
    previous = point;
  }
  return true;
}
function heightTransitionAllowed(a, b) {
  const start = expansionSurfaceAt(a.x, a.z),
    end = expansionSurfaceAt(b.x, b.z);
  if (start || end)
    return Math.abs(heightAt(a.x, a.z) - heightAt(b.x, b.z)) <= 0.19;
  return terrainCanTraverse(a, b);
}
export function move(position, direction, distance, obstacles) {
  const x = position.x + direction.x * distance,
    z = position.z + direction.z * distance;
  if (canTraverse(position, { x, z }, obstacles)) {
    position.x = x;
    position.z = z;
    return;
  }
  if (canTraverse(position, { x, z: position.z }, obstacles)) position.x = x;
  if (canTraverse(position, { x: position.x, z }, obstacles)) position.z = z;
}
export function route(from, target, obstacles = []) {
  if (
    !canWalk(from.x, from.z, obstacles) ||
    !canWalk(target.x, target.z, obstacles)
  )
    return [];
  const cell = 0.35,
    w = Math.ceil((CITY_BOUNDS.maxX - CITY_BOUNDS.minX) / cell) + 1,
    h = Math.ceil((CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ) / cell) + 1;
  const point = (i) => ({
    x: (i % w) * cell + CITY_BOUNDS.minX,
    z: Math.floor(i / w) * cell + CITY_BOUNDS.minZ,
  });
  let grid = navigationGrids.get(obstacles);
  if (!grid) {
    const allowed = new Uint8Array(w * h);
    for (let i = 0; i < allowed.length; i++) {
      const p = point(i);
      allowed[i] = Number(canWalk(p.x, p.z, obstacles));
    }
    grid = {
      allowed,
      checkedEdges: new Uint8Array(w * h),
      openEdges: new Uint8Array(w * h),
    };
    navigationGrids.set(obstacles, grid);
  }
  const { allowed, checkedEdges, openEdges } = grid;
  const prev = new Int32Array(w * h).fill(-1);
  // The grid is .35m; every candidate within the .65m connector radius lies in this 5x5 patch.
  const nearest = (position, reverse = false) => {
    const ix = Math.round((position.x - CITY_BOUNDS.minX) / cell),
      iz = Math.round((position.z - CITY_BOUNDS.minZ) / cell);
    let best = -1,
      distance = 0.65;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const x = ix + dx,
          z = iz + dz;
        if (x < 0 || x >= w || z < 0 || z >= h) continue;
        const index = z * w + x;
        if (!allowed[index]) continue;
        const p = point(index),
          d = Math.hypot(p.x - position.x, p.z - position.z);
        if (
          d < distance &&
          (reverse
            ? canTraverse(p, position, obstacles)
            : canTraverse(position, p, obstacles))
        ) {
          best = index;
          distance = d;
        }
      }
    return best;
  };
  const start = nearest(from),
    end = nearest(target, true);
  if (start < 0 || end < 0) return [];
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length && prev[end] < 0; head++) {
    const i = queue[head],
      x = i % w,
      z = Math.floor(i / w);
    for (let neighbor = 0; neighbor < NEIGHBORS.length; neighbor++) {
      const [dx, dz] = NEIGHBORS[neighbor];
      const nx = x + dx,
        nz = z + dz,
        k = nz * w + nx;
      if (nx < 0 || nx >= w || nz < 0 || nz >= h || !allowed[k] || prev[k] >= 0)
        continue;
      if (dx && dz && (!allowed[i + dx] || !allowed[i + dz * w])) continue;
      const bit = 1 << neighbor;
      if (!(checkedEdges[i] & bit)) {
        checkedEdges[i] |= bit;
        if (canTraverse(point(i), point(k), obstacles)) {
          openEdges[i] |= bit;
        }
      }
      if (!(openEdges[i] & bit)) continue;
      prev[k] = i;
      queue.push(k);
    }
  }
  if (prev[end] < 0) return [];
  const result = [];
  for (let i = end; i !== start; i = prev[i]) result.push(point(i));
  result.reverse();
  result.push({ ...target });
  return result;
}
