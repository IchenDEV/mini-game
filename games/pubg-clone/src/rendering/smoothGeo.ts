import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * smoothGeo：平滑几何工厂（带缓存）。
 * 角色 / 枪械 / 载具 / 道具的去棱角化统一从这里取几何：
 * 圆角盒、高细分胶囊 / 圆柱 / 球、车削回转体、圆角剖面挤出。
 */

const geoCache = new Map<string, THREE.BufferGeometry>()

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g as T
}

/** 圆角盒：r 默认取最短边 22%，seg=3 已足够平滑 */
export function rbox(w: number, h: number, d: number, r?: number, seg = 3): THREE.BufferGeometry {
  const rr = Math.min(r ?? Math.min(w, h, d) * 0.22, Math.min(w, h, d) * 0.49)
  return cached(`rb|${w}|${h}|${d}|${rr}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr))
}

/** 高细分胶囊（竖直，原点居中） */
export function caps(r: number, len: number, capSeg = 6, radSeg = 16): THREE.BufferGeometry {
  return cached(`cp|${r}|${len}|${capSeg}|${radSeg}`, () => new THREE.CapsuleGeometry(r, len, capSeg, radSeg))
}

/** 高细分圆柱 */
export function cyl(rt: number, rb: number, h: number, seg = 18, open = false): THREE.BufferGeometry {
  return cached(`cy|${rt}|${rb}|${h}|${seg}|${open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open))
}

/** 高细分球 */
export function sph(r: number, w = 20, h = 14): THREE.BufferGeometry {
  return cached(`sp|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h))
}

/** 球冠（帽壳等）：phiLen 控制覆盖角 */
export function dome(r: number, phiLen: number, w = 20, h = 10): THREE.BufferGeometry {
  return cached(`dm|${r}|${phiLen}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, phiLen))
}

/** 圆环 */
export function torus(r: number, tube: number, radSeg = 10, tubSeg = 24): THREE.BufferGeometry {
  return cached(`to|${r}|${tube}|${radSeg}|${tubSeg}`, () => new THREE.TorusGeometry(r, tube, radSeg, tubSeg))
}

/**
 * 车削回转体：pts 为 [radius, y] 剖面点列（自下而上），seg 周向细分。
 * 用于机身 / 瓶罐 / 桶等轴对称平滑形体。
 */
export function lathe(pts: [number, number][], seg = 24, key?: string): THREE.BufferGeometry {
  const k = key ?? `la|${pts.map(p => p.join(',')).join(';')}|${seg}`
  return cached(k, () => {
    const v2 = pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y))
    const g = new THREE.LatheGeometry(v2, seg)
    g.computeVertexNormals()
    return g
  })
}

/** 圆角矩形 Shape（挤出剖面用） */
export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const hw = w / 2, hh = h / 2
  const rr = Math.min(r, hw, hh)
  s.moveTo(-hw + rr, -hh)
  s.lineTo(hw - rr, -hh)
  s.absarc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(hw, hh - rr)
  s.absarc(hw - rr, hh - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(-hw + rr, hh)
  s.absarc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hh + rr)
  s.absarc(-hw + rr, -hh + rr, rr, Math.PI, Math.PI * 1.5, false)
  return s
}

/**
 * 圆角剖面挤出：shape 在 XY 平面，沿 Z 挤出 depth，带倒角。
 * 挤出后居中（z ∈ [-depth/2, depth/2]），顶点焊接 + 平滑法线（弧面车身 / 翼面用）。
 */
export function extrudeSmooth(
  shape: THREE.Shape, depth: number, bevel = 0.04, bevelSeg = 3, key?: string,
): THREE.BufferGeometry {
  const make = () => {
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: bevelSeg, curveSegments: 12, steps: 1,
    })
    g.translate(0, 0, -depth / 2)
    g = mergeVertices(g, 1e-4)
    g.computeVertexNormals()
    return g
  }
  return key ? cached(`ex|${key}`, make) : make()
}

/**
 * 平滑岩石：基于细分二十面体 + 多倍频噪声径向位移，平滑法线。
 * detail=1 约 80 面、detail=2 约 320 面。
 */
