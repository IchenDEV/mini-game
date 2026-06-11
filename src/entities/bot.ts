import * as THREE from 'three'
import { Character } from './character'
import { WeaponInst } from '../combat/weapon'
import { WEAPONS, ARMOR_DURABILITY, weaponScore, Rarity } from '../items/defs'
import type { Ctx } from '../core/ctx'
import type { GroundItem } from '../items/loot'
import { RNG } from '../utils/rng'
import { clamp, damp, dampAngle, dist2D } from '../utils/math'

const _muzzle = new THREE.Vector3()
const _dir = new THREE.Vector3()

type BotState = 'wander' | 'goto' | 'loot' | 'combat' | 'flee' | 'heal'

interface Band { min: number; max: number }
const RANGE_BANDS: Record<string, Band> = {
  AR: { min: 10, max: 55 }, DMR: { min: 18, max: 110 }, SR: { min: 28, max: 170 },
  SG: { min: 0, max: 13 }, SMG: { min: 0, max: 28 }, LMG: { min: 12, max: 70 },
  XBOW: { min: 8, max: 45 }, PISTOL: { min: 0, max: 32 }, MELEE: { min: 0, max: 1.6 },
}

/** AI 敌人：感知 → 决策 → 移动/战斗 */
export class Bot extends Character {
  skill = 1
  state: BotState = 'wander'
  target: Character | null = null
  private lastSeenPos = new THREE.Vector3()
  private lastSeenT = -99
  private reactUntil = 0
  private dest: { x: number; z: number } | null = null
  meds = 0
  ammoPool = 0
  private rng: RNG
  private nextThink = 0
  private strafeDir = 1
  private strafeFlipT = 0
  private burstUntil = 0
  private pauseUntil = 0
  private claimed: GroundItem | null = null
  private healUntil = -1
  private healStartT = 0
  private fleeUntil = 0
  private avoidYaw = 0
  private avoidUntil = 0
  private probeT = 0
  private stuckCheckT = 0
  private stuckX = 0
  private stuckZ = 0
  private noWeaponT = 0
  private ammoGrantT = 0
  private pendReload = -1
  private wanderSprint = false
  private semiGap = 1.5
  private meleeLastT = -99
  /** 跳伞里程（航线 s 值），由 Game 分配 */
  jumpS = 0
  inPlane = true
  private dropTarget = { x: 0, z: 0 }
  /** 远端低频模拟的 dt 累积 */
  private lowAcc = 0

  constructor(rngSeed: number) {
    super()
    this.rng = new RNG(rngSeed)
    this.skill = this.rng.range(0.65, 1.1)
  }

  init(scene: THREE.Scene, x: number, z: number, ctx: Ctx) {
    const palette = [0x6e6a55, 0x5d6657, 0x7a6248, 0x56606e, 0x6b5a5a, 0x4f5d52]
    this.buildModel(scene, this.rng.pick(palette))
    this.dropTarget.x = x + this.rng.range(-18, 18)
    this.dropTarget.z = z + this.rng.range(-18, 18)
    this.pos.set(x, 500, z)
    this.dropping = true
    this.model.visible = false
    this.yaw = this.rng.range(0, Math.PI * 2)
    // 初始装备
    const roll = this.rng.next()
    if (roll < 0.34) {
      const w = new WeaponInst(WEAPONS.p9, 0)
      w.mag = w.magSize
      this.setWeapon(w)
      this.ammoPool = 36
    } else if (roll < 0.46) {
      const w = new WeaponInst(WEAPONS.wasp, 0)
      w.mag = w.magSize
      this.setWeapon(w)
      this.ammoPool = 60
    }
    if (this.rng.chance(0.25)) {
      this.armor = { level: 1, dur: ARMOR_DURABILITY[1] }
      this.setArmorVisual()
    }
    this.meds = this.rng.int(0, 1)
    this.noWeaponT = 0
    this.nextThink = this.rng.range(0, 0.3)
  }

