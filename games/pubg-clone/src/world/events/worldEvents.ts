import * as THREE from 'three'
import type { Ctx } from '../../core/ctx'
import { RNG } from '../../utils/rng'
import { dist2D } from '../../utils/math'
import { carWreck } from '../poi/poiTemplates'
import { Vehicle } from '../vehicle'

export type WorldEventKind = 'bombing' | 'supply' | 'convoy' | 'tower'

/** HUD 小地图标记 */
export interface EventMarker {
  kind: WorldEventKind
  x: number
  z: number
  r: number
  label: string
  /** bombing 预警阶段闪烁 */
  warn: boolean
  /** tower 占领进度 0-1 */
  progress?: number
}

interface ActiveEvent {
  kind: WorldEventKind
  x: number
  z: number
  r: number
  until: number
  // bombing
  warnUntil?: number
  nextBomb?: number
  // tower
  progress?: number
  claimed?: boolean
  towerLight?: THREE.PointLight
}

const CYCLE: WorldEventKind[] = ['bombing', 'convoy', 'tower', 'supply']

/**
 * 局内动态事件：轰炸区 / 临时补给点 / 车队残骸 / 信号塔争夺。
 * 节奏：落地约 40s 后首个补给点，之后每次缩圈阶段推进轮换触发一个，
 * 并发上限 2，保证每局 2-4 个动态变化点。
 */
export class WorldEvents {
  private active: ActiveEvent[] = []
  private rng = new RNG((Math.random() * 1e9) | 0)
  private cycleIdx = 0
  private lastZoneIdx = -1
  private firstAt = -1
  private firstDone = false
  private spawnedCount = 0

  update(ctx: Ctx, dt: number) {
    if (ctx.state !== 'play') return
    if (this.firstAt < 0) this.firstAt = ctx.time + 40

    // ---- 调度 ----
    if (!this.firstDone && ctx.time >= this.firstAt) {
      this.firstDone = true
      this.spawn(ctx, 'supply')
    }
    if (this.lastZoneIdx < 0) this.lastZoneIdx = ctx.zone.idx
    if (ctx.zone.idx !== this.lastZoneIdx) {
      this.lastZoneIdx = ctx.zone.idx
      if (this.active.length < 2 && this.spawnedCount < 5) {
        this.spawn(ctx, CYCLE[this.cycleIdx % CYCLE.length])
        this.cycleIdx++
      }
    }

    // ---- 推进 ----
    for (const ev of this.active) {
      if (ev.kind === 'bombing') this.tickBombing(ctx, ev)
      else if (ev.kind === 'tower') this.tickTower(ctx, ev, dt)
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ev = this.active[i]
      if (ctx.time >= ev.until || ev.claimed) {
        if (ev.towerLight) ev.towerLight.intensity = 0
        this.active.splice(i, 1)
      }
    }
  }

  // ---------- 各事件生成 ----------

