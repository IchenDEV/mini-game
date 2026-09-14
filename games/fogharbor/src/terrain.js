import * as THREE from "three";
import { industrialOverlap } from "./industrial-layout.js";
import { foliageGeometry } from "./architecture.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Shared metre-based city parcels. Buildings define lanes and courts, rather than display rows.
export const TERRACES = [
  {
    id: "clock-walk", height: 5.4,
    polygon: [[-37,45.2],[-27,45.2],[-27,50.4],[-37,50.4]],
  },
  {
    id: "inn-court",
    height: 2.7,
    polygon: [
      [-64, 33],
      [-60, 30],
      [-53, 30],
      [-47, 33],
      [-45, 38],
      [-43, 37],
      [-34, 38.8],
      [-26, 37],
      [-6, 36],
      [-1, 39],
      [-1, 44],
      [0, 49],
      [-7, 52],
      [-20, 52],
      [-35, 50.5],
      [-44, 51],
      [-53, 51],
      [-64, 51],
      [-66, 44],
      [-64, 40],
    ],
  },
  {
    id: "post-court",
    height: 1.2,
    polygon: [
      [-51, 25.2],
      [-49, 23.8],
      [-43, 23.8],
      [-40, 25],
      [-31, 25],
      [-26, 28],
      [-27, 33],
      [-34, 36],
      [-43, 34],
      [-49.5, 29],
    ],
  },
  {
    id: "chapel-lower",
    height: 2.7,
    polygon: [
      [-6, 32],
      [-2, 29],
      [5, 29],
      [6, 27],
      [14, 27],
      [18, 32],
      [15, 38],
      [-1, 39],
      [-6, 36],
    ],
  },
  {
    id: "chapel-upper",
    height: 4.2,
    polygon: [
      [-2, 40],
      [1, 38],
      [10, 38],
      [14, 40],
      [15, 46],
      [10, 49],
      [0, 48],
      [-4, 44],
    ],
  },
];
// Narrow, level approaches turn before the steps; none is an extension of a bridge axis.
export const GROUND_PATHS = [
  [
    [-61, 21.4],
    [-55.5, 21.4],
    [-55.5, 24],
    [-55.5, 26.4],
    [-58.5, 26.4],
    [-58.5, 24.8],
    [-61, 23.4],
  ],
  [
    [-33, 21.4],
    [-29.8, 21.4],
    [-29.8, 22.4],
    [-33, 22.4],
  ],
  [
    [5, 21.4],
    [11.6, 21.4],
    [11.6, 23.4],
    [8.4, 23.4],
    [8.4, 22.4],
    [5, 22.4],
  ],
];
export const STAIRS = [
  {
    id: "canal-mews-stairs", x: -46, z0: 21.4, z1: 23.8, width: 2.2,
    bottom: 0, top: 1.2, steps: 8, from: null, to: "post-court",
  },
  {
    id: "clock-stairs", x: -34.5, z0: 41, z1: 45.2, width: 2,
    bottom: 2.7, top: 5.4, steps: 18, from: "inn-court", to: "clock-walk",
  },
  {
    id: "inn-stairs",
    x: -57,
    z0: 24.6,
    z1: 30,
    width: 2.6,
    bottom: 0,
    top: 2.7,
    steps: 18,
    from: null,
    to: "inn-court",
  },
  {
    id: "post-stairs",
    x: -31.4,
    z0: 21.4,
    z1: 25,
    width: 2.8,
    bottom: 0,
    top: 1.2,
    steps: 8,
    from: null,
    to: "post-court",
  },
  {
    id: "chapel-stairs",
    x: 10,
    z0: 21.6,
    z1: 27,
    width: 3,
    bottom: 0,
    top: 2.7,
    steps: 18,
    from: null,
    to: "chapel-lower",
  },
  {
    id: "upper-chapel-stairs",
    x: 4,
    z0: 34.4,
    z1: 38,
    width: 2.6,
    bottom: 2.7,
    top: 4.2,
    steps: 10,
    from: "chapel-lower",
    to: "chapel-upper",
  },
];
export const COURT_LANES = [
  {
    id: "mews-passage",
    a: [-46.9, 2.7, 39.9],
    b: [-40.3, 1.2, 34.1],
    width: 2.1,
    from: "inn-court",
    to: "post-court",
  },
  {
    id: "chapel-passage",
    a: [-31, 1.2, 34.5],
    b: [-23.2, 2.7, 38.5],
    width: 2.2,
    from: "post-court",
    to: "inn-court",
  },
].map((lane) => {
  // End the sloping surface at the actual retaining edges, so it meets each court flush.
  const at = (t) => [
    lane.a[0] + (lane.b[0] - lane.a[0]) * t,
    lane.a[2] + (lane.b[2] - lane.a[2]) * t,
  ];
  const boundary = (id, leaving) => {
    const polygon = TERRACES.find((t) => t.id === id).polygon;
    let low = 0,
      high = 1;
    for (let i = 0; i < 40; i++) {
      const t = (low + high) / 2,
        [x, z] = at(t);
      if (insidePolygon(x, z, polygon) === leaving) low = t;
      else high = t;
    }
    return at((low + high) / 2);
  };
  const start = boundary(lane.from, true),
    end = boundary(lane.to, false);
  return {
    ...lane,
    a: [start[0], lane.a[1], start[1]],
    b: [end[0], lane.b[1], end[1]],
  };
});
export function laneSample(lane, x, z) {
  const dx = lane.b[0] - lane.a[0],
    dz = lane.b[2] - lane.a[2],
    length = Math.hypot(dx, dz);
  const t = ((x - lane.a[0]) * dx + (z - lane.a[2]) * dz) / (length * length);
  const side = ((x - lane.a[0]) * -dz + (z - lane.a[2]) * dx) / length;
  return {
    t,
    side,
    height: lane.a[1] + (lane.b[1] - lane.a[1]) * Math.max(0, Math.min(1, t)),
  };
}
export const TERRACE_DESTINATIONS = {
  clockwalk: { x: -32, z: 45.9 },
  canalmews: { x: -46, z: 25 },
  inncourt: { x: -57, z: 33 },
  postcourt: { x: -32, z: 28 },
  chapelcourt: { x: 4, z: 40.3 },
};
export const FOOTPRINTS = {
  Terrace: [4.2, 4.4],
  Townhouse: [5.1, 4.8],
  CornerInn: [5.8, 4.9],
  Warehouse: [5.8, 5.4],
  PostOffice: [6.3, 5.0],
  Chapel: [6.7, 6.5],
};
export const CITY_PLOTS = [
  { name: "Terrace", x: -48, z: 26.7, size: .67, heightScale: 1.12, yaw: Math.PI, terrace: "post-court" },
  { name: "Townhouse", x: -43.8, z: 26.4, size: .64, heightScale: 1.14, yaw: Math.PI, terrace: "post-court" },
  { name: "Terrace", x: -34.7, z: 48.2, size: .68, heightScale: 1.16, yaw: Math.PI, terrace: "clock-walk" },
  { name: "Townhouse", x: -30.1, z: 48.2, size: .68, heightScale: 1.02, yaw: Math.PI, terrace: "clock-walk" },
  { name: "Townhouse", x: -24, z: 41, size: .64, heightScale: 1.13, yaw: Math.PI + .06, terrace: "inn-court" },
  { name: "Terrace", x: -19.7, z: 40.9, size: .70, heightScale: .96, yaw: Math.PI - .06, terrace: "inn-court" },
  { name: "Townhouse", x: -9, z: 39.3, size: .62, heightScale: 1.16, yaw: Math.PI + .08, terrace: "inn-court" },
  { name: "Terrace", x: -4.2, z: 41, size: .66, heightScale: 1.08, yaw: Math.PI + .12, terrace: "inn-court" },
  { name: "Terrace", x: -47.8, z: 47.6, size: .66, heightScale: 1.12, yaw: Math.PI + .04, terrace: "inn-court" },
  { name: "Townhouse", x: -40.4, z: 48.2, size: .70, heightScale: 1.08, yaw: Math.PI - .04, terrace: "inn-court" },
  { name: "Terrace", x: -18, z: 49.4, size: .60, heightScale: 1.15, yaw: Math.PI - .05, terrace: "inn-court" },
  { name: "Townhouse", x: -55, z: -31.8, size: .62, heightScale: .94, yaw: Math.PI/2, elevation: .18 },
  { name: "Terrace", x: -39.7, z: -28.3, size: .64, heightScale: .90, yaw: Math.PI/2, elevation: 0 },
  { name: "Terrace", x: -20.15, z: -23.4, size: .60, heightScale: 1.04, yaw: 0, elevation: 0 },
  { name: "Terrace", x: 12, z: -36.8, size: .65, heightScale: 1.16, yaw: Math.PI, elevation: .2 },
  {
    name: "CornerInn",
    x: -55,
    z: 39.3,
    size: 0.96,
    yaw: 3.021592653589793,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -60.2,
    z: 36.2,
    size: 0.83,
    yaw: 1.4507963267948965,
    terrace: "inn-court",
  },
  {
    name: "Townhouse",
    x: -49.1,
    z: 36.5,
    size: 0.72,
    yaw: -1.6907963267948967,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -59.9,
    z: 41,
    size: 0.73,
    yaw: 3.021592653589793,
    terrace: "inn-court",
  },
  {
    name: "PostOffice",
    x: -36.6,
    z: 30.7,
    size: 0.91,
    yaw: 3.001592653589793,
    terrace: "post-court",
  },
  {
    name: "Terrace",
    x: -41.4,
    z: 30.2,
    size: 0.7,
    yaw: 1.4307963267948964,
    terrace: "post-court",
  },
  {
    name: "Townhouse",
    x: -29.3,
    z: 30.8,
    size: 0.77,
    yaw: -1.7107963267948967,
    terrace: "post-court",
  },
  {
    name: "Chapel",
    x: 5.9,
    z: 44.5,
    size: 0.95,
    yaw: 3.2615926535897932,
    terrace: "chapel-upper",
  },
  {
    name: "Terrace",
    x: -0.8999999999999986,
    z: 34.1,
    size: 0.9,
    yaw: 1.6907963267948967,
    terrace: "chapel-lower",
  },
  {
    name: "Warehouse",
    x: 13.6,
    z: 32.9,
    size: 0.78,
    yaw: -1.4507963267948965,
    terrace: "chapel-lower",
  },
  {
    name: "Townhouse",
    x: 9,
    z: 35.2,
    size: 0.67,
    yaw: 3.2615926535897932,
    terrace: "chapel-lower",
  },
  {
    name: "Terrace",
    x: 12.2,
    z: 43,
    size: 0.63,
    yaw: -1.4507963267948965,
    terrace: "chapel-upper",
  },
  {
    name: "Townhouse",
    x: -43.5,
    z: 42.7,
    size: 0.87,
    yaw: 3.221592653589793,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -38.3,
    z: 42.3,
    size: 0.92,
    yaw: 3.221592653589793,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -29,
    z: 41.9,
    size: 0.92,
    yaw: 3.221592653589793,
    terrace: "inn-court",
  },
  {
    name: "CornerInn",
    x: -14.5,
    z: 44.8,
    size: 0.83,
    yaw: -1.4907963267948965,
    terrace: "inn-court",
  },
  {
    name: "Warehouse",
    x: -64.5,
    z: -25.2,
    size: 0.96,
    yaw: 0.12,
    elevation: 0.18,
  },
  {
    name: "Warehouse",
    x: -65.2,
    z: -32.1,
    size: 0.87,
    yaw: 1.6907963267948967,
    elevation: 0.18,
  },
  {
    name: "Terrace",
    x: -58.9,
    z: -26.7,
    size: 0.91,
    yaw: 0.12,
    elevation: 0.18,
  },
  {
    name: "Townhouse",
    x: -53.5,
    z: -27.3,
    size: 0.94,
    yaw: 0.12,
    elevation: 0.18,
  },
  {
    name: "Terrace",
    x: -59.8,
    z: -36.2,
    size: 0.93,
    yaw: 3.2615926535897932,
    elevation: 0.18,
  },
  {
    name: "Terrace",
    x: -55.1,
    z: -36.8,
    size: 0.93,
    yaw: 3.2615926535897932,
    elevation: 0.18,
  },
  {
    name: "Townhouse",
    x: -42.2,
    z: -23.1,
    size: 0.94,
    yaw: 0,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -37.3,
    z: -23.1,
    size: 0.98,
    yaw: 0,
    elevation: 0,
  },
  {
    name: "CornerInn",
    x: -31.7,
    z: -24.1,
    size: 0.94,
    yaw: -1.5707963267948966,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -42.5,
    z: -33.4,
    size: 0.95,
    yaw: 3.141592653589793,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -37.7,
    z: -33.4,
    size: 0.95,
    yaw: 3.141592653589793,
    elevation: 0,
  },
  {
    name: "Warehouse",
    x: -30.3,
    z: -33.7,
    size: 0.94,
    yaw: 1.5707963267948966,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -16.4,
    z: -19.1,
    size: 0.92,
    yaw: -0.1,
    elevation: 0,
  },
  {
    name: "Townhouse",
    x: -11.2,
    z: -18.6,
    size: 0.94,
    yaw: -0.1,
    elevation: 0,
  },
  {
    name: "CornerInn",
    x: -5.5,
    z: -22.5,
    size: 0.94,
    yaw: -1.6707963267948966,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -16.8,
    z: -29.9,
    size: 0.92,
    yaw: 3.041592653589793,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -12.2,
    z: -29.4,
    size: 0.92,
    yaw: 3.041592653589793,
    elevation: 0,
  },
  {
    name: "Warehouse",
    x: 5,
    z: -27.5,
    size: 1.08,
    yaw: 0.16,
    elevation: 0.2,
  },
  {
    name: "Townhouse",
    x: 11.8,
    z: -28.6,
    size: 0.97,
    yaw: 0.16,
    elevation: 0.2,
  },
  {
    name: "Terrace",
    x: 16.9,
    z: -29.4,
    size: 0.94,
    yaw: 0.16,
    elevation: 0.2,
  },
  {
    name: "CornerInn",
    x: 20.9,
    z: -23.8,
    size: 0.95,
    yaw: -1.4107963267948966,
    elevation: 0.2,
  },
  {
    name: "Terrace",
    x: -47.5,
    z: -28,
    size: 0.86,
    yaw: 0.12,
    elevation: 0,
  },
  {
    name: "Townhouse",
    x: -24,
    z: -26.4,
    size: 0.91,
    yaw: 0.12,
    elevation: 0,
  },
  {
    name: "Warehouse",
    x: -51,
    z: -43,
    size: 0.95,
    yaw: -0.08,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: -45.4,
    z: -42.5,
    size: 0.92,
    yaw: -0.08,
    elevation: 0,
  },
  {
    name: "Townhouse",
    x: 14.7,
    z: -20.8,
    size: 0.92,
    yaw: 3.3015926535897933,
    elevation: 0,
  },
  {
    name: "Terrace",
    x: 9.6,
    z: -20.4,
    size: 0.9,
    yaw: 3.3015926535897933,
    elevation: 0,
  },
  {
    name: "CornerInn",
    x: 6.5,
    z: -35,
    size: 0.93,
    yaw: -0.14,
    elevation: 0,
  },
  {
    name: "Townhouse",
    x: -58,
    z: 48.5,
    size: 0.82,
    yaw: 3.291592653589793,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -53.5,
    z: 47.8,
    size: 0.78,
    yaw: 3.291592653589793,
    terrace: "inn-court",
  },
  {
    name: "Warehouse",
    x: -23,
    z: 48.5,
    size: 0.82,
    yaw: 3.021592653589793,
    terrace: "inn-court",
  },
  {
    name: "Terrace",
    x: -9.5,
    z: 45.5,
    size: 0.84,
    yaw: 3.3215926535897933,
    terrace: "inn-court",
  },
].filter(plot => {
  if (plot.z > -13) return true;
  const [w,d] = FOOTPRINTS[plot.name], c = Math.abs(Math.cos(plot.yaw)), s = Math.abs(Math.sin(plot.yaw));
  return !industrialOverlap(plot.x, plot.z, (w*c+d*s)*plot.size/2+0.2, (w*s+d*c)*plot.size/2+0.2);
});
export const COURTYARD_PROPS = [
  { kind: "lamp", x: -36.5, z: 45.7, terrace: "clock-walk" },
  { kind: "planter", x: -28, z: 45.9, terrace: "clock-walk" },
  {
    kind: "bench",
    x: -53.5,
    z: 35.6,
    yaw: 0.12,
    terrace: "inn-court",
  },
  {
    kind: "planter",
    x: -59.2,
    z: 32.1,
    terrace: "inn-court",
  },
  {
    kind: "lamp",
    x: -55.2,
    z: 31.8,
    terrace: "inn-court",
  },
  {
    kind: "bench",
    x: -34.6,
    z: 27.1,
    yaw: 0.14,
    terrace: "post-court",
  },
  {
    kind: "planter",
    x: -28.4,
    z: 27.8,
    terrace: "post-court",
  },
  {
    kind: "lamp",
    x: -32.8,
    z: 26.5,
    terrace: "post-court",
  },
  {
    kind: "planter",
    x: 5.5,
    z: 30.5,
    terrace: "chapel-lower",
  },
  {
    kind: "planter",
    x: 0,
    z: 40.3,
    terrace: "chapel-upper",
  },
  {
    kind: "bench",
    x: 9.7,
    z: 39.8,
    yaw: 1.5707963267948966,
    terrace: "chapel-upper",
  },
  {
    kind: "lamp",
    x: 5.699999999999999,
    z: 39.3,
    terrace: "chapel-upper",
  },
];
// Quiet paths and rear yards in the scenic northern blocks, clipped into one continuous surface.
export const NORTH_PAVING = [
  [
    [-72, -18],
    [-69, -40],
    [-50, -41],
    [-46, -35],
    [-46, -20],
    [-51, -18],
  ],
  [
    [-47, -18],
    [-47, -37],
    [-26, -37],
    [-24, -24],
    [-20, -18],
  ],
  [
    [-21, -16],
    [-22, -32],
    [-10, -34],
    [0, -29],
    [2, -17],
  ],
  [
    [1, -19],
    [0, -32],
    [19, -35],
    [26, -29],
    [27, -18],
  ],
];
export function plotHeight(plot) {
  return plot.terrace
    ? TERRACES.find((t) => t.id === plot.terrace).height
    : (plot.elevation ?? 0);
}
export function plotObstacle(plot) {
  const [width, depth] = FOOTPRINTS[plot.name];
  const c = Math.abs(Math.cos(plot.yaw)),
    s = Math.abs(Math.sin(plot.yaw));
  const halfX = ((width * c + depth * s) * plot.size) / 2,
    halfZ = ((width * s + depth * c) * plot.size) / 2;
  return {
    minX: plot.x - halfX,
    maxX: plot.x + halfX,
    minZ: plot.z - halfZ,
    maxZ: plot.z + halfZ,
    plot,
  };
}
// Optional third component selects a low understorey scale within a grove.
export const UNDERGROWTH_PATCHES = [
  [-59, 53, 3.6, 1.7],
  [-32, 52.5, 3.8, 1.6],
  [9, 51.5, 3.1, 1.8],
  [23, -37, 2.8, 2.0],
];
export const TREE_PLOTS = [
  [-67.5, 51, 0.34],
  [-64.8, 53.3, 0.3],
  [-52.2, 54.5, 0.38],
  [-49.3, 53.8, 0.32],
  [-15.3, 53.5, 0.36],
  [-12.8, 55, 0.31],
  [23.5, -33.4, 0.36],
  [21.8, -34.2, 0.33],
  [-66, 34],
  [-65, 44],
  [-59, 49],
  [-53, 47],
  [-48, 47],
  [-40, 47],
  [-38, 38],
  [-23, 43],
  [-21, 49],
  [1, 37],
  [3, 46],
  [-69, -35],
  [-49, -34],
  [-25, -34],
  [1, -33],
  [27, -28],
  [-70, 31],
  [-66, 53],
  [-51, 54],
  [-42, 55],
  [-30, 54],
  [-15, 55],
  [0, 55],
  [18, 49],
  [21, 34],
  [-71, -23],
  [-65, -43],
  [-52, -46],
  [-36, -44],
  [-23, -40],
  [1, -37],
  [23, -36],
].filter(
  ([x, z]) =>
    !CITY_PLOTS.some((plot) => {
      const b = plotObstacle(plot);
      return (
        x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1
      );
    }),
);
export const TERRAIN_OBSTACLES = [
  ...TREE_PLOTS.map(([x, z]) => ({
    minX: x - 0.22,
    maxX: x + 0.22,
    minZ: z - 0.22,
    maxZ: z + 0.22,
  })),
  ...CITY_PLOTS.filter((p) => p.z > 21).map(plotObstacle),
  ...COURTYARD_PROPS.map((prop) => {
    const halfX =
      prop.kind === "bench"
        ? prop.yaw
          ? 0.28
          : 0.96
        : prop.kind === "planter"
          ? 0.68
          : 0.15;
    const halfZ = prop.kind === "bench" ? (prop.yaw ? 0.96 : 0.28) : halfX;
    return {
      minX: prop.x - halfX,
      maxX: prop.x + halfX,
      minZ: prop.z - halfZ,
      maxZ: prop.z + halfZ,
      prop,
    };
  }),
];
export function insidePolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i],
      [bx, bz] = polygon[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
function edgeDistance(x, z, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
    );
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}
function stairContains(stair, x, z, inset = 0) {
  return (
    Math.abs(x - stair.x) <= stair.width / 2 - inset &&
    z >= stair.z0 - 1e-6 &&
    z <= stair.z1 + 1e-6
  );
}
export function stairHeight(stair, z) {
  const t = Math.max(0, Math.min(1, (z - stair.z0) / (stair.z1 - stair.z0)));
  return (
    stair.bottom +
    ((stair.top - stair.bottom) * Math.ceil(t * stair.steps - 1e-8)) /
      stair.steps
  );
}
export function terrainSurfaceAt(x, z) {
  if (z < 21.4) return null;
  const stair = STAIRS.find((s) => stairContains(s, x, z));
  if (stair)
    return {
      id: stair.id,
      kind: "stairs",
      height: stairHeight(stair, z),
      stair,
    };
  let terrace = null;
  for (const t of TERRACES)
    if (
      insidePolygon(x, z, t.polygon) &&
      (!terrace || t.height > terrace.height)
    )
      terrace = t;
  for (const lane of COURT_LANES) {
    const sample = laneSample(lane, x, z);
    if (
      sample.t >= -0.06 &&
      sample.t <= 1.06 &&
      Math.abs(sample.side) <= lane.width / 2 &&
      (!terrace || sample.height > terrace.height + 0.001)
    )
      return { id: lane.id, kind: "passage", height: sample.height, lane };
  }
  if (!terrace && GROUND_PATHS.some((p) => insidePolygon(x, z, p)))
    return { id: null, kind: "lane", height: 0 };
  return terrace
    ? { id: terrace.id, kind: "terrace", height: terrace.height, terrace }
    : null;
}
export function terrainHeightAt(x, z) {
  return terrainSurfaceAt(x, z)?.height ?? null;
}
export function terrainCanWalk(x, z) {
  const surface = terrainSurfaceAt(x, z);
  if (!surface) return false;
  if (surface.kind === "lane") return true;
  if (surface.kind === "passage")
    return (
      Math.abs(laneSample(surface.lane, x, z).side) <=
      surface.lane.width / 2 - 0.27
    );
  if (surface.kind === "stairs")
    return stairContains(surface.stair, x, z, 0.27);
  if (edgeDistance(x, z, surface.terrace.polygon) >= 0.27) return true;
  if (
    TERRACES.some(
      (other) =>
        other.id !== surface.id &&
        other.height === surface.height &&
        edgeDistance(x, z, other.polygon) < 0.32,
    )
  )
    return true;
  if (
    COURT_LANES.some((lane) => {
      const p = laneSample(lane, x, z);
      return (
        (lane.from === surface.id || lane.to === surface.id) &&
        p.t >= -0.06 &&
        p.t <= 1.06 &&
        Math.abs(p.side) <= lane.width / 2 - 0.27
      );
    })
  )
    return true;
  return STAIRS.some(
    (s) =>
      (s.from === surface.id || s.to === surface.id) &&
      Math.abs(x - s.x) <= s.width / 2 - 0.27 &&
      (Math.abs(z - s.z0) < 0.38 || Math.abs(z - s.z1) < 0.38),
  );
}
function connects(stair, other, x, z) {
  const id = other?.id ?? null;
  return (
    Math.abs(x - stair.x) <= stair.width / 2 - 0.27 &&
    ((id === stair.from && Math.abs(z - stair.z0) < 0.38) ||
      (id === stair.to && Math.abs(z - stair.z1) < 0.38))
  );
}
export function terrainCanTraverse(a, b) {
  if (a.z < 21.4 && b.z < 21.4) return true;
  const start = terrainSurfaceAt(a.x, a.z),
    end = terrainSurfaceAt(b.x, b.z);
  if (!start?.height && !end?.height) return true;
  if (start?.id === end?.id) return true;
  if (
    start?.kind === "terrace" &&
    end?.kind === "terrace" &&
    Math.abs(start.height - end.height) < 1e-6
  )
    return true;
  for (const [passage, other] of [
    [start, end],
    [end, start],
  ])
    if (
      passage?.kind === "passage" &&
      (passage.lane.from === other?.id || passage.lane.to === other?.id) &&
      Math.abs(passage.height - other.height) < 0.14
    )
      return true;
  if (start?.kind === "stairs" && connects(start.stair, end, b.x, b.z))
    return true;
  if (end?.kind === "stairs" && connects(end.stair, start, a.x, a.z))
    return true;
  return !start && !end;
}

