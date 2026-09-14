import * as THREE from "three";

export const RAILWAY = Object.freeze({
  startX: -68,
  endX: 27.5,
  headY: 4.8975,
  gauge: 1.02,
  wheelRadius: 0.21,
  wheelBase: 2.94,
  bodyLength: 4.83,
  deckWidth: 2.15,
  deckTopY: 4.7275,
  sleeperTopY: 4.8225,
  sleeperSpacing: 0.48,
  railHeight: 0.075,
  railWidth: 0.075,
  maxSpeed: 0.9,
  bendStartX: -48,
  bendEndX: -18,
});

export function railPoint(x, lateral = 0) {
  const t = THREE.MathUtils.clamp((-x - 18) / 30, 0, 1);
  const blend = t * t * t * (10 + t * (-15 + 6 * t));
  const slope =
    t > 0 && t < 1 ? (3.55 / 30) * 30 * t * t * (1 - t) * (1 - t) : 0;
  const normalLength = Math.hypot(1, slope);
  return {
    x: x - (lateral * slope) / normalLength,
    y: RAILWAY.headY,
    z: -12.65 - 3.55 * blend + lateral / normalLength,
    yaw: -Math.atan(slope),
  };
}

// One arc-length table drives speed, end margins, both axles and wheel rotation.
const arc = [{ x: RAILWAY.startX, distance: 0 }];
for (let x = RAILWAY.startX + 0.1; x < RAILWAY.endX + 0.099; x += 0.1) {
  const nextX = Math.min(RAILWAY.endX, x);
  const previous = arc.at(-1),
    a = railPoint(previous.x),
    b = railPoint(nextX);
  arc.push({
    x: nextX,
    distance: previous.distance + Math.hypot(b.x - a.x, b.z - a.z),
  });
  if (nextX === RAILWAY.endX) break;
}
const length = arc.at(-1).distance;
export function railDistanceAtX(x) {
  const i = Math.min(arc.length - 2, Math.max(0, Math.floor((x - RAILWAY.startX) / 0.1)));
  const a = arc[i], b = arc[i + 1];
  return a.distance + (b.distance - a.distance) * THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1);
}
const initialStation = arc.reduce(
  (best, p) => (Math.abs(p.x - 2) < Math.abs(best.x - 2) ? p : best),
  arc[0],
).distance;
export function railPointAtDistance(distance, lateral = 0) {
  const s = THREE.MathUtils.clamp(distance, 0, length);
  let low = 0,
    high = arc.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (arc[mid].distance < s) low = mid;
    else high = mid;
  }
  const a = arc[low],
    b = arc[high],
    t = (s - a.distance) / (b.distance - a.distance || 1);
  return railPoint(a.x + (b.x - a.x) * t, lateral);
}
export function railTravelAt(time, formationLength = RAILWAY.bodyLength) {
  const endMargin = formationLength / 2 + 0.24;
  const travel = length - 2 * endMargin;
  const initialPhase = Math.acos(
    THREE.MathUtils.clamp(
      1 - (2 * (initialStation - endMargin)) / travel,
      -1,
      1,
    ),
  );
  const phase = initialPhase + (time * 2 * RAILWAY.maxSpeed) / travel;
  const distance = endMargin + travel * (0.5 - 0.5 * Math.cos(phase));
  return { distance, direction: Math.sin(phase) >= 0 ? 1 : -1 };
}
export function railVehiclePoseAt(
  distance,
  wheelBase,
  wheelRadius,
  rootHeight = 0,
) {
  const rear = railPointAtDistance(distance - wheelBase / 2);
  const front = railPointAtDistance(distance + wheelBase / 2);
  return {
    position: {
      x: (rear.x + front.x) / 2,
      y: RAILWAY.headY + rootHeight,
      z: (rear.z + front.z) / 2,
    },
    yaw: -Math.atan2(front.z - rear.z, front.x - rear.x),
    axles: [rear, front].map((p) => ({
      position: { x: p.x, y: RAILWAY.headY + wheelRadius, z: p.z },
      yaw: p.yaw,
    })),
    distance,
    wheelAngle: -distance / wheelRadius,
  };
}
export function tramPoseAt(time) {
  const travel = railTravelAt(time);
  return {
    ...railVehiclePoseAt(
      travel.distance,
      RAILWAY.wheelBase,
      RAILWAY.wheelRadius,
      0.06,
    ),
    direction: travel.direction,
  };
}

