import { test } from "node:test";
import assert from "node:assert/strict";
import { placeLabels, nearbyItem } from "../src/game-objects.js";

test("subpixel camera movement never teleports overlapping markers", () => {
  let previous;
  for (let x = 40; x < 350; x += 0.1) {
    const result = placeLabels([
      { x: 160, y: 240, width: 24, height: 24 },
      { x, y: 240, width: 24, height: 24 },
    ]);
    if (previous) assert.ok(Math.hypot(result[1].x - previous.x, result[1].y - previous.y) < 0.101);
    previous = result[1];
  }
});

test("only the nearest available prop gets a title, with stable boundary behavior", () => {
  const a = { x: 0, z: 0, kind: "gear", group: { visible: true } };
  const b = { x: 4, z: 0, kind: "regulator", group: { visible: true } };
  assert.equal(nearbyItem([a, b], { x: -5, z: 0 }), null);
  assert.equal(nearbyItem([a, b], { x: 1.95, z: 0 }), a);
  assert.equal(nearbyItem([a, b], { x: 2.05, z: 0 }, a), a);
  assert.equal(nearbyItem([a, b], { x: 2.4, z: 0 }, a), b);
  a.group.visible = false;
  assert.equal(nearbyItem([a, b], { x: 0, z: 0 }, a), null);
});