export function rockGeo(seed: number, detail = 1, squash = 0.78): THREE.BufferGeometry {
  return cached(`rk|${seed}|${detail}|${squash}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
      const n =
        Math.sin(v.x * 2.3 + seed) * Math.cos(v.y * 1.9 + seed * 1.7) * 0.5 +
        Math.sin(v.y * 3.1 + v.z * 2.2 + seed * 2.3) * 0.3 +
        Math.sin(v.z * 4.7 + v.x * 3.7 + seed * 3.1) * 0.2
      const k = 1 + n * 0.28
      v.multiplyScalar(k)
      pos.setXYZ(i, v.x, v.y * squash, v.z)
    }
    // 顶点焊接由 Icosahedron 保证（索引几何），直接平滑法线
    g.computeVertexNormals()
    return g
  })
}

/**
 * 弯曲草叶簇：n 片多段三角叶，每片带抛物线侧弯与随机朝向。
 * 返回非索引合并几何，做 InstancedMesh 单元（hero 草层）。
 */
export function grassClumpGeo(seed: number, blades = 7, height = 0.85): THREE.BufferGeometry {
  return cached(`gc|${seed}|${blades}|${height}`, () => {
    let s = seed >>> 0
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const colors: number[] = []
    const SEGS = 3
    for (let b = 0; b < blades; b++) {
      const yaw = rnd() * Math.PI * 2
      const lean = 0.15 + rnd() * 0.5
      const bh = height * (0.6 + rnd() * 0.55)
      const bw = 0.014 + rnd() * 0.016
      const ox = (rnd() - 0.5) * 0.16
      const oz = (rnd() - 0.5) * 0.16
      const cy = Math.cos(yaw), sy = Math.sin(yaw)
      // 每叶配色：亮度抖动 + 少量干草叶偏黄（顶点色，与实例色相乘）
      const lightJ = 0.82 + rnd() * 0.34
      const dry = rnd() < 0.16
      const tintR = dry ? 1.28 : 1, tintG = dry ? 1.02 : 1, tintB = dry ? 0.45 : 1
      // 叶片中轴：根部直立，向 lean 方向抛物线弯曲
      const px: number[] = [], py: number[] = [], pw: number[] = []
      for (let i = 0; i <= SEGS; i++) {
        const t = i / SEGS
        px.push(lean * t * t * bh)
        py.push(bh * t * (1 - lean * 0.22 * t))
        pw.push(bw * (1 - t * 0.92))
      }
      // 三角条带 → 独立三角形（非索引）；顶点色由叶高 v 渐变（根暗尖亮）
      const pushCol = (v: number) => {
        const k = (0.42 + 0.5 * v) * lightJ
        colors.push(Math.min(1.05, k * tintR), Math.min(1.05, k * tintG), Math.min(1.05, k * tintB))
      }
      const emit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx2: number, cy2: number, cz2: number, ua: number, va: number, ub: number, vb: number, uc: number, vc: number) => {
        positions.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2)
        // 法线沿弯曲方向略外倾，由 computeVertexNormals 重算，这里占位
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
        uvs.push(ua, va, ub, vb, uc, vc)
        pushCol(va); pushCol(vb); pushCol(vc)
      }
      const wp = (i: number, side: number): [number, number, number] => {
        const lx = px[i] * 1 + side * pw[i] * 0 // 弯向局部 +x
        const lz = side * pw[i]
        return [ox + cy * lx - sy * lz, py[i], oz + sy * lx + cy * lz]
      }
      for (let i = 0; i < SEGS; i++) {
        const t0 = i / SEGS, t1 = (i + 1) / SEGS
        const [alx, aly, alz] = wp(i, -1)
        const [arx, ary, arz] = wp(i, 1)
        const [blx, bly, blz] = wp(i + 1, -1)
        const [brx, bry, brz] = wp(i + 1, 1)
        if (i === SEGS - 1) {
          // 顶段收尖
          const tipX = ox + cy * px[SEGS], tipY = py[SEGS], tipZ = oz + sy * px[SEGS]
          emit(alx, aly, alz, arx, ary, arz, tipX, tipY, tipZ, 0, t0, 1, t0, 0.5, 1)
        } else {
          emit(alx, aly, alz, arx, ary, arz, brx, bry, brz, 0, t0, 1, t0, 1, t1)
          emit(alx, aly, alz, brx, bry, brz, blx, bly, blz, 0, t0, 1, t1, 0, t1)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    g.computeVertexNormals()
    // 法线上偏：受光更像地被植物（避免侧面纯黑）
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute
    for (let i = 0; i < nrm.count; i++) {
      const nx = nrm.getX(i) * 0.55, ny = nrm.getY(i) * 0.55 + 0.45, nz = nrm.getZ(i) * 0.55
      const l = Math.hypot(nx, ny, nz) || 1
      nrm.setXYZ(i, nx / l, ny / l, nz / l)
    }
    return g
  })
}
