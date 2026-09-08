export const WALK_BOUNDS = { minX: -10.8, maxX: 10.8, minZ: 1.0, maxZ: 10.1 };

export function clampDestination(x, z, bounds = WALK_BOUNDS) {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, z)),
  };
}

export function advance(position, target, speed, dt) {
  const dx = target.x - position.x,
    dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  const step = Math.min(Math.max(0, speed * dt), distance);
  if (distance > 0.0001) {
    position.x += (dx / distance) * step;
    position.z += (dz / distance) * step;
  }
  return step;
}

export function dampAngle(current, target, rate, dt) {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + delta * (1 - Math.exp(-rate * dt));
}
