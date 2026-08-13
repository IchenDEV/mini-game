export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** 帧率无关阻尼插值 */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt))

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export const dist2D = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz)

/** 角度差，结果在 [-PI, PI] */
export const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export const dampAngle = (cur: number, target: number, lambda: number, dt: number) =>
  cur + angleDelta(cur, target) * (1 - Math.exp(-lambda * dt))

export const DEG = Math.PI / 180

export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