  private spawn(ctx: Ctx, kind: WorldEventKind) {
    const pt = this.pickPoint(ctx)
    if (!pt) return
    this.spawnedCount++
    if (kind === 'bombing') {
      this.active.push({
        kind, x: pt.x, z: pt.z, r: 30,
        warnUntil: ctx.time + 6, nextBomb: ctx.time + 6, until: ctx.time + 6 + 16,
      })
      ctx.sfx.zoneAlert()
      ctx.hud.banner('警告：标记区域即将遭到轰炸！', 'danger', 3.4)
    } else if (kind === 'supply') {
      const y = ctx.world.col.groundAt(pt.x, pt.z, 500) + 0.12
      const off = () => this.rng.range(-2.2, 2.2)
      ctx.loot.spawnItem(pt.x + off(), y, pt.z + off(), 'firstaid', 1)
      ctx.loot.spawnItem(pt.x + off(), y, pt.z + off(), 'armorkit', 1)
      ctx.loot.spawnItem(pt.x + off(), y, pt.z + off(), this.rng.chance(0.5) ? 'adrenaline' : 'drink', 1)
      ctx.loot.spawnItem(pt.x + off(), y, pt.z + off(), this.rng.chance(0.5) ? 'extmag' : 'scope_4x', 1)
      ctx.loot.spawnWeapon(pt.x + off(), y, pt.z + off(), this.rng.chance(0.5) ? 'tempest' : 'whisper', 2, true)
      ctx.fx.flare(pt.x, y + 0.5, pt.z, 0.95, 0.45, 0.1, 45)
      this.active.push({ kind, x: pt.x, z: pt.z, r: 6, until: ctx.time + 45 })
      ctx.hud.banner('侦测到临时补给点 — 已在地图标记', 'amber', 3.2)
    } else if (kind === 'convoy') {
      const y = ctx.world.col.groundAt(pt.x, pt.z, 500)
      const ax = this.rng.chance(0.5)
      carWreck(ctx.world, pt.x - 5, pt.z - 2, ax)
      carWreck(ctx.world, pt.x + 4, pt.z + 3, !ax)
      const v = new Vehicle(ctx.scene, pt.x + 1, pt.z - 6, this.rng.range(0, Math.PI * 2), y)
      ctx.vehicles.push(v)
      const oy = y + 0.12
      const off = () => this.rng.range(-3, 3)
      ctx.loot.spawnItem(pt.x + off(), oy, pt.z + off(), 'fuelcan', 1)
      ctx.loot.spawnAmmo(pt.x + off(), oy, pt.z + off(), 'rifle', 60)
      ctx.loot.spawnItem(pt.x + off(), oy, pt.z + off(), 'firstaid', 1)
      ctx.loot.spawnWeapon(pt.x + off(), oy, pt.z + off(), this.rng.chance(0.4) ? 'boar' : 'raptor', 2, true)
      this.active.push({ kind, x: pt.x, z: pt.z, r: 9, until: ctx.time + 50 })
      ctx.hud.banner('发现遇袭车队残骸 — 含可用载具', 'amber', 3.2)
    } else {
      // 信号塔：运行时立塔，占满进度者获得高级补给
      const w = ctx.world
      const g = w.groundHeight(pt.x, pt.z)
      w.box(0.55, 9, 0.55, pt.x, g, pt.z, 0x8a4a42)
      w.box(2.2, 0.5, 2.2, pt.x, g + 9, pt.z, 0x6a7076)
      w.box(0.18, 2.2, 0.18, pt.x, g + 9.5, pt.z, 0xb0b6bc, false)
      const light = new THREE.PointLight(0xff4030, 2.2, 26, 1.6)
      light.position.set(pt.x, g + 11.4, pt.z)
      ctx.scene.add(light)
      this.active.push({
        kind, x: pt.x, z: pt.z, r: 11, until: ctx.time + 120,
        progress: 0, towerLight: light,
      })
      ctx.hud.banner('信号塔已激活 — 占领可获取高级补给', 'amber', 3.4)
    }
  }

  // ---------- 各事件推进 ----------

  private tickBombing(ctx: Ctx, ev: ActiveEvent) {
    if (ctx.time < ev.warnUntil! || ctx.time < ev.nextBomb!) return
    ev.nextBomb = ctx.time + this.rng.range(0.35, 0.6)
    const a = this.rng.range(0, Math.PI * 2)
    const d = Math.sqrt(this.rng.next()) * ev.r
    const bx = ev.x + Math.cos(a) * d
    const bz = ev.z + Math.sin(a) * d
    const by = ctx.world.col.groundAt(bx, bz, 500)
    ctx.fx.explosion(bx, by + 0.5, bz)
    ctx.sfx.explosion(new THREE.Vector3(bx, by, bz))
    for (const c of ctx.chars) {
      if (!c.alive) continue
      const cd = dist2D(c.pos.x, c.pos.z, bx, bz)
      if (cd > 7) continue
      const dmg = 85 * (1 - cd / 7)
      c.hp -= dmg
      c.lastDamageT = ctx.time
      if (c.isPlayer) {
        ctx.hud.zonePain()
        ctx.fx.kick('explosion', 0.8)
        ctx.fx.addShake(0.3)
      }
      if (c.hp <= 0) ctx.kill(c, null, '空袭轰炸')
    }
    const pd = dist2D(ctx.player.pos.x, ctx.player.pos.z, bx, bz)
    if (pd < 50 && pd > 7) ctx.fx.kick('explosion', 0.35 * (1 - pd / 50))
  }