  /** 从飞机跳出 */
  jumpOut(x: number, y: number, z: number) {
    this.inPlane = false
    this.pos.set(x, y, z)
    this.model.visible = true
    this.attachChute(this.rng.pick([0xc9a23f, 0x8a9a4a, 0x4a7a9a, 0x9a5a4a]))
  }

  /** 跳伞下落：朝预定落点漂移 */
  private updateDrop(dt: number, ctx: Ctx) {
    const dx = this.dropTarget.x - this.pos.x
    const dz = this.dropTarget.z - this.pos.z
    const d = Math.hypot(dx, dz)
    const g = ctx.world.col.groundAt(this.pos.x, this.pos.z, this.pos.y)
    const high = this.pos.y - g > 42
    this.setChuteVisible(!high)
    const hs = high ? 13 : 6.5
    if (d > 1.5) {
      this.vel.x = damp(this.vel.x, (dx / d) * Math.min(hs, d * 1.5), 2.2, dt)
      this.vel.z = damp(this.vel.z, (dz / d) * Math.min(hs, d * 1.5), 2.2, dt)
      this.yaw = Math.atan2(dx, dz)
    } else {
      this.vel.x = damp(this.vel.x, 0, 2.2, dt)
      this.vel.z = damp(this.vel.z, 0, 2.2, dt)
    }
    this.vel.y = damp(this.vel.y, high ? -32 : -9.5, 2.2, dt)
    this.pos.addScaledVector(this.vel, dt)
    if (this.pos.y <= g + 0.05) {
      this.pos.y = g
      this.vel.set(0, 0, 0)
      this.dropping = false
      this.onGround = true
      this.detachChute()
      ctx.fx.dust(this.pos.x, this.pos.y, this.pos.z, 10)
    }
    this.animate(dt)
  }

  update(dt: number, ctx: Ctx) {
    if (!this.alive) return
    if (this.inPlane) return
    if (this.dropping) { this.updateDrop(dt, ctx); return }

    // aiSpawnSystem：远离玩家的 AI 低频模拟（累积 dt，约 4Hz 更新）
    const pdx = this.pos.x - ctx.player.pos.x
    const pdz = this.pos.z - ctx.player.pos.z
    if (pdx * pdx + pdz * pdz > 350 * 350) {
      this.lowAcc += dt
      if (this.lowAcc < 0.22) return
      dt = Math.min(this.lowAcc, 0.34)
      this.lowAcc = 0
    } else {
      this.lowAcc = 0
    }
    const t = ctx.time

    if (t < this.stunnedUntil) {
      this.wishX = 0; this.wishZ = 0; this.wishSpeed = 0
      super.update(dt, ctx)
      return
    }

    if (t >= this.nextThink) {
      this.nextThink = t + 0.17 + this.rng.range(0, 0.08)
      this.think(ctx)
    }

    this.exec(dt, ctx)
    super.update(dt, ctx)
  }

  // ---------------- 决策 ----------------

