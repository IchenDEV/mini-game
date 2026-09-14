import * as THREE from "three";
import { route, heightAt, dampAngle } from "./movement.js";
import { terrainHeightAt } from "./terrain.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// These small pockets leave the continuous river walk and all stair approaches open.
export const LIFE_PROPS = [
  { id: "cart", model: "Life_Handcart", x: -24, z: 2.3, yaw: .08, width: 1.8, depth: 1.4 },
  { id: "washing", model: "Life_WashingLine", x: -49.1, z: 41.1, yaw: -.08, width: 3.3, depth: .7 },
  { id: "garden", model: "Life_PottingBench", x: 0, z: 44, yaw: Math.PI / 2, width: 2.3, depth: .9 },
];
export const LIFE_OBSTACLES = LIFE_PROPS.map((p) => {
  const halfX = (Math.abs(Math.cos(p.yaw)) * p.width + Math.abs(Math.sin(p.yaw)) * p.depth) / 2;
  const halfZ = (Math.abs(Math.sin(p.yaw)) * p.width + Math.abs(Math.cos(p.yaw)) * p.depth) / 2;
  return { minX: p.x - halfX, maxX: p.x + halfX, minZ: p.z - halfZ, maxZ: p.z + halfZ };
});
export const LIFE_SPOTS = [
  { id: "life_cart", name: "晚班的面包", x: -24, z: 4.1, anchor: [-24, 2, 2.3] },
  { id: "life_barge", name: "系在岸边的货船", x: -23, z: 4.6, anchor: [-23, .5, 8.1] },
  { id: "life_washing", name: "院里的晾衣绳", x: -49.1, z: 42.6, anchor: [-49.1, 5.1, 41.1] },
  { id: "life_garden", name: "窗下的育苗台", x: 1.2, z: 44, anchor: [0, 6, 44] },
];
export const RESIDENT_ROUTES = [
  {
    name: "Quay porter", source: "Milo", speed: .9, scale: 1.18, carrying: true,
    colors: { blue: 0x66523d, blueseam: 0x7b6851, gray: 0x5a584f },
    stops: [[-41, 3, 4], [-25.7, 3.4, 7], [-21.2, 1, 4], [-29.5, 1.1, 5]],
  },
  {
    name: "Inn housekeeper", source: "Molly", speed: .66, scale: 1.12,
    colors: { green: 0x504a56, cream: 0x9a9784, red: 0x5c5950 },
    stops: [[-49.1, 39.5, 6], [-50.9, 42.6, 5], [-47.8, 43, 8]],
  },
  {
    name: "Chapel gardener", source: "Beck", speed: .62, scale: 1.15,
    colors: { coat: 0x405354, patch: 0x62706a, scarf: 0x807353 },
    stops: [[1.3, 44, 8], [1.5, 42, 4], [1.3, 40.3, 5]],
  },
];

export function lifeScript(id) {
  const scripts = {
    life_cart: [
      ["Nora", "纸袋里留着三条面包，上面写着‘晚班’。"],
      ["Nora", "莫莉以前也给我留过一份。她总说是卖剩的。"],
    ],
    life_barge: [
      ["Nora", "船帮上缠着旧麻绳。贴到石岸时，木头只闷闷地响一声。"],
      ["Nora", "以前没有这圈绳子。有人在楼上骂过一整夜。"],
    ],
    life_washing: [
      ["Nora", "中间那件补过袖口。补丁洗得比原来的布还白。"],
      ["Nora", "下午要是再下雨，先收这一件。它厚，干得慢。"],
    ],
    life_garden: [
      ["Nora", "浇水壶的提手断过，用两圈细铜丝接上了。"],
      ["Nora", "还能提。先别动它，里面已经兑好了水。"],
    ],
  };
  return scripts[id];
}

// Precompute the short daily circuits using the same collision grid as the player.
export function residentCircuit(plan, obstacles) {
  return plan.stops.map((stop, index) => {
    const next = plan.stops[(index + 1) % plan.stops.length];
    const points = route({ x: stop[0], z: stop[1] }, { x: next[0], z: next[1] }, obstacles);
    if (!points.length) throw new Error(`No walking route for ${plan.name}: stop ${index}`);
    return points;
  });
}

