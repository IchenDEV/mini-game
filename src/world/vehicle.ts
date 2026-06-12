import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import { surface, glass, carPaint, metal } from '../rendering/materials'
import { rbox, cyl, sph, torus, lathe, extrudeSmooth } from '../rendering/smoothGeo'
import { pbr } from '../rendering/pbrTextures'
import type { Ctx } from '../core/ctx'
import type { Character } from '../entities/character'

/**
 * 可驾驶载具：贴地行驶 + 圆形碰撞 + 坡度俯仰 + 油量 + 撞击行人。
 * 三种车型（吉普 / 皮卡 / 厢式车）差异化操控。
 * F 上车 / 下车，W/S 油门倒挡，A/D 转向，空格手刹。
 */

export type VehicleKind = 'buggy' | 'pickup' | 'van'

interface VehicleSpec {
  label: string
  maxF: number; maxR: number
  accel: number; decel: number
  turn: number
  /** 碰撞半径 / 撞人判定半宽长 */
  radius: number; hitW: number; hitL: number
  /** 车身色池 */
  colors: number[]
}

const SPECS: Record<VehicleKind, VehicleSpec> = {
  buggy: {
    label: '越野吉普',
    maxF: 16.5, maxR: -6.5, accel: 11, decel: 12, turn: 1.6,
    radius: 1.45, hitW: 1.4, hitL: 2.5,
    colors: [0x5d6e46, 0x6e5a40, 0x55636e],
  },
  pickup: {
    label: '皮卡',
    maxF: 15, maxR: -6, accel: 9.5, decel: 11, turn: 1.35,
    radius: 1.55, hitW: 1.5, hitL: 2.9,
    colors: [0x7a4a36, 0x4a6478, 0x6e6a52, 0x803a32],
  },
  van: {
    label: '厢式车',
    maxF: 13, maxR: -5.5, accel: 8, decel: 10, turn: 1.15,
    radius: 1.65, hitW: 1.55, hitL: 3.1,
    colors: [0x9aa0a4, 0x6e8290, 0x8a8468, 0x5d7060],
  },
}

export class Vehicle {
  mesh = new THREE.Group()
  pos = new THREE.Vector3()
  yaw = 0
  speed = 0
  occupied = false
  /** 油量 0-100，耗尽无法加速 */
  fuel = 0
  driver: Character | null = null
  readonly kind: VehicleKind
  readonly spec: VehicleSpec
  private pitch = 0
  private roll = 0
  private wheels: THREE.Object3D[] = []
  private frontPivots: THREE.Group[] = []
  private wheelSpin = 0
  private steerVis = 0
  private hitCd = new Map<number, number>()
  private dustAcc = 0
  private dustSide = 1
  private lowFuelNoticed = false

  constructor(scene: THREE.Scene, x: number, z: number, yaw: number, groundY: number, kind: VehicleKind = 'buggy') {
    this.kind = kind
    this.spec = SPECS[kind]
    this.pos.set(x, groundY, z)
    this.yaw = yaw
    this.fuel = 35 + Math.random() * 45
    this.build()
    scene.add(this.mesh)
    this.sync()
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    this.mesh.add(m)
    return m
  }

