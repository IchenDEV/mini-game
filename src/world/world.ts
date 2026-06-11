import * as THREE from 'three'
import { ColliderWorld } from './colliders'
import { RNG } from '../utils/rng'
import { clamp, lerp, smoothstep, dist2D } from '../utils/math'
import * as TEX from './textures'

type TexKind = 'plaster' | 'brick' | 'metal' | 'roof' | 'wood' | 'concrete'
const TEX_BUILDERS: Record<TexKind, () => THREE.Texture> = {
  plaster: TEX.plaster, brick: TEX.brick, metal: TEX.metalSiding,
  roof: TEX.roofMetal, wood: TEX.woodPlanks, concrete: TEX.concrete,
}
/** 每张纹理对应的世界尺寸（米） */
const TEX_METERS: Record<TexKind, number> = {
  plaster: 3, brick: 2.3, metal: 2.6, roof: 3, wood: 1.8, concrete: 3,
}

// ---------------- 程序化噪声 ----------------
function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz), b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1)
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1
}
function fbm(x: number, z: number, oct: number): number {
  let v = 0, amp = 0.5, f = 1
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, z * f) * amp
    amp *= 0.5
    f *= 2.03
  }
  return v
}

export interface POI { name: string; x: number; z: number; r: number }
export interface LootPoint { x: number; y: number; z: number; tier: number }
interface Flatten { x: number; z: number; r: number; h: number }
interface MapRect { x: number; z: number; w: number; d: number; color: string }

const WALL_H = 2.9

export class World {
  col: ColliderWorld
  group = new THREE.Group()
  lootPoints: LootPoint[] = []
  pois: POI[] = []
  botSpawns: { x: number; z: number }[] = []
  minimap!: HTMLCanvasElement
  waterY = 0
  half = 400
  play = 368

  private rng = new RNG(20260611)
  private flattens: Flatten[] = []
  private roads: [number, number][][] = []
  private mapRects: MapRect[] = []
  private matCache = new Map<string, THREE.MeshLambertMaterial>()
  private texCache = new Map<string, THREE.Texture>()
  private geoCache = new Map<string, THREE.BoxGeometry>()
  private boxGeo = new THREE.BoxGeometry(1, 1, 1)
  private forests: { x: number; z: number; r: number }[] = []
  bridgeX = 20
  bridgeZ = 0

  constructor() {
    this.col = new ColliderWorld((x, z) => this.groundHeight(x, z))
    this.bridgeZ = this.riverZ(this.bridgeX)

    this.pois = [
      { name: '河畔镇', x: -120, z: -40, r: 62 },
      { name: '军备库', x: 240, z: -120, r: 58 },
      { name: '北货场', x: -60, z: 250, r: 42 },
      { name: '老农场', x: 60, z: -280, r: 44 },
    ]
    this.flattens = [
      { x: -120, z: -40, r: 62, h: 6.2 },
      { x: 240, z: -120, r: 58, h: 14.5 },
      { x: -60, z: 250, r: 42, h: 5.6 },
      { x: 60, z: -280, r: 44, h: 6.4 },
      { x: this.bridgeX, z: this.bridgeZ - 24, r: 15, h: 3.4 },
      { x: this.bridgeX, z: this.bridgeZ + 24, r: 15, h: 3.4 },
    ]
    this.roads = [
      [[60, -380], [60, -285], [35, -180], [20, -60], [20, this.bridgeZ], [-20, 250], [-60, 255], [-110, 300], [-110, 380]],
      [[-360, -40], [-260, -40], [-160, -40], [-120, -45], [-60, -55], [20, -60], [100, -80], [170, -100], [240, -120], [310, -130], [368, -130]],
      [[-120, -45], [-60, -140], [0, -220], [60, -280]],
    ]
    this.forests = [
      { x: -220, z: 150, r: 85 },
      { x: 160, z: 120, r: 70 },
      { x: -250, z: -200, r: 80 },
      { x: 180, z: -260, r: 60 },
      { x: -30, z: 90, r: 45 },
    ]
  }

  riverZ(x: number): number {
    return 140 + Math.sin(x * 0.009) * 34 + Math.sin(x * 0.0028 + 2.0) * 20
  }

  groundHeight(x: number, z: number): number {
    let h = 6 + (fbm(x * 0.0042 + 13.7, z * 0.0042 + 7.1, 4) * 0.5 + 0.5) * 13
    h += fbm(x * 0.02 + 3.1, z * 0.02 + 9.7, 2) * 1.1
    // 东部高地
    const dxd = x - 240, dzd = z + 120
    h += 8 * Math.exp(-(dxd * dxd + dzd * dzd) / (130 * 130))
    // 河流下切
    const dr = Math.abs(z - this.riverZ(x))
    if (dr < 30) h = lerp(h, -1.4, smoothstep(30, 9, dr))
    // POI 压平
    for (const f of this.flattens) {
      const ax = x - f.x, az = z - f.z
      if (ax > f.r || ax < -f.r || az > f.r || az < -f.r) continue
      const d = Math.hypot(ax, az)
      if (d < f.r) h = lerp(h, f.h, smoothstep(f.r, f.r * 0.45, d))
    }
    // 边界山脊
    const rb = Math.max(Math.abs(x), Math.abs(z))
    if (rb > 355) {
      const t = (rb - 355) / 55
      h += t * t * 60
    }
    return h
  }

