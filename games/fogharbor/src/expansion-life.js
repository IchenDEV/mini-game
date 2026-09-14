import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createResident } from "./world-life.js";
import { createAnimalAnimator } from "./city-animal-motion.js";
import { heightAt, canWalk, canTraverse, dampAngle } from "./movement.js";
import {
  TRAFFIC_LENGTH,
  trafficPose,
  EXPANSION_SCENES,
  EXPANSION_BUILDINGS,
  buildingPoint,
} from "./expansion-layout.js";

export { TRAFFIC_LENGTH, trafficPose } from "./expansion-layout.js";
const wardrobe = [
  { blue: 0x665740, gray: 0x666358 },
  { green: 0x52656a, cream: 0xc5baa5, red: 0x67543d },
  { coat: 0x485c4f, patch: 0x677667, scarf: 0x8e7045 },
];
const seat = new THREE.Vector3(0, 0.55, -0.89);
const cargoDeck = new THREE.Vector3(-0.14, 1.67, 0.24);
function stopPoint(stop, side, along = 0.1, rise = 0) {
  const { position, yaw } = stop.pose;
  return new THREE.Vector3(
    position.x + Math.cos(yaw) * side + Math.sin(yaw) * along,
    position.y + rise,
    position.z - Math.sin(yaw) * side + Math.cos(yaw) * along,
  );
}

export function createCarriageStops(obstacles = []) {
  return ["scene04", "scene05"]
    .map((id) => {
      const district = EXPANSION_SCENES.find((s) => s.id === id);
      let best = null;
      for (let distance = 8; distance < TRAFFIC_LENGTH - 8; distance += 0.5) {
        const pose = trafficPose(distance);
        const turn = [-5, 5].some((offset) => {
          const angle = trafficPose(distance + offset).yaw - pose.yaw;
          return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > 0.025;
        });
        if (turn) continue;
        for (const side of [-1, 1]) {
          const stop = { id, name: district.name, distance, pose, side };
          const curb = stopPoint(stop, side * 3.2);
          const score = Math.hypot(
            curb.x - district.x,
            curb.z - district.z - 6.8,
          );
          if (score > 18 || (best && score >= best.score)) continue;
          const waiting = [-2.8, 2.8].map((along) =>
            stopPoint(stop, side * 3.2, along),
          );
          const step = stopPoint(stop, side * 0.95, 0.1);
          const porterWait = stopPoint(stop, side * 4.0);
          if (
            ![curb, porterWait, ...waiting].every((p) =>
              canWalk(p.x, p.z, obstacles),
            )
          )
            continue;
          if (
            !waiting.every((p) => canTraverse(p, curb, obstacles)) ||
            !canTraverse(porterWait, curb, obstacles) ||
            !canTraverse(curb, step, obstacles)
          )
            continue;
          best = {
            ...stop,
            curb,
            waiting,
            porterWait,
            score,
            queue: [],
            occupant: null,
            passengers: [],
          };
        }
      }
      if (!best) throw new Error(`No straight, paved carriage stop for ${id}`);
      return best;
    })
    .sort((a, b) => a.distance - b.distance);
}