  private think(ctx: Ctx) {
    const t = ctx.time

    // 武器保障（模拟搜刮成功）
    if (!this.weapon) {
      this.noWeaponT += 0.2
      if (this.noWeaponT > 25) {
        const w = new WeaponInst(WEAPONS.p9, 0)
        w.mag = w.magSize
        this.setWeapon(w)
        this.ammoPool = 36
      }
    } else if (this.ammoPool <= 0 && this.weapon.mag <= 0 && t - this.ammoGrantT > 22) {
      this.ammoGrantT = t
      this.ammoPool = 40
    }

    // 感知
    const seen = this.scanEnemies(ctx)
    if (seen) {
      if (this.target !== seen) this.reactUntil = t + this.rng.range(0.4, 0.9) / this.skill
      this.target = seen
      this.lastSeenPos.copy(seen.pos)
      this.lastSeenT = t
    } else if (this.target) {
      if (!this.target.alive || t - this.lastSeenT > 4.5) {
        this.dest = { x: this.lastSeenPos.x, z: this.lastSeenPos.z }
        this.target = null
        if (this.state === 'combat') this.state = 'goto'
      }
    }

    // 听枪声
    if (!this.target && t >= ctx.graceUntil) {
      for (let i = ctx.shots.length - 1; i >= 0; i--) {
        const s = ctx.shots[i]
        if (t - s.t > 1.0) break
        if (s.shooter === this || !s.shooter.alive) continue
        const d = dist2D(this.pos.x, this.pos.z, s.x, s.z)
        if (d < s.loud && this.rng.chance(0.3)) {
          this.dest = { x: s.x + this.rng.range(-8, 8), z: s.z + this.rng.range(-8, 8) }
          if (this.state === 'wander') this.state = 'goto'
          break
        }
      }
    }

    // 治疗中：被打断条件
    if (this.healUntil > 0) {
      if (this.lastDamageT > this.healStartT || this.target) {
        this.healUntil = -1
        if (this.action.kind === 'heal') this.action.cancel()
        this.state = this.target ? 'combat' : 'wander'
      } else if (t >= this.healUntil) {
        this.hp = Math.min(100, this.hp + 62)
        this.meds = Math.max(0, this.meds - 1)
        this.healUntil = -1
        this.state = 'wander'
        this.dest = null
      } else {
        return // 持续治疗
      }
    }

    // 状态决策（优先级）
    const out = ctx.zone.outside(this.pos.x, this.pos.z)
    if (this.hp < 32 && (this.target || t - this.lastDamageT < 3)) {
      if (this.state !== 'flee') {
        this.state = 'flee'
        this.fleeUntil = t + 6
        const threat = this.target ?? this.lastAttacker
        let ang = this.rng.range(0, Math.PI * 2)
        if (threat) ang = Math.atan2(this.pos.x - threat.pos.x, this.pos.z - threat.pos.z) + this.rng.range(-0.6, 0.6)
        this.dest = {
          x: clamp(this.pos.x + Math.sin(ang) * 30, -360, 360),
          z: clamp(this.pos.z + Math.cos(ang) * 30, -360, 360),
        }
      }
      return
    }
    if (this.state === 'flee') {
      if (t < this.fleeUntil && this.dest && dist2D(this.pos.x, this.pos.z, this.dest.x, this.dest.z) > 3) return
      this.state = 'wander'
      this.dest = null
    }
    // 轰炸区规避：保命优先于一切交战
    for (const dz of ctx.events.dangerZones()) {
      const d = dist2D(this.pos.x, this.pos.z, dz.x, dz.z)
      if (d < dz.r) {
        const ang = Math.atan2(this.pos.x - dz.x, this.pos.z - dz.z) + this.rng.range(-0.3, 0.3)
        const run = dz.r - d + 14
        this.state = 'flee'
        this.fleeUntil = t + 5
        this.wanderSprint = true
        this.dest = {
          x: clamp(this.pos.x + Math.sin(ang) * run, -360, 360),
          z: clamp(this.pos.z + Math.cos(ang) * run, -360, 360),
        }
        return
      }
    }
    if (this.target) {
      this.state = 'combat'
      return
    }
    if (out) {
      // 向安全区移动
      if (!this.dest || !this.insideTarget(ctx, this.dest.x, this.dest.z)) {
        this.dest = this.pickZonePoint(ctx)
      }
      this.state = 'goto'
      this.wanderSprint = true
      return
    }
    if (this.hp < 62 && this.meds > 0 && t - this.lastDamageT > 5) {
      this.state = 'heal'
      this.healStartT = t
      this.healUntil = t + 4.5
      this.action.start('heal', 4.5)
      return
    }
    // 缩圈预判
    const z = ctx.zone
    const dToNext = dist2D(this.pos.x, this.pos.z, z.target.x, z.target.z) - z.target.r
    if (dToNext > 0 && z.mode !== 'done') {
      const eta = dToNext / 5.5
      if (z.mode === 'shrink' || z.tLeft < eta + 8) {
        if (!this.dest || !this.insideTarget(ctx, this.dest.x, this.dest.z)) this.dest = this.pickZonePoint(ctx)
        this.state = 'goto'
        this.wanderSprint = z.mode === 'shrink'
        return
      }
    }
    // 搜刮
    if (this.state !== 'loot' || !this.claimed || !ctx.loot.items.has(this.claimed.id)) {
      const want = this.findLoot(ctx)
      if (want) {
        if (this.claimed && this.claimed.claimedBy === this.id) this.claimed.claimedBy = 0
        this.claimed = want
        want.claimedBy = this.id
        this.state = 'loot'
        this.dest = { x: want.x, z: want.z }
        return
      }
    } else if (this.state === 'loot') {
      return
    }
    // 漫游
    if (this.state !== 'goto' || !this.dest || dist2D(this.pos.x, this.pos.z, this.dest.x, this.dest.z) < 3) {
      this.state = 'wander'
      if (!this.dest || dist2D(this.pos.x, this.pos.z, this.dest.x, this.dest.z) < 3) {
        this.dest = this.pickWanderPoint(ctx)
        this.wanderSprint = this.rng.chance(0.3)
      }
    }
  }