// The companion export stores its clothing palette in vertex colors, not separate materials.
const CLOTH_COLORS = {
  blue: [.075, .098, .13], blueseam: [.11, .14, .17], gray: [.25, .245, .217],
  green: [.065, .094, .069], cream: [.62, .55, .41], red: [.20, .048, .037],
  coat: [.15, .143, .10], patch: [.24, .185, .12], scarf: [.125, .080, .043],
};
function residentGeometry(original, wardrobe) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(original.index);
  for (const [name, attribute] of Object.entries(original.attributes))
    geometry.setAttribute(name, name === "color" ? attribute.clone() : attribute);
  geometry.groups = original.groups.map((group) => ({ ...group }));
  const colors = geometry.attributes.color;
  const replacements = Object.entries(wardrobe).map(([name, hex]) => ({
    from: CLOTH_COLORS[name], to: new THREE.Color(hex),
  }));
  if (colors) for (let i = 0; i < colors.count; i++) {
    const match = replacements.find(({ from }) =>
      Math.abs(colors.getX(i) - from[0]) < .006 &&
      Math.abs(colors.getY(i) - from[1]) < .006 &&
      Math.abs(colors.getZ(i) - from[2]) < .006,
    );
    if (match) colors.setXYZ(i, match.to.r, match.to.g, match.to.b);
  }
  return geometry;
}

function residentModel(asset, plan) {
  const source = asset.getObjectByName(plan.source);
  if (!source) throw new Error(`Missing resident source ${plan.source}`);
  const model = source.clone(true), materials = new Map();
  model.name = plan.name;
  model.scale.setScalar(plan.scale);
  model.traverse((node) => {
    if (!node.isMesh) return;
    const finish = (original) => {
      if (!materials.has(original)) {
        const material = original.clone();
        materials.set(original, material);
      }
      return materials.get(original);
    };
    node.material = Array.isArray(node.material) ? node.material.map(finish) : finish(node.material);
    node.geometry = residentGeometry(node.geometry, plan.colors);
    node.castShadow = node.receiveShadow = true;
  });
  return model;
}

export function createResident(asset, plan, obstacles) {
  const model = residentModel(asset, plan), circuit = residentCircuit(plan, obstacles);
  const joints = Object.fromEntries(["Head", "LeftArm", "RightArm", "LeftLeg", "RightLeg"].map(
    (part) => [part, model.getObjectByName(`${plan.source}_${part}`)],
  ));
  model.position.set(plan.stops[0][0], heightAt(plan.stops[0][0], plan.stops[0][1]), plan.stops[0][1]);
  let stopIndex = 0, pointIndex = 0, waiting = plan.stops[0][2], phase = 0;
  return {
    model,
    update(time, dt, player, enabled = true) {
      let moved = 0;
      const nearby = Math.hypot(model.position.x - player.x, model.position.z - player.z) < 1.15;
      if (enabled && !nearby) {
        if (waiting > 0) waiting = Math.max(0, waiting - dt);
        else {
          let distance = plan.speed * dt;
          while (distance > 0 && pointIndex < circuit[stopIndex].length) {
            const target = circuit[stopIndex][pointIndex];
            const dx = target.x - model.position.x, dz = target.z - model.position.z;
            const length = Math.hypot(dx, dz), step = Math.min(length, distance);
            if (length > 1e-5) {
              model.position.x += dx / length * step;
              model.position.z += dz / length * step;
              model.rotation.y = dampAngle(model.rotation.y, Math.atan2(dx, dz), 7, dt);
            }
            distance -= step;
            moved += step;
            if (length < .001 || step >= length) pointIndex++;
          }
          if (pointIndex === circuit[stopIndex].length) {
            stopIndex = (stopIndex + 1) % plan.stops.length;
            pointIndex = 0;
            waiting = plan.stops[stopIndex][2];
          }
        }
      }
      phase += moved * 8.4;
      const gait = moved > 0 ? Math.sin(phase) * .32 : 0;
      model.position.y = heightAt(model.position.x, model.position.z) + (moved > 0 ? Math.abs(Math.sin(phase)) * .014 : 0);
      for (const [part, sign] of [["LeftLeg", 1], ["RightLeg", -1], ["LeftArm", -.65], ["RightArm", .65]]) {
        const joint = joints[part];
        if (!joint) continue;
        const arms = part.includes("Arm");
        const pose = arms && plan.carrying ? -.72 : gait * sign;
        joint.rotation.x = THREE.MathUtils.damp(joint.rotation.x, pose, 10, dt);
      }
      if (joints.Head) {
        joints.Head.rotation.y = nearby ? .2 * Math.sin(time * .6) : Math.sin(time * .35 + stopIndex) * .09;
        joints.Head.rotation.x = waiting > 0 && !plan.carrying ? .12 : 0;
      }
      if (!moved && !plan.carrying && joints.RightArm)
        joints.RightArm.rotation.x = -.28 + Math.sin(time * .8) * .08;
    },
  };
}