  /**
   * 车轮组：车削一体轮胎（胎肩圆弧 + 轮辋内凹）+ 辐条轮毂，前轮挂转向枢轴。
   * 剖面绕 y 车削后旋转 90° 使轮轴横向。
   */
  private addWheels(positions: [number, number][], r: number, w: number) {
    const h = w / 2
    const tireGeo = lathe([
      [r * 0.36, -h + 0.02], [r * 0.66, -h + 0.035], [r * 0.84, -h + 0.02],
      [r * 0.97, -h + 0.09], [r, -h + 0.16], [r, h - 0.16], [r * 0.97, h - 0.09],
      [r * 0.84, h - 0.02], [r * 0.66, h - 0.035], [r * 0.36, h - 0.02],
    ], 28, `tire|${r}|${w}`)
    const tireMat = surface({ color: 0x232527, roughness: 0.94, metalness: 0 })
    const hubMat = metal(0x8d9296)
    const hubGeo = cyl(r * 0.36, r * 0.36, w * 0.86, 18)
    const spokeGeo = rbox(r * 0.5, 0.025, 0.07, 0.01, 2)
    const capGeo = sph(0.055, 12, 9)
    for (const [sx, sz] of positions) {
      const grp = new THREE.Group()
      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.castShadow = true
      const hub = new THREE.Mesh(hubGeo, hubMat)
      grp.add(tire, hub)
      // 五辐条 + 中心盖（两侧）
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Mesh(spokeGeo, hubMat)
          sp.position.set(0, side * (w * 0.43), 0)
          sp.rotation.y = (i / 5) * Math.PI * 2
          sp.translateX(r * 0.28)
          grp.add(sp)
        }
        const cap = new THREE.Mesh(capGeo, hubMat)
        cap.position.y = side * (w * 0.42)
        cap.scale.set(1, 0.5, 1)
        grp.add(cap)
      }
      grp.rotation.z = Math.PI / 2
      const pivot = new THREE.Group()
      pivot.position.set(sx, r, sz)
      pivot.add(grp)
      this.mesh.add(pivot)
      this.wheels.push(grp)
      if (sz > 0) this.frontPivots.push(pivot)
    }
  }

  /** 轮拱罩（半圆弧眉），车身与轮胎之间的过渡件 */
  private addFenders(positions: [number, number][], r: number, mat: THREE.Material) {
    const arcGeo = new THREE.TorusGeometry(r + 0.12, 0.085, 8, 18, Math.PI)
    for (const [sx, sz] of positions) {
      const f = new THREE.Mesh(arcGeo, mat)
      f.position.set(sx, r + 0.02, sz)
      f.rotation.y = Math.PI / 2
      f.castShadow = true
      this.mesh.add(f)
    }
  }

  /** 车灯：圆形大灯（透镜 + 镶边）+ 圆角尾灯 */
  private addLights(w2: number, frontZ: number, backZ: number, y: number) {
    const head = surface({ color: 0xfff2c9, roughness: 0.18, metalness: 0.1, emissive: 0x6d6248 })
    const rim = metal(0x9aa0a4)
    const tail = surface({ color: 0xb33327, roughness: 0.3, metalness: 0.05, emissive: 0x4d100a })
    for (const sx of [-w2, w2]) {
      const lamp = this.add(cyl(0.1, 0.1, 0.05, 18), head, sx, y, frontZ)
      lamp.rotation.x = Math.PI / 2
      const ring = this.add(torus(0.1, 0.018, 8, 18), rim, sx, y, frontZ + 0.02)
      ring.castShadow = false
      this.add(rbox(0.24, 0.13, 0.06, 0.03, 3), tail, sx, y + 0.02, backZ)
    }
  }

  /** 后视镜：弯杆 + 圆角镜面 */
  private addMirrors(x2: number, y: number, z: number, mat: THREE.Material) {
    for (const sx of [-1, 1]) {
      const arm = this.add(cyl(0.022, 0.022, 0.16, 10), mat, sx * x2, y, z)
      arm.rotation.z = sx * 1.15
      this.add(rbox(0.05, 0.16, 0.11, 0.02, 3), mat, sx * (x2 + 0.13), y + 0.05, z)
    }
  }

  private build() {
    const bodyHex = this.spec.colors[Math.floor(Math.random() * this.spec.colors.length)]
    const bodyC = carPaint(bodyHex)
    const darkC = surface({ color: 0x3a4034, roughness: 0.72, metalness: 0.2 })
    const trimC = surface({ color: 0x2e3134, roughness: 0.55, metalness: 0.35 })
    const fab = pbr('fabric')
    const seatC = surface({ color: 0x2c2f2a, normalMap: fab.normalMap, normalScale: 0.5, roughness: 0.92 })
    const glassC = glass()
    if (this.kind === 'buggy') this.buildBuggy(bodyC, darkC, trimC, seatC, glassC)
    else if (this.kind === 'pickup') this.buildPickup(bodyC, darkC, trimC, seatC, glassC)
    else this.buildVan(bodyC, darkC, trimC, seatC, glassC)
  }

  /** 车身剖面挤出（侧视轮廓 → 横向圆角车壳），车头朝 +z；smooth 时上轮廓走样条（无折角） */
  private hull(profile: [number, number][], width: number, mat: THREE.Material, bevel = 0.09, key?: string, smooth = true) {
    const shape = new THREE.Shape()
    const [x0, y0] = profile[0]
    shape.moveTo(x0, y0)
    if (smooth) {
      shape.splineThru(profile.slice(1).map(([px, py]) => new THREE.Vector2(px, py)))
    } else {
      profile.slice(1).forEach(([px, py]) => shape.lineTo(px, py))
    }
    shape.closePath()
    const geo = extrudeSmooth(shape, width - bevel * 2, bevel, 4, key)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.y = -Math.PI / 2
    m.castShadow = true
    m.receiveShadow = true
    this.mesh.add(m)
    return m
  }

  /** 开放式越野吉普（+z 朝前）：弧面壳体 + 圆管防滚架 */
  private buildBuggy(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 一体壳：尾部 → 座舱开放区下沿 → 引擎盖弧线 → 车头下倾（x=车长方向，车头 +x）
    this.hull([
      [-1.8, 0.42], [-1.85, 1.18], [-1.45, 1.26], [-0.75, 1.24],
      [-0.55, 0.95], [0.45, 0.95], [0.72, 1.22], [1.28, 1.3],
      [1.62, 1.22], [1.82, 0.98], [1.86, 0.42],
    ], 1.9, bodyC, 0.1, `buggy|${this.kind}`)
    // 前格栅（横杆）+ 牵引钩
    for (const gy of [0.78, 0.92, 1.06]) {
      this.add(rbox(1.3, 0.06, 0.06, 0.02, 2), trimC, 0, gy, 1.86)
    }
    // 保险杠（圆管）
    for (const sz of [1.92, -1.92]) {
      const bump = this.add(cyl(0.075, 0.075, 1.9, 14), trimC, 0, 0.52, sz)
      bump.rotation.z = Math.PI / 2
    }
    // 引擎盖进气口 + 中央天线
    this.add(rbox(0.6, 0.05, 0.46, 0.02, 2), trimC, 0, 1.32, 1.25)
    const ant = this.add(cyl(0.012, 0.008, 0.85, 8), darkC, -0.82, 1.7, -1.6)
    ant.rotation.x = -0.12
    // 方向盘（高细分）
    const wheel = new THREE.Mesh(torus(0.17, 0.026, 8, 22), darkC)
    wheel.position.set(-0.45, 1.32, 0.42)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    // 风挡（带框，微后倾）
    const wsFrame = this.add(rbox(1.78, 0.74, 0.07, 0.03, 3), trimC, 0, 1.58, 0.68)
    wsFrame.rotation.x = -0.12
    const ws = this.add(rbox(1.62, 0.6, 0.05, 0.02, 2), glassC, 0, 1.58, 0.665)
    ws.rotation.x = -0.12
    ws.castShadow = false
    // 桶形座椅（圆角壳 + 头枕）
    for (const sx of [-0.45, 0.45]) {
      this.add(rbox(0.68, 0.16, 0.58, 0.05, 3), seatC, sx, 1.06, -0.1)
      const back = this.add(rbox(0.66, 0.62, 0.14, 0.05, 3), seatC, sx, 1.4, -0.42)
      back.rotation.x = 0.16
      this.add(rbox(0.3, 0.18, 0.1, 0.04, 3), seatC, sx, 1.78, -0.48)
    }
    // 防滚架：圆管门形 ×2 + 横梁 + 斜撑
    const cageMat = surface({ color: 0x44483e, roughness: 0.45, metalness: 0.4 })
    for (const cz of [-0.88, -0.3]) {
      for (const sx of [-0.84, 0.84]) {
        this.add(cyl(0.05, 0.05, 0.92, 12), cageMat, sx, 1.32, cz)
      }
      const top = this.add(cyl(0.05, 0.05, 1.76, 12), cageMat, 0, 1.79, cz)
      top.rotation.z = Math.PI / 2
    }
    for (const sx of [-0.84, 0.84]) {
      const brace = this.add(cyl(0.04, 0.04, 0.66, 10), cageMat, sx, 1.62, -0.59)
      brace.rotation.x = 1.1
    }
    // 油桶（高细分 + 滚边）+ 备胎（车削轮胎同款）+ 排气管
    const drum = new THREE.Mesh(cyl(0.22, 0.22, 0.55, 18), metal(0x7a3a30))
    drum.position.set(0.55, 1.1, -1.52)
    drum.castShadow = true
    this.mesh.add(drum)
    for (const dy of [0.95, 1.24]) {
      const band = new THREE.Mesh(torus(0.222, 0.012, 6, 18), metal(0x5d2a22))
      band.position.set(0.55, dy, -1.52)
      band.rotation.x = Math.PI / 2
      this.mesh.add(band)
    }
    const spareGeo = lathe([
      [0.15, -0.13], [0.27, -0.15], [0.35, -0.1], [0.42, -0.06],
      [0.42, 0.06], [0.35, 0.1], [0.27, 0.15], [0.15, 0.13],
    ], 24, 'spare')
    const spare = new THREE.Mesh(spareGeo, surface({ color: 0x232527, roughness: 0.94, metalness: 0 }))
    spare.rotation.x = Math.PI / 2
    spare.position.set(-0.4, 1.05, -1.9)
    spare.castShadow = true
    this.mesh.add(spare)
    const exh = new THREE.Mesh(cyl(0.055, 0.065, 0.5, 14), metal(0x5d6166))
    exh.rotation.x = Math.PI / 2
    exh.position.set(-0.7, 0.42, -1.85)
    this.mesh.add(exh)
    const exhTip = new THREE.Mesh(torus(0.062, 0.008, 6, 14), metal(0x44484c))
    exhTip.position.set(-0.7, 0.42, -2.1)
    this.mesh.add(exhTip)
    this.addLights(0.66, 1.84, -1.86, 1.0)
    const wheelPos: [number, number][] = [[-1.0, 1.25], [1.0, 1.25], [-1.0, -1.15], [1.0, -1.15]]
    this.addWheels(wheelPos, 0.42, 0.32)
    this.addFenders(wheelPos, 0.42, bodyC)
  }

  /** 皮卡：弧面驾驶舱壳体 + 开放后斗 */
  private buildPickup(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 主壳：尾斗前壁 → 驾驶舱顶弧 → A 柱斜面 → 引擎盖 → 车头（+x 朝前）
    this.hull([
      [-0.62, 0.5], [-0.66, 1.2], [-0.62, 1.72], [-0.4, 1.88], [-0.05, 1.91], [0.3, 1.86],
      [0.62, 1.6], [0.92, 1.36], [1.3, 1.22], [1.75, 1.14], [2.08, 1.1],
      [2.18, 0.95], [2.2, 0.5],
    ], 1.96, bodyC, 0.1, 'pickup-cab')
    // 后斗：底板 + 双侧板 + 尾门（圆角板拼装）
    this.add(rbox(1.96, 0.1, 1.66, 0.03, 2), trimC, 0, 0.85, -1.45)
    for (const sx of [-0.94, 0.94]) {
      this.add(rbox(0.1, 0.52, 1.66, 0.035, 3), bodyC, sx, 1.12, -1.45)
    }
    this.add(rbox(1.96, 0.52, 0.1, 0.035, 3), bodyC, 0, 1.12, -2.24)
    // 底盘连接段（斗底与车架）
    this.add(rbox(2.0, 0.42, 1.9, 0.08, 3), bodyC, 0, 0.6, -1.4)
    // 后斗货物（随机木箱）
    if (Math.random() < 0.6) {
      const fabTex = pbr('planks')
      this.add(rbox(0.7, 0.5, 0.7, 0.04, 3), surface({ color: 0x8a7350, map: fabTex.map, normalMap: fabTex.normalMap, roughness: 0.8 }), 0.3, 0.95, -1.3)
    }
    // 风挡 + 侧窗 + 后窗（圆角玻璃，嵌在壳体表面）
    const ws = this.add(rbox(1.7, 0.6, 0.06, 0.04, 3), glassC, 0, 1.56, 0.84)
    ws.rotation.x = -0.42
    ws.castShadow = false
    this.add(rbox(1.78, 0.5, 0.06, 0.04, 3), glassC, 0, 1.5, -0.61).castShadow = false
    for (const sx of [-0.95, 0.95]) {
      const win = this.add(rbox(0.06, 0.46, 1.05, 0.03, 3), glassC, sx, 1.5, 0.08)
      win.castShadow = false
    }
    // 格栅（横条）+ 保险杠（圆角厚块）
    for (const gy of [0.88, 1.0]) {
      this.add(rbox(1.5, 0.07, 0.07, 0.025, 2), trimC, 0, gy, 2.2)
    }
    this.add(rbox(2.06, 0.2, 0.24, 0.07, 3), trimC, 0, 0.52, 2.22)
    this.add(rbox(2.06, 0.2, 0.24, 0.07, 3), trimC, 0, 0.52, -2.32)
    // 车顶探照灯排（圆灯）
    const barGeo = cyl(0.035, 0.035, 1.2, 10)
    const bar = new THREE.Mesh(barGeo, trimC)
    bar.position.set(0, 2.0, 0.55)
    bar.rotation.z = Math.PI / 2
    this.mesh.add(bar)
    for (const lx of [-0.38, 0, 0.38]) {
      const lamp = this.add(cyl(0.07, 0.07, 0.09, 14), surface({ color: 0xfff2c9, roughness: 0.25, metalness: 0.1, emissive: 0x35301f }), lx, 2.06, 0.6)
      lamp.rotation.x = Math.PI / 2
    }
    // 内饰：座椅 + 方向盘
    for (const sx of [-0.45, 0.45]) {
      this.add(rbox(0.62, 0.16, 0.52, 0.05, 3), seatC, sx, 0.98, 0.0)
      const back = this.add(rbox(0.6, 0.5, 0.13, 0.05, 3), seatC, sx, 1.28, -0.28)
      back.rotation.x = 0.12
    }
    const wheel = new THREE.Mesh(torus(0.16, 0.026, 8, 22), darkC)
    wheel.position.set(-0.45, 1.3, 0.55)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    this.addMirrors(1.0, 1.55, 0.85, trimC)
    // 排气管
    const exh = new THREE.Mesh(cyl(0.055, 0.065, 0.45, 14), metal(0x5d6166))
    exh.rotation.x = Math.PI / 2
    exh.position.set(0.75, 0.38, -2.3)
    this.mesh.add(exh)
    this.addLights(0.74, 2.3, -2.31, 1.0)
    const wheelPos: [number, number][] = [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.4], [1.05, -1.4]]
    this.addWheels(wheelPos, 0.45, 0.34)
    this.addFenders(wheelPos, 0.45, bodyC)
  }

  /** 厢式车：一体弧顶箱体 + 短鼻车头 + 车顶行李架 */
  private buildVan(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 一体壳：箱体大圆弧顶 → 风挡斜面 → 短鼻（+x 朝前）
    this.hull([
      [-2.25, 0.5], [-2.3, 2.32], [-1.9, 2.52], [1.0, 2.55],
      [1.45, 2.4], [1.78, 1.75], [2.1, 1.62], [2.28, 1.2], [2.3, 0.5],
    ], 2.04, bodyC, 0.12, 'van-hull')
    // 风挡（斜面大玻璃）+ 驾驶位侧窗
    const ws = this.add(rbox(1.74, 0.78, 0.06, 0.05, 3), glassC, 0, 2.04, 1.65)
    ws.rotation.x = -0.45
    ws.castShadow = false
    for (const sx of [-1.0, 1.0]) {
      const win = this.add(rbox(0.06, 0.5, 0.9, 0.04, 3), glassC, sx, 1.7, 1.35)
      win.castShadow = false
    }
    // 厢体侧滑门 + 后双开门（门板轮廓缝 + 圆角门把）
    const seamC = surface({ color: 0x16181a, roughness: 0.8, metalness: 0.1 })
    for (const dz of [0.1, -1.2]) {
      this.add(rbox(0.035, 1.2, 0.045, 0.012, 2), seamC, 1.03, 1.55, dz)
    }
    this.add(rbox(0.05, 1.5, 0.04, 0.015, 2), seamC, 0, 1.52, -2.32)
    this.add(rbox(1.62, 0.05, 0.04, 0.015, 2), seamC, 0, 2.24, -2.32)
    this.add(rbox(1.62, 0.05, 0.04, 0.015, 2), seamC, 0, 0.8, -2.32)
    for (const sx of [-0.81, 0.81]) {
      this.add(rbox(0.05, 1.5, 0.04, 0.015, 2), seamC, sx, 1.52, -2.32)
    }
    this.add(rbox(0.14, 0.035, 0.05, 0.012, 2), trimC, 0.9, 1.32, 0.55)
    this.add(rbox(0.14, 0.035, 0.06, 0.012, 2), trimC, 0.28, 1.36, -2.34)
    this.add(rbox(0.14, 0.035, 0.06, 0.012, 2), trimC, -0.28, 1.36, -2.34)
    // 牌照板
    this.add(rbox(0.44, 0.2, 0.03, 0.01, 2), surface({ color: 0xdfe3e6, roughness: 0.5 }), 0, 0.66, -2.36)
    // 车顶行李架（圆管骨架）
    const railMat = metal(0x6e7479)
    for (const sz of [-1.6, -0.6, 0.4]) {
      const r1 = this.add(cyl(0.03, 0.03, 1.84, 10), railMat, 0, 2.64, sz)
      r1.rotation.z = Math.PI / 2
    }
    for (const sx of [-0.86, 0.86]) {
      const r2 = this.add(cyl(0.032, 0.032, 2.4, 10), railMat, sx, 2.63, -0.7)
      r2.rotation.x = Math.PI / 2
    }
    // 格栅 + 保险杠
    for (const gy of [0.82, 0.96]) {
      this.add(rbox(1.4, 0.06, 0.06, 0.022, 2), trimC, 0, gy, 2.3)
    }
    this.add(rbox(2.06, 0.22, 0.24, 0.07, 3), trimC, 0, 0.48, 2.32)
    this.add(rbox(2.06, 0.22, 0.24, 0.07, 3), trimC, 0, 0.48, -2.34)
    this.addMirrors(1.08, 1.85, 1.9, trimC)
    // 内饰
    for (const sx of [-0.45, 0.45]) {
      this.add(rbox(0.62, 0.16, 0.52, 0.05, 3), seatC, sx, 0.98, 1.45)
      const back = this.add(rbox(0.6, 0.5, 0.13, 0.05, 3), seatC, sx, 1.28, 1.18)
      back.rotation.x = 0.1
    }
    const wheel = new THREE.Mesh(torus(0.16, 0.026, 8, 22), darkC)
    wheel.position.set(-0.45, 1.32, 1.95)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    this.addLights(0.76, 2.32, -2.34, 0.95)
    const wheelPos: [number, number][] = [[-1.06, 1.55], [1.06, 1.55], [-1.06, -1.45], [1.06, -1.45]]
    this.addWheels(wheelPos, 0.44, 0.32)
    this.addFenders(wheelPos, 0.44, bodyC)
  }

  /** 驾驶输入更新（由玩家驾驶时调用） */
  drive(dt: number, ctx: Ctx, throttle: number, steer: number, brake: boolean) {
    const { maxF, maxR, accel, decel, turn } = this.spec
    const hasFuel = this.fuel > 0
    // 油耗：踩油门时按速度消耗
    if (throttle !== 0 && hasFuel) {
      this.fuel = Math.max(0, this.fuel - dt * (0.22 + Math.abs(this.speed) * 0.024))
      if (this.fuel <= 0) {
        ctx.hud.banner('燃油耗尽 — 寻找汽油桶补充', 'danger', 3)
        ctx.sfx.noAmmo()
      } else if (this.fuel < 18 && !this.lowFuelNoticed) {
        this.lowFuelNoticed = true
        ctx.hud.notice('燃油不足')
      }
    }
    // 油门 / 自然阻力 / 手刹
    if (throttle > 0 && hasFuel) this.speed += accel * dt
    else if (throttle < 0 && hasFuel) this.speed -= decel * dt
    else this.speed = damp(this.speed, 0, 0.9, dt)
    if (brake) this.speed = damp(this.speed, 0, 5, dt)
    this.speed = clamp(this.speed, maxR, maxF)
    // 转向随速度（低速转向更小，倒车反向）
    const k = clamp(Math.abs(this.speed) / 7, 0, 1)
    this.yaw -= steer * turn * k * dt * Math.sign(this.speed || 1)
    // 前轮转向视觉
    this.steerVis = damp(this.steerVis, -steer * 0.42, 10, dt)
    this.move(dt, ctx)
    // 引擎音
    ctx.sfx.engineUpdate(this.pos, hasFuel ? Math.abs(this.speed) / maxF : 0)
  }

  /** 无人滑行（摩擦停车） */
  idle(dt: number, ctx: Ctx) {
    if (Math.abs(this.speed) < 0.05) { this.speed = 0; return }
    this.speed = damp(this.speed, 0, 2.4, dt)
    this.steerVis = damp(this.steerVis, 0, 6, dt)
    this.move(dt, ctx)
  }

  /** 车头矩形区域内的角色碾压判定 */
  private runOver(ctx: Ctx) {
    const sp = Math.abs(this.speed)
    if (sp < 3) return
    const t = ctx.time
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const rx = fz, rz = -fx // 右向量
    for (const c of ctx.chars) {
      if (!c.alive || c === this.driver || c.dropping) continue
      if (Math.abs(c.pos.y - this.pos.y) > 2.2) continue
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z
      const lz = dx * fx + dz * fz
      const lx = dx * rx + dz * rz
      if (Math.abs(lx) > this.spec.hitW || Math.abs(lz) > this.spec.hitL) continue
      const last = this.hitCd.get(c.id) ?? -9
      if (t - last < 0.7) continue
      this.hitCd.set(c.id, t)
      // 伤害随车速，撞飞 + 硬直
      const dmg = (sp - 2) * 9
      const dir = Math.sign(this.speed) || 1
      c.vel.x += fx * dir * sp * 0.7 + rx * Math.sign(lx || 1) * 2.6
      c.vel.z += fz * dir * sp * 0.7 + rz * Math.sign(lx || 1) * 2.6
      c.vel.y = Math.max(c.vel.y, 2.2 + sp * 0.16)
      c.onGround = false
      if (!c.isPlayer) c.stunnedUntil = t + 0.9
      ctx.fx.blood(c.pos.x, c.pos.y + 1.0, c.pos.z)
      ctx.fx.dust(c.pos.x, c.pos.y, c.pos.z, 6)
      ctx.sfx.crash(this.pos, 0.8)
      if (this.driver?.isPlayer) {
        ctx.fx.addShake(0.32)
        ctx.fx.kick('vehicleCrash', 0.55)
      }
      c.takeDamage(dmg, false, this.driver, '载具撞击', ctx)
      this.speed *= 0.8
    }
  }

  private move(dt: number, ctx: Ctx) {
    if (Math.abs(this.speed) < 0.01) { this.sync(); return }
    const dirX = Math.sin(this.yaw), dirZ = Math.cos(this.yaw)
    const stepX = dirX * this.speed * dt
    const stepZ = dirZ * this.speed * dt
    const want = { x: this.pos.x + stepX, z: this.pos.z + stepZ }
    // 碰撞推开
    ctx.world.col.resolveCircle(want, this.pos.y + 0.55, this.pos.y + 1.5, this.spec.radius)
    const gotX = want.x - this.pos.x, gotZ = want.z - this.pos.z
    // 被墙截断则掉速（车祸）
    const wanted = Math.hypot(stepX, stepZ)
    const got = Math.hypot(gotX, gotZ)
    if (wanted > 0.001 && got < wanted * 0.55) {
      const sp = Math.abs(this.speed)
      if (sp > 9) {
        ctx.fx.addShake(0.3)
        ctx.sfx.crash(this.pos, 1)
        ctx.fx.dust(this.pos.x + dirX * 1.8, this.pos.y + 0.7, this.pos.z + dirZ * 1.8, 8)
        if (this.driver?.isPlayer) ctx.fx.kick('vehicleCrash', Math.min(1.3, sp / 12))
        // 高速撞墙驾驶员受伤
        if (this.driver && sp > 11) {
          this.driver.takeDamage((sp - 10) * 1.4, false, null, '车祸', ctx)
        }
      }
      this.speed *= 0.35
    }
    this.pos.x = want.x
    this.pos.z = want.z
    // 边界
    const lim = ctx.world.play
    this.pos.x = clamp(this.pos.x, -lim, lim)
    this.pos.z = clamp(this.pos.z, -lim, lim)
    // 撞人判定
    this.runOver(ctx)
    // 贴地 + 坡度限速
    const g = ctx.world.groundHeight(this.pos.x, this.pos.z)
    this.pos.y = damp(this.pos.y, g, 14, dt)
    // 水里强制减速
    if (g < ctx.world.waterY + 0.2) this.speed = clamp(this.speed, -2.5, 2.5)
    // 车尾扬尘（高速更密集，左右轮交替）
    const spd = Math.abs(this.speed)
    if (spd > 5) {
      this.dustAcc += dt * spd
      const interval = spd > 12 ? 1.5 : 2.4
      if (this.dustAcc > interval) {
        this.dustAcc = 0
        this.dustSide = -this.dustSide
        const ox = dirZ * this.dustSide * 0.7
        const oz = -dirX * this.dustSide * 0.7
        ctx.fx.dust(this.pos.x - dirX * 1.7 + ox, this.pos.y + 0.15, this.pos.z - dirZ * 1.7 + oz, spd > 12 ? 5 : 3)
      }
    }
    // 视觉俯仰/侧倾
    const ahead = ctx.world.groundHeight(this.pos.x + dirX * 1.8, this.pos.z + dirZ * 1.8)
    const behind = ctx.world.groundHeight(this.pos.x - dirX * 1.8, this.pos.z - dirZ * 1.8)
    const right = ctx.world.groundHeight(this.pos.x + dirZ * 1.0, this.pos.z - dirX * 1.0)
    const left = ctx.world.groundHeight(this.pos.x - dirZ * 1.0, this.pos.z + dirX * 1.0)
    this.pitch = damp(this.pitch, Math.atan2(behind - ahead, 3.6), 8, dt)
    this.roll = damp(this.roll, Math.atan2(left - right, 2.0), 8, dt)
    // 轮转 + 前轮转向（高速时轮胎细微摆动）
    this.wheelSpin += (this.speed / 0.42) * dt
    const wobble = spd > 10 ? Math.sin(this.wheelSpin * 2.3) * 0.022 * Math.min(1, (spd - 10) / 6) : 0
    for (const w of this.wheels) w.rotation.x = this.wheelSpin
    for (const p of this.frontPivots) p.rotation.y = this.steerVis + wobble
    this.sync()
  }

  private sync() {
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ')
  }
}