  private insideTarget(ctx: Ctx, x: number, z: number): boolean {
    const zt = ctx.zone.target
    return dist2D(x, z, zt.x, zt.z) < zt.r * 0.92
  }

  private pickZonePoint(ctx: Ctx): { x: number; z: number } {
    const zt = ctx.zone.target
    const a = this.rng.range(0, Math.PI * 2)
    const r = Math.sqrt(this.rng.next()) * zt.r * 0.78
    const lim = ctx.world.play - 20
    return { x: clamp(zt.x + Math.cos(a) * r, -lim, lim), z: clamp(zt.z + Math.sin(a) * r, -lim, lim) }
  }

  private pickWanderPoint(ctx: Ctx): { x: number; z: number } {
    // 空投吸引
    for (const a of ctx.loot.airdrops) {
      if (a.landed && dist2D(this.pos.x, this.pos.z, a.x, a.z) < 220 && this.rng.chance(0.3)) {
        return { x: a.x + this.rng.range(-6, 6), z: a.z + this.rng.range(-6, 6) }
      }
    }
    // 局内事件吸引：补给点 / 车队 / 信号塔（高技巧 AI 更敢去抢）
    for (const at of ctx.events.attractions()) {
      const d = dist2D(this.pos.x, this.pos.z, at.x, at.z)
      if (d < 260 && this.rng.chance(this.skill > 1 ? 0.4 : 0.2)) {
        return { x: at.x + this.rng.range(-5, 5), z: at.z + this.rng.range(-5, 5) }
      }
    }
    if (this.rng.chance(0.5)) {
      const poi = this.rng.pick(ctx.world.pois)
      if (this.insideTarget(ctx, poi.x, poi.z) || dist2D(poi.x, poi.z, ctx.zone.cur.x, ctx.zone.cur.z) < ctx.zone.cur.r) {
        const a = this.rng.range(0, Math.PI * 2)
        return { x: poi.x + Math.cos(a) * poi.r * 0.5, z: poi.z + Math.sin(a) * poi.r * 0.5 }
      }
    }
    return this.pickZonePoint(ctx)
  }

  private scanEnemies(ctx: Ctx): Character | null {
    const t = ctx.time
    if (t < ctx.graceUntil) return null
    let best: Character | null = null
    let bestD = 1e9
    for (const c of ctx.chars) {
      if (c === this || !c.alive) continue
      if (c.dropping) continue
      const d = dist2D(this.pos.x, this.pos.z, c.pos.x, c.pos.z)
      // 视野随生物群系调整：沙漠开阔更远，雨林茂密更近
      let range = 95 * clamp(this.skill, 0.8, 1.15) * ctx.world.biome.aiVisionMul
      if (c.crouching) range *= 0.55
      if (c.sprinting) range *= 1.15
      if (d > range || d > bestD) continue
      if (d > 6) {
        const dx = (c.pos.x - this.pos.x) / d, dz = (c.pos.z - this.pos.z) / d
        if (dx * this.forwardX() + dz * this.forwardZ() < 0.6) continue
      }
      const eyeY = this.pos.y + this.eyeH
      const tgtY = c.pos.y + 1.2
      if (!ctx.world.col.losClear(this.pos.x, eyeY, this.pos.z, c.pos.x, tgtY, c.pos.z)) continue
      if (ctx.fx.smokeBlocked(this.pos.x, eyeY, this.pos.z, c.pos.x, tgtY, c.pos.z)) continue
      best = c
      bestD = d
    }
    return best
  }

