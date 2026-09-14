import test from "node:test";
import assert from "node:assert/strict";
import { hipRoofGeometry, archMouldingGeometry } from "../src/architecture.js";

test("continuous roof faces stay outside-facing and fit both wide and narrow buildings", () => {
  for (const [w, d, h, inset] of [
    [8.84, 5.9, 1.92, 1.02],
    [2, 1.2, 1, 1],
    [6.8, 3.86, 0.38, 0.48],
  ]) {
    const roof = hipRoofGeometry(w, d, h, inset);
    roof.computeBoundingBox();
    assert.ok(Math.abs(roof.boundingBox.max.y - h) < 1e-5);
    assert.ok(Math.abs(roof.boundingBox.max.x - w / 2) < 1e-5);
    const normals = roof.getAttribute("normal"),
      uv = roof.getAttribute("uv");
    assert.ok([...uv.array].every(Number.isFinite));
    let pitched = false;
    for (let i = 0; i < normals.count; i++) {
      assert.ok(
        normals.getY(i) > 0,
        "roof faces must face the sky instead of being culled from above",
      );
      if (normals.getY(i) < 0.99) pitched = true;
    }
    assert.ok(pitched, "roof must have a sloping silhouette");
    roof.dispose();
  }
  const arch = archMouldingGeometry(0.525, 0.115, 0.16);
  arch.computeBoundingBox();
  assert.ok(arch.boundingBox.max.x > 0.63);
  assert.ok([...arch.getAttribute("position").array].every(Number.isFinite));
  arch.dispose();
});
