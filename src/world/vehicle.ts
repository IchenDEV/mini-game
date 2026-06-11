import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import type { Ctx } from '../core/ctx'
import type { Character } from '../entities/character'

/**
 * 简化可驾驶越野车：贴地行驶 + 圆形碰撞 + 坡度俯仰 + 油量 + 撞击行人。
 * F 上车 / 下车，W/S 油门倒挡，A/D 转向，空格手刹。
 */
export class Vehicle {
  mesh = new THREE.Group()
  pos = new THREE.Vector3()
  yaw = 0
  speed = 0
  occupied = false
  /** 油量 0-100，耗尽无法加速 */
  fuel = 0
  driver: Character | null = null
  private pitch = 0
  private roll = 0
  private wheels: THREE.Mesh[] = []
  private frontPivots: THREE.Group[] = []
  private wheelSpin = 0
  private steerVis = 0
  private hitCd = new Map<number, number>()
  private dustAcc = 0
  private lowFuelNoticed = false

  constructor(scene: THREE.Scene, x: number, z: number, yaw: number, groundY: number) {
    this.pos.set(x, groundY, z)
    this.yaw = yaw
    this.fuel = 35 + Math.random() * 45
    this.build()
    scene.add(this.mesh)
    this.sync()
  }

  private build() {
    const bodyC = new THREE.MeshLambertMaterial({ color: 0x5d6e46, flatShading: true })
    const darkC = new THREE.MeshLambertMaterial({ color: 0x3a4034, flatShading: true })
    const seatC = new THREE.MeshLambertMaterial({ color: 0x2c2f2a, flatShading: true })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.castShadow = true
      this.mesh.add(m)
      return m
    }
    // 底盘 + 车头 + 座舱（开放式吉普，+z 朝前）
    add(new THREE.BoxGeometry(2.0, 0.5, 3.6), bodyC, 0, 0.62, 0)
    add(new THREE.BoxGeometry(1.9, 0.4, 1.0), bodyC, 0, 1.0, 1.25)
    add(new THREE.BoxGeometry(0.16, 0.5, 0.04), darkC, 0, 1.42, 0.72)
    // 方向盘
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 5, 10), darkC)
    wheel.position.set(-0.45, 1.32, 0.42)
    wheel.rotation.x = -1.1
    this.mesh.add(wheel)
    // 风挡框
    add(new THREE.BoxGeometry(1.8, 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x9fb4bd, transparent: true, opacity: 0.45 }), 0, 1.55, 0.7)
    // 座椅
    add(new THREE.BoxGeometry(0.7, 0.5, 0.6), seatC, -0.45, 1.05, -0.1)
    add(new THREE.BoxGeometry(0.7, 0.5, 0.6), seatC, 0.45, 1.05, -0.1)
    // 座椅靠背
    add(new THREE.BoxGeometry(0.7, 0.55, 0.12), seatC, -0.45, 1.38, -0.42)
    add(new THREE.BoxGeometry(0.7, 0.55, 0.12), seatC, 0.45, 1.38, -0.42)
    // 防滚架
    add(new THREE.BoxGeometry(0.1, 0.9, 0.1), darkC, -0.85, 1.3, -0.9)
    add(new THREE.BoxGeometry(0.1, 0.9, 0.1), darkC, 0.85, 1.3, -0.9)
    add(new THREE.BoxGeometry(1.85, 0.1, 0.1), darkC, 0, 1.78, -0.9)
    // 后部油桶（细节）
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8), new THREE.MeshLambertMaterial({ color: 0x7a3a30, flatShading: true }))
    drum.position.set(0.55, 1.05, -1.55)
    drum.castShadow = true
    this.mesh.add(drum)
    // 备胎
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10)
    const spare = new THREE.Mesh(wheelGeo, darkC)
    spare.rotation.x = Math.PI / 2
    spare.position.set(0, 0.95, -1.92)
    this.mesh.add(spare)
    // 四轮（前轮带转向枢轴）
    for (const [sx, sz] of [[-1.0, 1.25], [1.0, 1.25], [-1.0, -1.15], [1.0, -1.15]]) {
      const w = new THREE.Mesh(wheelGeo, darkC)
      w.rotation.z = Math.PI / 2
      w.castShadow = true
      const pivot = new THREE.Group()
      pivot.position.set(sx, 0.42, sz)
      pivot.add(w)
      this.mesh.add(pivot)
      this.wheels.push(w)
      if (sz > 0) this.frontPivots.push(pivot)
    }
  }

  /** 驾驶输入更新（由玩家驾驶时调用） */
  drive(dt: number, ctx: Ctx, throttle: number, steer: number, brake: boolean) {
    const maxF = 16, maxR = -6.5
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
    if (throttle > 0 && hasFuel) this.speed += 11 * dt
    else if (throttle < 0 && hasFuel) this.speed -= 12 * dt
    else this.speed = damp(this.speed, 0, 0.9, dt)
    if (brake) this.speed = damp(this.speed, 0, 5, dt)
    this.speed = clamp(this.speed, maxR, maxF)
    // 转向随速度（低速转向更小，倒车反向）
    const k = clamp(Math.abs(this.speed) / 7, 0, 1)
    this.yaw -= steer * 1.55 * k * dt * Math.sign(this.speed || 1)
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
      if (Math.abs(lx) > 1.4 || Math.abs(lz) > 2.5) continue
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
      if (this.driver?.isPlayer) ctx.fx.addShake(0.32)
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
    ctx.world.col.resolveCircle(want, this.pos.y + 0.55, this.pos.y + 1.5, 1.45)
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
    // 车尾扬尘
    const spd = Math.abs(this.speed)
    if (spd > 5) {
      this.dustAcc += dt * spd
      if (this.dustAcc > 2.6) {
        this.dustAcc = 0
        ctx.fx.dust(this.pos.x - dirX * 1.7, this.pos.y + 0.15, this.pos.z - dirZ * 1.7, 3)
      }
    }
    // 视觉俯仰/侧倾
    const ahead = ctx.world.groundHeight(this.pos.x + dirX * 1.8, this.pos.z + dirZ * 1.8)
    const behind = ctx.world.groundHeight(this.pos.x - dirX * 1.8, this.pos.z - dirZ * 1.8)
    const right = ctx.world.groundHeight(this.pos.x + dirZ * 1.0, this.pos.z - dirX * 1.0)
    const left = ctx.world.groundHeight(this.pos.x - dirZ * 1.0, this.pos.z + dirX * 1.0)
    this.pitch = damp(this.pitch, Math.atan2(behind - ahead, 3.6), 8, dt)
    this.roll = damp(this.roll, Math.atan2(left - right, 2.0), 8, dt)
    // 轮转 + 前轮转向
    this.wheelSpin += (this.speed / 0.42) * dt
    for (const w of this.wheels) w.rotation.x = this.wheelSpin
    for (const p of this.frontPivots) p.rotation.y = this.steerVis
    this.sync()
  }

  private sync() {
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ')
  }
}