  private findLoot(ctx: Ctx): GroundItem | null {
    const myScore = this.weapon ? weaponScore(this.weapon.def, this.weapon.rarity) : -1
    let best: GroundItem | null = null
    let bestD = 70
    for (const gi of ctx.loot.items.values()) {
      if (gi.claimedBy !== 0 && gi.claimedBy !== this.id) continue
      let useful = false
      if (gi.kind === 'weapon') {
        useful = weaponScore(gi.weapon!.def, gi.weapon!.rarity) > myScore + 0.5 && gi.weapon!.def.cls !== 'MELEE'
      } else if (gi.kind === 'ammo') {
        useful = !!this.weapon && this.weapon.def.ammo === gi.ammoType && this.ammoPool < 50
      } else if (gi.kind === 'item') {
        const id = gi.itemId!
        if (id.startsWith('armor')) useful = (this.armor?.level ?? 0) < Number(id[5])
        else if (id.startsWith('helm')) useful = (this.helmet?.level ?? 0) < Number(id[4])
        else if (id === 'bandage' || id === 'firstaid' || id === 'medkit') useful = this.meds < 2
      }
      if (!useful) continue
      const d = dist2D(this.pos.x, this.pos.z, gi.x, gi.z)
      if (d < bestD) { best = gi; bestD = d }
    }
    return best
  }

  // ---------------- 执行 ----------------

  private exec(dt: number, ctx: Ctx) {
    const t = ctx.time
    this.wishX = 0; this.wishZ = 0; this.wishSpeed = 0
    this.sprinting = false
    this.poseAiming = this.state === 'combat' && this.target !== null

    // 换弹完成
    if (this.pendReload > 0 && t >= this.pendReload) {
      this.pendReload = -1
      if (this.weapon) {
        const take = Math.min(this.weapon.magSize - this.weapon.mag, this.ammoPool)
        this.weapon.mag += take
        this.ammoPool -= take
      }
    }

    switch (this.state) {
      case 'combat':
        this.execCombat(dt, ctx)
        break
      case 'heal':
        this.crouching = true
        break
      case 'flee':
        this.crouching = false
        if (this.dest) this.moveToward(dt, ctx, this.dest.x, this.dest.z, true)
        break
      case 'loot': {
        this.crouching = false
        if (this.claimed && ctx.loot.items.has(this.claimed.id)) {
          const d = dist2D(this.pos.x, this.pos.z, this.claimed.x, this.claimed.z)
          if (d < 1.8) this.pickupClaimed(ctx)
          else this.moveToward(dt, ctx, this.claimed.x, this.claimed.z, false)
        } else {
          this.state = 'wander'
          this.claimed = null
        }
        break
      }
      default:
        this.crouching = false
        if (this.dest) {
          this.moveToward(dt, ctx, this.dest.x, this.dest.z, this.wanderSprint)
          if (dist2D(this.pos.x, this.pos.z, this.dest.x, this.dest.z) < 2.2) this.dest = null
        }
        break
    }

    // 卡住检测
    this.stuckCheckT -= dt
    if (this.stuckCheckT <= 0) {
      this.stuckCheckT = 1.3
      const moved = dist2D(this.pos.x, this.pos.z, this.stuckX, this.stuckZ)
      if (this.wishSpeed > 0.5 && moved < 0.5) {
        this.wantJump = true
        this.avoidYaw = this.rng.chance(0.5) ? 1.5 : -1.5
        this.avoidUntil = t + 0.9
      }
      this.stuckX = this.pos.x
      this.stuckZ = this.pos.z
    }
  }