// The authored doors share material meshes with the cabin. Separate only their
// existing triangles so an opened door is a real passage, with no model rebuild.
function passengerDoors(carriage) {
  carriage.updateMatrixWorld(true);
  const inverse = carriage.matrixWorld.clone().invert();
  const doors = {};
  const meshes = [];
  carriage.traverse((mesh) => {
    if (mesh.isMesh) meshes.push(mesh);
  });
  for (const side of [-1, 1]) {
    const hinge = new THREE.Vector3(side * 0.77, 0, -1.31);
    const door = new THREE.Group();
    door.name = `Passenger boarding door ${side}`;
    door.position.copy(hinge);
    for (const mesh of meshes) {
      const local = inverse.clone().multiply(mesh.matrixWorld);
      const original = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry;
      const positions = original.attributes.position;
      const kept = [],
        moving = [];
      for (let i = 0; i < positions.count; i += 3) {
        const points = [0, 1, 2].map((j) =>
          new THREE.Vector3()
            .fromBufferAttribute(positions, i + j)
            .applyMatrix4(local),
        );
        const lower = points.every(
          (p) =>
            p.x * side >= 0.665 &&
            p.x * side <= 0.82 &&
            p.y >= 0.9 &&
            p.y <= 1.535 &&
            p.z >= -1.34 &&
            p.z <= 0.67,
        );
        const panel = points.every(
          (p) =>
            p.x * side >= 0.735 &&
            p.x * side <= 0.88 &&
            p.y >= 0.93 &&
            p.y <= 2.095 &&
            p.z >= -0.72 &&
            p.z <= 0.15,
        );
        (lower || panel ? moving : kept).push(i, i + 1, i + 2);
      }
      if (!moving.length) continue;
      const subset = (indices) => {
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(original.attributes)) {
          const values = indices.flatMap((i) =>
            Array.from(
              attribute.array.slice(
                i * attribute.itemSize,
                (i + 1) * attribute.itemSize,
              ),
            ),
          );
          geometry.setAttribute(
            name,
            new THREE.BufferAttribute(
              new attribute.array.constructor(values),
              attribute.itemSize,
              attribute.normalized,
            ),
          );
        }
        return geometry;
      };
      mesh.geometry = subset(kept);
      const leaf = new THREE.Mesh(subset(moving), mesh.material);
      leaf.matrixAutoUpdate = false;
      leaf.matrix.makeTranslation(-hinge.x, -hinge.y, -hinge.z).multiply(local);
      door.add(leaf);
    }
    carriage.add(door);
    doors[side] = door;
  }
  return doors;
}

function serviceActor(companions, source, name) {
  const model = companions.getObjectByName(source).clone(true);
  model.name = name;
  model.scale.setScalar(source === "Molly" ? 0.88 : 0.95);
  return {
    model,
    source,
    phase: 0,
    mode: "waiting",
    bay: 0,
    joints: Object.fromEntries(
      ["LeftArm", "RightArm", "LeftLeg", "RightLeg"].map((part) => [
        part,
        model.getObjectByName(`${source}_${part}`),
      ]),
    ),
  };
}
function animateServiceActor(actor, moved, seated = 0, carrying = false) {
  actor.phase += moved * 8.4;
  for (const [part, sign] of [
    ["LeftLeg", 1],
    ["RightLeg", -1],
    ["LeftArm", -0.65],
    ["RightArm", 0.65],
  ]) {
    const joint = actor.joints[part];
    if (!joint) continue;
    const arms = part.includes("Arm");
    const walking = moved > 0 ? Math.sin(actor.phase) * 0.32 * sign : 0;
    joint.rotation.x =
      carrying && arms
        ? -0.78
        : THREE.MathUtils.lerp(walking, arms ? -0.22 : -1.4, seated);
  }
}

