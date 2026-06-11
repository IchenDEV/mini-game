import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ColliderWorld } from './colliders'
import { RNG } from '../utils/rng'
import { clamp, lerp, smoothstep, dist2D } from '../utils/math'
import * as TEX from './textures'
import type { MapConfig, PoiDef } from './mapConfig'
import type { BiomeDef } from './biome'

type TexKind = 'plaster' | 'brick' | 'metal' | 'roof' | 'wood' | 'concrete' | 'bark' | 'leaves' | 'rooftiles' | 'leafLitter' | 'gravelPatch'
const TEX_BUILDERS: Record<TexKind, () => THREE.Texture> = {
  plaster: TEX.plaster, brick: TEX.brick, metal: TEX.metalSiding,
  roof: TEX.roofMetal, wood: TEX.woodPlanks, concrete: TEX.concrete,
  bark: TEX.bark, leaves: TEX.leaves, rooftiles: TEX.roofTiles,
  leafLitter: TEX.leafLitter, gravelPatch: TEX.gravelPatch,
}
/** 每张纹理对应的世界尺寸（米） */
const TEX_METERS: Record<TexKind, number> = {
  plaster: 3, brick: 2.3, metal: 2.6, roof: 3, wood: 1.8, concrete: 3,
  bark: 2, leaves: 1, rooftiles: 2.4, leafLitter: 2, gravelPatch: 2,
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

export interface POI { name: string; x: number; z: number; r: number; tier: number; kind: string }
export interface LootPoint { x: number; y: number; z: number; tier: number; fixedItem?: string }
interface Flatten { x: number; z: number; r: number; h: number }
interface MapRect { x: number; z: number; w: number; d: number; color: string }

const WALL_H = 2.9

export class World {
  cfg: MapConfig
  biome: BiomeDef
  col: ColliderWorld
  group = new THREE.Group()
  lootPoints: LootPoint[] = []
  pois: POI[] = []
  botSpawns: { x: number; z: number }[] = []
  vehicleSpawns: { x: number; z: number; yaw: number }[] = []
  minimap!: HTMLCanvasElement
  waterY = 0
  half = 1260
  play = 1220
  /** 天空穹顶（跟随玩家，避免地图边缘看到穹顶变形） */
  sky: THREE.Mesh | null = null
  /** 风场时间（草摆动 shader uniform），由 Game 每帧推进 */
  windT = { value: 0 }

  private rng: RNG
  private flattens: Flatten[] = []
  private roads: [number, number][][] = []
  private roadBBs: { minX: number; minZ: number; maxX: number; maxZ: number; ax: number; az: number; bx: number; bz: number }[] = []
  private mapRects: MapRect[] = []
  private matCache = new Map<string, THREE.MeshLambertMaterial>()
  private texCache = new Map<string, THREE.Texture>()
  private geoCache = new Map<string, THREE.BoxGeometry>()
  private boxGeo = new THREE.BoxGeometry(1, 1, 1)
  private forests: { x: number; z: number; r: number }[] = []
  /** 树根接触阴影点（buildVegetation 收集，buildContactAO 生成） */
  private treeAOPts: { x: number; z: number; r: number }[] = []

  // 统一高度场：渲染地形与物理/摆放共用，保证完全贴合
  private hf: Float32Array | null = null
  private readonly hfN = 512
  private hfStep = 0

  // 动态草丛：只在玩家周围按确定性散列生成（避免全图实例被大地图稀释）
  private grass1: THREE.InstancedMesh | null = null
  private grass2: THREE.InstancedMesh | null = null
  private grassCap = 0
  private grassPerCell = 0
  private readonly grassCell = 24
  private readonly grassR = 9
  private grassLastCx = 1e9
  private grassLastCz = 1e9

  constructor(cfg: MapConfig) {
    this.cfg = cfg
    this.biome = cfg.biome
    this.rng = new RNG(cfg.seed)
    this.half = cfg.half
    this.play = cfg.half - 40
    this.waterY = cfg.biome.waterY
    this.col = new ColliderWorld((x, z) => this.groundHeight(x, z))
    this.roads = cfg.roads
    this.forests = cfg.forests
    // 道路段包围盒缓存（加速 roadDist）
    for (const road of this.roads) {
      for (let i = 0; i < road.length - 1; i++) {
        const [ax, az] = road[i]
        const [bx, bz] = road[i + 1]
        this.roadBBs.push({
          minX: Math.min(ax, bx) - 10, maxX: Math.max(ax, bx) + 10,
          minZ: Math.min(az, bz) - 10, maxZ: Math.max(az, bz) + 10,
          ax, az, bx, bz,
        })
      }
    }
    // POI 压平区（取生成前的原始地形高度）
    this.pois = cfg.pois.map(p => ({ name: p.name, x: p.x, z: p.z, r: p.r, tier: p.tier, kind: p.kind }))
    for (const p of cfg.pois) {
      const raw = this.groundHeight(p.x, p.z)
      this.flattens.push({ x: p.x, z: p.z, r: p.r, h: Math.max(raw, this.waterY + 1.2) })
    }
    // 桥头压平
    if (cfg.river) {
      for (const bx of cfg.bridges) {
        const bz = this.riverZ(bx)
        const w = cfg.river.width
        this.flattens.push({ x: bx, z: bz - w - 6, r: 16, h: 3.4 })
        this.flattens.push({ x: bx, z: bz + w + 6, r: 16, h: 3.4 })
      }
    }
  }

  riverZ(x: number): number {
    const r = this.cfg.river
    if (!r) return 1e9
    return r.z0 + Math.sin(x * r.f1) * r.a1 + Math.sin(x * r.f2 + r.p2) * r.a2
  }

  /**
   * 运行时高度查询：在高度场上做与地形网格同剖分的三角形插值。
   * 高度场建立前（构建期注册压平区时）退回解析噪声。
   */
  groundHeight(x: number, z: number): number {
    const hf = this.hf
    if (!hf) return this.groundHeightRaw(x, z)
    const N = this.hfN
    const fx = clamp((x + this.half) / this.hfStep, 0, N - 1e-6)
    const fz = clamp((z + this.half) / this.hfStep, 0, N - 1e-6)
    const ix = fx | 0, iz = fz | 0
    const tx = fx - ix, tz = fz - iz
    const i0 = iz * (N + 1) + ix
    const hA = hf[i0], hD = hf[i0 + 1]
    const hB = hf[i0 + N + 1], hC = hf[i0 + N + 2]
    // PlaneGeometry 的 quad 剖分为 (A,B,D)+(B,C,D)，对角线 B—D
    if (tx + tz <= 1) return hA + (hD - hA) * tx + (hB - hA) * tz
    return hC + (hB - hC) * (1 - tx) + (hD - hC) * (1 - tz)
  }

  private buildHeightField() {
    const N = this.hfN
    this.hfStep = (this.half * 2) / N
    const hf = new Float32Array((N + 1) * (N + 1))
    for (let iz = 0; iz <= N; iz++) {
      const z = -this.half + iz * this.hfStep
      for (let ix = 0; ix <= N; ix++) {
        hf[iz * (N + 1) + ix] = this.groundHeightRaw(-this.half + ix * this.hfStep, z)
      }
    }
    this.hf = hf
  }

  private groundHeightRaw(x: number, z: number): number {
    const b = this.biome
    let h = b.baseH + (fbm(x * b.hillFreq + 13.7, z * b.hillFreq + 7.1, 4) * 0.5 + 0.5) * b.hillAmp
    h += fbm(x * 0.02 + 3.1, z * 0.02 + 9.7, 2) * b.detailAmp
    // 沙漠：长波沙丘 + 岩石台地（形成峡谷）
    if (b.duneAmp > 0) {
      h += Math.abs(fbm(x * 0.0012 + 71, z * 0.0009 + 23, 2)) * b.duneAmp
      const m = fbm(x * 0.0011 + 50, z * 0.0011 + 90, 2)
      if (m > 0.22) h += smoothstep(0.22, 0.52, m) * 24
    }
    // 河流/干河床下切
    const r = this.cfg.river
    if (r) {
      const dr = Math.abs(z - this.riverZ(x))
      if (dr < r.width) h = lerp(h, -1.4, smoothstep(r.width, r.width * 0.3, dr))
    }
    // POI 压平
    for (const f of this.flattens) {
      const ax = x - f.x, az = z - f.z
      if (ax > f.r || ax < -f.r || az > f.r || az < -f.r) continue
      const d = Math.hypot(ax, az)
      if (d < f.r) h = lerp(h, f.h, smoothstep(f.r, f.r * 0.45, d))
    }
    // 边界山脊
    const rb = Math.max(Math.abs(x), Math.abs(z))
    const edge = this.half - 60
    if (rb > edge) {
      const t = (rb - edge) / 80
      h += t * t * 80
    }
    return h
  }

  roadDist(x: number, z: number): number {
    let best = 1e9
    for (const s of this.roadBBs) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) {
        // 包围盒外仍可能比 best 近，做粗下界检查
        const dx = x < s.minX ? s.minX - x : x > s.maxX ? x - s.maxX : 0
        const dz = z < s.minZ ? s.minZ - z : z > s.maxZ ? z - s.maxZ : 0
        if (dx * dx + dz * dz > best) continue
      }
      const abx = s.bx - s.ax, abz = s.bz - s.az
      const len2 = abx * abx + abz * abz || 1
      let t = ((x - s.ax) * abx + (z - s.az) * abz) / len2
      t = clamp(t, 0, 1)
      const dx = x - (s.ax + abx * t), dz = z - (s.az + abz * t)
      const d2 = dx * dx + dz * dz
      if (d2 < best) best = d2
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
  private nearRiver(x: number, z: number, pad: number): boolean {
    if (!this.cfg.river) return false
    return Math.abs(z - this.riverZ(x)) < this.cfg.river.width + pad
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

  // ---------------- 建筑构件 ----------------

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

  private rotPt(lx: number, lz: number, rot: number): [number, number] {
    if (rot === 1) return [lz, -lx]
    if (rot === 2) return [-lx, -lz]
    if (rot === 3) return [-lz, lx]
    return [lx, lz]
  }

  private pickWallTex(): TexKind {
    const b = this.biome.wallTexBias
    const r = this.rng.next()
    if (r < b.brick) return 'brick'
    if (r < b.brick + b.plaster) return 'plaster'
    return 'wood'
  }

  /** 人字坡屋顶：双坡瓦面 + 屋脊 + 三角山墙（纯视觉，碰撞由檐口平板承担） */
  private gableRoof(cx: number, cz: number, rot: number, w: number, d: number, y: number, roofC: number, wallC: number) {
    const grp = new THREE.Group()
    const rise = Math.min(1.9, d * 0.3)
    const half = d / 2 + 0.4
    const slopeLen = Math.hypot(half, rise) + 0.12
    const ang = Math.atan2(rise, half)
    const roofMat = this.mat(roofC, 'rooftiles')
    for (const s of [-1, 1]) {
      const panel = new THREE.Mesh(this.geoSized(w + 0.9, 0.13, slopeLen, TEX_METERS.rooftiles), roofMat)
      panel.rotation.x = s * ang
      panel.position.set(0, rise / 2, (s * half) / 2)
      panel.castShadow = true
      panel.receiveShadow = true
      grp.add(panel)
    }
    const ridge = new THREE.Mesh(this.geoSized(w + 1.0, 0.17, 0.45, TEX_METERS.rooftiles), roofMat)
    ridge.position.y = rise + 0.02
    ridge.castShadow = true
    grp.add(ridge)
    const tri = new THREE.Shape()
    tri.moveTo(-d / 2, 0)
    tri.lineTo(d / 2, 0)
    tri.lineTo(0, rise)
    tri.closePath()
    const triGeo = new THREE.ShapeGeometry(tri)
    const gableMat = new THREE.MeshLambertMaterial({ color: wallC, map: this.tex('plaster'), side: THREE.DoubleSide })
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(triGeo, gableMat)
      m.rotation.y = s * Math.PI / 2
      m.position.set(s * (w / 2 - 0.04), 0.02, 0)
      m.castShadow = true
      grp.add(m)
    }
    grp.rotation.y = rot * Math.PI / 2
    grp.position.set(cx, y, cz)
    this.group.add(grp)
  }

  private house(cx: number, cz: number, rot: number, tier: number, w = 8, d = 6) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const wallC = this.rng.pick(this.biome.houseWalls)
    const roofC = this.rng.pick(this.biome.houseRoofs)
    const wallT = this.pickWallTex()
    const t = 0.28
    const doorW = 1.5, doorH = 2.2
    const segW = (w - doorW) / 2
    B(segW, WALL_H, t, -(doorW + segW) / 2, g, d / 2 - t / 2, wallC, true, wallT)
    B(segW, WALL_H, t, (doorW + segW) / 2, g, d / 2 - t / 2, wallC, true, wallT)
    B(doorW, WALL_H - doorH, t, 0, g + doorH, d / 2 - t / 2, wallC, true, wallT)
    B(w, WALL_H, t, 0, g, -d / 2 + t / 2, wallC, true, wallT)
    B(t, WALL_H, d - t * 2, -w / 2 + t / 2, g, 0, wallC, true, wallT)
    B(t, WALL_H, d - t * 2, w / 2 - t / 2, g, 0, wallC, true, wallT)
    B(w + 0.5, 0.2, d + 0.5, 0, g + WALL_H, 0, new THREE.Color(roofC).multiplyScalar(0.75).getHex(), true, 'wood')
    this.gableRoof(cx, cz, rot, w, d, g + WALL_H + 0.2, roofC, wallC)
    B(w - 0.1, 0.1, d - 0.1, 0, g + 0.02, 0, 0x8d8579, false, 'concrete')
    B(w * 0.6, 0.09, 1.5, 0, g + 0.01, d / 2 + 0.8, 0x97907f, false, 'wood')
    // 窗：白框 + 玻璃 + 竖梃 + 凸出窗台
    const frameC = 0xe2dccb
    // 北墙窗（朝 -z）
    B(1.5, 1.18, 0.07, -w / 4, g + 1.11, -d / 2 + 0.045, frameC, false)
    B(1.3, 1.0, 0.1, -w / 4, g + 1.2, -d / 2 + 0.04, 0x222a31, false)
    B(0.06, 1.0, 0.12, -w / 4, g + 1.2, -d / 2 + 0.035, frameC, false)
    B(1.62, 0.1, 0.26, -w / 4, g + 1.0, -d / 2 + 0.1, frameC, false)
    // 东墙窗（朝 +x）
    B(0.07, 1.18, 1.4, w / 2 - 0.045, g + 1.11, 0, frameC, false)
    B(0.1, 1.0, 1.2, w / 2 - 0.04, g + 1.2, 0, 0x222a31, false)
    B(0.12, 1.0, 0.06, w / 2 - 0.035, g + 1.2, 0, frameC, false)
    B(0.26, 0.1, 1.52, w / 2 - 0.1, g + 1.0, 0, frameC, false)
    // 烟囱：砖柱 + 顶帽 + 囱口
    if (this.rng.chance(0.65)) {
      const rise = Math.min(1.9, d * 0.3)
      const chH = rise + 1.25
      B(0.62, chH, 0.62, w * 0.28, g + WALL_H + 0.2, 0.45, 0x96705a, true, 'brick')
      B(0.8, 0.14, 0.8, w * 0.28, g + WALL_H + 0.2 + chH, 0.45, 0x756a60, false)
      B(0.4, 0.16, 0.4, w * 0.28, g + WALL_H + 0.34 + chH, 0.45, 0x26262a, false)
    }
    if (this.rng.chance(0.45)) B(0.9, 0.9, 0.9, -w / 4, g + 0.1, -d / 4, 0x8a703f, true, 'wood')
    const pts: [number, number][] = [[-w / 4, 0], [w / 4, -d / 5], [0, d / 5], [0, d / 2 + 1.2]]
    for (const [lx, lz] of pts) {
      const [x, z] = this.rotPt(lx, lz, rot)
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? w : d, d: rot % 2 === 0 ? d : w, color: '#4d5560' })
  }

  private warehouse(cx: number, cz: number, rot: number, tier: number) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    const w = 20, d = 12, h = 5, t = 0.3
    const wallC = this.biome.id === 'desert' ? 0x9a7d52 : this.biome.id === 'jungle' ? 0x5d7055 : 0x4a6d96
    const roofC = 0x39444e
    const doorW = 5, doorH = 4
    for (const sx of [-1, 1]) {
      const segD = (d - doorW) / 2
      B(t, h, segD, sx * (w / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'metal')
      B(t, h, segD, sx * (w / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'metal')
      B(t, h - doorH, doorW, sx * (w / 2 - t / 2), g + doorH, 0, wallC, true, 'metal')
    }
    B(w - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'metal')
    B(w - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'metal')
    B(w + 0.8, 0.25, d + 0.8, 0, g + h, 0, roofC, true, 'roof')
    B(w - 0.2, 0.08, d - 0.2, 0, g + 0.02, 0, 0x868c90, false, 'concrete')
    const crates: [number, number, number][] = [[-6, -3, 1.3], [-5.8, 3.2, 1.3], [-2, -3.5, 1.2], [2.5, 3, 1.4], [6, -2.5, 1.3], [6.5, 2.8, 1.2]]
    for (const [lx, lz, s] of crates) {
      B(s, s, s, lx, g, lz, this.rng.pick([0x8a703f, 0x7a6a50, 0x6f7a55]), true, 'wood')
      if (this.rng.chance(0.4)) B(s * 0.9, s * 0.9, s * 0.9, lx, g + s, lz, 0x8a703f, true, 'wood')
    }
    const pts: [number, number][] = [[-7, 0], [-3.5, -3.5], [0, 3.5], [0, 0], [3.5, -3.5], [7, 0], [4, 3.5]]
    for (const [lx, lz] of pts) {
      const [x, z] = this.rotPt(lx, lz, rot)
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
    this.box(3.4, 0.8, 0.12, cx, g + 3.85, cz - 1.65, legC, true, true, 'wood')
    this.box(3.4, 0.8, 0.12, cx, g + 3.85, cz + 1.65, legC, true, true, 'wood')
    this.box(0.12, 0.8, 3.4, cx - 1.65, g + 3.85, cz, legC, true, true, 'wood')
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
    B(1.6, 1.2, 1.6, -3, g, -2, 0xb89a55, true, 'wood')
    B(1.6, 1.2, 1.6, -3, g, 2.2, 0xb89a55, true, 'wood')
    B(1.6, 1.2, 1.6, 3.5, g, 0, 0xb89a55, true, 'wood')
    const pts: [number, number][] = [[-4.5, 0], [-1, -2.5], [1.5, 2.5], [4.5, -1.5], [0, 0]]
    for (const [lx, lz] of pts) {
      const [x, z] = this.rotPt(lx, lz, rot)
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    this.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? w : d, d: rot % 2 === 0 ? d : w, color: '#6e4a38' })
  }

  private silo(cx: number, cz: number) {
    const g = this.groundHeight(cx, cz)
    const geo = new THREE.CylinderGeometry(2.4, 2.4, 8, 10)
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

  /** 加油站：顶棚 + 油泵 + 小卖部 */
  private gasStation(cx: number, cz: number, rot: number, tier: number) {
    const g = this.groundHeight(cx, cz)
    const B = this.localBuilder(cx, cz, rot)
    // 顶棚
    for (const [lx, lz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) {
      B(0.45, 4.6, 0.45, lx, g, lz, 0x8d9296, true, 'concrete')
    }
    B(14, 0.4, 9, 0, g + 4.6, 0, 0xb8483a, true, 'roof')
    B(13.9, 0.06, 8.9, 0, g + 0.02, 0, 0x8c9094, false, 'concrete')
    // 油泵
    for (const lx of [-2.5, 2.5]) {
      B(0.9, 1.5, 0.6, lx, g, 0, 0xb8483a, true, 'metal')
      B(1.1, 0.12, 0.8, lx, g + 1.5, 0, 0x8d9296, false)
    }
    // 小卖部
    const shopX = 12
    B(7, WALL_H, 5, shopX, g, 0, this.rng.pick(this.biome.houseWalls), true, this.pickWallTex())
    B(7.6, 0.22, 5.6, shopX, g + WALL_H, 0, 0x5d7283, true, 'roof')
    const pts: [number, number][] = [[-2.5, 1.8], [2.5, -1.8], [0, 0], [shopX, 3.5]]
    for (const [lx, lz] of pts) {
      const [x, z] = this.rotPt(lx, lz, rot)
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
    }
    // 加油站必出汽油桶
    for (const [lx, lz] of [[-4.2, -1.2], [4.2, 1.2]] as [number, number][]) {
      const [x, z] = this.rotPt(lx, lz, rot)
      this.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier, fixedItem: 'fuelcan' })
    }
    this.mapRects.push({ x: cx, z: cz, w: 14, d: 9, color: '#8c5046' })
  }

  /** 废墟：断墙阵列 */
  private ruins(cx: number, cz: number, r: number, tier: number) {
    const wallC = this.biome.id === 'desert' ? 0xc2ae8a : 0x9a8d7a
    const n = 10 + this.rng.int(0, 5)
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = this.rng.range(r * 0.12, r * 0.8)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      const g = this.groundHeight(x, z)
      const len = this.rng.range(3, 7.5)
      const h = this.rng.range(1.1, 2.8)
      const along = this.rng.chance(0.5)
      this.box(along ? len : 0.45, h, along ? 0.45 : len, x, g, z, wallC, true, true, 'brick')
      // 偶发 L 形
      if (this.rng.chance(0.4)) {
        const l2 = this.rng.range(2, 4)
        this.box(along ? 0.45 : l2, h * 0.8, along ? l2 : 0.45, x + (along ? len / 2 : l2 / 2 - 0.2), g, z + (along ? l2 / 2 : len / 2), wallC, true, true, 'brick')
      }
    }
    // 中央祭坛/基座（高级物资）
    const g0 = this.groundHeight(cx, cz)
    this.box(4, 0.7, 4, cx, g0, cz, 0x8d8478, true, true, 'concrete')
    const lootN = 4 + tier * 2
    for (let i = 0; i < lootN; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = this.rng.range(0, r * 0.7)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      this.lootPoints.push({ x, y: this.groundHeight(x, z) + 0.12, z, tier })
    }
    this.lootPoints.push({ x: cx, y: g0 + 0.82, z: cz, tier: Math.min(3, tier + 1) })
    this.mapRects.push({ x: cx, z: cz, w: r * 1.2, d: r * 1.2, color: '#8a8276' })
  }

  /** 营地：帐篷 + 篝火 + 木箱 */
  private camp(cx: number, cz: number, r: number, tier: number) {
    const tentGeo = new THREE.ConeGeometry(2.1, 2.2, 4)
    const tentC = [0x6e7a55, 0x7a6e50, 0x5d6e5d]
    const n = 4 + this.rng.int(0, 2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.3, 0.3)
      const d = this.rng.range(r * 0.3, r * 0.62)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      const g = this.groundHeight(x, z)
      const tent = new THREE.Mesh(tentGeo, this.mat(this.rng.pick(tentC)))
      tent.position.set(x, g + 1.1, z)
      tent.rotation.y = this.rng.range(0, Math.PI)
      tent.castShadow = true
      this.group.add(tent)
      this.col.addCyl(x, z, 1.7, g, g + 2.0)
      this.lootPoints.push({ x: x + Math.cos(a) * 2.4, y: this.groundHeight(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4) + 0.12, z: z + Math.sin(a) * 2.4, tier })
    }
    // 篝火
    const g0 = this.groundHeight(cx, cz)
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 8), this.mat(0x2d2a26))
    fire.position.set(cx, g0 + 0.12, cz)
    this.group.add(fire)
    // 木箱
    for (let i = 0; i < 3; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(2, r * 0.5)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      this.box(1.2, 1.2, 1.2, x, this.groundHeight(x, z), z, 0x8a703f, true, true, 'wood')
    }
    if (tier >= 2) this.watchtower(cx + r * 0.7, cz, tier)
    this.lootPoints.push({ x: cx + 1.8, y: g0 + 0.12, z: cz, tier })
    this.mapRects.push({ x: cx, z: cz, w: r, d: r, color: '#5d6e4d' })
  }

  /** 高脚竹屋群（雨林） */
  private huts(cx: number, cz: number, r: number, tier: number) {
    const n = 4 + this.rng.int(0, 2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.4, 0.4)
      const d = this.rng.range(r * 0.25, r * 0.7)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      const g = this.groundHeight(x, z)
      const rot = this.rng.int(0, 3)
      const B = this.localBuilder(x, z, rot)
      const deckH = 1.6
      // 立柱
      for (const [lx, lz] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) {
        B(0.28, deckH, 0.28, lx, g, lz, 0x6e5a40, true, 'wood')
      }
      // 平台
      B(5.4, 0.25, 4.2, 0, g + deckH, 0, 0x8a7350, true, 'wood')
      // 三面墙（正面开放）
      B(5.0, 2.1, 0.22, 0, g + deckH + 0.25, -1.85, 0x9a8258, true, 'wood')
      B(0.22, 2.1, 3.6, -2.45, g + deckH + 0.25, 0, 0x9a8258, true, 'wood')
      B(0.22, 2.1, 3.6, 2.45, g + deckH + 0.25, 0, 0x9a8258, true, 'wood')
      // 茅草顶
      B(6.0, 0.3, 4.8, 0, g + deckH + 2.45, 0, 0x7d7044, true, 'wood')
      // 上台阶
      const steps = 4
      for (let s = 0; s < steps; s++) {
        const hh = (deckH / steps) * (s + 1)
        B(1.1, hh, 0.5, 0, g, 2.4 - s * 0.5, 0x7a6448, true, 'wood')
      }
      const [lx2, lz2] = this.rotPt(0, -0.5, rot)
      this.lootPoints.push({ x: x + lx2, y: g + deckH + 0.4, z: z + lz2, tier })
      this.mapRects.push({ x, z, w: 5.4, d: 4.2, color: '#7d6a48' })
    }
    // 中心晒场 + 货箱
    const g0 = this.groundHeight(cx, cz)
    this.box(1.3, 1.0, 1.3, cx + 1.5, g0, cz, 0x8a703f, true, true, 'wood')
    this.lootPoints.push({ x: cx, y: g0 + 0.12, z: cz, tier })
  }

  /** 镇子：房屋网格 + 仓库 */
  private town(cx: number, cz: number, r: number, tier: number) {
    const houseDefs: [number, number, number, number, number][] = [
      [-34, -22, 0, 8, 6], [-16, -24, 0, 9, 6], [4, -22, 2, 8, 6], [22, -20, 0, 7, 5.5],
      [-34, 2, 2, 8, 6], [-14, 4, 2, 10, 7], [6, 2, 2, 8, 6], [24, 4, 0, 7, 6],
      [-26, 24, 0, 9, 6.5], [-4, 26, 2, 8, 6], [16, 24, 1, 8, 6], [36, 12, 1, 7, 5.5],
    ]
    const k = r / 95
    for (const [ox, oz, rot, w, d] of houseDefs) this.house(cx + ox * k, cz + oz * k, rot, tier, w, d)
    this.warehouse(cx + 2 * k, cz + 44 * k, 0, tier)
    this.carWreck(cx - 8, cz - 44 * k, true)
    this.carWreck(cx + 30, cz - 36 * k, false)
  }

  private village(cx: number, cz: number, r: number, tier: number) {
    const n = 6 + this.rng.int(0, 2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.25, 0.25)
      const d = this.rng.range(r * 0.25, r * 0.7)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      this.house(x, z, this.rng.int(0, 3), tier, this.rng.range(7, 9.5), this.rng.range(5.5, 7))
    }
    if (this.rng.chance(0.6)) this.carWreck(cx, cz, this.rng.chance(0.5))
  }

  private depot(cx: number, cz: number, tier: number) {
    this.warehouse(cx - 20, cz - 5, 0, tier)
    this.warehouse(cx + 15, cz + 15, 1, tier)
    this.warehouse(cx + 18, cz - 22, 0, tier)
    this.container(cx - 2, cz + 5, 1, false)
    this.container(cx + 2, cz - 7, 0, true)
    this.container(cx - 14, cz + 18, 0, false)
    this.carWreck(cx + 30, cz + 5, true)
  }

  private military(cx: number, cz: number, r: number, tier: number) {
    this.warehouse(cx - 25, cz - 20, 0, tier)
    this.warehouse(cx + 25, cz + 18, 1, tier)
    const contDefs: [number, number, number, boolean][] = [
      [-20, 8, 0, false], [-12, 8, 0, true], [-4, 8, 0, false], [8, 14, 1, true],
      [16, 14, 1, false], [-18, -10, 0, false], [-8, -14, 0, true], [4, -16, 0, false],
    ]
    for (const [ox, oz, rot, st] of contDefs) this.container(cx + ox, cz + oz, rot, st)
    this.watchtower(cx + 30, cz - 25, tier)
    this.watchtower(cx - 32, cz + 26, tier)
    // 围墙（四角断开留口）
    const wallC = 0x7d8084
    for (const s of [-1, 1]) {
      this.box(r * 1.1, 2.2, 0.4, cx, this.groundHeight(cx, cz + s * r * 0.62), cz + s * r * 0.62, wallC, true, true, 'concrete')
      this.box(0.4, 2.2, r * 0.7, cx + s * r * 0.66, this.groundHeight(cx + s * r * 0.66, cz), cz, wallC, true, true, 'concrete')
    }
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(4, r * 0.5)
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      this.lootPoints.push({ x, y: this.groundHeight(x, z) + 0.12, z, tier })
    }
    this.carWreck(cx - 42, cz + 2, true)
  }

  private farm(cx: number, cz: number, tier: number) {
    this.barn(cx, cz - 5, 1, tier)
    this.house(cx - 20, cz + 18, 0, tier)
    this.house(cx + 22, cz + 14, 1, tier, 7, 5.5)
    this.silo(cx + 14, cz - 16)
    this.box(1.7, 1.1, 1.7, cx - 12, this.groundHeight(cx - 12, cz - 10), cz - 10, 0xb89a55, true, true, 'wood')
    this.box(1.7, 1.1, 1.7, cx - 8, this.groundHeight(cx - 8, cz + 2), cz + 2, 0xb89a55, true, true, 'wood')
  }

  private bridge(bx: number) {
    const r = this.cfg.river
    if (!r) return
    const bz = this.riverZ(bx)
    const len = r.width * 2 + 14
    const deckC = 0x8d9296, railC = 0x5d6a74
    this.box(7.2, 0.35, len, bx, 3.0, bz, deckC, true, true, 'concrete')
    this.box(0.25, 0.95, len, bx - 3.45, 3.35, bz, railC, true, true, 'concrete')
    this.box(0.25, 0.95, len, bx + 3.45, 3.35, bz, railC, true, true, 'concrete')
    for (const sz of [-len * 0.25, len * 0.25]) {
      this.box(1.2, 4.8, 1.2, bx - 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
      this.box(1.2, 4.8, 1.2, bx + 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
    }
    this.mapRects.push({ x: bx, z: bz, w: 7.2, d: len, color: '#888d92' })
  }

  private buildPoi(p: PoiDef) {
    switch (p.kind) {
      case 'town': this.town(p.x, p.z, p.r, p.tier); break
      case 'village': this.village(p.x, p.z, p.r, p.tier); break
      case 'depot': this.depot(p.x, p.z, p.tier); break
      case 'military': this.military(p.x, p.z, p.r, p.tier); break
      case 'farm': this.farm(p.x, p.z, p.tier); break
      case 'gas': this.gasStation(p.x, p.z, this.rng.int(0, 3), p.tier); break
      case 'ruins': this.ruins(p.x, p.z, p.r, p.tier); break
      case 'camp': this.camp(p.x, p.z, p.r, p.tier); break
      case 'huts': this.huts(p.x, p.z, p.r, p.tier); break
    }
  }

  // ---------------- 总构建 ----------------

  build(scene: THREE.Scene) {
    const cfg = this.cfg
    // 独栋房（先注册压平区，再生成地形网格）
    const loneHouses: { x: number; z: number; rot: number }[] = []
    let attempts = 0
    const lim = this.half - 120
    while (loneHouses.length < cfg.loneHouses && attempts++ < cfg.loneHouses * 40) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      if (this.inPoi(x, z, 60)) continue
      if (this.nearRiver(x, z, 14)) continue
      if (this.groundHeight(x, z) < this.waterY + 1) continue
      let ok = true
      for (const lh of loneHouses) if (dist2D(x, z, lh.x, lh.z) < 130) ok = false
      if (!ok) continue
      const h0 = this.groundHeight(x, z)
      this.flattens.push({ x, z, r: 12, h: h0 })
      loneHouses.push({ x, z, rot: this.rng.int(0, 3) })
    }

    // 所有压平区注册完毕后烘焙统一高度场（渲染/物理/摆放共用）
    this.buildHeightField()

    this.buildTerrain()
    this.buildWater()
    this.buildVegetation()

    // 资源点
    for (const p of cfg.pois) this.buildPoi(p)

    // 独栋房
    for (const lh of loneHouses) this.house(lh.x, lh.z, lh.rot, 1)

    // 公路车辆残骸（沿道路撒）
    let placedWrecks = 0, wtries = 0
    while (placedWrecks < cfg.carWrecks && wtries++ < cfg.carWrecks * 30) {
      const road = this.rng.pick(this.roads)
      const i = this.rng.int(0, road.length - 2)
      const t = this.rng.next()
      const x = lerp(road[i][0], road[i + 1][0], t) + this.rng.range(-5, 5)
      const z = lerp(road[i][1], road[i + 1][1], t) + this.rng.range(-5, 5)
      if (this.nearRiver(x, z, 6)) continue
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue
      this.carWreck(x, z, this.rng.chance(0.5))
      placedWrecks++
    }

    // 桥
    for (const bx of cfg.bridges) this.bridge(bx)

    // 大型岩石掩体（开阔地带）
    const bigRocks = Math.round(this.half / 12)
    for (let i = 0; i < bigRocks; i++) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      if (this.inPoi(x, z, 20) || this.nearRiver(x, z, 8)) continue
      const g = this.groundHeight(x, z)
      if (g < this.waterY + 1) continue
      const s = this.rng.range(1.6, this.biome.id === 'desert' ? 4.2 : 2.8)
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.mat(this.biome.gRock))
      rock.position.set(x, g + s * 0.35, z)
      rock.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), 0)
      rock.castShadow = true
      this.group.add(rock)
      this.col.addCyl(x, z, s * 0.8, g, g + s * 1.1)
    }

    // AI 出生点（资源点按等级配密度，体现风险/收益）
    for (const p of this.pois) {
      const n = p.tier >= 3 ? 8 : p.tier === 2 ? 6 : 4
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2)
        const r = this.rng.range(p.r * 0.3, p.r * 0.85)
        this.botSpawns.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r })
      }
    }
    for (const lh of loneHouses) this.botSpawns.push({ x: lh.x + 6, z: lh.z + 6 })
    for (let i = 0; i < 16; i++) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      if (this.nearRiver(x, z, 5)) continue
      this.botSpawns.push({ x, z })
    }

    // 载具出生点（沿道路）
    let placedVeh = 0, vtries = 0
    while (placedVeh < cfg.vehicles && vtries++ < cfg.vehicles * 40) {
      const road = this.rng.pick(this.roads)
      const i = this.rng.int(0, road.length - 2)
      const t = this.rng.next()
      const x = lerp(road[i][0], road[i + 1][0], t)
      const z = lerp(road[i][1], road[i + 1][1], t)
      if (this.nearRiver(x, z, 10)) continue
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue
      let okV = true
      for (const v of this.vehicleSpawns) if (dist2D(x, z, v.x, v.z) < 120) okV = false
      if (!okV) continue
      const yaw = Math.atan2(road[i + 1][0] - road[i][0], road[i + 1][1] - road[i][1])
      this.vehicleSpawns.push({ x: x + this.rng.range(-3, 3), z: z + this.rng.range(-3, 3), yaw })
      placedVeh++
    }

    // 烘焙式接触阴影（替代屏幕空间 AO）
    this.buildContactAO()

    this.renderMinimap()
    scene.add(this.group)
  }

  /**
   * 烘焙式接触阴影：建筑墙基方形暗斑 + 树根圆形暗斑。
   * GTAOPass 在本场景实测开销过高（数千网格 × 深度/法线重渲染），
   * 用两个 InstancedMesh 即可获得"物体扎根于地面"的 AO 观感，开销可忽略。
   */
  private buildContactAO() {
    const nrm = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const q2 = new THREE.Quaternion()
    const vp = new THREE.Vector3()
    const vs = new THREE.Vector3()
    const groundQuat = (x: number, z: number) => {
      const e = 1.1
      nrm.set(
        -(this.groundHeight(x + e, z) - this.groundHeight(x - e, z)) / (2 * e), 1,
        -(this.groundHeight(x, z + e) - this.groundHeight(x, z - e)) / (2 * e),
      ).normalize()
      q.setFromUnitVectors(up, nrm)
      return q
    }
    const mkMat = (tex: THREE.Texture) => new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.rotateX(-Math.PI / 2)

    // 建筑墙基
    if (this.mapRects.length) {
      const bm = new THREE.InstancedMesh(quad, mkMat(TEX.contactRect()), this.mapRects.length)
      this.mapRects.forEach((r, i) => {
        const h = this.groundHeight(r.x, r.z)
        vp.set(r.x, h + 0.07, r.z)
        vs.set(r.w + 2.4, 1, r.d + 2.4)
        bm.setMatrixAt(i, m4.compose(vp, groundQuat(r.x, r.z), vs))
      })
      bm.renderOrder = 0
      bm.computeBoundingSphere()
      this.group.add(bm)
    }
    // 树根
    if (this.treeAOPts.length) {
      const tex = TEX.contactBlob()
      const tm = new THREE.InstancedMesh(quad, mkMat(tex), this.treeAOPts.length)
      this.treeAOPts.forEach((p, i) => {
        const h = this.groundHeight(p.x, p.z)
        vp.set(p.x, h + 0.06, p.z)
        vs.set(p.r, 1, p.r)
        q2.copy(groundQuat(p.x, p.z))
        tm.setMatrixAt(i, m4.compose(vp, q2, vs))
      })
      tm.renderOrder = 0
      tm.computeBoundingSphere()
      this.group.add(tm)
    }
  }

  // ---------------- 地形（4x4 分块以支持视锥剔除） ----------------

  private buildTerrain() {
    const CH = 4
    const chunkSize = (this.half * 2) / CH
    // 分段与高度场对齐（512/4），顶点高度直接取格点值，确保渲染面与物理面一致
    const seg = this.hfN / CH
    const cBase = new THREE.Color(this.biome.gBase)
    const cAlt = new THREE.Color(this.biome.gAlt)
    const cDry = new THREE.Color(this.biome.gDry)
    const cLow = new THREE.Color(this.biome.gLow)
    const cRock = new THREE.Color(this.biome.gRock)
    const cRoad = new THREE.Color(this.biome.gRoad)
    const tmp = new THREE.Color()
    const detail = this.biome.groundDetail()
    detail.repeat.set(chunkSize / 5.0, chunkSize / 5.0)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail })
    // 双尺度采样混合：再叠一层低频采样打散平铺感
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 tex1 = texture2D( map, vMapUv );
          vec4 tex2 = texture2D( map, vMapUv * 0.1273 + vec2( 0.37, 0.71 ) );
          diffuseColor *= mix( tex1, tex2, 0.42 );
        #endif`,
      )
    }

    for (let cz = 0; cz < CH; cz++) {
      for (let cx = 0; cx < CH; cx++) {
        const ox = -this.half + chunkSize * (cx + 0.5)
        const oz = -this.half + chunkSize * (cz + 0.5)
        const geo = new THREE.PlaneGeometry(chunkSize, chunkSize, seg, seg)
        geo.rotateX(-Math.PI / 2)
        const pos = geo.getAttribute('position') as THREE.BufferAttribute
        const colors = new Float32Array(pos.count * 3)
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) + ox, z = pos.getZ(i) + oz
          const h = this.groundHeight(x, z)
          pos.setY(i, h)
          const hx = this.groundHeight(x + 2, z)
          const hz = this.groundHeight(x, z + 2)
          const slope = Math.hypot(hx - h, hz - h) / 2
          const n = vnoise(x * 0.045 + 5, z * 0.045 + 11) * 0.5 + 0.5
          tmp.copy(cBase).lerp(cAlt, n)
          if (n > 0.72) tmp.lerp(cDry, (n - 0.72) * 2.4)
          if (h < this.waterY + 1.2) tmp.lerp(cLow, clamp((this.waterY + 1.2 - h) / 1.6, 0, 1))
          else if (this.biome.id === 'desert' && h < 3) tmp.lerp(cLow, 0.4)
          if (slope > 0.5) tmp.lerp(cRock, clamp((slope - 0.5) * 1.4, 0, 0.85))
          const rd = this.roadDist(x, z)
          if (rd < 6) tmp.lerp(cRoad, smoothstep(6, 3, rd) * 0.85)
          colors[i * 3] = tmp.r
          colors[i * 3 + 1] = tmp.g
          colors[i * 3 + 2] = tmp.b
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        geo.computeVertexNormals()
        // 顶点为分块局部坐标（高度按世界坐标计算），再整体平移到位
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(ox, 0, oz)
        mesh.receiveShadow = true
        this.group.add(mesh)
      }
    }

    // 天空穹顶（每帧跟随玩家水平位置，见 updateGrass 调用处）
    const skyGeo = new THREE.SphereGeometry(this.half * 1.9, 24, 12)
    const [s0, s1, s2, s3] = this.biome.sky
    const skyMat = new THREE.MeshBasicMaterial({ map: TEX.skyGradient(s0, s1, s2, s3), side: THREE.BackSide, fog: false, depthWrite: false })
    this.sky = new THREE.Mesh(skyGeo, skyMat)
    this.sky.renderOrder = -10
    this.group.add(this.sky)

    // 远处云层（蓬松积云贴图）
    const cloudMat = new THREE.MeshBasicMaterial({
      map: TEX.cloudPuff(), transparent: true, opacity: this.biome.cloudOpacity,
      fog: false, depthWrite: false,
    })
    const cloudRng = new RNG(77)
    for (let i = 0; i < this.biome.cloudCount; i++) {
      const cw = cloudRng.range(220, 520)
      const cd = cw * cloudRng.range(0.4, 0.62)
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd), cloudMat)
      cloud.rotation.x = -Math.PI / 2
      cloud.rotation.z = cloudRng.range(0, Math.PI * 2)
      const a = cloudRng.range(0, Math.PI * 2)
      const r = cloudRng.range(300, this.half * 1.4)
      cloud.position.set(Math.cos(a) * r, cloudRng.range(230, 360), Math.sin(a) * r)
      cloud.renderOrder = -9
      this.group.add(cloud)
    }
  }

  private buildWater() {
    if (this.waterY < -20) return
    const geo = new THREE.PlaneGeometry(this.half * 2.2, this.half * 2.2)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshLambertMaterial({ color: this.biome.waterColor, transparent: true, opacity: this.biome.waterOpacity })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = this.waterY
    this.group.add(mesh)
  }

  // ---------------- 植被（分块实例化，支持视锥剔除与草距裁剪） ----------------

  /** 树干 + 枝杈合并几何（原点在树根，贴树皮） */
  private trunkGeometry(form: 'broad' | 'dead' | 'tall'): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = []
    const branch = (r0: number, r1: number, len: number, y: number, tilt: number, yaw: number) => {
      const bg = new THREE.CylinderGeometry(r0, r1, len, 5)
      bg.translate(0, len / 2, 0)
      bg.rotateZ(tilt)
      bg.rotateY(yaw)
      bg.translate(0, y, 0)
      parts.push(bg)
    }
    if (form === 'tall') {
      const t = new THREE.CylinderGeometry(0.2, 0.5, 6.8, 7)
      t.translate(0, 3.4, 0)
      parts.push(t)
      branch(0.06, 0.13, 2.1, 4.8, 1.0, 0.4)
      branch(0.06, 0.12, 1.9, 5.5, -0.95, 2.5)
      branch(0.05, 0.1, 1.7, 5.9, 1.05, 4.3)
    } else if (form === 'dead') {
      const t = new THREE.CylinderGeometry(0.12, 0.34, 4.4, 6)
      t.translate(0, 2.2, 0)
      parts.push(t)
      branch(0.03, 0.09, 2.0, 2.8, 0.95, 0.3)
      branch(0.03, 0.08, 1.7, 3.4, -1.15, 2.2)
      branch(0.02, 0.07, 1.5, 3.8, 0.8, 4.0)
      branch(0.02, 0.05, 1.1, 4.2, -0.55, 5.4)
    } else {
      const t = new THREE.CylinderGeometry(0.18, 0.44, 4.0, 7)
      t.translate(0, 2.0, 0)
      parts.push(t)
      branch(0.07, 0.13, 1.8, 2.7, 0.92, 0.6)
      branch(0.06, 0.12, 1.6, 3.2, -1.0, 2.8)
      branch(0.05, 0.1, 1.4, 3.6, 1.05, 4.6)
    }
    return mergeGeometries(parts)
  }

  /** 叶团面片星形冠（原点在冠心，贴 alpha 叶团）；法线向球面外推获得柔和受光 */
  private canopyGeometry(form: 'broad' | 'dead' | 'tall'): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = []
    const rng = new RNG(this.cfg.seed ^ 0x5eaf)
    const N = form === 'tall' ? 8 : form === 'dead' ? 2 : 7
    const R = form === 'tall' ? 1.9 : form === 'dead' ? 0.7 : 1.5
    const S: [number, number] = form === 'tall' ? [3.4, 4.7] : form === 'dead' ? [1.4, 1.9] : [2.6, 3.7]
    for (let i = 0; i < N; i++) {
      const size = rng.range(S[0], S[1])
      const p = new THREE.PlaneGeometry(size, size, 1, 1)
      p.rotateX(rng.range(-0.55, 0.55))
      p.rotateY(rng.range(0, Math.PI))
      p.rotateZ(rng.range(-0.45, 0.45))
      const a = (i / N) * Math.PI * 2 + rng.range(0, 0.9)
      const r = rng.range(R * 0.2, R)
      p.translate(Math.cos(a) * r, rng.range(-0.55, 0.85) * R * 0.75, Math.sin(a) * r)
      parts.push(p)
    }
    // 顶部一片水平叶团，让树冠从上方看更饱满
    if (form !== 'dead') {
      const top = new THREE.PlaneGeometry(S[1] * 0.9, S[1] * 0.9)
      top.rotateX(-Math.PI / 2 + 0.18)
      top.translate(rng.range(-0.3, 0.3), R * 0.85, rng.range(-0.3, 0.3))
      parts.push(top)
    }
    const merged = mergeGeometries(parts)
    // 法线球面化：以冠心为球心向外，受光像一团体积而非一堆平面
    const posA = merged.getAttribute('position') as THREE.BufferAttribute
    const nrmA = merged.getAttribute('normal') as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < posA.count; i++) {
      v.set(posA.getX(i), posA.getY(i) * 0.8, posA.getZ(i))
      const len = v.length()
      if (len < 0.3) { nrmA.setXYZ(i, 0, 1, 0); continue }
      v.divideScalar(len)
      nrmA.setXYZ(i, v.x, v.y, v.z)
    }
    nrmA.needsUpdate = true
    return merged
  }

  private buildVegetation() {
    const b = this.biome
    const lim = this.half - 50
    const CH = 4
    const chunkSize = (this.half * 2) / CH
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const q2 = new THREE.Quaternion()
    const vs = new THREE.Vector3()
    const vp = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const cidx = (x: number, z: number) => {
      const ix = clamp(Math.floor((x + this.half) / chunkSize), 0, CH - 1)
      const iz = clamp(Math.floor((z + this.half) / chunkSize), 0, CH - 1)
      return iz * CH + ix
    }

    // ---- 树（写实化：树干带枝杈贴树皮 + 叶团面片星形冠，按 16 块分桶）----
    type TreeInst = { m: THREE.Matrix4; c: THREE.Color }
    const trunkBuckets: THREE.Matrix4[][] = Array.from({ length: CH * CH }, () => [])
    const canopyBuckets: TreeInst[][] = Array.from({ length: CH * CH }, () => [])
    const form = b.treeForm
    // 冠心相对树根高度（随树干 y 缩放再乘）
    const canopyBaseY = form === 'tall' ? 5.6 : 3.2
    let placed = 0, tries = 0
    while (placed < b.treeCount && tries++ < b.treeCount * 7) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      const prob = this.inForest(x, z) ? b.forestChance : b.openChance
      if (!this.rng.chance(prob)) continue
      if (this.roadDist(x, z) < 8) continue
      if (this.inPoi(x, z, 6)) continue
      const h = this.groundHeight(x, z)
      if (h < this.waterY + 0.8) continue
      const s = this.rng.range(b.treeScale[0], b.treeScale[1])
      const yaw = this.rng.range(0, Math.PI * 2)
      q.setFromAxisAngle(up, yaw)
      const bkt = cidx(x, z)
      const sw = 0.82 + s * 0.28
      const sy = 0.72 + s * 0.42
      vp.set(x, h - 0.12, z); vs.set(sw, sy, sw)
      trunkBuckets[bkt].push(m4.clone().compose(vp, q, vs))
      const hasCanopy = form !== 'dead' || this.rng.chance(0.45)
      if (hasCanopy) {
        const cy = h + canopyBaseY * sy + this.rng.range(-0.3, 0.5)
        const cs2 = form === 'dead' ? s * 0.55 : s
        vp.set(x, cy, z); vs.set(cs2, cs2 * this.rng.range(0.85, 1.1), cs2)
        q2.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2))
        canopyBuckets[bkt].push({
          m: m4.clone().compose(vp, q2, vs),
          c: new THREE.Color(this.rng.pick(b.canopyColors)).multiplyScalar(1.8),
        })
      }
      const trunkH = (form === 'tall' ? 6.6 : 4.2) * sy
      this.col.addCyl(x, z, form === 'tall' ? 0.5 : 0.42, h, h + trunkH * 0.82)
      this.treeAOPts.push({ x, z, r: (form === 'tall' ? 2.4 : 1.9) * sw })
      placed++
    }
    const trunkGeo = this.trunkGeometry(form)
    const leavesTex = this.tex('leaves')
    const trunkMat = new THREE.MeshLambertMaterial({
      map: this.tex('bark'),
      color: new THREE.Color(b.trunkColor).multiplyScalar(1.85),
    })
    const canGeo = this.canopyGeometry(form)
    const canMat = new THREE.MeshLambertMaterial({
      map: leavesTex, alphaTest: 0.42, side: THREE.DoubleSide,
      // 叶片透射假象：抬升背光面，避免树冠死黑
      emissive: 0x2a3819, emissiveMap: leavesTex,
    })
    const canDepth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: leavesTex, alphaTest: 0.42,
    })
    for (let bIdx = 0; bIdx < CH * CH; bIdx++) {
      const ts = trunkBuckets[bIdx]
      if (ts.length) {
        const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, ts.length)
        ts.forEach((m, i) => tm.setMatrixAt(i, m))
        tm.castShadow = true
        tm.computeBoundingSphere()
        this.group.add(tm)
      }
      const cs = canopyBuckets[bIdx]
      if (cs.length) {
        const cm = new THREE.InstancedMesh(canGeo, canMat, cs.length)
        cs.forEach((c, i) => { cm.setMatrixAt(i, c.m); cm.setColorAt(i, c.c) })
        cm.castShadow = true
        cm.customDepthMaterial = canDepth
        cm.computeBoundingSphere()
        this.group.add(cm)
      }
    }

    // ---- 仙人掌（沙漠）----
    if (b.cactusCount > 0) {
      const cacGeo = new THREE.CapsuleGeometry(0.38, 1.9, 3, 6)
      const cacMesh = new THREE.InstancedMesh(cacGeo, this.mat(0x4d7a4a), b.cactusCount)
      let ci = 0, ctries = 0
      while (ci < b.cactusCount && ctries++ < b.cactusCount * 7) {
        const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
        if (this.roadDist(x, z) < 7 || this.inPoi(x, z, 4)) continue
        const h = this.groundHeight(x, z)
        const s = this.rng.range(0.6, 1.4)
        vp.set(x, h + 1.2 * s, z)
        q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2))
        vs.set(s, s, s)
        cacMesh.setMatrixAt(ci, m4.clone().compose(vp, q, vs))
        if (s > 0.9) this.col.addCyl(x, z, 0.4 * s, h, h + 2.4 * s)
        ci++
      }
      cacMesh.count = ci
      cacMesh.castShadow = true
      cacMesh.computeBoundingSphere()
      this.group.add(cacMesh)
    }

    // ---- 灌木（叶团三向交叉面片，16 桶）----
    const bushParts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const p = new THREE.PlaneGeometry(1.7, 1.25)
      p.translate(0, 0.42, 0)
      p.rotateY((i / 3) * Math.PI + 0.25)
      p.rotateZ(i === 1 ? 0.12 : -0.08)
      bushParts.push(p)
    }
    const bushGeo = mergeGeometries(bushParts)
    const bushMat = new THREE.MeshLambertMaterial({
      map: leavesTex, alphaTest: 0.42, side: THREE.DoubleSide,
      emissive: 0x26331a, emissiveMap: leavesTex,
    })
    const bushBuckets: TreeInst[][] = Array.from({ length: CH * CH }, () => [])
    let bi = 0, btries = 0
    while (bi < b.bushCount && btries++ < b.bushCount * 6) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      if (this.roadDist(x, z) < 6 || this.inPoi(x, z, 2)) continue
      const h = this.groundHeight(x, z)
      if (h < this.waterY + 0.5) continue
      const s = this.rng.range(0.7, 1.6)
      vp.set(x, h, z)
      q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2))
      vs.set(s, s * this.rng.range(0.7, 1.0), s)
      bushBuckets[cidx(x, z)].push({
        m: m4.clone().compose(vp, q, vs),
        c: new THREE.Color(this.rng.pick(b.bushColors)).multiplyScalar(1.75),
      })
      bi++
    }
    for (const bucket of bushBuckets) {
      if (!bucket.length) continue
      const bm = new THREE.InstancedMesh(bushGeo, bushMat, bucket.length)
      bucket.forEach((c, i) => { bm.setMatrixAt(i, c.m); bm.setColorAt(i, c.c) })
      bm.computeBoundingSphere()
      this.group.add(bm)
    }

    // ---- 草丛（动态：只在玩家周围生成，见 updateGrass；带风摆 shader）----
    if (b.grassCount > 0) {
      const bladeTex = TEX.grassBlades()
      const grassMat = new THREE.MeshLambertMaterial({
        map: bladeTex, alphaTest: 0.38, side: THREE.DoubleSide,
        // 贴图自带绿色，色调只轻度往 biome 草色偏移避免过暗
        color: new THREE.Color(b.grassTint).lerp(new THREE.Color(0xffffff), 0.55),
        emissive: 0x141b0c, emissiveMap: bladeTex,
      })
      const windT = this.windT
      grassMat.onBeforeCompile = (sh) => {
        sh.uniforms.uWindT = windT
        sh.vertexShader = ('uniform float uWindT;\n' + sh.vertexShader).replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 gwp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            float gsw = sin(uWindT * 1.9 + gwp.x * 0.21 + gwp.y * 0.17)
                      + 0.45 * sin(uWindT * 3.6 + gwp.x * 0.07 - gwp.y * 0.11);
            float gbend = smoothstep(0.04, 0.85, position.y);
            transformed.x += gsw * 0.065 * gbend;
            transformed.z += gsw * 0.05 * gbend;
          #endif`,
        )
      }
      const grassGeo = new THREE.PlaneGeometry(1.35, 0.85)
      grassGeo.translate(0, 0.40, 0)
      // 圆形覆盖区 ≈ π·R² 个 cell
      const cells = Math.max(1, Math.round(Math.PI * this.grassR * this.grassR))
      this.grassPerCell = Math.ceil(b.grassCount / cells)
      this.grassCap = this.grassPerCell * (cells + this.grassR * 4)
      this.grass1 = new THREE.InstancedMesh(grassGeo, grassMat, this.grassCap)
      this.grass2 = new THREE.InstancedMesh(grassGeo, grassMat, this.grassCap)
      for (const gm of [this.grass1, this.grass2]) {
        gm.count = 0
        gm.frustumCulled = false
        gm.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.group.add(gm)
      }
    }

    // ---- 散石（16 桶）----
    const rockGeo = new THREE.DodecahedronGeometry(1, 0)
    const rockMat = new THREE.MeshLambertMaterial({ flatShading: true })
    const rockBuckets: TreeInst[][] = Array.from({ length: CH * CH }, () => [])
    let ri = 0, rtries = 0
    while (ri < b.rockCount && rtries++ < b.rockCount * 6) {
      const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
      if (this.roadDist(x, z) < 6 || this.inPoi(x, z, 4)) continue
      const h = this.groundHeight(x, z)
      if (h < this.waterY + 0.2) continue
      const s = this.rng.range(0.5, 1.6)
      vp.set(x, h + s * 0.3, z)
      q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2))
      vs.set(s, s * this.rng.range(0.5, 0.9), s)
      rockBuckets[cidx(x, z)].push({ m: m4.clone().compose(vp, q, vs), c: new THREE.Color(this.rng.pick(b.rockColors)) })
      if (s > 1.0) this.col.addCyl(x, z, s * 0.75, h, h + s * 0.8)
      ri++
    }
    for (const bucket of rockBuckets) {
      if (!bucket.length) continue
      const rm = new THREE.InstancedMesh(rockGeo, rockMat, bucket.length)
      bucket.forEach((c, i) => { rm.setMatrixAt(i, c.m); rm.setColorAt(i, c.c) })
      rm.castShadow = true
      rm.computeBoundingSphere()
      this.group.add(rm)
    }

    // ---- 地面贴花：落叶簇 / 碎石簇（贴合地面坡度的 alpha 面片）----
    const decals = (tex: THREE.Texture, count: number, size: [number, number], weight: (x: number, z: number) => number) => {
      if (count <= 0) return
      const geo = new THREE.PlaneGeometry(1, 1)
      geo.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshLambertMaterial({
        map: tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
      const mesh = new THREE.InstancedMesh(geo, mat, count)
      const nrm = new THREE.Vector3()
      let i = 0, tries = 0
      while (i < count && tries++ < count * 9) {
        const x = this.rng.range(-lim, lim), z = this.rng.range(-lim, lim)
        const wgt = weight(x, z)
        if (wgt <= 0 || !this.rng.chance(wgt)) continue
        if (this.inPoi(x, z, 3)) continue
        const h = this.groundHeight(x, z)
        if (h < this.waterY + 0.4) continue
        // 对齐地面法线
        const e = 0.9
        nrm.set(
          -(this.groundHeight(x + e, z) - this.groundHeight(x - e, z)) / (2 * e), 1,
          -(this.groundHeight(x, z + e) - this.groundHeight(x, z - e)) / (2 * e),
        ).normalize()
        q.setFromUnitVectors(up, nrm)
        q2.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2))
        q.multiply(q2)
        const s = this.rng.range(size[0], size[1])
        vp.set(x, h + 0.05, z)
        vs.set(s, 1, s)
        mesh.setMatrixAt(i, m4.clone().compose(vp, q, vs))
        i++
      }
      mesh.count = i
      mesh.receiveShadow = true
      mesh.renderOrder = 1
      mesh.computeBoundingSphere()
      this.group.add(mesh)
    }
    // 落叶：林下密集、道路上不放
    const leafN = b.id === 'desert' ? 0 : b.id === 'jungle' ? 950 : 620
    decals(this.tex('leafLitter'), leafN, [1.7, 3.4], (x, z) =>
      this.roadDist(x, z) < 5 ? 0 : this.inForest(x, z) ? 0.9 : 0.13)
    // 碎石：路肩聚集、空地零星
    decals(this.tex('gravelPatch'), b.id === 'desert' ? 760 : 430, [1.2, 2.7], (x, z) => {
      const rd = this.roadDist(x, z)
      return rd < 7 ? 0.85 : rd < 16 ? 0.32 : 0.09
    })
  }

  /**
   * 每帧调用：玩家跨越草丛 cell 时，在周围按确定性散列重新铺草。
   * 同一 cell 的草布局由 (cellX, cellZ, seed) 决定，移动往返时草位置保持一致。
   */
  updateGrass(px: number, pz: number) {
    if (this.sky) this.sky.position.set(px, 0, pz)
    const g1 = this.grass1, g2 = this.grass2
    if (!g1 || !g2) return
    const cell = this.grassCell
    const ccx = Math.floor(px / cell), ccz = Math.floor(pz / cell)
    if (ccx === this.grassLastCx && ccz === this.grassLastCz) return
    this.grassLastCx = ccx; this.grassLastCz = ccz

    const b = this.biome
    const lim = this.half - 50
    const R = this.grassR
    const cap = this.grassCap
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const q2 = new THREE.Quaternion()
    const vp = new THREE.Vector3()
    const vs = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const tint = new THREE.Color()
    let n = 0

    for (let dz = -R; dz <= R && n < cap; dz++) {
      for (let dx = -R; dx <= R && n < cap; dx++) {
        if (dx * dx + dz * dz > R * R + 1) continue
        const gx = ccx + dx, gz = ccz + dz
        // mulberry32：以 cell 坐标 + 地图种子为种子的确定性随机
        let s = ((gx * 73856093) ^ (gz * 19349663) ^ (this.cfg.seed * 83492791)) >>> 0
        const rnd = () => {
          s = (s + 0x6d2b79f5) | 0
          let t = Math.imul(s ^ (s >>> 15), 1 | s)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        for (let k = 0; k < this.grassPerCell && n < cap; k++) {
          const x = (gx + rnd()) * cell, z = (gz + rnd()) * cell
          const yawR = rnd() * Math.PI
          const sc = 0.7 + rnd() * 0.8
          const sy = 0.8 + rnd() * 0.45
          const hueJ = rnd() * 0.07 - 0.03
          const lightJ = rnd() * 0.15 - 0.07
          if (Math.abs(x) > lim || Math.abs(z) > lim) continue
          const h = this.groundHeight(x, z)
          if (h < this.waterY + 0.6) continue
          if (this.roadDist(x, z) < 4.5 || this.inPoi(x, z, 1)) continue
          vp.set(x, h, z)
          vs.set(sc, sc * sy, sc)
          q.setFromAxisAngle(up, yawR)
          q2.setFromAxisAngle(up, yawR + Math.PI / 2)
          tint.setHSL(b.grassHue + hueJ, b.grassSat * 0.82, Math.min(0.68, b.grassLight + 0.09 + lightJ))
          g1.setMatrixAt(n, m4.compose(vp, q, vs))
          g1.setColorAt(n, tint)
          g2.setMatrixAt(n, m4.compose(vp, q2, vs))
          g2.setColorAt(n, tint)
          n++
        }
      }
    }
    g1.count = n; g2.count = n
    g1.instanceMatrix.needsUpdate = true
    g2.instanceMatrix.needsUpdate = true
    if (g1.instanceColor) g1.instanceColor.needsUpdate = true
    if (g2.instanceColor) g2.instanceColor.needsUpdate = true
  }

  // ---------------- 小地图 ----------------

  private renderMinimap() {
    const N = 512
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(N, N)
    const b = this.biome
    const col = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
    const cBase = col(b.gBase), cAlt = col(b.gAlt), cLow = col(b.gLow)
    const cWater = col(b.waterColor).map(v => v * 0.78), cRock = col(b.gRock)
    const size = this.half * 2
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const wx = (px / (N - 1)) * size - this.half
        const wz = (py / (N - 1)) * size - this.half
        const h = this.groundHeight(wx, wz)
        let r: number, g: number, bb: number
        if (h < this.waterY) {
          r = cWater[0]; g = cWater[1]; bb = cWater[2]
        } else {
          const n = vnoise(wx * 0.045 + 5, wz * 0.045 + 11) * 0.5 + 0.5
          r = lerp(cBase[0], cAlt[0], n); g = lerp(cBase[1], cAlt[1], n); bb = lerp(cBase[2], cAlt[2], n)
          if (h < this.waterY + 1.2) {
            const t = clamp((this.waterY + 1.2 - h) / 1.6, 0, 1)
            r = lerp(r, cLow[0], t); g = lerp(g, cLow[1], t); bb = lerp(bb, cLow[2], t)
          }
          const hx = this.groundHeight(wx + 3, wz)
          const slope = Math.abs(hx - h) / 3
          if (slope > 0.5) {
            const t = clamp(slope - 0.5, 0, 0.7)
            r = lerp(r, cRock[0], t); g = lerp(g, cRock[1], t); bb = lerp(bb, cRock[2], t)
          }
          const shade = clamp(0.82 + h * 0.0075, 0.8, 1.18)
          r *= shade; g *= shade; bb *= shade
        }
        const idx = (py * N + px) * 4
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = bb; img.data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const w2c = (x: number, z: number): [number, number] => [((x + this.half) / size) * N, ((z + this.half) / size) * N]
    // 道路
    ctx.strokeStyle = '#' + b.gRoad.toString(16).padStart(6, '0')
    ctx.lineWidth = 1.8
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
      const w = (rect.w / size) * N, d = (rect.d / size) * N
      ctx.fillStyle = rect.color
      ctx.fillRect(cx - w / 2, cz - d / 2, Math.max(w, 1.6), Math.max(d, 1.6))
    }
    // POI 标签由 HUD 运行时矢量绘制（避免缩放模糊）
    this.minimap = c
  }
}
