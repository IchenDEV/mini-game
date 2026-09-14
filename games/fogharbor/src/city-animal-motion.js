import { Vector3 } from "three";

/** Pose the articulated city animal kit. Root translation and heading belong to the caller.
 * update(timeSeconds, speedMetresPerSecond, mode) accepts idle, walk, run, sit,
 * lick, sleep, stretch, sniff, jump. Walk/run support feet cancel root travel at
 * the supplied speed. Call once per frame after moving the root. For jump the
 * caller owns the root's ballistic arc and ground landing; this helper tucks legs.
 */
export function createAnimalAnimator(root) {
  const name = root.name;
  const body = root.getObjectByName(`${name}_Body`);
  if (!body) return { update() {} };
  const neck = root.getObjectByName(`${name}_Neck`);
  const head = root.getObjectByName(`${name}_Head`);
  const tail = root.getObjectByName(`${name}_Tail`);
  const height = root.userData.animalHeight || 0.6;
  const stride = root.userData.stride || 0.25;
  const kind = root.userData.animalKind;
  const legs = ["FrontLeft", "FrontRight", "HindLeft", "HindRight"].map(
    (label, i) => {
      const upper = root.getObjectByName(`${name}_${label}Upper`);
      return {
        upper,
        lower: root.getObjectByName(`${name}_${label}Lower`),
        foot: root.getObjectByName(`${name}_${label}Foot`),
        hip: upper.position.clone(),
        l1: upper.userData.upperLength,
        l2: upper.userData.lowerLength,
        fh: upper.userData.footHeight,
        bend: upper.userData.bendSign,
        offset: [0, 0.5, 0.75, 0.25][i],
        front: i < 2,
      };
    },
  );
  const target = new Vector3();
  let previousTime;
  let phase = 0;
  return {
    update(time, speed = 0, mode = "idle") {
      const dt =
        previousTime === undefined
          ? 0
          : Math.max(0, Math.min(time - previousTime, 0.1));
      previousTime = time;
      const moving = speed > 0.015 && (mode === "walk" || mode === "run");
      const running = mode === "run";
      const stance = running ? 0.48 : 0.64;
      const step = stride * (running ? 1.25 : 1);
      if (moving) phase = (phase + (dt * speed * stance) / step) % 1;
      const sitting = mode === "sit" || mode === "lick";
      const sleeping = mode === "sleep";
      const stretching = mode === "stretch";
      body.position.y =
        -height *
        (sleeping
          ? 0.39
          : sitting
            ? 0.19
            : mode === "sniff"
              ? 0.18
              : moving
                ? running
                  ? 0.13
                  : 0.1
                : 0.035);
      body.rotation.x = sleeping
        ? -0.1
        : sitting
          ? -0.22
          : stretching
            ? 0.19
            : 0;
      body.rotation.z = 0;
      neck.rotation.x = sleeping
        ? 0.65
        : mode === "sniff"
          ? 0.9 + Math.sin(time * 3) * 0.05
          : mode === "lick"
            ? 0.5 + Math.sin(time * 6) * 0.1
            : stretching
              ? 0.3
              : 0.025 * Math.sin(time * 1.8);
      head.rotation.y = sleeping
        ? 0.28
        : mode === "lick"
          ? 0.23
          : Math.sin(time * 0.67) * (moving ? 0.025 : 0.14);
      head.rotation.x = mode === "sniff" ? 0.17 : sleeping ? 0.12 : 0;
      tail.rotation.y =
        Math.sin(time * (kind === "dog" ? 5 : 1.7)) *
        (kind === "dog" && !sleeping ? 0.24 : 0.07);
      tail.rotation.x = sleeping ? -0.63 : sitting ? 0.18 : 0;
      root.updateMatrixWorld(true);
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const p = (phase + (running ? [0, 0.5, 0.5, 0][i] : leg.offset)) % 1;
        let z = leg.hip.z;
        let y = leg.fh;
        if (moving) {
          if (p < stance) z += step * (0.5 - p / stance);
          else {
            const swing = (p - stance) / (1 - stance);
            z += step * (-0.5 + swing * swing * (3 - 2 * swing));
            y += Math.sin(Math.PI * swing) * height * (running ? 0.2 : 0.12);
          }
        } else if (sitting) {
          z += leg.front ? stride * 0.18 : stride * 0.5;
          if (mode === "lick" && i === 0) {
            y += height * (0.5 + Math.sin(time * 6) * 0.025);
            z += stride * 0.45;
          }
        } else if (sleeping) z += leg.front ? -stride * 0.35 : stride * 0.5;
        else if (stretching) z += leg.front ? stride * 0.45 : -stride * 0.25;
        else if (mode === "jump") y += height * 0.22;
        target.set(leg.hip.x, y, z);
        body.worldToLocal(root.localToWorld(target));
        const dy = target.y - leg.hip.y;
        const dz = target.z - leg.hip.z;
        const distance = Math.max(
          0.0001,
          Math.min(Math.hypot(dy, dz), leg.l1 + leg.l2 - 0.00001),
        );
        const direction = Math.atan2(dz, -dy);
        const bend = Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (distance * distance - leg.l1 * leg.l1 - leg.l2 * leg.l2) /
                (2 * leg.l1 * leg.l2),
            ),
          ),
        );
        const shoulder = Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (distance * distance + leg.l1 * leg.l1 - leg.l2 * leg.l2) /
                (2 * distance * leg.l1),
            ),
          ),
        );
        leg.upper.rotation.x = -(direction + leg.bend * shoulder);
        leg.lower.rotation.x = leg.bend * bend;
        leg.foot.rotation.x =
          -leg.upper.rotation.x - leg.lower.rotation.x - body.rotation.x;
      }
    },
  };
}
