import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import { surface, glass, cloth, metal } from '../rendering/materials'
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

  /** 车轮组：胎面 + 轮毂盖，前轮挂转向枢轴 */
  private addWheels(positions: [number, number][], r: number, w: number, darkC: THREE.Material) {
    const wheelGeo = new THREE.CylinderGeometry(r, r, w, 10)
    const hubGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.04, 8)
    const hubC = metal(0x8d9296)
    for (const [sx, sz] of positions) {
      const grp = new THREE.Group()
      const tire = new THREE.Mesh(wheelGeo, darkC)
      tire.castShadow = true
      grp.add(tire, new THREE.Mesh(hubGeo, hubC))
      grp.rotation.z = Math.PI / 2
      const pivot = new THREE.Group()
      pivot.position.set(sx, r, sz)
      pivot.add(grp)
      this.mesh.add(pivot)
      this.wheels.push(grp)
      if (sz > 0) this.frontPivots.push(pivot)
    }
  }

  /** 车灯：前大灯（暖白）+ 尾灯（红） */
  private addLights(w2: number, frontZ: number, backZ: number, y: number) {
    const head = surface({ color: 0xfff2c9, roughness: 0.3, emissive: 0x5d543a })
    const tail = surface({ color: 0xb33327, roughness: 0.4, emissive: 0x3d0c08 })
    for (const sx of [-w2, w2]) {
      this.add(new THREE.BoxGeometry(0.28, 0.16, 0.06), head, sx, y, frontZ)
      this.add(new THREE.BoxGeometry(0.24, 0.14, 0.05), tail, sx, y + 0.02, backZ)
    }
  }

  private build() {
    const bodyHex = this.spec.colors[Math.floor(Math.random() * this.spec.colors.length)]
    const bodyC = surface({ color: bodyHex, roughness: 0.42, metalness: 0.45, flatShading: true })
    const darkC = surface({ color: 0x3a4034, roughness: 0.72, metalness: 0.2, flatShading: true })
    const trimC = surface({ color: 0x2e3134, roughness: 0.6, metalness: 0.3, flatShading: true })
    const seatC = cloth(0x2c2f2a)
    const glassC = glass(0x9fc4d4)
    if (this.kind === 'buggy') this.buildBuggy(bodyC, darkC, trimC, seatC, glassC)
    else if (this.kind === 'pickup') this.buildPickup(bodyC, darkC, trimC, seatC, glassC)
    else this.buildVan(bodyC, darkC, trimC, seatC, glassC)
  }

  /** 开放式越野吉普（+z 朝前） */
  private buildBuggy(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 底盘 + 车头
    this.add(new THREE.BoxGeometry(2.0, 0.5, 3.6), bodyC, 0, 0.62, 0)
    this.add(new THREE.BoxGeometry(1.9, 0.4, 1.0), bodyC, 0, 1.0, 1.25)
    // 前格栅 + 保险杠
    this.add(new THREE.BoxGeometry(1.5, 0.3, 0.07), trimC, 0, 0.95, 1.78)
    this.add(new THREE.BoxGeometry(2.0, 0.16, 0.18), trimC, 0, 0.52, 1.84)
    this.add(new THREE.BoxGeometry(2.0, 0.16, 0.18), trimC, 0, 0.52, -1.84)
    // 引擎盖进气口
    this.add(new THREE.BoxGeometry(0.6, 0.06, 0.5), trimC, 0, 1.22, 1.3)
    this.add(new THREE.BoxGeometry(0.16, 0.5, 0.04), darkC, 0, 1.42, 0.72)
    // 方向盘
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 5, 10), darkC)
    wheel.position.set(-0.45, 1.32, 0.42)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    // 风挡
    this.add(new THREE.BoxGeometry(1.8, 0.7, 0.08), glassC, 0, 1.55, 0.7)
    // 座椅 + 靠背
    this.add(new THREE.BoxGeometry(0.7, 0.5, 0.6), seatC, -0.45, 1.05, -0.1)
    this.add(new THREE.BoxGeometry(0.7, 0.5, 0.6), seatC, 0.45, 1.05, -0.1)
    this.add(new THREE.BoxGeometry(0.7, 0.55, 0.12), seatC, -0.45, 1.38, -0.42)
    this.add(new THREE.BoxGeometry(0.7, 0.55, 0.12), seatC, 0.45, 1.38, -0.42)
    // 防滚架
    this.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), darkC, -0.85, 1.3, -0.9)
    this.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), darkC, 0.85, 1.3, -0.9)
    this.add(new THREE.BoxGeometry(1.85, 0.1, 0.1), darkC, 0, 1.78, -0.9)
    // 油桶 + 备胎 + 排气管
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8), metal(0x7a3a30))
    drum.position.set(0.55, 1.05, -1.55)
    drum.castShadow = true
    this.mesh.add(drum)
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10), darkC)
    spare.rotation.x = Math.PI / 2
    spare.position.set(0, 0.95, -1.92)
    this.mesh.add(spare)
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), metal(0x5d6166))
    exh.rotation.x = Math.PI / 2
    exh.position.set(-0.7, 0.42, -1.85)
    this.mesh.add(exh)
    this.addLights(0.7, 1.82, -1.82, 0.98)
    this.addWheels([[-1.0, 1.25], [1.0, 1.25], [-1.0, -1.15], [1.0, -1.15]], 0.42, 0.32, darkC)
  }

  /** 皮卡：封闭驾驶舱 + 开放后斗 */
  private buildPickup(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 底盘
    this.add(new THREE.BoxGeometry(2.1, 0.5, 4.4), bodyC, 0, 0.6, 0)
    // 引擎舱
    this.add(new THREE.BoxGeometry(2.0, 0.55, 1.3), bodyC, 0, 1.05, 1.5)
    // 驾驶舱（带顶）
    this.add(new THREE.BoxGeometry(2.0, 0.85, 1.5), bodyC, 0, 1.05, 0.1)
    this.add(new THREE.BoxGeometry(1.9, 0.12, 1.45), bodyC, 0, 1.92, 0.08)
    // A/B 柱 + 风挡 + 侧窗 + 后窗
    this.add(new THREE.BoxGeometry(1.76, 0.62, 0.07), glassC, 0, 1.6, 0.78)
    this.add(new THREE.BoxGeometry(1.76, 0.58, 0.07), glassC, 0, 1.58, -0.62)
    for (const sx of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.07, 0.58, 1.2), glassC, sx * 0.94, 1.58, 0.08)
      this.add(new THREE.BoxGeometry(0.09, 0.66, 0.1), bodyC, sx * 0.95, 1.6, 0.76)
      this.add(new THREE.BoxGeometry(0.09, 0.66, 0.1), bodyC, sx * 0.95, 1.6, -0.6)
    }
    // 后斗：底板 + 三侧板 + 尾门
    this.add(new THREE.BoxGeometry(2.0, 0.1, 1.7), trimC, 0, 0.88, -1.45)
    this.add(new THREE.BoxGeometry(0.09, 0.5, 1.7), bodyC, -0.96, 0.92, -1.45)
    this.add(new THREE.BoxGeometry(0.09, 0.5, 1.7), bodyC, 0.96, 0.92, -1.45)
    this.add(new THREE.BoxGeometry(2.0, 0.5, 0.09), bodyC, 0, 0.92, -2.26)
    // 后斗货物（随机木箱）
    if (Math.random() < 0.6) this.add(new THREE.BoxGeometry(0.7, 0.5, 0.7), cloth(0x6e5a3c), 0.3, 0.95, -1.3)
    // 格栅 + 保险杠
    this.add(new THREE.BoxGeometry(1.6, 0.35, 0.08), trimC, 0, 1.0, 2.12)
    this.add(new THREE.BoxGeometry(2.1, 0.18, 0.2), trimC, 0, 0.5, 2.18)
    this.add(new THREE.BoxGeometry(2.1, 0.18, 0.2), trimC, 0, 0.5, -2.32)
    // 车顶探照灯排
    this.add(new THREE.BoxGeometry(1.2, 0.1, 0.12), trimC, 0, 2.02, 0.6)
    for (const lx of [-0.4, 0, 0.4]) {
      this.add(new THREE.BoxGeometry(0.16, 0.12, 0.1), surface({ color: 0xfff2c9, roughness: 0.35, emissive: 0x2c281b }), lx, 2.05, 0.66)
    }
    // 内饰：座椅 + 方向盘
    this.add(new THREE.BoxGeometry(0.65, 0.45, 0.55), seatC, -0.45, 0.95, 0.0)
    this.add(new THREE.BoxGeometry(0.65, 0.45, 0.55), seatC, 0.45, 0.95, 0.0)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10), darkC)
    wheel.position.set(-0.45, 1.3, 0.55)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    // 排气管
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.45, 6), metal(0x5d6166))
    exh.rotation.x = Math.PI / 2
    exh.position.set(0.75, 0.38, -2.3)
    this.mesh.add(exh)
    this.addLights(0.78, 2.16, -2.3, 1.0)
    this.addWheels([[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.4], [1.05, -1.4]], 0.45, 0.34, darkC)
  }

  /** 厢式车：整箱车身 + 短车头 + 车顶行李架 */
  private buildVan(bodyC: THREE.Material, darkC: THREE.Material, trimC: THREE.Material, seatC: THREE.Material, glassC: THREE.Material) {
    // 底盘
    this.add(new THREE.BoxGeometry(2.1, 0.45, 4.6), trimC, 0, 0.55, 0)
    // 厢体
    this.add(new THREE.BoxGeometry(2.1, 1.5, 3.4), bodyC, 0, 1.0, -0.5)
    // 车头（短鼻 + 斜面感用两段盒子）
    this.add(new THREE.BoxGeometry(2.05, 1.0, 1.3), bodyC, 0, 1.0, 1.6)
    this.add(new THREE.BoxGeometry(1.95, 0.45, 0.5), bodyC, 0, 2.0, 1.45)
    // 风挡（大块）+ 侧窗（驾驶位）
    this.add(new THREE.BoxGeometry(1.8, 0.72, 0.08), glassC, 0, 1.72, 2.0)
    for (const sx of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.07, 0.5, 0.9), glassC, sx * 1.02, 1.62, 1.35)
    }
    // 厢体侧滑门线 + 后双开门线（凹槽细条）
    this.add(new THREE.BoxGeometry(0.04, 1.2, 0.05), trimC, 1.06, 0.95, 0.1)
    this.add(new THREE.BoxGeometry(0.04, 1.2, 0.05), trimC, 1.06, 0.95, -1.2)
    this.add(new THREE.BoxGeometry(0.05, 1.35, 0.04), trimC, 0, 0.95, -2.21)
    // 车顶行李架
    for (const sz of [-1.6, -0.6, 0.4]) {
      this.add(new THREE.BoxGeometry(1.9, 0.07, 0.07), metal(0x6e7479), 0, 2.55, sz)
    }
    this.add(new THREE.BoxGeometry(0.07, 0.09, 2.4), metal(0x6e7479), -0.88, 2.54, -0.7)
    this.add(new THREE.BoxGeometry(0.07, 0.09, 2.4), metal(0x6e7479), 0.88, 2.54, -0.7)
    // 格栅 + 保险杠
    this.add(new THREE.BoxGeometry(1.5, 0.3, 0.08), trimC, 0, 0.92, 2.28)
    this.add(new THREE.BoxGeometry(2.1, 0.2, 0.2), trimC, 0, 0.46, 2.32)
    this.add(new THREE.BoxGeometry(2.1, 0.2, 0.2), trimC, 0, 0.46, -2.32)
    // 后视镜
    for (const sx of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.08, 0.18, 0.12), trimC, sx * 1.14, 1.78, 1.95)
    }
    // 内饰
    this.add(new THREE.BoxGeometry(0.65, 0.45, 0.55), seatC, -0.45, 0.95, 1.45)
    this.add(new THREE.BoxGeometry(0.65, 0.45, 0.55), seatC, 0.45, 0.95, 1.45)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10), darkC)
    wheel.position.set(-0.45, 1.32, 1.95)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    this.addLights(0.8, 2.3, -2.32, 0.95)
    this.addWheels([[-1.06, 1.55], [1.06, 1.55], [-1.06, -1.45], [1.06, -1.45]], 0.44, 0.32, darkC)
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