// Preserve authored support details while relocating their old centerline onto the shared curve.
export function alignRailSupportGeometry(geometry, oldCenterline) {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      lateral = position.getZ(i) - oldCenterline(x),
      point = railPoint(x, lateral);
    position.setXYZ(i, point.x, position.getY(i), point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Cross sections share endpoints exactly across the eastern/western factory boundary.
export function railPrismGeometry(startX, endX, left, right, bottom, top) {
  const count = Math.max(1, Math.ceil((endX - startX) / 0.25)),
    vertices = [],
    uv = [],
    indices = [];
  for (let i = 0; i <= count; i++) {
    const x = startX + ((endX - startX) * i) / count;
    for (const [lateral, y] of [
      [left, bottom],
      [right, bottom],
      [left, top],
      [right, top],
    ]) {
      const p = railPoint(x, lateral);
      vertices.push(p.x, y, p.z);
      uv.push(x / 2, lateral / 2);
    }
    if (i < count) {
      const a = i * 4,
        b = a + 4;
      indices.push(
        a,
        b,
        b + 1,
        a,
        b + 1,
        a + 1,
        a + 2,
        a + 3,
        b + 3,
        a + 2,
        b + 3,
        b + 2,
        a,
        a + 2,
        b + 2,
        a,
        b + 2,
        b,
        a + 1,
        b + 1,
        b + 3,
        a + 1,
        b + 3,
        a + 3,
      );
    }
  }
  const end = count * 4;
  indices.push(0, 1, 3, 0, 3, 2, end, end + 2, end + 3, end, end + 3, end + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const faces = geometry.toNonIndexed();
  // Keep the running surface separate from vertical end caps at segment joins.
  faces.computeVertexNormals();
  geometry.dispose();
  return faces;
}

export function addRailRunningSurface(
  startX,
  endX,
  emitGeometry,
  emitBox,
  emitCylinder,
  emitLine,
  { deckThickness = 0.27, contactWire = true, guardLateral = 1.01 } = {},
) {
  emitGeometry(
    railPrismGeometry(
      startX,
      endX,
      -RAILWAY.deckWidth / 2,
      RAILWAY.deckWidth / 2,
      RAILWAY.deckTopY - deckThickness,
      RAILWAY.deckTopY,
    ),
    "iron",
  );
  for (const side of [-1, 1]) {
    const center = (side * RAILWAY.gauge) / 2;
    emitGeometry(
      railPrismGeometry(
        startX,
        endX,
        center - RAILWAY.railWidth / 2,
        center + RAILWAY.railWidth / 2,
        RAILWAY.headY - RAILWAY.railHeight,
        RAILWAY.headY,
      ),
      "ironLight",
    );
  }
  const first = Math.ceil((startX - RAILWAY.startX) / RAILWAY.sleeperSpacing);
  for (let n = first; ; n++) {
    const x = RAILWAY.startX + n * RAILWAY.sleeperSpacing;
    if (x >= endX - 1e-6) break;
    const p = railPoint(x);
    emitBox(p.x, RAILWAY.sleeperTopY - 0.0475, p.z, 0.13, 0.095, 1.68, "wood", [
      0,
      p.yaw,
      0,
    ]);
  }
  // Retain the original one-sided iron safety railing, now following the same centerline.
  const guardTop = RAILWAY.deckTopY + 0.85;
  for (let x = Math.ceil(startX / 1.1) * 1.1; x < endX; x += 1.1) {
    const p = railPoint(x, guardLateral);
    emitCylinder(p.x, RAILWAY.deckTopY + 0.425, p.z, 0.041, 0.85, "iron");
  }
  for (const y of [RAILWAY.deckTopY + 0.31, guardTop]) {
    for (let x = startX; x < endX; x += 0.5) {
      const a = railPoint(x, guardLateral),
        b = railPoint(Math.min(endX, x + 0.5), guardLateral);
      emitLine([a.x, y, a.z], [b.x, y, b.z], 0.025, "iron");
    }
  }
  // The unchanged electric tram keeps its contact wire on both halves of the route.
  if (!contactWire) return;
  for (let x = Math.ceil(startX / 6) * 6; x < endX; x += 6) {
    const post = railPoint(x, -1.0),
      over = railPoint(x, 0.3);
    emitLine(
      [post.x, RAILWAY.deckTopY, post.z],
      [post.x, 7.3, post.z],
      0.04,
      "iron",
    );
    emitLine([post.x, 7.25, post.z], [over.x, 7.25, over.z], 0.035, "iron");
  }
  for (let x = startX; x < endX; x += 0.5) {
    const a = railPoint(x),
      b = railPoint(Math.min(endX, x + 0.5));
    emitLine([a.x, 7.16, a.z], [b.x, 7.16, b.z], 0.012, "iron");
  }
}
