import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createNeighborhood } from "../src/neighborhood.js";
import { createDistricts } from "../src/districts.js";
import { canWalk } from "../src/movement.js";

function gltf(name) {
  const bytes = readFileSync(
    new URL(`../public/models/${name}.glb`, import.meta.url),
  );
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
}

test("authored actors retain the independent joints used by real-time animation", () => {
  for (const [file, actors] of [
    ["nora-v1", ["Nora"]],
    ["companions-v1", ["Milo", "Molly", "Beck"]],
  ]) {
    const asset = gltf(file);
    const names = new Set(asset.nodes.map((node) => node.name));
    for (const actor of actors) {
      assert.ok(names.has(actor));
      for (const joint of [
        "Head",
        "LeftArm",
        "RightArm",
        "LeftLeg",
        "RightLeg",
      ])
        assert.ok(names.has(`${actor}_${joint}`), `${actor} missing ${joint}`);
    }
  }
});

test("building GLBs keep inspection and machinery nodes and packed textures", () => {
  for (const [file, parts] of [
    [
      "workshop-v1",
      [
        "Workshop_Structure",
        "Workshop_Roof",
        "Workshop_Flywheel",
        "Workshop_Storefront",
      ],
    ],
    ["soup-house-v1", ["Soup_Structure", "Soup_Roof"]],
  ]) {
    const asset = gltf(file);
    for (const name of parts)
      assert.ok(
        asset.nodes.some((node) => node.name === name),
        name,
      );
    const glass = asset.materials.find(
      (material) => material.name === "Recessed blue green glass",
    );
    assert.equal(glass.alphaMode, "BLEND");
    assert.ok(
      glass.pbrMetallicRoughness.baseColorFactor[3] < 0.4,
      "export must preserve transparent windows",
    );
    assert.ok(asset.images.length >= 3);
    assert.ok(
      asset.images.every((image) => image.bufferView !== undefined),
      "textures must travel with the GLB",
    );
  }
});

test("authored replacements hide old geometry without hiding the story appliance", () => {
  const world = createNeighborhood(new THREE.Scene());
  assert.equal(
    canWalk(-9.87, -0.3, world.obstacles),
    false,
    "curved shopfront blocks walking",
  );
  assert.equal(
    canWalk(-1.4, -1.18, world.obstacles),
    false,
    "the enlarged flywheel blocks walking",
  );
  assert.equal(
    canWalk(world.spots.laundry.x, world.spots.laundry.z, world.obstacles),
    true,
  );
  const workshop = new THREE.Group();
  for (const name of ["Workshop_Roof", "Workshop_Storefront"]) {
    const part = new THREE.Group();
    part.name = name;
    workshop.add(part);
  }
  const soup = new THREE.Group();
  world.installWorkshop(workshop);
  world.installSoup(soup);
  for (const name of ["legacy repair workshop", "legacy soup house"])
    assert.equal(world.root.getObjectByName(name).visible, false);
  world.setWorkshopFocus(true);
  assert.equal(workshop.getObjectByName("Workshop_Storefront").visible, false);
  assert.equal(workshop.getObjectByName("Workshop_Roof").visible, true);
  assert.equal(world.kettle.visible, true);
  world.setWorkshopFocus(false);
  assert.ok(workshop.children.every((child) => child.visible));
  world.setState({ repairStep: 3, delivered: true });
  assert.ok(
    world.kettle.position.x > 0,
    "the same quest kettle reaches Molly's new counter",
  );
});

