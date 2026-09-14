import {
  COURT_HALF_WIDTH,
  COURT_HALF_DEPTH,
  EXPANSION_SCENES,
  EXPANSION_BUILDINGS,
  EXPANSION_ROADS,
  buildingPoint,
} from "./expansion-layout.js";
import {
  CITY_PLOTS,
  TERRACES,
  STAIRS,
  GROUND_PATHS,
  COURT_LANES,
  NORTH_PAVING,
  TERRACE_DESTINATIONS,
  FOOTPRINTS,
} from "./terrain.js";
import { RAILWAY, railPoint } from "./railway.js";

export const mapPoint = (x, z) => [18 + (x + 88) * 3.87, 12 + (z + 42) * 2.37];
const points = (polygon) =>
  polygon.map(([x, z]) => mapPoint(x, z).join(",")).join(" ");
const polygon = (vertices, fill, stroke = "none") =>
  `<polygon points="${points(vertices)}" fill="${fill}" stroke="${stroke}"/>`;

/** The fold-out plan and the live city use the same parcels, stairs and walking passages. */
export function cityMapMarkup() {
  const content = [];
  content.push('<rect width="640" height="420" rx="8" fill="#152b2d"/>');
  content.push(
    polygon(
      [
        [-75, 6],
        [36, 6],
        [36, 16],
        [-75, 16],
      ],
      "#3a6467",
    ),
  );
  for (const parcel of NORTH_PAVING) content.push(polygon(parcel, "#263d3a"));
  for (const terrace of TERRACES)
    content.push(polygon(terrace.polygon, "#33483e", "#8b8060"));
  for (const path of GROUND_PATHS) content.push(polygon(path, "#8b8060"));
  for (const z of [3.6, 19])
    content.push(
      `<polyline points="${points([
        [-64, z],
        [14, z],
      ])}" fill="none" stroke="#a89a72" stroke-width="3"/>`,
    );
  for (const x of [-58, -34, -10])
    content.push(
      `<polyline points="${points([
        [x, 5.8],
        [x, 16.2],
      ])}" stroke="#dac8a0" stroke-width="7"/>`,
    );
  for (const lane of COURT_LANES)
    content.push(
      `<polyline points="${points([
        [lane.a[0], lane.a[2]],
        [lane.b[0], lane.b[2]],
      ])}" stroke="#b3a079" stroke-width="5"/>`,
    );
  for (const stair of STAIRS) {
    for (let i = 0; i < stair.steps; i++) {
      const z = stair.z0 + ((i + 0.5) * (stair.z1 - stair.z0)) / stair.steps;
      content.push(
        `<polyline points="${points([
          [stair.x - stair.width / 2, z],
          [stair.x + stair.width / 2, z],
        ])}" stroke="#d9c79c" stroke-width="1.3"/>`,
      );
    }
  }
  for (const plot of CITY_PLOTS) {
    const [w, d] = FOOTPRINTS[plot.name],
      c = Math.cos(plot.yaw),
      s = Math.sin(plot.yaw);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([u, v]) => {
      const dx = (u * w * plot.size) / 2,
        dz = (v * d * plot.size) / 2;
      return [plot.x + c * dx + s * dz, plot.z - s * dx + c * dz];
    });
    content.push(polygon(corners, "#856c50", "#c2a474"));
  }
  for (const [x, z, w, d] of [
    [-53.5, -8.1, 15, 10],
    [-37.9, -3.7, 6, 6],
    [-28, -4, 7, 5],
    [-21, -3.7, 5, 6],
    [-6.6, -3.76, 8.2, 5.4],
    [5.1, -1.4, 6, 5],
  ])
    content.push(
      polygon(
        [
          [x - w / 2, z - d / 2],
          [x + w / 2, z - d / 2],
          [x + w / 2, z + d / 2],
          [x - w / 2, z + d / 2],
        ],
        "#aa885d",
        "#dec899",
      ),
    );
  for (const area of EXPANSION_SCENES)
    content.push(
      polygon(
        [
          [area.x - COURT_HALF_WIDTH, area.z - COURT_HALF_DEPTH],
          [area.x + COURT_HALF_WIDTH, area.z - COURT_HALF_DEPTH],
          [area.x + COURT_HALF_WIDTH, area.z + COURT_HALF_DEPTH],
          [area.x - COURT_HALF_WIDTH, area.z + COURT_HALF_DEPTH],
        ],
        "#344a40",
        "#78876b",
      ),
    );
  for (const road of EXPANSION_ROADS)
    content.push(
      `<polyline points="${points([
        [road.a[0], road.a[1]],
        [road.b[0], road.b[1]],
      ])}" stroke="#9d9477" stroke-width="4"/>`,
    );
  for (const b of EXPANSION_BUILDINGS)
    content.push(
      polygon(
        [
          [-4, -3.5],
          [4, -3.5],
          [4, 3.5],
          [-4, 3.5],
        ].map(([x, z]) => {
          const p = buildingPoint(b, x, z);
          return [p.x, p.z];
        }),
        "#a58254",
        "#dec99a",
      ),
    );
  for (const area of EXPANSION_SCENES) {
    const [x, y] = mapPoint(area.x, area.z + 8);
    content.push(
      `<text x="${x}" y="${y}" fill="#f1dfbc" stroke="#152b2d" stroke-width="3" paint-order="stroke" font-size="11" text-anchor="middle">${area.name}</text>`,
    );
  }
  const rails = [];
  for (let x = RAILWAY.startX; x <= RAILWAY.endX; x += 1) {
    const p = railPoint(x);
    rails.push([p.x, p.z]);
  }
  content.push(
    `<polyline points="${points(rails)}" fill="none" stroke="#0d2022" stroke-width="7"/><polyline points="${points(rails)}" fill="none" stroke="#abac95" stroke-width="2" stroke-dasharray="2 3"/>`,
  );
  for (const [x, z, label] of [
    [-53, 1, "老泵站"],
    [-29, 1, "第七码头"],
    [-3, 3, "盐锈巷"],
    [-54, 48, "客栈院"],
    [-32, 51, "钟匠高街"],
    [-46, 23, "河阶里"],
    [-35, 24, "邮局前庭"],
    [6, 51, "教堂坡地"],
  ]) {
    const [px, py] = mapPoint(x, z);
    content.push(
      `<text x="${px}" y="${py}" fill="#eee0be" stroke="#152b2d" stroke-width="4" paint-order="stroke" font-size="12" text-anchor="middle">${label}</text>`,
    );
  }
  for (const destination of Object.values(TERRACE_DESTINATIONS)) {
    const [x, y] = mapPoint(destination.x, destination.z);
    content.push(`<circle cx="${x}" cy="${y}" r="3" fill="#edc989"/>`);
  }
  const [x, y] = mapPoint(-6.3, 1.6);
  content.push(
    `<circle id="map-player" cx="${x}" cy="${y}" r="5" fill="#ffe0a1" stroke="#092127" stroke-width="2"/>`,
  );
  return content.join("");
}