  private tickTower(ctx: Ctx, ev: ActiveEvent, dt: number) {
    let occupied = false
    let playerHere = false
    for (const c of ctx.chars) {
      if (!c.alive) continue
      if (dist2D(c.pos.x, c.pos.z, ev.x, ev.z) < ev.r) {
        occupied = true
        if (c.isPlayer) playerHere = true
      }
    }
    if (occupied) {
      ev.progress = Math.min(1, ev.progress! + dt / 14)
      if (ev.towerLight) ev.towerLight.intensity = 2.2 + Math.sin(ctx.time * 9) * 1.4
    } else {
      ev.progress = Math.max(0, ev.progress! - dt / 28)
      if (ev.towerLight) ev.towerLight.intensity = 2.2
    }
    if (ev.progress! >= 1) {
      ev.claimed = true
      const y = ctx.world.groundHeight(ev.x, ev.z) + 0.12
      const off = () => this.rng.range(-2.4, 2.4)
      ctx.loot.spawnWeapon(ev.x + off(), y, ev.z + off(), this.rng.chance(0.45) ? 'thunder' : 'boar', 3, true)
      ctx.loot.spawnItem(ev.x + off(), y, ev.z + off(), 'armor3', 1)
      ctx.loot.spawnItem(ev.x + off(), y, ev.z + off(), 'medkit', 1)
      ctx.loot.spawnItem(ev.x + off(), y, ev.z + off(), 'scope_8x', 1)
      ctx.fx.flare(ev.x, y + 0.6, ev.z, 0.3, 0.9, 0.4, 30)
      ctx.sfx.airdropAlert()
      ctx.hud.banner(playerHere ? '信号塔占领成功 — 补给已解锁' : '信号塔已被占领', playerHere ? 'amber' : 'danger', 3)
    }
  }

  // ---------- 对外查询 ----------

  markers(): EventMarker[] {
    const out: EventMarker[] = []
    for (const ev of this.active) {
      out.push({
        kind: ev.kind, x: ev.x, z: ev.z, r: ev.r,
        label: ev.kind === 'bombing' ? '轰炸区' : ev.kind === 'supply' ? '补给点' : ev.kind === 'convoy' ? '车队' : '信号塔',
        warn: ev.kind === 'bombing' && performance.now() % 700 < 350,
        progress: ev.kind === 'tower' ? ev.progress : undefined,
      })
    }
    return out
  }

  /** AI 规避：活跃轰炸圈 */
  dangerZones(): { x: number; z: number; r: number }[] {
    return this.active
      .filter(e => e.kind === 'bombing')
      .map(e => ({ x: e.x, z: e.z, r: e.r + 8 }))
  }

  /** AI 吸引：补给点 / 车队 / 信号塔 */
  attractions(): { x: number; z: number; r: number }[] {
    return this.active
      .filter(e => e.kind !== 'bombing')
      .map(e => ({ x: e.x, z: e.z, r: e.r }))
  }

  // ---------- 选点 ----------

  private pickPoint(ctx: Ctx): { x: number; z: number } | null {
    const zt = ctx.zone.target
    const lim = ctx.world.play - 25
    for (let i = 0; i < 24; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = Math.sqrt(this.rng.next()) * zt.r * 0.8
      const x = Math.max(-lim, Math.min(lim, zt.x + Math.cos(a) * d))
      const z = Math.max(-lim, Math.min(lim, zt.z + Math.sin(a) * d))
      if (ctx.world.groundHeight(x, z) < 0.6) continue // 避开水面
      if (dist2D(x, z, ctx.player.pos.x, ctx.player.pos.z) < 30) continue // 不压脸生成
      return { x, z }
    }
    return null
  }
}