  private moveToward(dt: number, ctx: Ctx, tx: number, tz: number, sprint: boolean) {
    const t = ctx.time
    let yaw = Math.atan2(tx - this.pos.x, tz - this.pos.z)
    // 障碍探测
    this.probeT -= dt
    if (this.probeT <= 0) {
      this.probeT = 0.28
      const eyeY = this.pos.y + 1.1
      const tryYaws = [0, 0.8, -0.8, 1.6, -1.6]
      for (const off of tryYaws) {
        const a = yaw + off
        const hit = ctx.world.col.raycast(this.pos.x, eyeY, this.pos.z, Math.sin(a), 0, Math.cos(a), 2.6, true)
        if (!hit) {
          if (off !== 0) { this.avoidYaw = off; this.avoidUntil = t + 0.6 }
          else if (t > this.avoidUntil) this.avoidYaw = 0
          break
        }
      }
    }
    if (t < this.avoidUntil) yaw += this.avoidYaw
    this.wishX = Math.sin(yaw)
    this.wishZ = Math.cos(yaw)
    let speed = sprint ? 6.5 : 4.1
    if (this.wading) speed *= 0.55
    this.wishSpeed = speed
    this.sprinting = sprint
    this.yaw = dampAngle(this.yaw, yaw, 9, dt)
  }

  private execCombat(dt: number, ctx: Ctx) {
    const tgt = this.target
    if (!tgt || !tgt.alive) { this.state = 'wander'; return }
    const t = ctx.time
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    const faceYaw = Math.atan2(dx, dz)
    this.yaw = dampAngle(this.yaw, faceYaw, 12, dt)
    const dy = tgt.pos.y + 1.15 - (this.pos.y + this.eyeH)
    this.pitch = Math.atan2(dy, dist)

    const w = this.weapon
    const band = RANGE_BANDS[w ? w.def.cls : 'MELEE']

    // 走位
    if (!w || w.def.cls === 'MELEE') {
      this.moveToward(dt, ctx, tgt.pos.x, tgt.pos.z, true)
      this.yaw = dampAngle(this.yaw, faceYaw, 12, dt)
      if (dist < this.meleeDef.range + 0.2 && t - this.meleeLastT > 60 / this.meleeDef.rpm) {
        this.meleeLastT = t
        this.triggerPunch()
        ctx.combat.melee(ctx, this)
      }
      return
    }
    if (dist > band.max * 0.95) {
      this.moveToward(dt, ctx, tgt.pos.x, tgt.pos.z, dist > band.max * 1.6)
      this.yaw = dampAngle(this.yaw, faceYaw, 12, dt)
    } else if (dist < band.min) {
      const back = faceYaw + Math.PI
      this.wishX = Math.sin(back); this.wishZ = Math.cos(back)
      this.wishSpeed = 4.1
    } else {
      // 横向走位
      if (t > this.strafeFlipT) {
        this.strafeFlipT = t + this.rng.range(1.1, 2.3)
        this.strafeDir = this.rng.chance(0.5) ? 1 : -1
        this.crouching = dist > 55 && this.rng.chance(0.4)
      }
      const sa = faceYaw + (Math.PI / 2) * this.strafeDir
      this.wishX = Math.sin(sa)
      this.wishZ = Math.cos(sa)
      this.wishSpeed = this.crouching ? 2.2 : 3.6
    }

    // 开火
    if (t < this.reactUntil) return
    if (w.mag <= 0) {
      if (this.pendReload < 0) {
        if (this.ammoPool > 0) {
          this.pendReload = t + w.def.reload
          w.reloadEnd = this.pendReload
          this.action.start('reload', w.def.reload)
        } else if (dist > 12) {
          this.state = 'flee'
          this.fleeUntil = t + 5
          this.dest = this.pickZonePoint(ctx)
        }
      }
      return
    }
    if (dist > w.def.range) return
    // 弹道节奏
    if (w.def.auto) {
      if (t > this.pauseUntil && t > this.burstUntil) {
        this.burstUntil = t + this.rng.range(0.22, 0.5)
        this.pauseUntil = this.burstUntil + this.rng.range(0.8, 1.6)
      }
      if (t > this.burstUntil) return
    } else {
      if (t - w.lastShot < w.fireInterval * this.semiGap) return
    }
    if (!w.canFire(t)) return

    // 实时视线检查
    const eyeY = this.pos.y + this.eyeH
    const aimY = tgt.pos.y + (tgt.crouching ? 0.85 : 1.15)
    if (!ctx.world.col.losClear(this.pos.x, eyeY, this.pos.z, tgt.pos.x, aimY, tgt.pos.z)) return
    if (ctx.fx.smokeBlocked(this.pos.x, eyeY, this.pos.z, tgt.pos.x, aimY, tgt.pos.z)) return

    // 预瞄 + 误差
    const lead = clamp(dist / 420, 0, 0.5) * this.skill
    const px = tgt.pos.x + tgt.vel.x * lead
    const pz = tgt.pos.z + tgt.vel.z * lead
    this.muzzleWorld(_muzzle)
    _dir.set(px - _muzzle.x, aimY - _muzzle.y, pz - _muzzle.z).normalize()
    let sigma = (0.85 + dist * 0.02) / this.skill
    const tgtSpeed = Math.hypot(tgt.vel.x, tgt.vel.z)
    if (tgtSpeed > 3.5) sigma *= 1.55
    if (Math.hypot(this.vel.x, this.vel.z) > 2.5) sigma *= 1.35
    if (this.crouching) sigma *= 0.8
    this.semiGap = this.rng.range(1.2, 2.1)
    ctx.combat.tryFire(ctx, this, w, _muzzle, _dir, sigma)
  }

