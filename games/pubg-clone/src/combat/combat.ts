import * as THREE from 'three'
import type { Ctx } from '../core/ctx'
import type { Character } from '../entities/character'
import type { NadeType } from '../items/defs'
import { WeaponInst } from './weapon'
import { lerp, DEG } from '../utils/math'

const _end = new THREE.Vector3()
const _spread = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _t2 = new THREE.Vector3()

interface Grenade {
  type: NadeType
  pos: THREE.Vector3
  vel: THREE.Vector3
  fuse: number
  mesh: THREE.Mesh
  thrower: Character
}

/** 燃烧瓶火区 */
interface FireZone {
  x: number; y: number; z: number
  r: number
  until: number
  nextTick: number
  owner: Character
}

/** 诱饵弹：周期性假枪声吸引 AI */
interface Decoy {
  x: number; y: number; z: number
  until: number
  nextShot: number
  owner: Character
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz
  const b = 2 * (fx * dx + fy * dy + fz * dz)
  const c = fx * fx + fy * fy + fz * fz - r * r
  const disc = b * b - 4 * c
  if (disc < 0) return -1
  const t = (-b - Math.sqrt(disc)) / 2
  return t >= 0 ? t : -1
}

function rayVCyl(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y0: number, y1: number): number {
  const fx = ox - cx, fz = oz - cz
  const a = dx * dx + dz * dz
  if (a < 1e-9) return -1
  const b = 2 * (fx * dx + fz * dz)
  const c = fx * fx + fz * fz - r * r
  const disc = b * b - 4 * a * c
  if (disc < 0) return -1
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  if (t < 0) return -1
  const hy = oy + dy * t
  if (hy < y0 || hy > y1) return -1
  return t
}

/** 射击/近战/手雷 结算系统 */
export class Combat {
  grenades: Grenade[] = []
  fireZones: FireZone[] = []
  private decoys: Decoy[] = []
  private nadeGeo = new THREE.SphereGeometry(0.11, 12, 9)
  private nadeMats: Record<NadeType, THREE.MeshLambertMaterial> = {
    frag: new THREE.MeshLambertMaterial({ color: 0x44513c }),
    smoke: new THREE.MeshLambertMaterial({ color: 0x8a9298 }),
    flash: new THREE.MeshLambertMaterial({ color: 0xd8d8d0 }),
    molotov: new THREE.MeshLambertMaterial({ color: 0xb35a22 }),
    decoy: new THREE.MeshLambertMaterial({ color: 0x4a6a8a }),
  }

  /**
   * 尝试开火。origin 为枪口位置，dir 为基准方向（已含瞄准），
   * spreadDeg 为本次散布角度。返回是否真的射出。
   */
  tryFire(ctx: Ctx, shooter: Character, w: WeaponInst, origin: THREE.Vector3, dir: THREE.Vector3, spreadDeg: number): boolean {
    const t = ctx.time
    if (!w.canFire(t) || w.mag <= 0) return false
    w.lastShot = t
    w.mag--
    const pellets = w.def.pellets
    for (let i = 0; i < pellets; i++) {
      const s = (spreadDeg + (pellets > 1 ? w.def.spreadAds : 0)) * DEG
      _spread.copy(dir)
      _spread.x += (Math.random() - 0.5) * 2 * s
      _spread.y += (Math.random() - 0.5) * 2 * s
      _spread.z += (Math.random() - 0.5) * 2 * s
      _spread.normalize()
      this.fireRay(ctx, shooter, w, origin, _spread)
    }
    ctx.fx.muzzle(origin.x, origin.y, origin.z)
    if (w.def.cls !== 'MELEE') {
      ctx.fx.shell(origin.x, origin.y, origin.z, -Math.cos(shooter.yaw), Math.sin(shooter.yaw))
    }
    ctx.sfx.shot(origin, w.def.cls, w.silenced)
    ctx.shots.push({ x: origin.x, y: origin.y, z: origin.z, t, loud: w.silenced ? 26 : w.def.cls === 'SR' ? 130 : 95, shooter })
    return true
  }

  private fireRay(ctx: Ctx, shooter: Character, w: WeaponInst, origin: THREE.Vector3, dir: THREE.Vector3) {
    const range = w.def.range
    const wh = ctx.world.col.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range)
    let bestT = wh ? wh.t : range
    let hitChar: Character | null = null
    let hitHead = false