export const LANDSCAPE_GRID = {
  minX: -76,
  maxX: 27,
  minZ: 22,
  maxZ: 62,
  spacing: 0.5,
};

function smoothRange(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Scenic, non-walkable ground is one continuous hill behind the existing courtyards.
// The navigation surfaces remain explicit: grass never changes a step or a building base.
export function landscapeHeightAt(x, z) {
  const { minX, maxX, minZ, maxZ } = LANDSCAPE_GRID;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return -0.14;

  let weightedHeight = 0;
  let weightTotal = 0;
  let clearance = Infinity;
  for (const terrace of TERRACES) {
    const inside = insidePolygon(x, z, terrace.polygon);
    const distance = inside ? 0 : edgeDistance(x, z, terrace.polygon);
    const weight = 1 / (1 + (distance / 7) ** 4);
    weightedHeight += (terrace.height - 0.12) * weight;
    weightTotal += weight;
    // The buffer exceeds a grid cell diagonal, so interpolated triangles cannot enter paving.
    if (inside || distance < 0.8)
      clearance = Math.min(clearance, terrace.height - 0.12);
  }
  for (const lane of COURT_LANES) {
    const sample = laneSample(lane, x, z);
    if (
      sample.t >= -0.1 &&
      sample.t <= 1.1 &&
      Math.abs(sample.side) < lane.width / 2 + 0.8
    )
      clearance = Math.min(clearance, sample.height - 0.16);
  }
  for (const plot of CITY_PLOTS.filter((p) => !p.terrace && p.z > 21)) {
    const b = plotObstacle(plot);
    if (
      x > b.minX - 0.8 &&
      x < b.maxX + 0.8 &&
      z > b.minZ - 0.8 &&
      z < b.maxZ + 0.8
    )
      clearance = Math.min(clearance, plot.elevation - 0.12);
  }
  for (const path of GROUND_PATHS)
    if (insidePolygon(x, z, path) || edgeDistance(x, z, path) < 0.8)
      clearance = Math.min(clearance, -0.12);
  for (const stair of STAIRS) {
    if (
      Math.abs(x - stair.x) <= stair.width / 2 + 0.8 &&
      z >= stair.z0 - 0.8 &&
      z <= stair.z1 + 0.8
    ) {
      // Look one cell downhill to keep triangle interpolation clear of every discrete riser.
      clearance = Math.min(clearance, stairHeight(stair, z - 0.55) - 0.12);
    }
  }

  const frontRise = smoothRange(24.8, 31, z);
  const rearFall = 1 - smoothRange(50, 61, z);
  const ripple = 0.12 * Math.sin(x * 0.16 + z * 0.1) * Math.sin(z * 0.19);
  const hill =
    Math.max(0, weightedHeight / weightTotal + ripple) * frontRise * rearFall;
  // Wavy shoreline distances fade the mesh below the old soil, not along a visible rectangle.
  const boundaryDistance = Math.min(
    x - (-72 + 1.5 * Math.sin(z * 0.17)),
    22 + 1.8 * Math.sin(z * 0.13) - x,
    59 + 1.4 * Math.sin(x * 0.11) - z,
    z - 22,
  );
  const edgeFade = smoothRange(0, 4.5, boundaryDistance);
  const height = -0.14 + (hill + 0.14) * edgeFade;
  const withinTown = TERRACES.some((t) => insidePolygon(x, z, t.polygon));
  return Math.min(withinTown ? height : Math.min(height, 0.12), clearance);
}

export function createLandscapeGeometry() {
  const { minX, maxX, minZ, maxZ, spacing } = LANDSCAPE_GRID;
  const columns = Math.round((maxX - minX) / spacing) + 1;
  const rows = Math.round((maxZ - minZ) / spacing) + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row < rows; row++) {
    const z = minZ + row * spacing;
    for (let column = 0; column < columns; column++) {
      const x = minX + column * spacing;
      positions.push(x, landscapeHeightAt(x, z), z);
      uvs.push(x / 2, z / 2);
      if (row < rows - 1 && column < columns - 1) {
        const a = row * columns + column;
        indices.push(
          a,
          a + columns,
          a + 1,
          a + 1,
          a + columns,
          a + columns + 1,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.scenicHeightfield = true;
  return geometry;
}

function wallSegments(a, b, terrace) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz);
  const openings = STAIRS.filter((stair) => stair.to === terrace.id).map(
    (stair) => ({
      point: [stair.x, stair.z1],
      direction: [0, 1],
      width: stair.width + 0.08,
    }),
  );
  for (const lane of COURT_LANES) {
    if (lane.from !== terrace.id && lane.to !== terrace.id) continue;
    const end = lane.from === terrace.id ? lane.a : lane.b;
    openings.push({
      point: [end[0], end[2]],
      direction: [lane.b[0] - lane.a[0], lane.b[2] - lane.a[2]],
      width: lane.width + 0.08,
    });
  }
  let intervals = [[0, 1]];
  for (const opening of openings) {
    const [x, z] = opening.point,
      offsetX = x - a[0],
      offsetZ = z - a[1];
    if (Math.abs(offsetX * dz - offsetZ * dx) / length > 0.08) continue;
    const center = (offsetX * dx + offsetZ * dz) / (length * length),
      [ox, oz] = opening.direction;
    const sine = Math.abs(dx * oz - dz * ox) / (length * Math.hypot(ox, oz));
    if (sine < 0.01) continue;
    const half = opening.width / (2 * sine * length),
      left = center - half,
      right = center + half;
    intervals = intervals.flatMap(([lo, hi]) =>
      right <= lo || left >= hi
        ? [[lo, hi]]
        : [
            [lo, Math.max(lo, left)],
            [Math.min(hi, right), hi],
          ].filter(([l, r]) => r - l > 0.001),
    );
  }
  return intervals.map(([lo, hi]) => [
    [a[0] + dx * lo, a[1] + dz * lo],
    [a[0] + dx * hi, a[1] + dz * hi],
  ]);
}

export function retainingEdges() {
  const edges = [];
  for (const terrace of TERRACES)
    for (let i = 0; i < terrace.polygon.length; i++) {
      const a = terrace.polygon[i],
        b = terrace.polygon[(i + 1) % terrace.polygon.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const shared = TERRACES.some(
        (other) =>
          other.id !== terrace.id &&
          other.height === terrace.height &&
          [-0.25, 0.25].some((offset) =>
            insidePolygon(
              mid[0] - (dz / length) * offset,
              mid[1] + (dx / length) * offset,
              other.polygon,
            ),
          ),
      );
      const covered = TERRACES.some(
        (other) =>
          other.height > terrace.height &&
          insidePolygon(mid[0], mid[1], other.polygon),
      );
      if (shared || covered) continue;
      const area = terrace.polygon.reduce((sum, p, index) => {
        const q = terrace.polygon[(index + 1) % terrace.polygon.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0);
      const outward =
        area > 0 ? [dz / length, -dx / length] : [-dz / length, dx / length];
      for (const [p, q] of wallSegments(a, b, terrace))
        edges.push({ a: p, b: q, terrace, outward });
    }
  return edges;
}

/** Build directly from the navigation polygons/stair dimensions, with shared authored PBR materials. */
export function createTerrain(
  materials = {},
  { authoredEnvironment = false } = {},
) {
  const root = new THREE.Group();
  root.name = "terraced city terrain";
  const fallback = (name, color, roughness) =>
    new THREE.MeshStandardMaterial({ name, color, roughness });
  const stone =
    materials.stone?.clone() ??
    fallback("Terrace dressed stone", 0x8d897a, 0.82);
  if (materials.stone) {
    stone.onBeforeCompile = materials.stone.onBeforeCompile;
    stone.customProgramCacheKey = materials.stone.customProgramCacheKey;
  }
  const paving = materials.paving ?? stone;
  const wood =
    materials.wood ?? fallback("Courtyard bench oak", 0x594532, 0.72);
  const soil = fallback("Garden earth", 0x444637, 0.96);
  const grass =
    materials.grass ?? fallback("Terrace planted banks", 0x626d51, 0.96);
  const leaves = fallback("Courtyard evergreen", 0x395245, 0.88);
  const lampGlass = fallback("Warm courtyard lantern", 0xbfa678, 0.35);
  lampGlass.emissive.setHex(0xbc7a32);
  lampGlass.emissiveIntensity = 0.35;
  const brick =
    materials.brick ?? fallback("Terrace retaining brick", 0x64564a, 0.88);
  const iron = materials.iron ?? fallback("Terrace cast iron", 0x263936, 0.45);
  const brass =
    materials.brass ?? fallback("Terrace brass caps", 0x88734d, 0.35);
  const batches = new Map();
  const add = (geometry, material, walk = false) => {
    if (material === grass) {
      const position = geometry.getAttribute("position"),
        uv = geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, position.getX(i) / 2, position.getZ(i) / 2);
    }
    const key = walk ? "walk" : material;
    if (!batches.has(key)) batches.set(key, { material, walk, geometries: [] });
    batches.get(key).geometries.push(geometry);
  };
  const box = (x, y, z, w, h, d, material, yaw = 0, walk = false) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(yaw);
    g.translate(x, y, z);
    const position = g.getAttribute("position"),
      normal = g.getAttribute("normal"),
      uv = g.getAttribute("uv");
    const meter = walk
      ? 2.6
      : material === wood
        ? 1.5
        : material === brick
          ? 1.8
          : 2.4;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(normal.getY(i)) > 0.5)
        uv.setXY(i, position.getX(i) / meter, position.getZ(i) / meter);
      else if (Math.abs(normal.getX(i)) > 0.5)
        uv.setXY(i, position.getZ(i) / meter, position.getY(i) / meter);
      else uv.setXY(i, position.getX(i) / meter, position.getY(i) / meter);
    }
    add(g, walk ? paving : material, walk);
  };
  const strip = (a, b, y, height, width, material) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 0.03) return;
    box(
      (a[0] + b[0]) / 2,
      y,
      (a[1] + b[1]) / 2,
      length,
      height,
      width,
      material,
      -Math.atan2(dz, dx),
    );
  };
  const polygonSurface = (points, height) => {
    const vertices = points.flatMap(([x, z]) => [x, height, z]);
    const shape = points.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(shape, []).flatMap(
      ([a, b, c]) => [c, b, a],
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        points.flatMap(([x, z]) => [x / 2.6, z / 2.6]),
        2,
      ),
    );
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal");
    if (normals.getY(0) < 0) {
      geometry.setIndex(
        faces.reduce(
          (all, _, i) =>
            i % 3 ? all : all.concat(faces[i], faces[i + 2], faces[i + 1]),
          [],
        ),
      );
      geometry.computeVertexNormals();
    }
    add(geometry, paving, true);
  };
  const tube = (points, radius, material) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    add(
      new THREE.TubeGeometry(
        curve,
        Math.max(2, points.length * 3),
        radius,
        6,
        false,
      ),
      material,
    );
  };
  // One connected slope field replaces both the flat garden rectangle and isolated rear wedges.
  const hinterland = new THREE.PlaneGeometry(220, 110);
  hinterland.rotateX(-Math.PI / 2);
  hinterland.translate(0, -0.005, 77);
  add(hinterland, grass);
  const northernGround = new THREE.PlaneGeometry(220, 110);
  northernGround.rotateX(-Math.PI / 2);
  northernGround.translate(0, -0.005, -64);
  add(northernGround, grass);
  add(createLandscapeGeometry(), grass);
  for (const lane of COURT_LANES) {
    const dx = lane.b[0] - lane.a[0],
      dz = lane.b[2] - lane.a[2],
      length = Math.hypot(dx, dz);
    const nx = ((-dz / length) * lane.width) / 2,
      nz = ((dx / length) * lane.width) / 2;
    const [a, b] = [lane.a, lane.b];
    const vertices = [
      a[0] - nx,
      a[1],
      a[2] - nz,
      a[0] + nx,
      a[1],
      a[2] + nz,
      b[0] - nx,
      b[1],
      b[2] - nz,
      b[0] + nx,
      b[1],
      b[2] + nz,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        vertices.flatMap((_, i) =>
          i % 3 === 0 ? [vertices[i] / 2.6, vertices[i + 2] / 2.6] : [],
        ),
        2,
      ),
    );
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.computeVertexNormals();
    add(g, paving, true);
    for (const side of [-1, 1]) {
      const start = [a[0] + side * nx, a[1] + 0.08, a[2] + side * nz],
        end = [b[0] + side * nx, b[1] + 0.08, b[2] + side * nz];
      tube([start, end], 0.07, stone);
    }
  }
  for (const path of GROUND_PATHS) polygonSurface(path, 0.028);
  for (const terrace of TERRACES)
    polygonSurface(terrace.polygon, terrace.height);
  for (const { a: p, b: q, terrace } of retainingEdges()) {
    strip(p, q, (terrace.height - 0.12) / 2, terrace.height - 0.12, 0.2, brick);
    if (!authoredEnvironment) {
      strip(p, q, 0.11, 0.22, 0.28, stone);
      strip(p, q, terrace.height - 0.045, 0.15, 0.28, stone);
    }
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    strip(p, q, terrace.height + 0.88, 0.048, 0.044, iron);
    for (let d = 0; d <= length; d += 0.85) {
      const t = d / length,
        x = p[0] + (q[0] - p[0]) * t,
        z = p[1] + (q[1] - p[1]) * t;
      box(x, terrace.height + 0.43, z, 0.034, 0.86, 0.034, iron);
    }
  }
  for (const stair of STAIRS) {
    const run = (stair.z1 - stair.z0) / stair.steps,
      rise = (stair.top - stair.bottom) / stair.steps;
    for (let i = 0; i < stair.steps; i++) {
      const top = stair.bottom + rise * (i + 1),
        z = stair.z0 + run * (i + 0.5);
      box(stair.x, (top - 0.11) / 2, z, stair.width, top - 0.11, run, brick);
      // Each tread is the exact collision height, with a fine dressed-stone nosing.
      box(
        stair.x,
        top - 0.055,
        z,
        stair.width + 0.05,
        0.11,
        run,
        stone,
        0,
        true,
      );
    }
    for (const side of [-1, 1]) {
      const x = stair.x + side * (stair.width / 2 + 0.04);
      tube(
        [
          [x, stair.bottom + 0.9, stair.z0],
          [x, stair.top + 0.9, stair.z1],
        ],
        0.035,
        iron,
      );
      for (let i = 0; i <= stair.steps; i += 2) {
        const z = stair.z0 + run * i,
          height = stair.bottom + rise * i;
        box(x, height + 0.44, z, 0.042, 0.88, 0.042, iron);
        const cap = new THREE.SphereGeometry(0.055, 8, 6);
        cap.translate(x, height + 0.9, z);
        add(cap, brass);
      }
    }
  }
  for (const prop of COURTYARD_PROPS) {
    const y = TERRACES.find((t) => t.id === prop.terrace).height;
    if (prop.kind === "bench") {
      const yaw = prop.yaw ?? 0,
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      const piece = (dx, dy, dz, w, h, d, material) =>
        box(
          prop.x + c * dx + s * dz,
          y + dy,
          prop.z - s * dx + c * dz,
          w,
          h,
          d,
          material,
          yaw,
        );
      for (const z of [-0.17, 0, 0.17])
        piece(0, 0.48, z, 1.86, 0.065, 0.125, wood);
      for (const h of [0.75, 0.96]) piece(0, h, -0.24, 1.86, 0.12, 0.055, wood);
      for (const x of [-0.67, 0.67]) {
        piece(x, 0.24, 0, 0.07, 0.48, 0.4, iron);
        piece(x, 0.74, -0.24, 0.05, 0.55, 0.05, iron);
      }
    } else if (prop.kind === "planter") {
      const planter = new THREE.CylinderGeometry(0.65, 0.55, 0.34, 16);
      planter.translate(prop.x, y + 0.17, prop.z);
      add(planter, stone);
      const earth = new THREE.CylinderGeometry(0.59, 0.59, 0.025, 16);
      earth.translate(prop.x, y + 0.35, prop.z);
      add(earth, soil);
      if (authoredEnvironment) continue;
      const trunk = new THREE.CylinderGeometry(0.055, 0.08, 1.55, 9);
      trunk.translate(prop.x, y + 1.12, prop.z);
      add(trunk, wood);
      for (const [dx, dy, dz, r] of [
        [0, 2.2, 0, 0.66],
        [-0.29, 1.94, 0.12, 0.48],
        [0.29, 2.01, -0.1, 0.5],
      ]) {
        const canopy = new THREE.IcosahedronGeometry(r, 1);
        canopy.translate(prop.x + dx, y + dy, prop.z + dz);
        add(canopy, leaves);
      }
    } else {
      const stem = new THREE.CylinderGeometry(0.045, 0.075, 2.4, 10);
      stem.translate(prop.x, y + 1.2, prop.z);
      add(stem, iron);
      box(prop.x, y + 2.47, prop.z, 0.23, 0.31, 0.23, lampGlass);
      const hood = new THREE.ConeGeometry(0.22, 0.2, 8);
      hood.translate(prop.x, y + 2.71, prop.z);
      add(hood, brass);
    }
  }
  // Scenic northern foundations match each model's declared elevation; no floating buildings.
  for (const plot of CITY_PLOTS.filter(
    (p) => !p.terrace && plotHeight(p) > 0,
  )) {
    const [w, d] = FOOTPRINTS[plot.name],
      height = plotHeight(plot);
    box(
      plot.x,
      (height - 0.12) / 2,
      plot.z,
      (w + 0.2) * plot.size,
      height - 0.12,
      (d + 0.2) * plot.size,
      brick,
      plot.yaw,
    );
    box(
      plot.x,
      height - 0.06,
      plot.z,
      (w + 0.3) * plot.size,
      0.12,
      (d + 0.3) * plot.size,
      stone,
      plot.yaw,
    );
  }
  if (!authoredEnvironment) {
    const foliage = foliageGeometry();
    const treeLeaves = [0x475942, 0x586747, 0x68744d].map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.95,
          side: THREE.DoubleSide,
        }),
    );
    let seed = 8173;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (const [x, z] of TREE_PLOTS) {
      const y = Math.max(0, landscapeHeightAt(x, z)),
        height = 4.8 + random() * 1.7;
      const trunk = new THREE.CylinderGeometry(0.09, 0.21, height, 7);
      trunk.translate(x, y + height / 2, z);
      add(trunk, wood);
      for (let branch = 0; branch < 5; branch++) {
        const angle = branch * 2.4,
          tip = [
            x + Math.cos(angle) * 1.2,
            y + height * 0.83,
            z + Math.sin(angle) * 1.2,
          ];
        tube([[x, y + height * 0.4, z], tip], 0.055, wood);
      }
      for (let leaf = 0; leaf < 170; leaf++) {
        const angle = random() * Math.PI * 2,
          r = Math.sqrt(random()) * 1.8,
          h = random();
        const g = foliage.clone();
        g.scale(
          0.6 + random() * 0.5,
          0.8 + random() * 0.7,
          0.6 + random() * 0.5,
        );
        g.rotateY(angle);
        g.rotateZ((random() - 0.5) * 0.6);
        g.translate(
          x + Math.cos(angle) * r * (0.6 + h * 0.4),
          y + height * 0.55 + h * 2.7,
          z + Math.sin(angle) * r,
        );
        add(g, treeLeaves[leaf % 3]);
      }
    }
    foliage.dispose();
  }
  const walkSurfaces = [];
  for (const { material, walk, geometries } of batches.values()) {
    // Uniform attributes let authored textures stay shared while geometry is merged per material.
    const normalized = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(normalized, false),
      mesh = new THREE.Mesh(merged, material);
    mesh.name = walk
      ? "terrace and stair walking surfaces"
      : "terrace retaining walls and rails";
    mesh.castShadow = !walk;
    mesh.receiveShadow = true;
    mesh.userData.walkSurface = walk;
    root.add(mesh);
    if (walk) walkSurfaces.push(mesh);
    for (const g of normalized) g.dispose();
    for (const g of geometries) if (!normalized.includes(g)) g.dispose();
  }
  return { root, walkSurfaces };
}