test("all districts ship authored model groups with portable surface maps", () => {
  for (const [file, groups] of [
    [
      "wharf-v1",
      [
        "Wharf_Structure",
        "Wharf_Sailmaker_Roof",
        "Wharf_Warehouse_Roof",
        "Wharf_Clockshop_Roof",
      ],
    ],
    [
      "pumpworks-v1",
      [
        "Pump_Structure",
        "Pump_Roof",
        "Pump_Facade",
        "Pump_Flywheel",
        "Pump_Piston",
      ],
    ],
    [
      "city-kit-v1",
      [
        "City_Terrace",
        "City_CornerInn",
        "City_Warehouse",
        "City_Townhouse",
        "City_PostOffice",
        "City_Chapel",
      ],
    ],
    [
      "civic-details-v1",
      ["Watergate_Structure", "Watergate_Roof", "Civic_Bridge"],
    ],
  ]) {
    const asset = gltf(file);
    for (const name of groups)
      assert.ok(
        asset.nodes.some((node) => node.name === name),
        `${file}: ${name}`,
      );
    assert.ok(asset.images.length >= 3);
    assert.ok(asset.images.every((image) => image.bufferView !== undefined));
  }
});

test("pump cutaway preserves machine opacity and follows the existing supply state", () => {
  const district = createDistricts(new THREE.Scene());
  const asset = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.8,
  });
  const structures = {};
  for (const name of [
    "Pump_Structure",
    "Pump_Roof",
    "Pump_Facade",
    "Pump_Flywheel",
    "Pump_Piston",
  ]) {
    const group = new THREE.Group();
    group.name = name;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
    asset.add(group);
    structures[name] = group;
  }
  district.installPump(asset);
  district.update(1, 0.5, { playerX: -55, playerZ: -8 });
  district.update(2, 0.5, { playerX: -55, playerZ: -8 });
  assert.equal(structures.Pump_Roof.visible, false);
  assert.equal(structures.Pump_Facade.visible, false);
  assert.equal(structures.Pump_Structure.children[0].material.opacity, 0.8);
  const angle = structures.Pump_Flywheel.rotation.z;
  district.update(6, 0.1, { playerX: -55, playerZ: -8 });
  assert.equal(structures.Pump_Flywheel.rotation.z, angle);
  district.update(6, 0.1, { playerX: -55, playerZ: -8, pumpRestored: true });
  assert.notEqual(structures.Pump_Flywheel.rotation.z, angle);
  assert.ok(Math.abs(structures.Pump_Piston.position.z) <= 0.23);
  district.update(8, 1, { playerX: -49, playerZ: 1.5, pumpRestored: true });
  assert.equal(structures.Pump_Roof.visible, true);
  assert.ok(structures.Pump_Roof.children[0].material.opacity > 0.79);
});

test("new watergate leaves the entire working transmission visible", () => {
  const world = createNeighborhood(new THREE.Scene());
  world.installWatergate(new THREE.Group());
  for (const name of [
    "waterworks reduction gear frame",
    "waterworks pressure vessel",
    "waterworks connecting rod",
    "reduction gear 1",
    "reduction gear 4",
  ]) {
    const part = world.root.getObjectByName(name);
    assert.ok(part, name);
    for (let parent = part; parent; parent = parent.parent)
      assert.equal(parent.visible, true, name);
  }
});

test("district exports preserve the shared PBR color factors", () => {
  const expected = {
    "Limestone trim": [0.64, 0.59, 0.49, 1],
    "Warm weathered brick": [0.8, 0.78, 0.75, 1],
    "Walnut end grain": [0.7, 0.6, 0.47, 1],
    "Real slate roof": [0.24, 0.3, 0.34, 1],
  };
  for (const file of [
    "workshop-v1",
    "soup-house-v1",
    "wharf-v1",
    "pumpworks-v1",
    "city-kit-v1",
    "civic-details-v1",
  ]) {
    const asset = gltf(file);
    for (const [name, factor] of Object.entries(expected)) {
      const material = asset.materials.find(
        (material) => material.name === name,
      );
      if (!material) continue;
      const actual = material.pbrMetallicRoughness.baseColorFactor;
      assert.ok(actual, `${file}: ${name} must not silently default to white`);
      assert.ok(
        actual.every((value, index) => Math.abs(value - factor[index]) < 0.001),
        `${file}: ${name}`,
      );
    }
  }
});