    for (const c of ctx.chars) {
      if (c === shooter || !c.alive) continue
      // 头部
      const ht = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c.pos.x, c.headWorldY(), c.pos.z, 0.23)
      if (ht > 0 && ht < bestT) {
        bestT = ht; hitChar = c; hitHead = true
        continue
      }
      // 躯干圆柱
      const bt = rayVCyl(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c.pos.x, c.pos.z, 0.34, c.pos.y + 0.05, c.pos.y + c.height - 0.32)
      if (bt > 0 && bt < bestT) {
        bestT = bt; hitChar = c; hitHead = false
      }
    }

    _end.copy(origin).addScaledVector(dir, bestT)
    ctx.fx.tracer(origin.x, origin.y, origin.z, _end.x, _end.y, _end.z)

    // 敌方子弹近飞呼啸
    if (!shooter.isPlayer && ctx.player.alive && !ctx.player.dropping) {
      const p = ctx.player
      const hx = p.pos.x - origin.x, hy = p.pos.y + 1.35 - origin.y, hz = p.pos.z - origin.z
      const tt = Math.max(0, Math.min(bestT, hx * dir.x + hy * dir.y + hz * dir.z))
      const cx = origin.x + dir.x * tt - p.pos.x
      const cy = origin.y + dir.y * tt - (p.pos.y + 1.35)
      const cz = origin.z + dir.z * tt - p.pos.z
      if (tt > 6 && cx * cx + cy * cy + cz * cz < 5.5) {
        ctx.sfx.whiz(cx + cz)
        ctx.fx.kick('nearMiss')
      }
    }

    if (hitChar) {
      ctx.fx.blood(_end.x, _end.y, _end.z)
      const near = range * 0.45
      const fall = bestT < near ? 1 : lerp(1, 0.55, (bestT - near) / (range - near))
      let dmg = w.dmg * fall
      if (hitHead) dmg *= w.def.headMult
      const wasAlive = hitChar.alive
      hitChar.takeDamage(dmg, hitHead, shooter, w.def.name, ctx)
      if (shooter.isPlayer) {
        ctx.hud.hitmarker(hitHead, wasAlive && !hitChar.alive)
        ctx.hud.damageNumber(_end.x, _end.y, _end.z, dmg, hitHead, ctx)
        ctx.sfx.hit(hitHead)
      }
    } else if (wh) {
      ctx.fx.impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, wh.terrain ? 0x7d6f50 : 0x9a8d72)
    }
  }

  /** 近战挥击 */
  melee(ctx: Ctx, attacker: Character): boolean {
    const def = attacker.meleeDef
    ctx.sfx.swing(attacker.pos)
    const fx = attacker.forwardX(), fz = attacker.forwardZ()
    let best: Character | null = null
    let bestD = def.range + 0.4
    for (const c of ctx.chars) {
      if (c === attacker || !c.alive) continue
      const dx = c.pos.x - attacker.pos.x, dz = c.pos.z - attacker.pos.z
      const d = Math.hypot(dx, dz)
      if (d > bestD) continue
      if ((dx * fx + dz * fz) / Math.max(d, 0.01) < 0.45) continue
      if (Math.abs(c.pos.y - attacker.pos.y) > 1.6) continue
      best = c
      bestD = d
    }
    if (best) {
      ctx.fx.blood(best.pos.x, best.headWorldY() - 0.3, best.pos.z)
      const wasAlive = best.alive
      best.takeDamage(def.dmg, false, attacker, def.name, ctx)
      if (attacker.isPlayer) {
        ctx.hud.hitmarker(false, wasAlive && !best.alive)
        ctx.hud.damageNumber(best.pos.x, best.headWorldY() - 0.2, best.pos.z, def.dmg, false, ctx)
        ctx.sfx.hit(false)
      }
      return true
    }
    return false
  }

  throwGrenade(ctx: Ctx, thrower: Character, type: NadeType, origin: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.nadeGeo, this.nadeMats[type])
    mesh.position.copy(origin)
    ctx.scene.add(mesh)
    const vel = new THREE.Vector3().copy(dir).multiplyScalar(17)
    vel.y += 4.5
    const fuse = type === 'frag' ? 2.9 : type === 'molotov' ? 1.1 : type === 'decoy' ? 1.4 : 1.7
    this.grenades.push({ type, pos: origin.clone(), vel, fuse, mesh, thrower })
  }

  update(ctx: Ctx, dt: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      g.fuse -= dt
      g.vel.y -= 18 * dt
      _t1.copy(g.pos)
      _t2.copy(g.pos).addScaledVector(g.vel, dt)
      // 与静态体碰撞反弹
      const move = _t2.clone().sub(_t1)
      const mlen = move.length()
      if (mlen > 0.001) {
        move.divideScalar(mlen)
        const hit = ctx.world.col.raycast(_t1.x, _t1.y, _t1.z, move.x, move.y, move.z, mlen + 0.1)
        if (hit) {
          _t2.set(hit.x + hit.nx * 0.12, hit.y + hit.ny * 0.12, hit.z + hit.nz * 0.12)
          const dot = g.vel.x * hit.nx + g.vel.y * hit.ny + g.vel.z * hit.nz
          g.vel.x -= 1.6 * dot * hit.nx
          g.vel.y -= 1.6 * dot * hit.ny
          g.vel.z -= 1.6 * dot * hit.nz
          g.vel.multiplyScalar(0.45)
        }
      }
      g.pos.copy(_t2)
      // 地面
      const gh = ctx.world.col.groundAt(g.pos.x, g.pos.z, g.pos.y + 0.2)
      if (g.pos.y < gh + 0.1) {
        g.pos.y = gh + 0.1
        if (g.vel.y < 0) g.vel.y *= -0.4
        g.vel.x *= 0.82
        g.vel.z *= 0.82
      }
      g.mesh.position.copy(g.pos)

      if (g.fuse <= 0) {
        ctx.scene.remove(g.mesh)
        this.grenades.splice(i, 1)
        this.detonate(ctx, g)
      }
    }

    // 燃烧瓶火区：持续火焰粒子 + 周期灼烧
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const f = this.fireZones[i]
      if (ctx.time > f.until) {
        this.fireZones.splice(i, 1)
        continue
      }
      // 火焰与烟粒子
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2
        const rr = Math.random() * f.r
        ctx.fx.flame(f.x + Math.cos(a) * rr, f.y + 0.1, f.z + Math.sin(a) * rr)
      }
      if (ctx.time >= f.nextTick) {
        f.nextTick = ctx.time + 0.5
        for (const c of ctx.chars) {
          if (!c.alive) continue
          const dx = c.pos.x - f.x, dz = c.pos.z - f.z
          if (dx * dx + dz * dz > f.r * f.r) continue
          if (Math.abs(c.pos.y - f.y) > 2.2) continue
          c.takeDamage(7, false, f.owner, '燃烧瓶', ctx)
        }
      }
    }

    // 诱饵弹：周期假枪声（写入 shots 供 AI 听声索敌）
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i]
      if (ctx.time > d.until) {
        this.decoys.splice(i, 1)
        continue
      }
      if (ctx.time >= d.nextShot) {
        d.nextShot = ctx.time + 0.25 + Math.random() * 0.65
        _t1.set(d.x, d.y + 0.3, d.z)
        ctx.sfx.shot(_t1, Math.random() < 0.3 ? 'SMG' : 'AR', false)
        ctx.fx.muzzle(d.x, d.y + 0.35, d.z)
        ctx.shots.push({ x: d.x, y: d.y + 0.3, z: d.z, t: ctx.time, loud: 95, shooter: d.owner })
      }
    }
  }

  private detonate(ctx: Ctx, g: Grenade) {
    if (g.type === 'frag') {
      ctx.fx.explosion(g.pos.x, g.pos.y, g.pos.z)
      ctx.sfx.explosion(g.pos)
      const R = 9
      for (const c of ctx.chars) {
        if (!c.alive) continue
        const d = c.pos.distanceTo(g.pos)
        if (d > R) continue
        let dmg = 108 * (1 - d / R)
        const losOk = ctx.world.col.losClear(g.pos.x, g.pos.y + 0.3, g.pos.z, c.pos.x, c.pos.y + 1, c.pos.z)
        if (!losOk) dmg *= 0.25
        if (dmg > 1) c.takeDamage(dmg, false, g.thrower, '破片手雷', ctx)
      }
      const pd = ctx.player.pos.distanceTo(g.pos)
      if (pd < 26) {
        ctx.fx.addShake(1.1 * (1 - pd / 26))
        ctx.fx.kick('explosion', 1 - pd / 26)
      }
    } else if (g.type === 'smoke') {
      ctx.fx.smoke(g.pos.x, g.pos.y, g.pos.z)
      ctx.sfx.zoneTick()
    } else if (g.type === 'molotov') {
      // 燃烧瓶：碎裂火区
      ctx.sfx.explosion(g.pos)
      ctx.fx.explosion(g.pos.x, g.pos.y, g.pos.z)
      this.fireZones.push({ x: g.pos.x, y: g.pos.y, z: g.pos.z, r: 3.6, until: ctx.time + 6, nextTick: ctx.time + 0.3, owner: g.thrower })
      const pd = ctx.player.pos.distanceTo(g.pos)
      if (pd < 18) ctx.fx.kick('explosion', 0.4 * (1 - pd / 18))
    } else if (g.type === 'decoy') {
      // 诱饵弹：落地后持续假枪声
      this.decoys.push({ x: g.pos.x, y: g.pos.y, z: g.pos.z, until: ctx.time + 9, nextShot: ctx.time + 0.4, owner: g.thrower })
    } else {
      // 闪光弹
      ctx.fx.explosion(g.pos.x, g.pos.y + 0.5, g.pos.z)
      ctx.sfx.explosion(g.pos)
      const fpd = ctx.player.pos.distanceTo(g.pos)
      if (fpd < 18) ctx.fx.kick('explosion', 0.45 * (1 - fpd / 18))
      for (const c of ctx.chars) {
        if (!c.alive) continue
        const d = c.pos.distanceTo(g.pos)
        if (d > 15) continue
        const losOk = ctx.world.col.losClear(g.pos.x, g.pos.y + 0.4, g.pos.z, c.pos.x, c.headWorldY(), c.pos.z)
        if (!losOk) continue
        const dx = g.pos.x - c.pos.x, dz = g.pos.z - c.pos.z
        const dl = Math.max(0.01, Math.hypot(dx, dz))
        const facing = (dx / dl) * c.forwardX() + (dz / dl) * c.forwardZ()
        const strength = facing > -0.15 ? 1 : 0.35
        if (c.isPlayer) {
          ctx.hud.flashWhite(strength)
        } else {
          c.stunnedUntil = ctx.time + 2.8 * strength
        }
      }
    }
  }
}
