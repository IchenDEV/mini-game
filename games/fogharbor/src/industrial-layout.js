// Reserved north-bank parcels replace the domestic backdrop at these locations.
export const INDUSTRIAL_PARCELS = [
  {
    id: "common-engine",
    x: -31,
    z: -23,
    width: 16,
    depth: 7,
    height: 7,
    kind: "mill",
  },
  {
    id: "night-foundry",
    x: -63,
    z: -27,
    width: 10,
    depth: 7,
    height: 10,
    kind: "mill",
  },
  {
    id: "reclamation-works",
    x: -5,
    z: -26,
    width: 12,
    depth: 7,
    height: 6,
    kind: "mill",
  },
  {
    id: "gasometer",
    x: -49,
    z: -27,
    width: 7,
    depth: 7,
    height: 13,
    kind: "tank",
  },
];
export function industrialOverlap(x, z, halfWidth = 0, halfDepth = halfWidth) {
  return INDUSTRIAL_PARCELS.some(
    (p) =>
      Math.abs(x - p.x) < p.width / 2 + halfWidth &&
      Math.abs(z - p.z) < p.depth / 2 + halfDepth,
  );
}