export async function createExpansionLife(
  scene,
  companions,
  obstacles,
  authoredAsset = null,
  parcelAsset = null,
) {
  const asset =
    authoredAsset ??
    (await new GLTFLoader().loadAsync("./models/city-animals-v1.glb")).scene;
  const root = new THREE.Group();
  root.name = "Street occupations, carriage traffic and courtyard animals";
  scene.add(root);
  const people = [];
  EXPANSION_SCENES.forEach((s, index) => {
    for (let j = 0; j < 2; j++) {
      const side = j ? 1 : -1,
        source = ["Milo", "Molly", "Beck"][(index + j) % 3];
      const building = EXPANSION_BUILDINGS.find(
          (b) => b.sceneId === s.id && b.primary,
        ),
        work = buildingPoint(building, 0, -0.2);
      const stops = [
        [s.x + side * 1.65, s.z + 5, 4 + j * 3],
        j ? [s.x + side * 0.65, s.z + 2.5, 6] : [work.x, work.z, 12],
        [s.x, s.z + 5.8, 3],
      ];
      if (index === 6 && j === 1)
        stops[1] = [EXPANSION_SCENES[3].x, EXPANSION_SCENES[3].z + 5, 7];
      const resident = createResident(
        companions,
        {
          name: `${s.name} · ${j ? "街坊" : "当班工人"}`,
          source,
          speed: 0.68 + j * 0.18,
          scale: 1.1,
          carrying: index % 3 === 0,
          colors: wardrobe[(index + j) % 3],
          stops,
        },
        obstacles,
      );
      if (index % 3 === 0 && parcelAsset) {
        const parcel = parcelAsset.getObjectByName("Life_Parcel").clone(true);
        parcel.position.set(0, 1.08, 0.31);
        resident.model.add(parcel);
      }
      resident.model.name = `${s.id}_resident_${j}`;
      root.add(resident.model);
      people.push({
        ...resident,
        source,
        home: s,
        index: index * 2 + j,
        work: j ? null : work,
      });
    }
  });
  const stops = createCarriageStops(obstacles);
  const vehicles = ["PassengerCarriage", "FreightCarriage"].map(
    (name, index) => {
      const group = new THREE.Group(),
        carriage = asset.getObjectByName(name).clone(true),
        horse = asset.getObjectByName("Horse").clone(true);
      horse.position.z = 3.15;
      group.add(carriage, horse);
      root.add(group);
      const driver = companions.getObjectByName("Beck").clone(true);
      driver.scale.setScalar(0.92);
      driver.position.set(0, 0.67, 1.15);
      driver.getObjectByName("Beck_LeftLeg").rotation.x = -1.2;
      driver.getObjectByName("Beck_RightLeg").rotation.x = -1.2;
      driver.getObjectByName("Beck_LeftArm").rotation.x = -0.9;
      driver.getObjectByName("Beck_RightArm").rotation.x = -0.9;
      group.add(driver);
      const wheels = [];
      carriage.traverse((o) => {
        if (/Wheel_(FL|FR|RL|RR)$/.test(o.name)) wheels.push(o);
      });
      return {
        name,
        group,
        horse,
        doors: index === 0 ? passengerDoors(carriage) : null,
        rider: null,
        service: null,
        completedStops: 0,
        status: "initial-wait",
        stopIndex: 0,
        animator: createAnimalAnimator(horse),
        wheels,
        axle: carriage.getObjectByName(`${name}_FrontAxle`),
        distance: stops[index].distance - (index === 0 ? 10 : 12),
        speed: 0,
        wait: 3 + index * 4,
        nextStop: stops[0].distance,
      };
    },
  );
  const passengers = stops.map((stop, index) => {
    const actor = serviceActor(
      companions,
      "Molly",
      `Carriage passenger ${index + 1}`,
    );
    actor.model.position.copy(stop.waiting[0]);
    stop.passengers.push(actor);
    root.add(actor.model);
    return actor;
  });
  const rider = serviceActor(companions, "Molly", "Carriage passenger 3");
  rider.model.position.copy(seat);
  rider.mode = "seated";
  animateServiceActor(rider, 0, 1);
  vehicles[0].group.add(rider.model);
  vehicles[0].rider = rider;
  passengers.push(rider);
  const porters = stops.map((stop, index) => {
    const actor = serviceActor(
      companions,
      "Milo",
      `Freight porter ${index + 1}`,
    );
    actor.model.position.copy(stop.porterWait);
    root.add(actor.model);
    stop.porter = actor;
    return actor;
  });
  const parcelSource = parcelAsset?.getObjectByName("Life_Parcel");
  const cargo = {
    model: parcelSource?.clone(true) ?? null,
    location: stops[1].id,
    carrier: null,
  };
  const parcelFloor = (stop) => stopPoint(stop, stop.side * 4.0, 0.65);
  if (cargo.model) {
    cargo.model.scale.setScalar(0.7);
    cargo.model.position.copy(parcelFloor(stops[1]));
    root.add(cargo.model);
  }
  for (const v of vehicles) {
    v.stopIndex = stops.findIndex((stop) => stop.distance > v.distance + 0.01);
    if (v.stopIndex < 0) v.stopIndex = 0;
    v.nextStop = stops[v.stopIndex].distance;
    if (v.nextStop <= v.distance) v.nextStop += TRAFFIC_LENGTH;
    const pose = trafficPose(v.distance);
    v.group.position.copy(pose.position);
    v.group.rotation.y = pose.yaw;
  }
  const handPoint = (actor) => {
    actor.model.updateWorldMatrix(true, false);
    return actor.model.localToWorld(new THREE.Vector3(0, 1.08, 0.31));
  };
  function beginService(v, stop) {
    stop.occupant = v;
    v.speed = 0;
    v.status = "servicing";
    const jobs = [];
    const moveActor = (
      actor,
      to,
      duration,
      mode,
      fromSeat = 0,
      toSeat = 0,
      done = null,
    ) => jobs.push({ actor, to, duration, mode, fromSeat, toSeat, done });
    if (v.doors) {
      const door = v.doors[stop.side];
      jobs.push({ duration: 0.7, mode: "opening-door", door, open: true });
      const boarding = stop.passengers.shift() ?? null;
      if (boarding) boarding.mode = "reserved";
      const step = stopPoint(stop, stop.side * 0.95, 0.1, 0.61);
      if (v.rider) {
        const leaving = v.rider;
        v.group.updateWorldMatrix(true, true);
        root.attach(leaving.model);
        v.rider = null;
        leaving.bay = boarding?.bay === 0 ? 1 : 0;
        moveActor(leaving, step, 1.5, "alighting-step", 1, 0);
        moveActor(leaving, stop.curb, 2.1, "alighting-curb");
        moveActor(
          leaving,
          stop.waiting[leaving.bay],
          2.7,
          "leaving-curb",
          0,
          0,
          () => {
            leaving.mode = "waiting";
            stop.passengers.push(leaving);
          },
        );
      }
      if (boarding) {
        moveActor(boarding, stop.curb, 2.7, "approaching-curb");
        moveActor(boarding, step, 2.1, "boarding-step");
        moveActor(
          boarding,
          stopPoint(stop, seat.x, seat.z, seat.y),
          1.5,
          "taking-seat",
          0,
          1,
          () => {
            v.group.updateWorldMatrix(true, true);
            v.group.attach(boarding.model);
            boarding.model.position.copy(seat);
            boarding.model.rotation.y = 0;
            boarding.mode = "seated";
            v.rider = boarding;
          },
        );
      }
      jobs.push({ duration: 0.7, mode: "closing-door", door, open: false });
    } else if (
      cargo.model &&
      (cargo.location === stop.id || cargo.location === "carriage")
    ) {
      const actor = stop.porter;
      const loading = cargo.location === stop.id;
      const beside = stopPoint(stop, stop.side * 1.5, -0.3);
      const deck = stopPoint(stop, cargoDeck.x, cargoDeck.z, cargoDeck.y);
      const transfer = (to, mode, done) =>
        jobs.push({ actor, duration: 1.3, mode, parcelTo: to, done });
      if (loading)
        transfer(
          () => handPoint(actor),
          "picking-up",
          () => {
            cargo.carrier = actor;
          },
        );
      moveActor(actor, stop.curb, 2.7, "freight-approach");
      moveActor(actor, beside, 1.8, "freight-beside");
      transfer(
        loading ? () => deck : () => handPoint(actor),
        loading ? "loading-parcel" : "unloading-parcel",
        () => {
          if (loading) {
            v.group.updateWorldMatrix(true, true);
            v.group.attach(cargo.model);
            cargo.model.position.copy(cargoDeck);
            cargo.carrier = null;
            cargo.location = "carriage";
          } else {
            cargo.carrier = actor;
            cargo.location = "carried";
          }
        },
      );
      moveActor(actor, stop.curb, 1.8, "freight-clearance");
      moveActor(actor, stop.porterWait, 1.2, "freight-return");
      if (!loading)
        transfer(
          () => parcelFloor(stop),
          "setting-down",
          () => {
            cargo.carrier = null;
            cargo.location = stop.id;
          },
        );
      jobs.push({
        duration: 0.4,
        mode: "freight-ready",
        done: () => {
          actor.mode = "waiting";
        },
      });
    } else jobs.push({ duration: 1.4, mode: "empty-stop" });
    v.service = {
      stop,
      jobs,
      index: 0,
      elapsed: 0,
      started: false,
      action: jobs[0].mode,
    };
    v.wait = jobs.reduce((sum, job) => sum + job.duration, 0);
  }
  function actorCanMove(v, actor, to, player) {
    if (!canTraverse(actor.model.position, to, obstacles)) return false;
    const blockedByPlayer =
      Math.hypot(to.x - player.x, to.z - player.z) < 0.7 &&
      Math.abs(to.y - player.y) < 1.4 &&
      Math.hypot(to.x - player.x, to.z - player.z) <=
        Math.hypot(
          actor.model.position.x - player.x,
          actor.model.position.z - player.z,
        );
    if (blockedByPlayer) return false;
    return !vehicles.some((other) => {
      if (other === v) return false;
      const pose = trafficPose(other.distance);
      const dx = to.x - pose.position.x,
        dz = to.z - pose.position.z;
      const across = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
      const along = dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
      return Math.abs(across) < 1.45 && along > -2 && along < 4.9;
    });
  }
  function updateService(v, dt, player) {
    const service = v.service,
      job = service.jobs[service.index];
    if (!service.started) {
      if (job.actor) {
        job.actor.mode = job.mode;
        job.from = job.actor.model.position.clone();
      }
      if (job.parcelTo) {
        v.group.updateWorldMatrix(true, true);
        root.attach(cargo.model);
        cargo.carrier = null;
        job.parcelFrom = cargo.model.position.clone();
      }
      service.started = true;
    }
    const elapsed = Math.min(job.duration, service.elapsed + dt);
    const progress = THREE.MathUtils.smoothstep(elapsed / job.duration, 0, 1);
    if (job.to) {
      const next = job.from.clone().lerp(job.to, progress);
      if (!actorCanMove(v, job.actor, next, player)) return;
      const delta = next.clone().sub(job.actor.model.position);
      job.actor.model.position.copy(next);
      const seated = THREE.MathUtils.lerp(job.fromSeat, job.toSeat, progress);
      const yaw = job.toSeat
        ? service.stop.pose.yaw
        : Math.atan2(delta.x, delta.z);
      if (delta.lengthSq() > 1e-8)
        job.actor.model.rotation.y = dampAngle(
          job.actor.model.rotation.y,
          yaw,
          9,
          dt,
        );
      animateServiceActor(
        job.actor,
        delta.length(),
        seated,
        cargo.carrier === job.actor,
      );
    }
    if (job.door)
      job.door.rotation.y =
        service.stop.side * 1.35 * (job.open ? progress : 1 - progress);
    if (job.parcelTo) {
      cargo.model.position.copy(job.parcelFrom).lerp(job.parcelTo(), progress);
      cargo.model.position.y += Math.sin(Math.PI * progress) * 0.6;
      animateServiceActor(job.actor, 0, 0, true);
    }
    if (cargo.carrier) cargo.model.position.copy(handPoint(cargo.carrier));
    service.elapsed = elapsed;
    service.action = job.mode;
    v.wait = Math.max(
      0.1,
      service.jobs
        .slice(service.index)
        .reduce((sum, next) => sum + next.duration, 0) - elapsed,
    );
    if (elapsed < job.duration) return;
    job.done?.();
    service.index++;
    service.elapsed = 0;
    service.started = false;
    if (service.index < service.jobs.length) return;
    service.stop.occupant = null;
    service.stop.queue = service.stop.queue.filter((queued) => queued !== v);
    v.completedStops++;
    v.lastStop = service.stop.id;
    v.service = null;
    v.status = "driving";
    v.wait = 0;
    v.stopIndex = (v.stopIndex + 1) % stops.length;
    v.nextStop =
      stops[v.stopIndex].distance +
      Math.floor(v.distance / TRAFFIC_LENGTH) * TRAFFIC_LENGTH;
    if (v.nextStop <= v.distance + 0.01) v.nextStop += TRAFFIC_LENGTH;
  }
  const animals = [];
  for (const [index, s] of EXPANSION_SCENES.entries()) {
    const cat = index % 2 === 0,
      name = cat
        ? index % 4
          ? "Cat_Cobby"
          : "Cat_Slender"
        : index % 4 === 1
          ? "Dog_Terrier"
          : "Dog_Lurcher";
    const model = asset.getObjectByName(name).clone(true);
    root.add(model);
    model.position.set(s.x - 1.4, s.height, s.z + 4);
    animals.push({
      model,
      animator: createAnimalAnimator(model),
      home: s,
      cat,
      mode: "idle",
      index,
      phase: 0,
    });
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  let elapsed = 0;
  return {
    root,
    people,
    animals,
    vehicles,
    stops,
    passengers,
    porters,
    cargo,
    update(time, dt, player, enabled) {
      elapsed += enabled ? dt : 0;
      for (const v of vehicles) {
        if (!enabled) {
          v.animator.update(time, 0, "idle");
          continue;
        }
        const previousDistance = v.distance;
        const pose = trafficPose(v.distance);
        const front = new THREE.Vector3(
          Math.sin(pose.yaw),
          0,
          Math.cos(pose.yaw),
        );
        const stop = stops[v.stopIndex];
        const remaining = v.nextStop - v.distance;
        if (enabled && remaining <= 12 && !stop.queue.includes(v))
          stop.queue.push(v);
        const queueIndex = stop.queue.indexOf(v);
        const queued = queueIndex > 0 || (stop.occupant && stop.occupant !== v);
        const barrier = v.nextStop - (queued ? 9 * Math.max(1, queueIndex) : 0);
        const outsidePassengers = passengers.filter(
          (actor) => actor.model.parent === root,
        );
        const blockers = [
          player,
          ...people.map((p) => p.model.position),
          ...outsidePassengers.map((p) => p.model.position),
          ...porters.map((p) => p.model.position),
        ];
        const obstructed =
          blockers.some((p) => {
            const dx = p.x - pose.position.x,
              dz = p.z - pose.position.z;
            const forward = dx * front.x + dz * front.z;
            const side = dx * front.z - dz * front.x;
            return (
              forward > -1 &&
              forward < 7 &&
              Math.abs(side) < 1.55 &&
              Math.abs(p.y - pose.position.y) < 1
            );
          }) ||
          vehicles.some((other) => {
            if (other === v) return false;
            const gap =
              (((other.distance - v.distance) % TRAFFIC_LENGTH) +
                TRAFFIC_LENGTH) %
              TRAFFIC_LENGTH;
            return gap > 0.001 && gap < 9;
          });
        let travelled = 0;
        if (v.service) {
          v.speed = 0;
          v.status = "servicing";
          if (enabled) updateService(v, dt, player);
        } else {
          if (v.wait > 0 && enabled) v.wait = Math.max(0, v.wait - dt);
          const speed =
            enabled && !obstructed && v.wait <= 0
              ? Math.min(
                  1.7,
                  Math.sqrt(2.5 * Math.max(0, barrier - v.distance)),
                )
              : 0;
          v.speed = enabled ? THREE.MathUtils.damp(v.speed, speed, 5, dt) : 0;
          travelled = enabled
            ? Math.min(v.speed * dt, Math.max(0, barrier - v.distance))
            : 0;
          v.distance += travelled;
          v.status = queued
            ? "queued"
            : v.wait > 0
              ? "initial-wait"
              : obstructed
                ? "braking"
                : "driving";
          if (enabled && !queued && v.distance >= v.nextStop - 0.001) {
            v.distance = v.nextStop;
            v.group.position.copy(stop.pose.position);
            v.group.rotation.y = stop.pose.yaw;
            beginService(v, stop);
          }
        }
        const next = trafficPose(v.distance);
        v.group.position.copy(next.position);
        v.group.rotation.y = next.yaw;
        travelled = v.distance - previousDistance;
        v.wheels.forEach((wheel) => (wheel.rotation.x += travelled / 0.52));
        if (v.axle) {
          const ahead = trafficPose(v.distance + 2).yaw;
          v.axle.rotation.y = Math.atan2(
            Math.sin(ahead - next.yaw),
            Math.cos(ahead - next.yaw),
          );
        }
        v.animator.update(time, v.speed, v.speed > 0.02 ? "walk" : "idle");
        v.group.visible =
          Math.hypot(player.x - next.position.x, player.z - next.position.z) <
          90;
      }
      for (const actor of [...passengers, ...porters]) {
        actor.model.visible =
          actor.model.parent !== root ||
          Math.hypot(
            player.x - actor.model.position.x,
            player.z - actor.model.position.z,
          ) < 90;
      }
      for (const p of people) {
        const near = Math.hypot(player.x - p.home.x, player.z - p.home.z) < 60;
        p.model.visible = near;
        if (!near) continue;
        const trafficNear = vehicles.some(
          (v) =>
            v.speed > 0.1 && v.group.position.distanceTo(p.model.position) < 6,
        );
        p.update(time + p.index * 2.3, dt, player, enabled && !trafficNear);
        if (
          p.work &&
          Math.hypot(
            p.model.position.x - p.work.x,
            p.model.position.z - p.work.z,
          ) < 0.4
        ) {
          const arm = p.model.getObjectByName(`${p.source}_RightArm`),
            head = p.model.getObjectByName(`${p.source}_Head`);
          if (arm) {
            arm.rotation.x = -0.8 + Math.sin(time * 1.6 + p.index) * 0.1;
            arm.rotation.z = 0.25;
          }
          if (head) head.rotation.x = 0.13;
        }
      }
      for (const a of animals) {
        const near = Math.hypot(player.x - a.home.x, player.z - a.home.z) < 55;
        a.model.visible = near;
        if (!near) continue;
        const h = a.home,
          t = (elapsed + a.index * 6.3) % 34;
        let target,
          mode = "idle",
          speed = 0;
        if (a.cat) {
          const start = new THREE.Vector3(h.x - 0.8, h.height, h.z + 4),
            edge = new THREE.Vector3(h.x - 0.9, h.height, h.z + 6.9),
            bench = new THREE.Vector3(h.x - 1.55, h.height + 0.52, h.z + 6.9);
          if (t < 8) {
            target = start.clone().lerp(edge, t / 8);
            mode = "walk";
            speed = start.distanceTo(edge) / 8;
          } else if (t < 9) {
            const u = t - 8;
            target = edge.clone().lerp(bench, u);
            target.y += Math.sin(u * Math.PI) * 0.35;
            mode = "jump";
          } else if (t < 24) {
            target = bench;
            mode = t < 12 ? "lick" : t < 21 ? "sleep" : "stretch";
          } else if (t < 25) {
            const u = t - 24;
            target = bench.clone().lerp(edge, u);
            target.y += Math.sin(u * Math.PI) * 0.18;
            mode = "jump";
          } else {
            target = edge.clone().lerp(start, (t - 25) / 9);
            mode = "walk";
            speed = start.distanceTo(edge) / 9;
          }
          const delta = target.clone().sub(a.model.position);
          if (delta.length() > 0.005)
            a.model.rotation.y = dampAngle(
              a.model.rotation.y,
              Math.atan2(delta.x, delta.z),
              8,
              dt,
            );
          a.model.position.copy(target);
        } else {
          const close = Math.hypot(
            player.x - a.model.position.x,
            player.z - a.model.position.z,
          );
          const homeDistance = Math.hypot(player.x - h.x, player.z - h.z);
          target =
            homeDistance < 10 && close < 5
              ? new THREE.Vector3(player.x, 0, player.z)
              : new THREE.Vector3(
                  h.x + Math.sin(elapsed * 0.08 + a.index) * 1.4,
                  0,
                  h.z + 4 + Math.cos(elapsed * 0.08 + a.index) * 2,
                );
          const dx = target.x - a.model.position.x,
            dz = target.z - a.model.position.z,
            d = Math.hypot(dx, dz);
          if (enabled && d > 1.4 && !(close < 1.4)) {
            const step = Math.min(d - 1.2, dt * 0.9),
              next = {
                x: a.model.position.x + (dx / d) * step,
                z: a.model.position.z + (dz / d) * step,
              };
            if (canTraverse(a.model.position, next, obstacles)) {
              a.model.position.x = next.x;
              a.model.position.z = next.z;
              speed = step / dt;
              mode = "walk";
              a.model.rotation.y = dampAngle(
                a.model.rotation.y,
                Math.atan2(dx, dz),
                6,
                dt,
              );
            }
          } else mode = t < 12 ? "sniff" : t < 25 ? "sit" : "idle";
          a.model.position.y = heightAt(a.model.position.x, a.model.position.z);
        }
        a.mode = mode;
        a.animator.update(
          time,
          enabled ? speed : 0,
          enabled ? mode : mode === "walk" ? "idle" : mode,
        );
      }
    },
    state() {
      return {
        residents: people.map((p) => ({
          name: p.model.name,
          position: p.model.position.toArray(),
        })),
        vehicles: vehicles.map((v) => ({
          name: v.name,
          position: v.group.position.toArray(),
          speed: v.speed,
          waiting: v.wait,
          status: v.status,
          stop: stops[v.stopIndex].id,
          action: v.service?.action ?? null,
          completedStops: v.completedStops,
          passenger: v.rider?.model.name ?? null,
        })),
        stops: stops.map((stop) => ({
          id: stop.id,
          queue: stop.queue.map((v) => v.name),
          occupant: stop.occupant?.name ?? null,
          passengers: stop.passengers.map((p) => p.model.name),
        })),
        cargo: cargo.model
          ? { location: cargo.location, carrying: Boolean(cargo.carrier) }
          : null,
        passengers: passengers.map((p) => ({
          name: p.model.name,
          mode: p.mode,
          position: p.model.getWorldPosition(new THREE.Vector3()).toArray(),
        })),
        animals: animals.map((a) => ({
          name: a.model.name,
          position: a.model.position.toArray(),
          mode: a.mode,
        })),
      };
    },
  };
}
