import { test } from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import { createAtmosphere } from "../src/atmosphere.js";

test("rain endpoints share a wrap origin so recycling cannot stretch a streak across the scene", () => {
  const group = new Group();
  createAtmosphere(group, [[0, 10, 0]]);
  const rain = group.children.find(o => o.isLineSegments);
  const origins = rain.geometry.getAttribute("position");
  const tips = rain.geometry.getAttribute("aTip");
  assert.ok(tips, "tips must be offsets applied after the shared wrap");
  for (let i = 0; i < origins.count; i += 2) {
    for (const axis of ["getX", "getY", "getZ"])
      assert.equal(origins[axis](i), origins[axis](i + 1));
    assert.equal(tips.getX(i), 0);
    assert.equal(tips.getX(i + 1), 1);
  }
  group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
});
