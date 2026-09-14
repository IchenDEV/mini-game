import * as THREE from "three";
import { RAILWAY, railDistanceAtX, railPoint } from "./railway.js";

// Stops, moving vehicles, the printed map and boarding animations share these metres.
export const TRANSIT_STOPS = [
  {
    id: "rail_salt",
    mode: "train",
    name: "盐锈巷高架站",
    english: "SALT-RUST EXCHANGE",
    x: -15,
    z: -7,
    height: 0,
  },
  {
    id: "rail_works",
    mode: "train",
    name: "泵厂工人站",
    english: "WORKS UNION HALT",
    x: -43,
    z: -7,
    height: 0,
  },
  {
    id: "air_river",
    mode: "airship",
    name: "河岸系泊塔",
    english: "RIVERSIDE MOORING",
    x: -15,
    z: 19,
    height: 0,
  },
  {
    id: "air_upper",
    mode: "airship",
    name: "学徒院空港",
    english: "FREE AERONAUTS YARD",
    x: -37.8,
    z: 98.5,
    height: 5.4,
  },
];
export const TRANSIT_ROUTES = {
  train: {
    name: "沿岸工人线",
    english: "WORKERS' RAILWAY",
    stops: TRANSIT_STOPS.filter((s) => s.mode === "train"),
    dwell: 16,
    duration: 23,
  },
  airship: {
    name: "自由航工线",
    english: "FREE AERONAUTS",
    stops: TRANSIT_STOPS.filter((s) => s.mode === "airship"),
    dwell: 18,
    duration: 42,
  },
};
export const ease = (t) => t * t * (3 - 2 * t);
export function serviceAt(mode, time) {
  const route = TRANSIT_ROUTES[mode],
    half = route.dwell + route.duration;
  const clock = ((time % (half * 2)) + half * 2) % (half * 2);
  const index = clock < half ? 0 : 1,
    local = clock % half;
  const docked = local < route.dwell;
  return {
    mode,
    index,
    from: route.stops[index],
    to: route.stops[1 - index],
    docked,
    progress: docked ? 0 : ease((local - route.dwell) / route.duration),
    remaining: docked ? route.dwell - local : half - local,
  };
}
export function stopDeck(stop) {
  return stop.mode === "train" ? RAILWAY.headY + 0.64 : stop.height + 7.53;
}
export function liftPoint(stop) {
  return new THREE.Vector3(stop.x, stop.height + 0.04, stop.z);
}
export function airshipDock(stop) {
  return new THREE.Vector3(
    stop.x + 1.56,
    stop.height + 10,
    stop.z - 1.8 - 1.534,
  );
}
const airCurve = new THREE.CatmullRomCurve3([
  airshipDock(TRANSIT_STOPS[2]),
  new THREE.Vector3(-20, 29, 32),
  new THREE.Vector3(-47, 33, 57),
  new THREE.Vector3(-42, 29, 80),
  airshipDock(TRANSIT_STOPS[3]),
]);
export function airshipPose(service) {
  const u = service.index === 0 ? service.progress : 1 - service.progress;
  // Both berths meet the same starboard gangway; the reversible propellers pull either way.
  return {
    position: airCurve.getPointAt(u),
    yaw: 0.16 * Math.sin(u * Math.PI * 2),
  };
}
export function airRoutePoints() {
  return airCurve.getSpacedPoints(40);
}

