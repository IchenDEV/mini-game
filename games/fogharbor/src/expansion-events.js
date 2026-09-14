import * as THREE from "three";
import {
  EXPANSION_STORIES,
  EXPANSION_SETTLED_STORIES,
} from "./expansion-stories.js";

// The GLB has one static mesh per room/material, not individual movable cups or
// valves. These small task props are independent additions at real work surfaces.
export const EXPANSION_EVENT_PLANS = [
  {
    scene: "scene01",
    building: "B01",
    title: "把灯芯调稳",
    side: 1,
    z: 0.7,
    action: 3.6,
    result: "灯火稳定",
  },
  {
    scene: "scene02",
    building: "B04",
    title: "给暖气放气",
    side: 1,
    z: 0.05,
    action: 4.2,
    result: "汽雾散去，表针回稳",
  },
  {
    scene: "scene03",
    building: "B07",
    title: "擦净最后一只杯",
    side: -1,
    z: 0.65,
    action: 4.0,
    result: "擦布叠在杯旁",
  },
  {
    scene: "scene04",
    building: "B10",
    title: "折好面包纸包",
    side: -1,
    z: -2.45,
    action: 3.5,
    result: "纸包折口封好",
  },
  {
    scene: "scene05",
    building: "B13",
    title: "收紧一副挽带",
    side: 1,
    z: 1.8,
    action: 3.8,
    result: "带扣收紧，皮带挂稳",
  },
  {
    scene: "scene06",
    building: "B16",
    title: "把短木留进回收格",
    side: -1,
    z: -0.35,
    action: 3.7,
    result: "短木落在可回收木料上",
  },
  {
    scene: "scene07",
    building: "B19",
    title: "盖好一枚邮戳",
    side: -1,
    z: -0.65,
    action: 3.2,
    result: "信封留下邮戳",
  },
  {
    scene: "scene08",
    building: "B22",
    title: "校稳检验表",
    side: 1,
    z: 0.32,
    action: 4.3,
    result: "检验表指针停止摆动",
  },
  {
    scene: "scene09",
    building: "B25",
    title: "压紧货箱封扣",
    side: -1,
    z: 0.4,
    action: 3.7,
    result: "货签平整，封扣压紧",
  },
  {
    scene: "scene10",
    building: "B28",
    title: "浇透一盆小苗",
    side: 1,
    z: 0.6,
    action: 4.5,
    result: "水壶放回，盆土湿润",
  },
];

const clamp = THREE.MathUtils.clamp;
const smooth = (a) => {
  const t = clamp(a, 0, 1);
  return t * t * (3 - 2 * t);
};
const part = (a, from, to) => smooth((a - from) / (to - from));
const vector = (p) => new THREE.Vector3(...p);
const material = (color, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.7 });

