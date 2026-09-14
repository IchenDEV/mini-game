import {
  createExpansionBoundaries,
  createBoundaryCollision,
} from "./expansion-boundaries.js";
import * as THREE from "three";
import { terrainSurfaceAt, terrainCanWalk } from "./terrain.js";
export const COURT_HALF_WIDTH = 9.6,
  COURT_HALF_DEPTH = 8;
// Compress the new urban fabric while leaving both historical street connections fixed.
export function compactCityPoint(x, z) {
  return { x: -25 + (x + 25) * 0.8, z: 52 + (z - 52) * 0.8 };
}
const circuit = [];
function line(a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
  for (let i = 0; i < n; i++)
    circuit.push(
      new THREE.Vector3(
        a[0] + ((b[0] - a[0]) * i) / n,
        2.7,
        a[1] + ((b[1] - a[1]) * i) / n,
      ),
    );
}
function arc(cx, cz, start) {
  for (let i = 0; i < 16; i++) {
    const a = start + ((i / 16) * Math.PI) / 2;
    circuit.push(
      new THREE.Vector3(cx + 5 * Math.cos(a), 2.7, cz + 5 * Math.sin(a)),
    );
  }
}
line([-70, 50.5], [33.5, 50.5]);
arc(33.5, 55.5, -Math.PI / 2);
line([38.5, 55.5], [38.5, 76]);
arc(33.5, 76, 0);
line([33.5, 81], [-70, 81]);
arc(-70, 76, Math.PI / 2);
line([-75, 76], [-75, 55.5]);
arc(-70, 55.5, Math.PI);
for (const point of circuit) {
  const p = compactCityPoint(point.x, point.z + 8);
  point.x = p.x;
  point.z = p.z;
}
const trafficCurve = new THREE.CatmullRomCurve3(circuit, true, "centripetal");
export const TRAFFIC_LENGTH = trafficCurve.getLength();
export function trafficPose(distance) {
  const u =
    (((distance % TRAFFIC_LENGTH) + TRAFFIC_LENGTH) % TRAFFIC_LENGTH) /
    TRAFFIC_LENGTH;
  return {
    position: trafficCurve.getPointAt(u),
    yaw: Math.atan2(
      trafficCurve.getTangentAt(u).x,
      trafficCurve.getTangentAt(u).z,
    ),
  };
}

// One coordinate contract for authored rooms, streets, the map and navigation.
export const EXPANSION_SCENES = [
  {
    id: "scene01",
    name: "圣烛教堂山院",
    english: "ST CANDLE CLOSE",
    x: 14,
    z: 102,
    height: 8.1,
    buildings: ["新教堂", "牧师宅", "唱诗学校"],
  },
  {
    id: "scene02",
    name: "河湾医院",
    english: "RIVERBEND INFIRMARY",
    x: -13,
    z: 99,
    height: 5.4,
    buildings: ["河湾医院", "药房", "洗消房"],
  },
  {
    id: "scene03",
    name: "铜鹿酒馆街",
    english: "THE COPPER STAG",
    x: -58,
    z: 65,
    height: 2.7,
    buildings: ["铜鹿酒馆", "酿酒屋", "小剧场"],
  },
  {
    id: "scene04",
    name: "铁穹市场",
    english: "IRON ARCADE MARKET",
    x: -31,
    z: 68,
    height: 2.7,
    buildings: ["市场大厅", "面包房", "鱼铺"],
  },
  {
    id: "scene05",
    name: "驿马车站院",
    english: "CARRIAGE YARD",
    x: -3,
    z: 67,
    height: 2.7,
    buildings: ["马车站", "马厩", "车轮修理铺"],
  },
  {
    id: "scene06",
    name: "旧城清运巷",
    english: "ASH & RAG LANE",
    x: 24,
    z: 63,
    height: 2.7,
    buildings: ["清运站", "旧货回收铺", "公共洗衣房"],
  },
  {
    id: "scene07",
    name: "印刷邮务街",
    english: "PRINTERS ROW",
    x: -68,
    z: 99,
    height: 5.4,
    buildings: ["邮务分拣所", "印刷厂", "装订书店"],
  },
  {
    id: "scene08",
    name: "铜机学徒院",
    english: "APPRENTICES COURT",
    x: -41,
    z: 100,
    height: 5.4,
    buildings: ["仪器工坊", "钟表铺", "学徒宿舍"],
  },
  {
    id: "scene09",
    name: "闸口货栈",
    english: "LOCKSIDE STORES",
    x: 46,
    z: 37,
    height: 0,
    buildings: ["保税仓", "海关所", "船具行"],
  },
  {
    id: "scene10",
    name: "城墙温室院",
    english: "WALL GARDENS",
    x: 42,
    z: 99,
    height: 8.1,
    buildings: ["植物温室", "气象观测所", "花匠住宅"],
  },
]
  .map((scene) => ({ ...scene, ...compactCityPoint(scene.x, scene.z + 8) }))
  .map((scene) => ({
    ...scene,
    z:
      { scene08: 91.5, scene02: 102, scene01: 93, scene10: 100 }[scene.id] ??
      scene.z,
  }));
