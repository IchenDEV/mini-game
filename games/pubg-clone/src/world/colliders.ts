/**
 * 简化静态碰撞系统：AABB 盒 + 竖直圆柱，配空间哈希网格。
 * 提供圆形推挤（角色）、可站立面高度查询、射线检测（子弹/视线/相机）。
 */
export interface BoxCol {
  kind: 'box'
  id: number
  minx: number; miny: number; minz: number
  maxx: number; maxy: number; maxz: number
  _q: number
}
export interface CylCol {
  kind: 'cyl'
  id: number
  x: number; z: number; r: number; y0: number; y1: number
  _q: number
}
export type Collider = BoxCol | CylCol

export interface RayHit {
  t: number
  x: number; y: number; z: number
  nx: number; ny: number; nz: number
  col: Collider | null
  terrain: boolean
}

const STEP_H = 0.56 // 可自动迈上的台阶高度

export class ColliderWorld {
  private cell = 8
  private grid = new Map<number, Collider[]>()
  private nextId = 1
  private queryId = 0
  private scratch: Collider[] = []

  constructor(public groundH: (x: number, z: number) => number) {}

  private key(cx: number, cz: number): number {
    return (cx + 600) * 4096 + (cz + 600)
  }

  private insert(c: Collider, minx: number, minz: number, maxx: number, maxz: number) {
    const c0x = Math.floor(minx / this.cell), c1x = Math.floor(maxx / this.cell)
    const c0z = Math.floor(minz / this.cell), c1z = Math.floor(maxz / this.cell)
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const k = this.key(cx, cz)
        let arr = this.grid.get(k)
        if (!arr) { arr = []; this.grid.set(k, arr) }
        arr.push(c)
      }
    }
  }

  addBox(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number): BoxCol {
    const c: BoxCol = { kind: 'box', id: this.nextId++, minx, miny, minz, maxx, maxy, maxz, _q: 0 }
    this.insert(c, minx, minz, maxx, maxz)
    return c
  }

  addCyl(x: number, z: number, r: number, y0: number, y1: number): CylCol {
    const c: CylCol = { kind: 'cyl', id: this.nextId++, x, z, r, y0, y1, _q: 0 }
    this.insert(c, x - r, z - r, x + r, z + r)
    return c
  }

  /** 查询圆形范围内的碰撞体（去重），结果写入内部 scratch 数组 */
  queryCircle(x: number, z: number, r: number): Collider[] {
    this.queryId++
    const out = this.scratch
    out.length = 0
    const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell)
    const c0z = Math.floor((z - r) / this.cell), c1z = Math.floor((z + r) / this.cell)
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const arr = this.grid.get(this.key(cx, cz))
        if (!arr) continue
        for (const c of arr) {
          if (c._q !== this.queryId) { c._q = this.queryId; out.push(c) }
        }
      }
    }
    return out
  }

  /** 角色圆柱与静态体推挤，直接修改传入对象的 x/z */
  resolveCircle(p: { x: number; z: number }, feetY: number, headY: number, r: number) {
    for (let iter = 0; iter < 2; iter++) {
      const cols = this.queryCircle(p.x, p.z, r + 0.4)
      let moved = false
      for (const c of cols) {
        if (c.kind === 'box') {
          if (c.maxy <= feetY + STEP_H) continue // 可踩上去，不推
          if (c.miny >= headY - 0.05) continue   // 在头顶上方
          const cx = Math.max(c.minx, Math.min(p.x, c.maxx))
          const cz = Math.max(c.minz, Math.min(p.z, c.maxz))
          let dx = p.x - cx, dz = p.z - cz
          const d2 = dx * dx + dz * dz
          if (d2 > r * r) continue
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2)
            const push = (r - d) / d
            p.x += dx * push
            p.z += dz * push
          } else {
            // 圆心在盒内：沿最小穿透轴推出
            const pl = p.x - c.minx, pr = c.maxx - p.x
            const pb = p.z - c.minz, pf = c.maxz - p.z
            const m = Math.min(pl, pr, pb, pf)
            if (m === pl) p.x = c.minx - r
            else if (m === pr) p.x = c.maxx + r
            else if (m === pb) p.z = c.minz - r
            else p.z = c.maxz + r
          }
          moved = true
        } else {
          if (c.y0 >= headY || c.y1 <= feetY + STEP_H) continue
          const dx = p.x - c.x, dz = p.z - c.z
          const rr = r + c.r
          const d2 = dx * dx + dz * dz
          if (d2 >= rr * rr || d2 < 1e-8) continue
          const d = Math.sqrt(d2)
          const push = (rr - d) / d
          p.x += dx * push
          p.z += dz * push
          moved = true
        }
      }
      if (!moved) break
    }
  }

  /** 脚下可站立高度：地形 + 可踩盒顶 */
  groundAt(x: number, z: number, feetY: number): number {
    let h = this.groundH(x, z)
    const cols = this.queryCircle(x, z, 0.45)
    for (const c of cols) {
      if (c.kind !== 'box') continue
      const m = 0.3
      if (x < c.minx - m || x > c.maxx + m || z < c.minz - m || z > c.maxz + m) continue
      if (c.maxy <= feetY + STEP_H && c.maxy > h) h = c.maxy
    }
    return h
  }

  private rayBox(c: BoxCol, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
    let tmin = -Infinity, tmax = Infinity
    let nx = 0, ny = 0, nz = 0
    const axes: [number, number, number, number][] = [
      [ox, dx, c.minx, c.maxx],
      [oy, dy, c.miny, c.maxy],
      [oz, dz, c.minz, c.maxz],
    ]
    for (let i = 0; i < 3; i++) {
      const [o, d, mn, mx] = axes[i]
      if (Math.abs(d) < 1e-9) {
        if (o < mn || o > mx) return null
        continue
      }
      let t1 = (mn - o) / d
      let t2 = (mx - o) / d
      let sign = -1
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1 }
      if (t1 > tmin) {
        tmin = t1
        nx = i === 0 ? sign : 0; ny = i === 1 ? sign : 0; nz = i === 2 ? sign : 0
      }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) return null
    }
    if (tmax < 0 || tmin < 0 || tmin > maxT) return null // 起点在盒内时不算命中
    return { t: tmin, x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin, nx, ny, nz, col: c, terrain: false }
  }

  private rayCyl(c: CylCol, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
    const rx = ox - c.x, rz = oz - c.z
    const a = dx * dx + dz * dz
    if (a < 1e-9) return null
    const b = 2 * (rx * dx + rz * dz)
    const cc = rx * rx + rz * rz - c.r * c.r
    const disc = b * b - 4 * a * cc
    if (disc < 0) return null
    const t = (-b - Math.sqrt(disc)) / (2 * a)
    if (t < 0 || t > maxT) return null
    const hy = oy + dy * t
    if (hy < c.y0 || hy > c.y1) return null
    const hx = ox + dx * t, hz = oz + dz * t
    let nx = (hx - c.x) / c.r, nz = (hz - c.z) / c.r
    return { t, x: hx, y: hy, z: hz, nx, ny: 0, nz, col: c, terrain: false }
  }

  /**
   * 射线检测：返回最近命中（含地形）。方向需归一化。
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, skipTerrain = false): RayHit | null {
    let best: RayHit | null = null
    let bestT = maxT

    // 沿射线步进收集碰撞体
    this.queryId++
    const step = 4
    for (let t = 0; t <= bestT + step; t += step) {
      const px = ox + dx * t, pz = oz + dz * t
      const c0x = Math.floor((px - 5) / this.cell), c1x = Math.floor((px + 5) / this.cell)
      const c0z = Math.floor((pz - 5) / this.cell), c1z = Math.floor((pz + 5) / this.cell)
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
          const arr = this.grid.get(this.key(cx, cz))
          if (!arr) continue
          for (const c of arr) {
            if (c._q === this.queryId) continue
            c._q = this.queryId
            const hit = c.kind === 'box'
              ? this.rayBox(c, ox, oy, oz, dx, dy, dz, bestT)
              : this.rayCyl(c, ox, oy, oz, dx, dy, dz, bestT)
            if (hit && hit.t < bestT) { best = hit; bestT = hit.t }
          }
        }
      }
      if (t > bestT) break
    }

    if (!skipTerrain) {
      const tHit = this.rayTerrain(ox, oy, oz, dx, dy, dz, bestT)
      if (tHit && tHit.t < bestT) best = tHit
    }
    return best
  }

  private rayTerrain(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
    const coarse = 3
    let prevT = 0
    let prevAbove = oy - this.groundH(ox, oz) > 0
    if (!prevAbove) return null
    for (let t = coarse; t <= maxT + coarse; t += coarse) {
      const tt = Math.min(t, maxT)
      const px = ox + dx * tt, py = oy + dy * tt, pz = oz + dz * tt
      const above = py - this.groundH(px, pz) > 0
      if (!above) {
        // 二分细化
        let lo = prevT, hi = tt
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2
          const my = oy + dy * mid - this.groundH(ox + dx * mid, oz + dz * mid)
          if (my > 0) lo = mid
          else hi = mid
        }
        const ft = (lo + hi) / 2
        const fx = ox + dx * ft, fz = oz + dz * ft
        const e = 0.6
        const hL = this.groundH(fx - e, fz), hR = this.groundH(fx + e, fz)
        const hD = this.groundH(fx, fz - e), hU = this.groundH(fx, fz + e)
        let nx = hL - hR, ny = 2 * e, nz = hD - hU
        const nl = Math.hypot(nx, ny, nz)
        return { t: ft, x: fx, y: oy + dy * ft, z: fz, nx: nx / nl, ny: ny / nl, nz: nz / nl, col: null, terrain: true }
      }
      prevT = tt
      if (tt >= maxT) break
    }
    return null
  }

  /** 两点间是否无遮挡（不含地形以外的角色） */
  losClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const d = Math.hypot(dx, dy, dz)
    if (d < 0.01) return true
    const hit = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.15)
    return hit === null
  }
}

export { STEP_H }