  private pickupClaimed(ctx: Ctx) {
    const gi = this.claimed!
    this.claimed = null
    this.state = 'wander'
    if (!ctx.loot.items.has(gi.id)) return
    if (gi.kind === 'weapon') {
      const w = gi.weapon!
      if (this.weapon && this.weapon.def.cls !== 'MELEE') {
        ctx.loot.spawnWeaponInst(this.pos.x, this.pos.y + 0.05, this.pos.z, this.weapon)
      }
      const sameAmmo = this.weapon?.def.ammo === w.def.ammo
      this.setWeapon(w)
      w.mag = w.magSize
      if (!sameAmmo) this.ammoPool = 45
      else this.ammoPool = Math.max(this.ammoPool, 30)
    } else if (gi.kind === 'ammo') {
      this.ammoPool += gi.count
    } else if (gi.kind === 'item') {
      const id = gi.itemId!
      if (id.startsWith('armor')) {
        this.armor = { level: Number(id[5]), dur: ARMOR_DURABILITY[Number(id[5])] }
        this.setArmorVisual()
      } else if (id.startsWith('helm')) {
        this.helmet = { level: Number(id[4]), dur: ARMOR_DURABILITY[Number(id[4])] }
        this.setHelmetVisual()
      } else {
        this.meds++
      }
    }
    ctx.loot.remove(gi)
  }
}

/** 生成 AI 名称 */
const BOT_NAMES = [
  '灰狼', '夜鸮', '秃鹫', '野犬', '沙蝰', '黑貂', '白狐', '猎隼', '斑鬣', '岩羊',
  '赤狐', '苍鹰', '孤狼', '水獭', '棕熊', '云豹', '银环', '红隼', '石貂', '貉绒',
  '獾爪', '蓝鹊', '乌鸫', '潜鸟', '雪鸮', '金雕', '游隼', '鸬鹚', '池鹭', '白鹡',
  '风蜥', '夜枭', '砂狐', '燕隼', '岩鸽', '黑鸢',
]
export function botName(i: number): string {
  return BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? `-${Math.floor(i / BOT_NAMES.length) + 1}` : '')
}