export function createWorldLife(scene, asset, companions, obstacles) {
  const root = new THREE.Group();
  root.name = "everyday life along the canal";
  const source = (name) => {
    const node = asset.getObjectByName(name);
    if (!node) throw new Error(`Missing life prop ${name}`);
    return node;
  };
  for (const prop of LIFE_PROPS) {
    const model = source(prop.model).clone(true);
    model.name = prop.id;
    model.position.set(prop.x, terrainHeightAt(prop.x, prop.z) ?? 0, prop.z);
    model.rotation.y = prop.yaw;
    root.add(model);
  }
  const boats = [];
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5342, roughness: .96 });
  const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x343c37, metalness: .55, roughness: .65 });
  const bollardParts = [];
  for (const [x, z, yaw] of [[-23, 8.1, .025], [-46, 14, -.035]]) {
    const boat = source("Life_Barge").clone(true);
    boat.position.set(x, -.78, z);
    boat.rotation.y = yaw;
    root.add(boat);
    boats.push({ model: boat, yaw });
    const bank = z < 11 ? 6.25 : 15.85;
    const side = z < 11 ? -1 : 1;
    for (const offset of [-1.75, 1.75]) {
      const anchor = new THREE.Vector3(x + offset, .24, bank);
      const attachment = new THREE.Vector3(x + offset, -.49, z + side * .72);
      const middle = anchor.clone().lerp(attachment, .52);
      middle.y -= .16;
      const curve = new THREE.QuadraticBezierCurve3(anchor, middle, attachment);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .018, 5, false), ropeMaterial);
      rope.name = "slack quay mooring";
      root.add(rope);
      for (const [radius, height, y] of [[.12, .05, .055], [.07, .23, .19], [.13, .07, .315]]) {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 10);
        geometry.translate(anchor.x, y, bank);
        bollardParts.push(geometry);
      }
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(bollardParts), ironMaterial));
  bollardParts.forEach((geometry) => geometry.dispose());
  const cloth = [];
  root.traverse((node) => {
    if (node.isMesh) node.castShadow = node.receiveShadow = true;
    if (/^Wash_Cloth_[123]$/.test(node.name)) cloth.push({ node, rest: node.rotation.z });
  });
  const residents = RESIDENT_ROUTES.map((plan) => {
    const resident = createResident(companions, plan, obstacles);
    if (plan.carrying) {
      const parcel = source("Life_Parcel").clone(true);
      parcel.position.set(0, 1.08, .31);
      resident.model.add(parcel);
    }
    root.add(resident.model);
    return resident;
  });
  scene.add(root);
  return {
    root,
    state: () => ({
      residents: residents.map(({ model }) => ({ name: model.name, position: model.position.toArray() })),
      boats: boats.map(({ model }) => model.position.toArray()),
    }),
    update(time, dt, player, enabled) {
      boats.forEach(({ model, yaw }, index) => {
        model.position.y = -.78 + Math.sin(time * .65 + index * 2) * .018;
        model.rotation.x = Math.sin(time * .48 + index) * .009;
        model.rotation.y = yaw + Math.sin(time * .19 + index) * .002;
      });
      cloth.forEach(({ node, rest }, index) => {
        node.rotation.z = rest + Math.sin(time * .9 + index * 1.7) * .012;
      });
      residents.forEach((resident) => resident.update(time, dt, player, enabled));
    },
  };
}