export const EXPANSION_BUILDINGS = EXPANSION_SCENES.flatMap((scene, index) => {
  // The side wings turn toward the courtyard. Main volumes remain individually authored.
  const slots = [
    [index % 3 === 1 ? 1 : 0, -4.4, 0],
    [-6, 3.2, Math.PI / 2],
    [6, 3.2, -Math.PI / 2],
  ];
  return scene.buildings.map((name, slot) => ({
    id: `B${String(index * 3 + slot + 1).padStart(2, "0")}`,
    sceneId: scene.id,
    name,
    x: scene.x + slots[slot][0],
    z: scene.z + slots[slot][1],
    yaw: slots[slot][2],
    height: scene.height,
    primary: slot === 0,
  }));
});
export function buildingPoint(building, x, z) {
  const c = Math.cos(building.yaw),
    s = Math.sin(building.yaw);
  return { x: building.x + c * x + s * z, z: building.z - s * x + c * z };
}
export function buildingLocal(building, x, z) {
  const dx = x - building.x,
    dz = z - building.z,
    c = Math.cos(building.yaw),
    s = Math.sin(building.yaw);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
export const EXPANSION_DESTINATIONS = Object.fromEntries(
  EXPANSION_SCENES.map((s) => [s.id, { x: s.x, z: s.z + 3 }]),
);
// These off-court streets avoid courtyard furniture and all door approaches.
const lanes = [
  [
    [-44.5, 50.5, 2.7],
    [38.5, 50.5, 2.7],
    [38.5, 81, 2.7],
    [-44.5, 81, 2.7],
    [-44.5, 50.5, 2.7],
  ],
  [
    [-62, 47, 2.7],
    [-62, 55, 2.7],
    [-58, 55, 2.7],
  ],
  [
    [-58, 75, 2.7],
    [-45, 79, 2.7],
    [-31, 78, 2.7],
    [-17, 79, 2.7],
    [-3, 77, 2.7],
    [10, 77, 2.7],
    [24, 73, 2.7],
  ],
  [
    [-68, 109, 5.4],
    [-54, 113, 5.4],
    [-41, 110, 5.4],
    [-27, 112, 5.4],
    [-13, 109, 5.4],
    [0, 117, 8.1],
    [14, 112, 8.1],
    [28, 111, 8.1],
    [42, 109, 8.1],
  ],
  [
    [-70, 69, 2.7],
    [-82, 79, 3.7],
    [-82, 96, 5.4],
    [-80, 99, 5.4],
  ],
  [
    [-17, 81, 2.7],
    [-17, 84, 2.7],
    [-17, 89, 5.4],
    [-13, 89, 5.4],
  ],
  [
    [24, 81, 2.7],
    [28, 84, 2.7],
    [28, 99, 8.1],
    [30, 99, 8.1],
  ],
  [
    [39.5, 66, 2.7],
    [59, 60, 2.7],
    [60, 47, 0],
    [58, 40, 0],
  ],
  [
    [46, 27, 0],
    [40, 20, 0],
    [13, 20, 0],
  ],
].map((points) => points.map(([x, z, h]) => [x, z + 8, h]));
// The two historic street ends keep their original world coordinates.
lanes.push([
  [-62, 49, 2.7],
  [-62, 55, 2.7],
]);
lanes.push([
  [13, 20, 0],
  [20, 23, 0],
  [40, 28, 0],
]);
export const EXPANSION_ROADS = lanes.flatMap((points, path) =>
  points.slice(1).flatMap((p, i) => {
    const a = points[i],
      count = Math.max(1, Math.ceil(Math.hypot(p[0] - a[0], p[1] - a[1]) / 3));
    const point = (t) => {
      const q = compactCityPoint(
        a[0] + (p[0] - a[0]) * t,
        a[1] + (p[1] - a[1]) * t,
      );
      return [q.x, q.z, a[2] + (p[2] - a[2]) * t];
    };
    // Keep stair flights whole so tread heights agree across the complete run.
    if (path === 5 && i === 1)
      return [
        {
          id: `new-road-${path}-${i}`,
          a: point(0),
          b: point(1),
          width: 2.8,
          stairs: true,
        },
      ];
    return Array.from({ length: count }, (_, j) => ({
      id: `new-road-${path}-${i}-${j}`,
      a: point(j / count),
      b: point((j + 1) / count),
      width:
        path === 0 &&
        [
          [-44.5, 58.5],
          [38.5, 58.5],
          [38.5, 89],
          [-44.5, 89],
        ].some(
          ([cx, cz]) =>
            Math.hypot(
              a[0] + ((p[0] - a[0]) * (j + 0.5)) / count - cx,
              a[1] + ((p[1] - a[1]) * (j + 0.5)) / count - cz,
            ) < 10,
        )
          ? 7
          : path === 5
            ? 2.8
            : 5.6,
      stairs: false,
    }));
  }),
);
for (let i = EXPANSION_ROADS.length - 1; i >= 0; i--)
  if (/^new-road-((0|1|3|4|5|6|8|9|10)-|7-2-)/.test(EXPANSION_ROADS[i].id))
    EXPANSION_ROADS.splice(i, 1);
const gateways = [
  [
    [13, 20, 0],
    [20, 23, 0],
    [46, 25, 0],
    [46, 54.4, 0],
    [31.8, 54.4, 0],
  ],
  [
    [-62, 49, 2.7],
    [-64, 56, 2.7],
    [-64, 78, 2.7],
    [-51.4, 78, 2.7],
  ],
  [
    [-51.4, 78, 2.7],
    [-68.8, 78, 2.7],
    [-74, 87, 5.4],
    [-74, 105, 5.4],
    [-59.4, 105, 5.4],
  ],
  [
    [-26.6, 82, 2.7],
    [-26.6, 86, 2.7],
    [-26.6, 93, 5.4],
    [-26.6, 111, 5.4],
    [-15.4, 111, 5.4],
  ],
];
gateways.forEach((points, p) =>
  points.slice(1).forEach((b, i) =>
    EXPANSION_ROADS.push({
      id: `gateway-${p}-${i}`,
      a: points[i],
      b,
      width: p === 3 ? 2.8 : 4,
      stairs: p === 3 && i === 1,
    }),
  ),
);
const upperWays = [
  [
    [-59.4, 104, 5.4],
    [-48.6, 108, 5.4],
    [-37.8, 99.5, 5.4],
    [-29, 110.5, 5.4],
    [-15.4, 112, 5.4],
    [-2, 113, 8.1],
    [6.2, 101, 8.1],
    [17, 111, 8.1],
    [28.6, 108, 8.1],
  ],
  [
    [14.2, 75.2, 2.7],
    [30, 80, 2.7],
    [31, 85, 2.7],
    [42, 85, 2.7],
    [42, 102, 8.1],
    [42, 109, 8.1],
    [28.6, 109, 8.1],
  ],
];
upperWays.forEach((points, p) =>
  points.slice(1).forEach((b, i) =>
    EXPANSION_ROADS.push({
      id: `upper-way-${p}-${i}`,
      a: points[i],
      b,
      // This apron joins two oblique streets; a narrow strip leaves soil wedges.
      width: p === 1 && i === 0 ? 9 : 3.6,
      stairs: false,
    }),
  ),
);
const roadSegments = Math.ceil(TRAFFIC_LENGTH / 2);
for (let i = 0; i < roadSegments; i++) {
  const a = trafficPose((i / roadSegments) * TRAFFIC_LENGTH).position,
    b = trafficPose(((i + 1) / roadSegments) * TRAFFIC_LENGTH).position;
  EXPANSION_ROADS.push({
    id: `carriage-lane-${i}`,
    a: [a.x, a.z, a.y],
    b: [b.x, b.z, b.y],
    width:
      Math.abs(
        Math.atan2(
          Math.sin(
            trafficPose(((i + 1) / roadSegments) * TRAFFIC_LENGTH).yaw -
              trafficPose((i / roadSegments) * TRAFFIC_LENGTH).yaw,
          ),
          Math.cos(
            trafficPose(((i + 1) / roadSegments) * TRAFFIC_LENGTH).yaw -
              trafficPose((i / roadSegments) * TRAFFIC_LENGTH).yaw,
          ),
        ),
      ) > 0.03
        ? 6.8
        : 5.6,
    stairs: false,
  });
}
// Flat landings meet stair flights without a circular apron across the steps.
for (const stair of EXPANSION_ROADS.filter((road) => road.stairs)) {
  const same = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-6);
  for (const road of EXPANSION_ROADS.filter((road) => !road.stairs)) {
    if (same(road.a, stair.b) || same(road.a, stair.a)) road.flatStart = true;
    if (same(road.b, stair.a) || same(road.b, stair.b)) road.flatEnd = true;
  }
}
const roadCells = new Map();
for (const road of EXPANSION_ROADS) {
  const radius = road.width / 2;
  for (
    let x = Math.floor((Math.min(road.a[0], road.b[0]) - radius) / 8);
    x <= Math.floor((Math.max(road.a[0], road.b[0]) + radius) / 8);
    x++
  )
    for (
      let z = Math.floor((Math.min(road.a[1], road.b[1]) - radius) / 8);
      z <= Math.floor((Math.max(road.a[1], road.b[1]) + radius) / 8);
      z++
    ) {
      const key = `${x},${z}`;
      if (!roadCells.has(key)) roadCells.set(key, []);
      roadCells.get(key).push(road);
    }
}
export function roadSample(road, x, z) {
  const dx = road.b[0] - road.a[0],
    dz = road.b[1] - road.a[1],
    len2 = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(1, ((x - road.a[0]) * dx + (z - road.a[1]) * dz) / len2),
  );
  const projection = ((x - road.a[0]) * dx + (z - road.a[1]) * dz) / len2;
  const distance =
    ((road.stairs || road.flatStart) && projection < 0) ||
    ((road.stairs || road.flatEnd) && projection > 1)
      ? Infinity
      : Math.hypot(x - road.a[0] - dx * t, z - road.a[1] - dz * t);
  const rise = road.b[2] - road.a[2];
  const u = road.stairs ? Math.ceil(t * 18 - 1e-8) / 18 : t;
  return { distance, t, height: road.a[2] + rise * u };
}
export function expansionSurfaceAt(x, z, inset = 0) {
  const court = EXPANSION_SCENES.find(
    (s) =>
      Math.abs(x - s.x) <= COURT_HALF_WIDTH - inset &&
      z >= s.z - COURT_HALF_DEPTH + inset &&
      z <= s.z + COURT_HALF_DEPTH - inset,
  );
  if (court) return { id: court.id, height: court.height, kind: "court" };
  let best = null;
  for (const road of roadCells.get(
    `${Math.floor(x / 8)},${Math.floor(z / 8)}`,
  ) ?? []) {
    const sample = roadSample(road, x, z);
    if (
      sample.distance <= road.width / 2 - inset &&
      (!best || sample.distance < best.distance)
    )
      best = { ...sample, id: road.id, kind: road.stairs ? "stairs" : "road" };
  }
  return best;
}
export function expansionBuildingAt(x, z) {
  return EXPANSION_BUILDINGS.find((b) => {
    const p = buildingLocal(b, x, z);
    return Math.abs(p.x) < 3.65 && Math.abs(p.z) < 3.3;
  });
}
export const EXPANSION_GARDENS = EXPANSION_SCENES.flatMap((s, i) => [
  {
    x0: s.x - 9.3,
    x1: s.x - 4.4,
    z0: s.z - 7.8,
    z1: s.z - 1.3,
    height: s.height,
    service: [4, 5, 6, 8].includes(i),
  },
  {
    x0: s.x + (i % 3 === 1 ? 5.4 : 4.4),
    x1: s.x + 9.3,
    z0: s.z - 7.8,
    z1: s.z - 1.3,
    height: s.height,
    service: [4, 5, 6, 8].includes(i),
  },
]);
export const EXPANSION_STREET_PROPS = EXPANSION_SCENES.flatMap((s, i) => [
  ...[-1, 1].map((side) => ({
    model: "Street_GasLamp",
    x: s.x + side * 1.9,
    z: s.z + 7.65,
    height: s.height,
    radius: 0.2,
  })),
  {
    model: "Street_Dustbin",
    x: s.x + 1.9,
    z: s.z + 0.3,
    height: s.height,
    radius: 0.3,
  },
  {
    model: "Street_Drain",
    x: s.x - 1.9,
    z: s.z + 7.65,
    height: s.height,
    radius: 0,
  },
  ...(i === 5
    ? [
        {
          model: "Street_AshBox",
          x: s.x - 1.8,
          z: s.z + 0.5,
          height: s.height,
          radius: 0.4,
        },
        {
          model: "Street_Litter",
          x: s.x - 1.9,
          z: s.z + 1.2,
          height: s.height,
          radius: 0,
        },
      ]
    : []),
  ...(i === 3
    ? [
        {
          model: "Street_MarketBarrow",
          x: s.x - 1.65,
          z: s.z + 1,
          height: s.height,
          radius: 0.8,
        },
      ]
    : []),
  ...(i === 8
    ? [
        {
          model: "Street_CrateStack",
          x: s.x + 1.65,
          z: s.z + 1,
          height: s.height,
          radius: 0.75,
        },
      ]
    : []),
]);
export function expansionCanWalk(x, z) {
  const surface = expansionSurfaceAt(x, z);
  if (!surface) return false;
  if (
    EXPANSION_GARDENS.some(
      (g) =>
        x > g.x0 - 0.2 && x < g.x1 + 0.2 && z > g.z0 - 0.2 && z < g.z1 + 0.2,
    )
  )
    return false;
  for (const [dx, dz] of [
    [0.27, 0],
    [-0.27, 0],
    [0, 0.27],
    [0, -0.27],
    [0.19, 0.19],
    [-0.19, 0.19],
    [0.19, -0.19],
    [-0.19, -0.19],
  ]) {
    const px = x + dx,
      pz = z + dz;
    let edge = expansionSurfaceAt(px, pz);
    if (!edge)
      edge = terrainCanWalk(px, pz)
        ? terrainSurfaceAt(px, pz)
        : px >= -64 && px <= 13.5 && pz >= 16 && pz <= 21.7
          ? { height: 0 }
          : null;
    if (!edge || Math.abs(edge.height - surface.height) > 0.31) return false;
  }
  if (
    EXPANSION_STREET_PROPS.some(
      (p) => p.radius > 0 && Math.hypot(x - p.x, z - p.z) < p.radius + 0.27,
    )
  )
    return false;
  if (
    EXPANSION_SCENES.some((s) =>
      [-1, 1].some(
        (side) =>
          Math.abs(x - (s.x + side * 1.55)) < 1.045 &&
          Math.abs(z - (s.z + 6.9)) < 0.47,
      ),
    )
  )
    return false;
  for (const b of EXPANSION_BUILDINGS) {
    if (Math.abs(x - b.x) > 5 || Math.abs(z - b.z) > 5) continue;
    const p = buildingLocal(b, x, z);
    if (Math.abs(p.x) < 4.27 && Math.abs(p.z) < 3.77) {
      // Interior furniture lives in the side bays, leaving an authored central aisle.
      if (Math.abs(p.x) > 3.35 || p.z < -2.85) return false;
      if (p.z > 2.85 && Math.abs(p.x) > 0.8) return false;
      if (Math.abs(p.x) > 0.83 && p.z < 2.5) return false;
    }
  }
  return true;
}

export const EXPANSION_BOUNDARIES = createExpansionBoundaries({
  roads: EXPANSION_ROADS,
  courts: EXPANSION_SCENES,
  halfWidth: COURT_HALF_WIDTH,
  halfDepth: COURT_HALF_DEPTH,
  surfaceAt: (x, z) =>
    expansionSurfaceAt(x, z) ??
    terrainSurfaceAt(x, z) ??
    (x >= -64 && x <= 13.5 && z >= 16 && z <= 21.7 ? { height: 0 } : null),
  nearBuilding: (x, z, height) =>
    EXPANSION_BUILDINGS.some((b) => {
      if (Math.abs(height - b.height) > 0.25) return false;
      const local = buildingLocal(b, x, z);
      return Math.abs(local.x) < 4.2 && Math.abs(local.z) < 3.7;
    }),
});
export const expansionBoundaryBlocks =
  createBoundaryCollision(EXPANSION_BOUNDARIES);