  roadDist(x: number, z: number): number {
    let best = 1e9
    for (const road of this.roads) {
      for (let i = 0; i < road.length - 1; i++) {
        const [ax, az] = road[i]
        const [bx, bz] = road[i + 1]
        const abx = bx - ax, abz = bz - az
        const len2 = abx * abx + abz * abz
        let t = ((x - ax) * abx + (z - az) * abz) / len2
        t = clamp(t, 0, 1)
        const dx = x - (ax + abx * t), dz = z - (az + abz * t)
        const d2 = dx * dx + dz * dz
        if (d2 < best) best = d2
      }
    }
    return Math.sqrt(best)
  }

  private inPoi(x: number, z: number, pad = 0): boolean {
    for (const p of this.pois) if (dist2D(x, z, p.x, p.z) < p.r + pad) return true
    return false
  }
  private inForest(x: number, z: number): boolean {
    for (const f of this.forests) if (dist2D(x, z, f.x, f.z) < f.r) return true
    return false
  }

  private tex(kind: TexKind): THREE.Texture {
    let t = this.texCache.get(kind)
    if (!t) {
      t = TEX_BUILDERS[kind]()
      this.texCache.set(kind, t)
    }
    return t
  }

  private mat(color: number, kind: TexKind | null = null): THREE.MeshLambertMaterial {
    const key = `${color}|${kind ?? ''}`
    let m = this.matCache.get(key)
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true })
      if (kind) m.map = this.tex(kind)
      this.matCache.set(key, m)
    }
    return m
  }

  /** 按世界尺寸缩放 UV 的盒子几何（带缓存），使贴图密度恒定 */
  private geoSized(w: number, h: number, d: number, meters: number): THREE.BoxGeometry {
    const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${meters}`
    let geo = this.geoCache.get(key)
    if (!geo) {
      geo = new THREE.BoxGeometry(w, h, d)
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute
      const k = 1 / meters
      // BoxGeometry 面序：+x -x +y -y +z -z，每面 4 顶点
      const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
      for (let f = 0; f < 6; f++) {
        const [su, sv] = spans[f]
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v
          uv.setXY(i, uv.getX(i) * su * k, uv.getY(i) * sv * k)
        }
      }
      uv.needsUpdate = true
      this.geoCache.set(key, geo)
    }
    return geo
  }

  /** 通用盒子：y 为底部高度；tk 指定贴图类别 */
  private box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, collide = true, shadow = true, tk: TexKind | null = null): THREE.Mesh {
    let mesh: THREE.Mesh
    if (tk) {
      mesh = new THREE.Mesh(this.geoSized(w, h, d, TEX_METERS[tk]), this.mat(color, tk))
    } else {
      mesh = new THREE.Mesh(this.boxGeo, this.mat(color))
      mesh.scale.set(w, h, d)
    }
    mesh.position.set(x, y + h / 2, z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    this.group.add(mesh)
    if (collide) this.col.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2)
    return mesh
  }

  // ---------------- 建筑 ----------------

  /** 局部坐标盒子构建器（支持 0/90/180/270 旋转） */
  private localBuilder(cx: number, cz: number, rot: number) {
    return (lw: number, lh: number, ld: number, lx: number, ly: number, lz: number, color: number, collide = true, tk: TexKind | null = null) => {
      let w = lw, d = ld, x = lx, z = lz
      if (rot === 1) { w = ld; d = lw; x = lz; z = -lx }
      else if (rot === 2) { x = -lx; z = -lz }
      else if (rot === 3) { w = ld; d = lw; x = -lz; z = lx }
      return this.box(w, lh, d, cx + x, ly, cz + z, color, collide, true, tk)
    }
  }

  private house(cx: number, cz: number, rot: number, tier: number, w = 8, d = 6) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const wallC = this.rng.pick([0xc8b9a2, 0xb9a98f, 0xa9b0b5, 0xbfae93])
    const roofC = this.rng.pick([0x7a4a3a, 0x5d7283, 0x6e5d4a])
    const wallT: TexKind = this.rng.chance(0.45) ? 'brick' : 'plaster'
    const t = 0.28
    const doorW = 1.5, doorH = 2.2
    // 前墙（+d/2）：门居中
    const segW = (w - doorW) / 2
    B(segW, WALL_H, t, -(doorW + segW) / 2, g, d / 2 - t / 2, wallC, true, wallT)
    B(segW, WALL_H, t, (doorW + segW) / 2, g, d / 2 - t / 2, wallC, true, wallT)
    B(doorW, WALL_H - doorH, t, 0, g + doorH, d / 2 - t / 2, wallC, true, wallT)
    // 后墙
    B(w, WALL_H, t, 0, g, -d / 2 + t / 2, wallC, true, wallT)
    // 侧墙
    B(t, WALL_H, d - t * 2, -w / 2 + t / 2, g, 0, wallC, true, wallT)
    B(t, WALL_H, d - t * 2, w / 2 - t / 2, g, 0, wallC, true, wallT)
    // 屋顶 / 地板 / 门廊（视觉）
    B(w + 0.7, 0.22, d + 0.7, 0, g + WALL_H, 0, roofC, true, 'roof')
    B(w - 0.1, 0.1, d - 0.1, 0, g + 0.02, 0, 0x8d8579, false, 'concrete')
    B(w * 0.6, 0.09, 1.5, 0, g + 0.01, d / 2 + 0.8, 0x97907f, false, 'wood')
    // 窗户（视觉）
    B(1.3, 1.0, 0.08, -w / 4, g + 1.2, -d / 2 + 0.06, 0x222a31, false)
    B(0.08, 1.0, 1.2, w / 2 - 0.06, g + 1.2, 0, 0x222a31, false)
    // 室内杂物
    if (this.rng.chance(0.45)) B(0.9, 0.9, 0.9, -w / 4, g + 0.1, -d / 4, 0x8a703f, true, 'wood')
    // 战利品点
    const pts: [number, number][] = [[-w / 4, 0], [w / 4, -d / 5], [0, d / 5], [0, d / 2 + 1.2]]
    for (const [lx, lz] of pts) {
      let x = lx, z = lz
      if (rot === 1) { x = lz; z = -lx } else if (rot === 2) { x = -lx; z = -lz } else if (rot === 3) { x = -lz; z = lx }
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? w : d, d: rot % 2 === 0 ? d : w, color: '#4d5560' })
  }

  private warehouse(cx: number, cz: number, rot: number, tier: number) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const w = 20, d = 12, h = 5, t = 0.3
    const wallC = 0x4a6d96, roofC = 0x39444e
    const doorW = 5, doorH = 4
    // 两端短墙开大门
    for (const sx of [-1, 1]) {
      const segD = (d - doorW) / 2
      B(t, h, segD, sx * (w / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'metal')
      B(t, h, segD, sx * (w / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'metal')
      B(t, h - doorH, doorW, sx * (w / 2 - t / 2), g + doorH, 0, wallC, true, 'metal')
    }
    // 长墙
    B(w - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'metal')
    B(w - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'metal')
    // 屋顶 / 地面
    B(w + 0.8, 0.25, d + 0.8, 0, g + h, 0, roofC, true, 'roof')
    B(w - 0.2, 0.08, d - 0.2, 0, g + 0.02, 0, 0x868c90, false, 'concrete')
    // 货箱
    const crates: [number, number, number][] = [[-6, -3, 1.3], [-5.8, 3.2, 1.3], [-2, -3.5, 1.2], [2.5, 3, 1.4], [6, -2.5, 1.3], [6.5, 2.8, 1.2]]
    for (const [lx, lz, s] of crates) {
      B(s, s, s, lx, g, lz, this.rng.pick([0x8a703f, 0x7a6a50, 0x6f7a55]), true, 'wood')
      if (this.rng.chance(0.4)) B(s * 0.9, s * 0.9, s * 0.9, lx, g + s, lz, 0x8a703f, true, 'wood')
    }
    // 战利品点
    const pts: [number, number][] = [[-7, 0], [-3.5, -3.5], [0, 3.5], [0, 0], [3.5, -3.5], [7, 0], [4, 3.5]]
    for (const [lx, lz] of pts) {
      let x = lx, z = lz
      if (rot === 1) { x = lz; z = -lx } else if (rot === 2) { x = -lx; z = -lz } else if (rot === 3) { x = -lz; z = lx }
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? w : d, d: rot % 2 === 0 ? d : w, color: '#46627f' })
  }

  private container(cx: number, cz: number, rot: number, stack = false) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const c1 = this.rng.pick([0x3f6fa8, 0x2f8a8a, 0x9a5b3c, 0x5d7283, 0x55795e])
    B(6.2, 2.5, 2.5, 0, g, 0, c1, true, 'metal')
    if (stack) {
      const c2 = this.rng.pick([0x3f6fa8, 0x2f8a8a, 0x9a5b3c, 0x5d7283])
      B(6.2, 2.5, 2.5, 0.4, g + 2.5, 0, c2, true, 'metal')
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? 6.2 : 2.5, d: rot % 2 === 0 ? 2.5 : 6.2, color: '#3f618c' })
  }

  private watchtower(cx: number, cz: number, tier: number) {
    const g = this.groundHeight(cx, cz)
    const legC = 0x5d4a36, platC = 0x6e5d4a
    for (const [sx, sz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      this.box(0.3, 3.6, 0.3, cx + sx, g, cz + sz, legC, true, true, 'wood')
    }
    this.box(3.4, 0.25, 3.4, cx, g + 3.6, cz, platC, true, true, 'wood')
    // 护栏
    this.box(3.4, 0.8, 0.12, cx, g + 3.85, cz - 1.65, legC, true, true, 'wood')
    this.box(3.4, 0.8, 0.12, cx, g + 3.85, cz + 1.65, legC, true, true, 'wood')
    this.box(0.12, 0.8, 3.4, cx - 1.65, g + 3.85, cz, legC, true, true, 'wood')
    // 实心台阶楼梯（+x 侧上行）
    const steps = 8
    for (let i = 0; i < steps; i++) {
      const hh = (3.6 / steps) * (i + 1)
      this.box(1.3, hh, 0.62, cx + 2.4, g, cz - 1.55 + i * 0.45, 0x7a6a50, true, true, 'wood')
    }
    this.lootPoints.push({ x: cx, y: g + 3.97, z: cz, tier })
    this.mapRects.push({ x: cx, z: cz, w: 3.4, d: 3.4, color: '#5d4a36' })
  }

  private barn(cx: number, cz: number, rot: number, tier: number) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const w = 14, d = 10, h = 5.4, t = 0.3
    const wallC = 0x7a5a40, roofC = 0x8a4a3a
    const doorW = 4, doorH = 4.2
    for (const sx of [-1, 1]) {
      const segD = (d - doorW) / 2
      B(t, h, segD, sx * (w / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'wood')
      B(t, h, segD, sx * (w / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'wood')
      B(t, h - doorH, doorW, sx * (w / 2 - t / 2), g + doorH, 0, wallC, true, 'wood')
    }
    B(w - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'wood')
    B(w - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'wood')
    B(w + 0.8, 0.25, d + 0.8, 0, g + h, 0, roofC, true, 'roof')
    // 干草垛
    B(1.6, 1.2, 1.6, -3, g, -2, 0xb89a55, true, 'wood')
    B(1.6, 1.2, 1.6, -3, g, 2.2, 0xb89a55, true, 'wood')
    B(1.6, 1.2, 1.6, 3.5, g, 0, 0xb89a55, true, 'wood')
    const pts: [number, number][] = [[-4.5, 0], [-1, -2.5], [1.5, 2.5], [4.5, -1.5], [0, 0]]
    for (const [lx, lz] of pts) {
      let x = lx, z = lz
      if (rot === 1) { x = lz; z = -lx } else if (rot === 2) { x = -lx; z = -lz } else if (rot === 3) { x = -lz; z = lx }
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? w : d, d: rot % 2 === 0 ? d : w, color: '#6e4a38' })
  }

  private silo(cx: number, cz: number) {
    const g = this.groundHeight(cx, cz)
    const geo = new THREE.CylinderGeometry(2.4, 2.4, 8, 10)
    // 筒仓单独 clone 贴图设置环绕重复
    const siloTex = this.tex('metal').clone()
    siloTex.repeat.set(6, 3)
    siloTex.needsUpdate = true
    const siloMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, flatShading: true, map: siloTex })
    const mesh = new THREE.Mesh(geo, siloMat)
    mesh.position.set(cx, g + 4, cz)
    mesh.castShadow = true
    this.group.add(mesh)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.6, 10), this.mat(0x7a8086))
    cap.position.set(cx, g + 8.8, cz)
    cap.castShadow = true
    this.group.add(cap)
    this.col.addCyl(cx, cz, 2.4, g, g + 8)
    this.mapRects.push({ x: cx, z: cz, w: 4.8, d: 4.8, color: '#7d8388' })
  }

  private carWreck(cx: number, cz: number, alongX: boolean) {
    const g = this.groundHeight(cx, cz)
    const bodyC = this.rng.pick([0x6d4a3a, 0x5d6066, 0x47525a, 0x705a30])
    const w = alongX ? 4.3 : 1.8, d = alongX ? 1.8 : 4.3
    this.box(w, 0.9, d, cx, g + 0.35, cz, bodyC)
    const cw = alongX ? 2.1 : 1.6, cd = alongX ? 1.6 : 2.1
    this.box(cw, 0.65, cd, cx, g + 1.25, cz, bodyC, false)
    // 车轮（视觉）
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const wheel = new THREE.Mesh(wg, this.mat(0x1d2125))
      wheel.rotation.z = alongX ? 0 : Math.PI / 2
      wheel.rotation.x = alongX ? Math.PI / 2 : 0
      const ox = alongX ? sx * 1.4 : sx * 0.85
      const oz = alongX ? sz * 0.85 : sz * 1.4
      wheel.position.set(cx + ox, g + 0.36, cz + oz)
      this.group.add(wheel)
    }
    this.col.addBox(cx - w / 2, g, cz - d / 2, cx + w / 2, g + 1.6, cz + d / 2)
    if (this.rng.chance(0.55)) this.lootPoints.push({ x: cx + (alongX ? 0 : 2.2), y: g + 0.12, z: cz + (alongX ? 2.2 : 0), tier: 1 })
  }

  private bridge() {
    const bx = this.bridgeX, bz = this.bridgeZ
    const deckC = 0x8d9296, railC = 0x5d6a74
    // 桥面（可行走）
    this.box(7.2, 0.35, 34, bx, 3.0, bz, deckC, true, true, 'concrete')
    // 护栏
    this.box(0.25, 0.95, 34, bx - 3.45, 3.35, bz, railC, true, true, 'concrete')
    this.box(0.25, 0.95, 34, bx + 3.45, 3.35, bz, railC, true, true, 'concrete')
    // 桥墩
    for (const sz of [-8, 8]) {
      this.box(1.2, 4.8, 1.2, bx - 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
      this.box(1.2, 4.8, 1.2, bx + 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
    }
    this.mapRects.push({ x: bx, z: bz, w: 7.2, d: 34, color: '#888d92' })
  }

  // ---------------- 总构建 ----------------

  build(scene: THREE.Scene) {
    // 独栋房（先注册压平区，再生成地形网格）
    const loneHouses: { x: number; z: number; rot: number }[] = []
    let attempts = 0
    while (loneHouses.length < 8 && attempts++ < 300) {
      const x = this.rng.range(-330, 330), z = this.rng.range(-330, 330)
      if (this.inPoi(x, z, 50)) continue
      if (Math.abs(z - this.riverZ(x)) < 42) continue
      if (this.groundHeight(x, z) < 1) continue
      let ok = true
      for (const lh of loneHouses) if (dist2D(x, z, lh.x, lh.z) < 80) ok = false
      if (!ok) continue
      const h0 = this.groundHeight(x, z)
      this.flattens.push({ x, z, r: 12, h: h0 })
      loneHouses.push({ x, z, rot: this.rng.int(0, 3) })
    }

    this.buildTerrain()
    this.buildWater()
    this.buildVegetation()

    // 河畔镇
    const tx = -120, tz = -40
    const houseDefs: [number, number, number, number, number][] = [
      [-34, -22, 0, 8, 6], [-16, -24, 0, 9, 6], [4, -22, 2, 8, 6], [22, -20, 0, 7, 5.5],
      [-34, 2, 2, 8, 6], [-14, 4, 2, 10, 7], [6, 2, 2, 8, 6], [24, 4, 0, 7, 6],
      [-26, 24, 0, 9, 6.5], [-4, 26, 2, 8, 6], [16, 24, 1, 8, 6], [36, 12, 1, 7, 5.5],
    ]
    for (const [ox, oz, rot, w, d] of houseDefs) this.house(tx + ox, tz + oz, rot, 1, w, d)
    this.warehouse(tx + 2, tz + 44, 0, 1)
    this.carWreck(tx - 8, tz - 44, true)
    this.carWreck(tx + 30, tz - 36, false)

    // 军备库（参考截图的蓝色集装箱区）
    const dx = 240, dz = -120
    this.warehouse(dx - 25, dz - 20, 0, 3)
    this.warehouse(dx + 25, dz + 18, 1, 3)
    const contDefs: [number, number, number, boolean][] = [
      [-20, 8, 0, false], [-12, 8, 0, true], [-4, 8, 0, false], [8, 14, 1, true],
      [16, 14, 1, false], [-18, -10, 0, false], [-8, -14, 0, true], [4, -16, 0, false],
    ]
    for (const [ox, oz, rot, st] of contDefs) this.container(dx + ox, dz + oz, rot, st)
    this.watchtower(dx + 30, dz - 25, 3)
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(4, 30)
      this.lootPoints.push({ x: dx + Math.cos(a) * r, y: this.groundHeight(dx + Math.cos(a) * r, dz + Math.sin(a) * r) + 0.12, z: dz + Math.sin(a) * r, tier: 3 })
    }
    this.carWreck(dx - 42, dz + 2, true)

    // 北货场
    this.warehouse(-80, 245, 0, 2)
    this.warehouse(-45, 265, 1, 2)
    this.warehouse(-42, 228, 0, 2)
    this.container(-62, 250, 1, false)
    this.container(-58, 238, 0, true)
    this.carWreck(-30, 250, true)

    // 老农场
    this.barn(60, -285, 1, 1)
    this.house(40, -262, 0, 1)
    this.house(82, -266, 1, 1, 7, 5.5)
    this.silo(74, -296)
    this.box(1.7, 1.1, 1.7, 48, this.groundHeight(48, -290), -290, 0xb89a55, true, true, 'wood')
    this.box(1.7, 1.1, 1.7, 52, this.groundHeight(52, -278), -278, 0xb89a55, true, true, 'wood')

    // 独栋房
    for (const lh of loneHouses) this.house(lh.x, lh.z, lh.rot, 1)

    // 公路车辆残骸
    const carSpots: [number, number, boolean][] = [
      [62, -340, false], [38, -150, false], [22, -10, false], [16, 110, false],
      [-200, -42, true], [-30, -58, true], [140, -92, true], [290, -126, true], [-90, 280, true],
    ]
    for (const [x, z, ax] of carSpots) {
      if (Math.abs(z - this.riverZ(x)) < 26) continue
      this.carWreck(x + this.rng.range(-2, 2), z + this.rng.range(-2, 2), ax)
    }

    this.bridge()

    // 岩石掩体补充（开阔地带）
    for (let i = 0; i < 14; i++) {
      const x = this.rng.range(-340, 340), z = this.rng.range(-340, 340)
      if (this.inPoi(x, z, 20) || Math.abs(z - this.riverZ(x)) < 36) continue
      const g = this.groundHeight(x, z)
      if (g < 1) continue
      const s = this.rng.range(1.6, 2.8)
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.mat(0x7e7f78))
      rock.position.set(x, g + s * 0.35, z)
      rock.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), 0)
      rock.castShadow = true
      this.group.add(rock)
      this.col.addCyl(x, z, s * 0.8, g, g + s * 1.1)
    }

    // AI 出生点
    for (const p of this.pois) {
      for (let i = 0; i < 6; i++) {
        const a = this.rng.range(0, Math.PI * 2)
        const r = this.rng.range(p.r * 0.3, p.r * 0.85)
        this.botSpawns.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r })
      }
    }
    for (const lh of loneHouses) this.botSpawns.push({ x: lh.x + 6, z: lh.z + 6 })
    for (let i = 0; i < 10; i++) {
      const x = this.rng.range(-300, 300), z = this.rng.range(-300, 300)
      if (Math.abs(z - this.riverZ(x)) < 30) continue
      this.botSpawns.push({ x, z })
    }

    this.renderMinimap()
    scene.add(this.group)
  }

  private buildTerrain() {
    const size = 800, seg = 200
    const geo = new THREE.PlaneGeometry(size, size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const cGrass = new THREE.Color(0x6f8b4f)
    const cGrass2 = new THREE.Color(0x86975a)
    const cDry = new THREE.Color(0x9aa05c)
    const cSand = new THREE.Color(0xc7b483)
    const cRock = new THREE.Color(0x7e7f78)
    const cDirt = new THREE.Color(0xa08868)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const h = this.groundHeight(x, z)
      pos.setY(i, h)
      // 坡度
      const hx = this.groundHeight(x + 2, z)
      const hz = this.groundHeight(x, z + 2)
      const slope = Math.hypot(hx - h, hz - h) / 2
      const n = vnoise(x * 0.045 + 5, z * 0.045 + 11) * 0.5 + 0.5
      tmp.copy(cGrass).lerp(cGrass2, n)
      if (n > 0.72) tmp.lerp(cDry, (n - 0.72) * 2.4)
      if (h < 1.2) tmp.lerp(cSand, clamp((1.2 - h) / 1.6, 0, 1))
      if (slope > 0.5) tmp.lerp(cRock, clamp((slope - 0.5) * 1.4, 0, 0.85))
      const rd = this.roadDist(x, z)
      if (rd < 6) tmp.lerp(cDirt, smoothstep(6, 3, rd) * 0.85)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const detail = TEX.grassDetail()
    detail.repeat.set(150, 150)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    this.group.add(mesh)

    // 天空穹顶（渐变贴图，不受雾影响）
    const skyGeo = new THREE.SphereGeometry(1180, 24, 12)
    const skyMat = new THREE.MeshBasicMaterial({ map: TEX.skyGradient(), side: THREE.BackSide, fog: false, depthWrite: false })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    sky.renderOrder = -10
    this.group.add(sky)

    // 远处云层（几片轻薄横向板）
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xe9eef2, transparent: true, opacity: 0.55, fog: false, depthWrite: false })
    const cloudRng = new RNG(77)
    for (let i = 0; i < 10; i++) {
      const cw = cloudRng.range(120, 300)
      const cd = cloudRng.range(40, 90)
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd), cloudMat)
      cloud.rotation.x = -Math.PI / 2
      const a = cloudRng.range(0, Math.PI * 2)
      const r = cloudRng.range(250, 700)
      cloud.position.set(Math.cos(a) * r, cloudRng.range(165, 240), Math.sin(a) * r)
      cloud.renderOrder = -9
      this.group.add(cloud)
    }
  }

  private buildWater() {
    const geo = new THREE.PlaneGeometry(900, 900)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshLambertMaterial({ color: 0x3f7f96, transparent: true, opacity: 0.85 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = this.waterY
    this.group.add(mesh)
  }

  private buildVegetation() {
    // 树
    const treeMax = 380
    const trunks: THREE.Matrix4[] = []
    const canopies: { m: THREE.Matrix4; c: THREE.Color }[] = []
    const canopyColors = [0x4d6b3a, 0x5a7a40, 0x6b8a4a, 0x46603a, 0x7d8a4d]
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const vs = new THREE.Vector3()
    const vp = new THREE.Vector3()
    let tries = 0
    while (trunks.length < treeMax && tries++ < 2600) {
      const x = this.rng.range(-360, 360), z = this.rng.range(-360, 360)
      const prob = this.inForest(x, z) ? 0.95 : 0.16
      if (!this.rng.chance(prob)) continue
      if (this.roadDist(x, z) < 8) continue
      if (this.inPoi(x, z, 6)) continue
      const h = this.groundHeight(x, z)
      if (h < 0.8) continue
      if (Math.abs(x - this.bridgeX) < 12 && Math.abs(z - this.bridgeZ) < 30) continue
      const s = this.rng.range(0.8, 1.5)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI * 2))
      vp.set(x, h + 1.7, z); vs.set(1, 1, 1)
      trunks.push(m4.clone().compose(vp, q, vs))
      vp.set(x, h + 3.4 + s * 1.1, z); vs.set(s, s * 1.25, s)
      canopies.push({ m: m4.clone().compose(vp, q, vs), c: new THREE.Color(this.rng.pick(canopyColors)) })
      this.col.addCyl(x, z, 0.42, h, h + 3.4)
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 3.4, 5)
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, this.mat(0x6b5236), trunks.length)
    trunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m))
    trunkMesh.castShadow = true
    trunkMesh.frustumCulled = false
    this.group.add(trunkMesh)
    const canGeo = new THREE.IcosahedronGeometry(2.0, 0)
    const canMat = new THREE.MeshLambertMaterial({ flatShading: true })
    const canMesh = new THREE.InstancedMesh(canGeo, canMat, canopies.length)
    canopies.forEach((c, i) => { canMesh.setMatrixAt(i, c.m); canMesh.setColorAt(i, c.c) })
    canMesh.castShadow = true
    canMesh.frustumCulled = false
    this.group.add(canMesh)

    // 灌木
    const bushGeo = new THREE.IcosahedronGeometry(0.8, 0)
    const bushMat = new THREE.MeshLambertMaterial({ flatShading: true })
    const bushCount = 170
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushCount)
    let bi = 0, btries = 0
    const bushColors = [0x44603c, 0x52703f, 0x5d6e3c]
    while (bi < bushCount && btries++ < 1400) {
      const x = this.rng.range(-360, 360), z = this.rng.range(-360, 360)
      if (this.roadDist(x, z) < 6 || this.inPoi(x, z, 2)) continue
      const h = this.groundHeight(x, z)
      if (h < 0.6) continue
      const s = this.rng.range(0.7, 1.6)
      vp.set(x, h + 0.35 * s, z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI * 2))
      vs.set(s, s * 0.65, s)
      bushMesh.setMatrixAt(bi, m4.clone().compose(vp, q, vs))
      bushMesh.setColorAt(bi, new THREE.Color(this.rng.pick(bushColors)))
      bi++
    }
    bushMesh.count = bi
    bushMesh.frustumCulled = false
    this.group.add(bushMesh)

    // 草丛（交叉面片 ×2 个实例化网格）
    const bladeTex = TEX.grassBlades()
    const grassMat = new THREE.MeshLambertMaterial({
      map: bladeTex, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xa8b478,
    })
    const grassGeo = new THREE.PlaneGeometry(1.25, 0.78)
    grassGeo.translate(0, 0.36, 0)
    const GRASS_N = 1000
    const gm1 = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_N)
    const gm2 = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_N)
    let gi = 0, gtries = 0
    const grassTint = new THREE.Color()
    const q2 = new THREE.Quaternion()
    while (gi < GRASS_N && gtries++ < 6000) {
      const x = this.rng.range(-360, 360), z = this.rng.range(-360, 360)
      if (this.roadDist(x, z) < 4.5 || this.inPoi(x, z, 1)) continue
      const h = this.groundHeight(x, z)
      if (h < 0.7) continue
      const yaw = this.rng.range(0, Math.PI)
      const s = this.rng.range(0.7, 1.5)
      vp.set(x, h, z)
      vs.set(s, s * this.rng.range(0.8, 1.25), s)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      gm1.setMatrixAt(gi, m4.clone().compose(vp, q, vs))
      q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2)
      gm2.setMatrixAt(gi, m4.clone().compose(vp, q2, vs))
      grassTint.setHSL(0.21 + this.rng.range(-0.03, 0.04), 0.34, 0.5 + this.rng.range(-0.07, 0.08))
      gm1.setColorAt(gi, grassTint)
      gm2.setColorAt(gi, grassTint)
      gi++
    }
    gm1.count = gi
    gm2.count = gi
    gm1.frustumCulled = false
    gm2.frustumCulled = false
    this.group.add(gm1)
    this.group.add(gm2)

    // 散石
    const rockGeo = new THREE.DodecahedronGeometry(1, 0)
    const rockMat = new THREE.MeshLambertMaterial({ flatShading: true })
    const rockCount = 90
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount)
    let ri = 0, rtries = 0
    const rockColors = [0x7e7f78, 0x8a8a82, 0x6e6f6a]
    while (ri < rockCount && rtries++ < 900) {
      const x = this.rng.range(-360, 360), z = this.rng.range(-360, 360)
      if (this.roadDist(x, z) < 6 || this.inPoi(x, z, 4)) continue
      const h = this.groundHeight(x, z)
      if (h < 0.2) continue
      const s = this.rng.range(0.5, 1.6)
      vp.set(x, h + s * 0.3, z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI * 2))
      vs.set(s, s * this.rng.range(0.5, 0.9), s)
      rockMesh.setMatrixAt(ri, m4.clone().compose(vp, q, vs))
      rockMesh.setColorAt(ri, new THREE.Color(this.rng.pick(rockColors)))
      if (s > 1.0) this.col.addCyl(x, z, s * 0.75, h, h + s * 0.8)
      ri++
    }
    rockMesh.count = ri
    rockMesh.castShadow = true
    rockMesh.frustumCulled = false
    this.group.add(rockMesh)
  }

  private renderMinimap() {
    const N = 384
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(N, N)
    const cGrass = [111, 139, 79], cGrass2 = [134, 151, 90], cSand = [199, 180, 131]
    const cWater = [52, 96, 122], cRock = [126, 127, 120]
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const wx = (px / (N - 1)) * 800 - 400
        const wz = (py / (N - 1)) * 800 - 400
        const h = this.groundHeight(wx, wz)
        let r: number, g: number, b: number
        if (h < this.waterY) {
          r = cWater[0]; g = cWater[1]; b = cWater[2]
        } else {
          const n = vnoise(wx * 0.045 + 5, wz * 0.045 + 11) * 0.5 + 0.5
          r = lerp(cGrass[0], cGrass2[0], n); g = lerp(cGrass[1], cGrass2[1], n); b = lerp(cGrass[2], cGrass2[2], n)
          if (h < 1.2) { const t = clamp((1.2 - h) / 1.6, 0, 1); r = lerp(r, cSand[0], t); g = lerp(g, cSand[1], t); b = lerp(b, cSand[2], t) }
          const hx = this.groundHeight(wx + 2, wz)
          const slope = Math.abs(hx - h) / 2
          if (slope > 0.5) { const t = clamp((slope - 0.5), 0, 0.7); r = lerp(r, cRock[0], t); g = lerp(g, cRock[1], t); b = lerp(b, cRock[2], t) }
          // 高度明暗
          const shade = clamp(0.82 + h * 0.012, 0.8, 1.15)
          r *= shade; g *= shade; b *= shade
        }
        const idx = (py * N + px) * 4
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const w2c = (x: number, z: number): [number, number] => [((x + 400) / 800) * N, ((z + 400) / 800) * N]
    // 道路
    ctx.strokeStyle = '#a8957a'
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    for (const road of this.roads) {
      ctx.beginPath()
      road.forEach(([x, z], i) => {
        const [cx, cz] = w2c(x, z)
        if (i === 0) ctx.moveTo(cx, cz)
        else ctx.lineTo(cx, cz)
      })
      ctx.stroke()
    }
    // 建筑
    for (const rect of this.mapRects) {
      const [cx, cz] = w2c(rect.x, rect.z)
      const w = (rect.w / 800) * N, d = (rect.d / 800) * N
      ctx.fillStyle = rect.color
      ctx.fillRect(cx - w / 2, cz - d / 2, Math.max(w, 2), Math.max(d, 2))
    }
    // POI 标签
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    for (const p of this.pois) {
      const [cx, cz] = w2c(p.x, p.z)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillText(p.name, cx + 1, cz - 7)
      ctx.fillStyle = '#f0ead8'
      ctx.fillText(p.name, cx, cz - 8)
    }
    this.minimap = c
  }
}