function taskProps(parent, plan, palette) {
  const group = new THREE.Group();
  group.name = `${plan.scene}_daily_task`;
  parent.add(group);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const ringGeometry = new THREE.TorusGeometry(1, 0.15, 5, 16);
  const sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  function mesh(name, geometry, mat, p, scale, holder = group) {
    const object = new THREE.Mesh(geometry, mat);
    object.name = `${plan.scene}_${name}`;
    object.position.set(...p);
    object.scale.set(...scale);
    object.castShadow = object.receiveShadow = true;
    holder.add(object);
    return object;
  }
  const box = (name, p, size, mat = palette.wood, holder) =>
    mesh(name, boxGeometry, mat, p, size, holder);
  const cylinder = (name, p, r, h, mat = palette.brass, holder) =>
    mesh(name, cylinderGeometry, mat, p, [r, h, r], holder);
  const ring = (name, p, r, mat = palette.brass, holder) =>
    mesh(name, ringGeometry, mat, p, [r, r, r], holder);
  const ball = (name, p, size, mat, holder) =>
    mesh(name, sphereGeometry, mat, p, size, holder);
  const pivot = (name, p) => {
    const o = new THREE.Group();
    o.name = `${plan.scene}_${name}`;
    o.position.set(...p);
    group.add(o);
    return o;
  };
  let hand = vector([plan.side * 1.52, 1.2, plan.z]);
  let paint;

  if (plan.scene === "scene01") {
    cylinder("lamp_foot", [1.43, 0.05, 0.7], 0.16, 0.1, palette.iron);
    cylinder("lamp_stem", [1.43, 0.52, 0.7], 0.026, 0.94);
    cylinder("oil_reservoir", [1.43, 1.03, 0.7], 0.13, 0.16);
    const glow = new THREE.MeshStandardMaterial({
      color: 0xffd184,
      emissive: 0xffa641,
      emissiveIntensity: 0.25,
      roughness: 0.35,
    });
    cylinder("lamp_chimney", [1.43, 1.24, 0.7], 0.08, 0.27, glow);
    cylinder("lamp_cap", [1.43, 1.4, 0.7], 0.115, 0.06, palette.iron);
    const knob = ring("wick_wheel", [1.29, 1.09, 0.7], 0.055);
    knob.rotation.y = Math.PI / 2;
    hand.set(1.29, 1.1, 0.7);
    paint = (a, working) => {
      knob.rotation.x = a * 1.6;
      glow.emissiveIntensity =
        a >= 1 ? 0.85 : 0.35 + (working ? 0.27 * Math.sin(a * 55) : 0);
    };
  } else if (plan.scene === "scene02") {
    cylinder("radiator_service_riser", [1.52, 0.53, 0.05], 0.035, 1.06);
    const branch = cylinder(
      "radiator_connection",
      [1.73, 0.73, 0.05],
      0.035,
      0.42,
    );
    branch.rotation.z = Math.PI / 2;
    const gauge = cylinder(
      "radiator_pressure_dial",
      [1.73, 1.27, -0.07],
      0.115,
      0.035,
      palette.linen,
    );
    gauge.rotation.z = Math.PI / 2;
    cylinder(
      "pressure_gauge_stem",
      [1.73, 1.0, -0.07],
      0.018,
      0.54,
      palette.brass,
    );
    const pressure = pivot("radiator_pressure_pointer", [1.706, 1.27, -0.07]);
    box(
      "pressure_pointer",
      [0, 0.037, 0],
      [0.012, 0.075, 0.012],
      palette.iron,
      pressure,
    );
    const valve = ring("bleed_valve", [1.46, 1.08, 0.05], 0.1);
    valve.rotation.y = Math.PI / 2;
    const steamMaterial = new THREE.MeshBasicMaterial({
      color: 0xcbd4cf,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const steam = [0, 1, 2].map((i) =>
      ball(
        `bleed_vapour_${i}`,
        [1.56, 1.2 + i * 0.11, 0.05],
        [0.065, 0.06, 0.065],
        steamMaterial,
      ),
    );
    hand.set(1.43, 1.09, 0.05);
    paint = (a, working) => {
      valve.rotation.x = Math.sin(a * Math.PI) * 1.4;
      pressure.rotation.x =
        -1.1 + 1.55 * part(a, 0.2, 0.85) + (1 - a) * 0.08 * Math.sin(a * 24);
      steamMaterial.opacity =
        working && a > 0.2 && a < 0.8
          ? 0.2 * Math.sin(((a - 0.2) / 0.6) * Math.PI)
          : 0;
      steam.forEach((p, i) => {
        p.position.y = 1.24 + ((a * 2 + i / 3) % 1) * 0.48;
        p.scale.setScalar(0.055 + i * 0.017);
      });
    };
  } else if (plan.scene === "scene03") {
    cylinder("last_cup", [-1.76, 1.35, 0.65], 0.075, 0.18, palette.linen);
    ring("last_cup_handle", [-1.76, 1.36, 0.75], 0.045, palette.linen);
    const cloth = box(
      "wiping_cloth",
      [-1.66, 1.27, 0.48],
      [0.16, 0.025, 0.16],
      palette.linen,
    );
    paint = (a) => {
      const wipe = Math.sin(Math.PI * a);
      cloth.position.set(
        -1.66 - 0.06 * wipe,
        1.27 + 0.025 * wipe,
        0.48 + 0.13 * Math.sin(a * Math.PI * 6) * wipe,
      );
      cloth.rotation.y = 0.3 * Math.sin(a * Math.PI * 6) * wipe;
      hand.copy(cloth.position).y += 0.02;
    };
  } else if (plan.scene === "scene04") {
    box(
      "bread_paper_packet",
      [-1.62, 1.01, -2.45],
      [0.31, 0.2, 0.35],
      palette.paper,
    );
    const fold = pivot("packet_fold", [-1.62, 1.12, -2.6]);
    box("paper_fold", [0, 0.12, 0], [0.31, 0.24, 0.014], palette.paper, fold);
    const seal = box(
      "packet_seal",
      [-1.62, 1.127, -2.46],
      [0.11, 0.008, 0.17],
      palette.red,
    );
    paint = (a) => {
      fold.rotation.x = (part(a, 0.15, 0.8) * Math.PI) / 2;
      seal.visible = a > 0.84;
      hand.set(-1.47, 1.22 - 0.11 * a, -2.45);
    };
  } else if (plan.scene === "scene05") {
    cylinder("harness_stand", [1.58, 0.58, 1.8], 0.026, 1.16, palette.iron);
    box(
      "harness_stand_foot",
      [1.58, 0.04, 1.8],
      [0.28, 0.08, 0.22],
      palette.iron,
    );
    const strap = ring(
      "leather_harness_loop",
      [1.6, 1.1, 1.8],
      0.145,
      palette.wood,
    );
    const buckle = box(
      "harness_buckle",
      [1.46, 1.12, 1.8],
      [0.06, 0.11, 0.055],
      palette.brass,
    );
    paint = (a) => {
      strap.scale.y = 0.145 * (1 - 0.13 * part(a, 0.2, 0.75));
      strap.rotation.z = 0.13 * (1 - a) * Math.sin(a * 18);
      buckle.position.y = 1.12 + 0.075 * part(a, 0.2, 0.75);
      hand.copy(buckle.position);
    };
  } else if (plan.scene === "scene06") {
    box(
      "sorting_lip_tray",
      [-1.57, 0.97, -0.35],
      [0.29, 0.06, 0.3],
      palette.iron,
    );
    for (const x of [-1.67, -1.47])
      box(
        "sorting_tray_bracket",
        [x, 0.48, -0.35],
        [0.035, 0.96, 0.045],
        palette.iron,
      );
    const offcut = box(
      "saved_short_timber",
      [-1.55, 1.02, -0.35],
      [0.25, 0.065, 0.25],
    );
    paint = (a) => {
      offcut.position.x = -1.55 - 0.1 * part(a, 0.15, 0.63);
      offcut.position.y =
        1.02 +
        0.12 * Math.sin(part(a, 0.05, 0.6) * Math.PI) -
        0.4 * part(a, 0.65, 0.9);
      offcut.rotation.y = 0.3 * part(a, 0.15, 0.65);
      hand.copy(offcut.position);
      hand.y = Math.max(hand.y + 0.05, 1.1);
    };
  } else if (plan.scene === "scene07") {
    box(
      "unstamped_letter",
      [-1.56, 0.975, -0.75],
      [0.31, 0.015, 0.28],
      palette.linen,
    );
    const stamp = pivot("postal_handstamp", [-1.54, 1.13, -0.75]);
    box("handstamp_base", [0, 0, 0], [0.1, 0.055, 0.09], palette.iron, stamp);
    cylinder(
      "handstamp_handle",
      [0, 0.09, 0],
      0.028,
      0.14,
      palette.wood,
      stamp,
    );
    const mark = cylinder(
      "postmark",
      [-1.56, 0.988, -0.75],
      0.047,
      0.005,
      palette.red,
    );
    paint = (a) => {
      stamp.position.y =
        1.13 -
        0.116 * Math.sin(part(a, 0.15, 0.65) * Math.PI) -
        0.1575 * part(a, 0.82, 1);
      stamp.position.z = -0.75 + 0.21 * part(a, 0.7, 1);
      mark.visible = a > 0.4;
      hand.copy(stamp.position).y += 0.13;
    };
  } else if (plan.scene === "scene08") {
    box(
      "test_clock_base",
      [1.57, 0.975, 0.32],
      [0.29, 0.14, 0.26],
      palette.wood,
    );
    box(
      "test_clock_pedestal",
      [1.57, 1.09, 0.32],
      [0.07, 0.14, 0.07],
      palette.brass,
    );
    const dial = cylinder(
      "test_clock_dial",
      [1.57, 1.24, 0.32],
      0.17,
      0.05,
      palette.linen,
    );
    dial.rotation.z = Math.PI / 2;
    const bezel = ring("test_clock_bezel", [1.532, 1.24, 0.32], 0.17);
    bezel.rotation.y = Math.PI / 2;
    const pointer = pivot("test_clock_pointer", [1.5, 1.24, 0.32]);
    box(
      "test_clock_hand",
      [0, 0.064, 0],
      [0.015, 0.13, 0.018],
      palette.iron,
      pointer,
    );
    const key = ring("winding_key", [1.43, 1.08, 0.32], 0.055);
    key.rotation.y = Math.PI / 2;
    paint = (a) => {
      key.rotation.x = a * Math.PI * 6;
      pointer.rotation.x = -0.6 + a * 0.9 + (1 - a) * 0.26 * Math.sin(a * 30);
      hand.set(1.43, 1.09, 0.32);
    };
  } else if (plan.scene === "scene09") {
    const tag = pivot("cargo_tag_hinge", [-1.411, 1.035, 0.4]);
    box("cargo_tag", [0, 0.125, 0], [0.013, 0.25, 0.26], palette.paper, tag);
    const clasp = pivot("cargo_seal_clasp", [-1.39, 1.28, 0.4]);
    box(
      "cargo_clasp_lever",
      [0, -0.09, 0],
      [0.042, 0.18, 0.05],
      palette.iron,
      clasp,
    );
    const wax = ball(
      "secured_cargo_seal",
      [-1.385, 1.16, 0.4],
      [0.02, 0.05, 0.05],
      palette.red,
    );
    paint = (a) => {
      tag.rotation.z = -0.22 * (1 - part(a, 0.05, 0.45));
      clasp.rotation.z = 0.75 * (1 - part(a, 0.2, 0.76));
      wax.visible = a > 0.78;
      hand.set(-1.37, 1.21, 0.4);
    };
  } else {
    const can = pivot("hand_watering_can", [1.61, 1.12, 0.6]);
    cylinder("watering_can_body", [0, 0, 0], 0.105, 0.23, palette.green, can);
    const spout = cylinder(
      "watering_can_spout",
      [0.16, 0.04, 0],
      0.025,
      0.29,
      palette.green,
      can,
    );
    spout.rotation.z = -Math.PI / 2 + 0.22;
    ring("watering_can_handle", [-0.09, 0.11, 0], 0.105, palette.iron, can);
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: 0xc2e6df,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const drops = [0, 1, 2].map((i) =>
      ball(
        `watering_drop_${i}`,
        [1.89, 1.45, 0.28],
        [0.014, 0.035, 0.014],
        waterMaterial,
      ),
    );
    const soil = cylinder(
      "watered_pot_soil",
      [1.85, 1.289, 0.28],
      0.1,
      0.008,
      palette.wood,
    );
    const wet = material(0x2b2b1b);
    soil.material = wet;
    paint = (a) => {
      const lift = part(a, 0.08, 0.23) * (1 - part(a, 0.76, 0.94));
      can.position.set(1.61, 1.12 + 0.41 * lift, 0.6 - 0.32 * lift);
      can.rotation.z = -0.38 * part(a, 0.25, 0.38) * (1 - part(a, 0.7, 0.8));
      drops.forEach((p, i) => {
        p.visible = a > 0.34 && a < 0.7;
        p.position.y = 1.29 + ((a * 7 + i / 3) % 1) * 0.2;
      });
      wet.color.setHex(a > 0.5 ? 0x25291a : 0x65503a);
      hand.copy(can.position).x -= 0.09;
      hand.y += 0.11;
    };
  }
  paint(0, false);
  return {
    group,
    hand,
    paint,
    geometries: [boxGeometry, cylinderGeometry, ringGeometry, sphereGeometry],
  };
}

/** Bind once before the first rendered frame. Only existing primary workplace
 * residents are assigned here; street neighbours and story actors keep their routes. */
export function createExpansionEvents(buildings) {
  const palette = {
    wood: material(0x795637),
    iron: material(0x263834, 0.65),
    brass: material(0xb58b49, 0.6),
    linen: material(0xd5cdb0),
    paper: material(0xad9166),
    red: material(0x853d2d),
    green: material(0x557764),
  };
  const records = EXPANSION_EVENT_PLANS.map((plan) => {
    const building = buildings.find((b) => b.data.id === plan.building);
    if (!building?.room || !building.holder)
      throw new Error(`Missing event room ${plan.building}`);
    return {
      plan,
      building,
      task: taskProps(building.room, plan, palette),
      time: 0,
      phase: "idle",
      completed: false,
      worker: null,
      originalUpdate: null,
      handGap: 0,
    };
  });
  const handRest = new THREE.Vector3(-0.1, -0.495, 0.022);
  const target = new THREE.Vector3(),
    origin = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    quaternion = new THREE.Quaternion();
  let bound = false,
    active = null;

  function pose(record, blend) {
    const { worker, task, building, plan } = record;
    if (!worker) return;
    const model = worker.model;
    model.rotation.y = building.data.yaw + (plan.side * Math.PI) / 2;
    const arm = model.getObjectByName(`${worker.source}_RightArm`);
    const left = model.getObjectByName(`${worker.source}_LeftArm`);
    const head = model.getObjectByName(`${worker.source}_Head`);
    if (left) left.rotation.set(-0.1, 0, -0.025);
    for (const part of ["LeftLeg", "RightLeg"])
      model.getObjectByName(`${worker.source}_${part}`)?.rotation.set(0, 0, 0);
    if (head) head.rotation.set(0.06 + blend * 0.13, 0, 0);
    if (!arm) return;
    arm.quaternion.identity();
    arm.updateWorldMatrix(true, false);
    task.group.updateWorldMatrix(true, false);
    target.copy(task.hand);
    task.group.localToWorld(target);
    arm.parent.worldToLocal(target);
    direction.copy(target).sub(arm.position).normalize();
    quaternion.setFromUnitVectors(handRest.clone().normalize(), direction);
    arm.quaternion.slerp(quaternion, blend);
    arm.updateWorldMatrix(true, false);
    origin.copy(handRest);
    arm.localToWorld(origin);
    target.copy(task.hand);
    task.group.localToWorld(target);
    record.handGap = origin.distanceTo(target);
  }

  return {
    bindWorkers(people) {
      if (bound)
        throw new Error(
          "Expansion workers must only be bound once before rendering",
        );
      const assignments = records.map((record) => {
        const worker = people.find(
          (p) => p.home?.id === record.plan.scene && p.work,
        );
        if (!worker?.model.getObjectByName(`${worker.source}_RightArm`))
          throw new Error(
            `Missing local worker or arm for ${record.plan.scene}`,
          );
        return worker;
      });
      for (const [index, record] of records.entries()) {
        const worker = assignments[index];
        record.worker = worker;
        record.originalUpdate = worker.update;
        // Initial placement, not an enter-time teleport. The remaining central
        // strip stays free: workers stand at x=±1.12, facing their side station.
        record.building.holder.updateWorldMatrix(true, false);
        const station = record.building.holder.localToWorld(
          vector([record.plan.side * 1.12, 0.035, record.plan.z]),
        );
        worker.model.position.copy(station);
        record.originalWork = worker.work;
        worker.work = station.clone();
        record.parcel = worker.model.getObjectByName("Life_Parcel");
        if (record.parcel) {
          record.parcelVisible = record.parcel.visible;
          record.parcel.visible = false;
        }
        worker.update = () => {};
        pose(record, 0);
      }
      bound = true;
    },
    update(dt, player, current) {
      const id = typeof current === "string" ? current : current?.id;
      active = id ?? null;
      const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
      for (const record of records) {
        const inside = id === record.plan.building;
        if (!bound || (!inside && !record.building.room.visible)) continue;
        if (inside && record.phase === "idle") record.phase = "prepare";
        if (inside && !record.completed && record.phase !== "idle")
          record.time += delta;
        const start = 1.1,
          end = start + record.plan.action,
          settle = end + 0.7,
          done = settle + 0.85;
        const a = clamp((record.time - start) / record.plan.action, 0, 1);
        if (record.time >= done) {
          record.completed = true;
          record.phase = "done";
        } else if (record.time >= settle) record.phase = "settle";
        else if (record.time >= end) record.phase = "pause";
        else if (record.time >= start) record.phase = "act";
        record.task.paint(a, record.phase === "act");
        const blend =
          record.phase === "idle" || record.completed
            ? 0
            : smooth(record.time / start) *
              (1 - smooth((record.time - settle) / 0.85));
        pose(record, blend);
      }
    },
    state() {
      return {
        active,
        completed: records.filter((r) => r.completed).length,
        scenes: Object.fromEntries(
          records.map((r) => [
            r.plan.scene,
            {
              building: r.plan.building,
              title: r.plan.title,
              phase: r.phase,
              time: Number(r.time.toFixed(2)),
              completed: r.completed,
              workerBound: !!r.worker,
              handGap: Number(r.handGap.toFixed(3)),
              result: r.completed ? r.plan.result : null,
            },
          ]),
        ),
      };
    },
    script(sceneId) {
      return records.find((r) => r.plan.scene === sceneId)?.completed
        ? EXPANSION_SETTLED_STORIES[sceneId]
        : EXPANSION_STORIES[sceneId];
    },
    dispose() {
      const materials = new Set(Object.values(palette));
      for (const r of records) {
        if (r.worker) {
          r.worker.update = r.originalUpdate;
          r.worker.work = r.originalWork;
        }
        if (r.parcel) r.parcel.visible = r.parcelVisible;
        r.task.group.traverse((o) => {
          if (o.isMesh) materials.add(o.material);
        });
        r.task.group.removeFromParent();
        r.task.geometries.forEach((g) => g.dispose());
      }
      materials.forEach((m) => m.dispose());
    },
  };
}