export function createTransit(transport, player) {
  const clocks = Object.fromEntries(Object.entries(TRANSIT_ROUTES).map(([mode, route]) => {
    const distances = route.stops.map(stop => Math.hypot(stop.x - player.position.x, stop.z - player.position.z));
    return [mode, distances[1] < distances[0] ? route.dwell + route.duration : 0];
  }));
  const coach = transport.train.vehicles.find((v) => v.name === "Coach");
  let waiting = null,
    passenger = null,
    lastArrival = null;
  const seat = new THREE.Vector3(),
    origin = new THREE.Vector3();
  const liftHeights = new Map(
    TRANSIT_STOPS.map((s) => [s.id, s.height + 0.04]),
  );
  function passengerPoint(mode) {
    const root = mode === "train" ? coach.body : transport.airship.root;
    root.updateWorldMatrix(true, true);
    return root.localToWorld(
      seat.set(
        mode === "train" ? 0 : -1.2,
        mode === "train" ? 0.64 : -1.9,
        mode === "train" ? 1.12 : 1.18,
      ),
    );
  }
  function positionVehicles() {
    const rail = serviceAt("train", clocks.train);
    const distance =
      THREE.MathUtils.lerp(
        railDistanceAtX(rail.from.x),
        railDistanceAtX(rail.to.x),
        rail.progress,
      ) - coach.offset;
    transport.train.update(clocks.train, {
      distance,
      direction: rail.index ? 1 : -1,
    });
    transport.airship.update(
      clocks.airship,
      airshipPose(serviceAt("airship", clocks.airship)),
    );
  }
  function startTransfer(stage, stop) {
    origin.copy(player.position);
    passenger = {
      mode: stop.mode,
      stage,
      stop,
      elapsed: 0,
      exitAtNext: true,
      originStop: stop.id,
    };
    waiting = null;
  }
  function transferPose() {
    const p = passenger,
      stop = p.stop,
      dock = passengerPoint(p.mode).clone();
    const ground = liftPoint(stop),
      top = ground.clone().setY(stopDeck(stop));
    const path =
      p.stage === "boarding"
        ? [origin, ground, top, dock]
        : [
            origin,
            top,
            ground,
            ground.clone().add(new THREE.Vector3(0, 0, 0.5)),
          ];
    const duration = [0.8, 3.6, 2.0];
    // Exit crosses the upper gangway before lowering the platform.
    if (p.stage === "exiting") duration.splice(0, 3, 2.0, 3.6, 0.8);
    let elapsed = p.elapsed,
      i = 0;
    while (i < 2 && elapsed > duration[i]) elapsed -= duration[i++];
    const t = ease(Math.min(1, elapsed / duration[i]));
    player.position.lerpVectors(path[i], path[i + 1], t);
    const delta = path[i + 1].clone().sub(path[i]);
    if (Math.hypot(delta.x, delta.z) > 0.01)
      player.rotation.y = Math.atan2(delta.x, delta.z);
    liftHeights.set(
      stop.id,
      i === 1
        ? player.position.y
        : p.stage === "boarding"
          ? i
            ? top.y
            : ground.y
          : i
            ? ground.y
            : top.y,
    );
    if (p.elapsed >= 6.4) {
      if (p.stage === "boarding") {
        p.stage = "riding";
        const route = TRANSIT_ROUTES[p.mode],
          service = serviceAt(p.mode, clocks[p.mode]);
        clocks[p.mode] =
          service.index * (route.dwell + route.duration) + route.dwell - 2;
      } else {
        lastArrival = stop;
        passenger = null;
      }
    }
  }
  positionVehicles();
  return {
    liftHeights,
    request(stopId) {
      const stop = TRANSIT_STOPS.find((s) => s.id === stopId);
      if (
        !stop ||
        passenger ||
        Math.hypot(player.position.x - stop.x, player.position.z - stop.z) >
          1.8 ||
        Math.abs(player.position.y - stop.height) > 0.35
      )
        return false;
      waiting = stop;
      return true;
    },
    cancelWaiting() {
      waiting = null;
    },
    toggleExit() {
      if (passenger?.stage === "riding")
        passenger.exitAtNext = !passenger.exitAtNext;
    },
    reset() {
      waiting = null;
      passenger = null;
    },
    get locked() {
      return !!passenger;
    },
    update(dt, active) {
      const step = active ? Math.min(Math.max(dt, 0), 0.05) : 0;
      for (const mode of ["train", "airship"]) {
        if (!(passenger?.mode === mode && passenger.stage !== "riding"))
          clocks[mode] += step;
      }
      positionVehicles();
      if (waiting && active) {
        if (
          Math.hypot(
            player.position.x - waiting.x,
            player.position.z - waiting.z,
          ) > 2
        )
          waiting = null;
        else {
          const service = serviceAt(waiting.mode, clocks[waiting.mode]);
          if (service.docked && service.from.id === waiting.id)
            startTransfer("boarding", waiting);
        }
      }
      if (passenger) {
        if (passenger.stage === "riding") {
          player.position.copy(passengerPoint(passenger.mode));
          player.rotation.y =
            passenger.mode === "train"
              ? coach.body.rotation.y
              : transport.airship.root.rotation.y;
          const service = serviceAt(passenger.mode, clocks[passenger.mode]);
          if (
            active &&
            service.docked &&
            service.from.id !== passenger.originStop
          ) {
            if (passenger.exitAtNext) startTransfer("exiting", service.from);
            else passenger.originStop = service.from.id;
          }
        } else {
          passenger.elapsed += step;
          transferPose();
        }
      }
      return this.state();
    },
    state() {
      return {
        waiting: waiting?.id ?? null,
        passenger: passenger
          ? {
              mode: passenger.mode,
              stage: passenger.stage,
              stop: passenger.stop.id,
              exitAtNext: passenger.exitAtNext,
            }
          : null,
        services: Object.fromEntries(
          Object.keys(clocks).map((mode) => [
            mode,
            serviceAt(mode, clocks[mode]),
          ]),
        ),
        lastArrival: lastArrival?.id ?? null,
      };
    },
  };
}
