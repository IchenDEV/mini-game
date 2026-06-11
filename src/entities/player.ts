import * as THREE from 'three'
import { Character } from './character'
import { Inventory } from '../items/inventory'
import { WeaponInst } from '../combat/weapon'
import { WEAPONS, FISTS, ITEMS, ARMOR_DURABILITY, Rarity } from '../items/defs'
import type { Ctx } from '../core/ctx'
import type { GroundItem } from '../items/loot'
import { clamp, damp, DEG } from '../utils/math'

const _camDir = new THREE.Vector3()
const _muzzle = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _shotDir = new THREE.Vector3()
const NADE_TYPES = ['frag', 'smoke', 'flash'] as const

interface Casting {
  itemId: string
  label: string
  dur: number
  t: number
}

export class Player extends Character {
  inv = new Inventory()
  primary: (WeaponInst | null)[] = [null, null]
  sidearm: WeaponInst | null = null
  hasPan = false
  nadeSel = 0
  slot = 3
  ads = false
  dropping = true
  fastDrop = false
  casting: Casting | null = null
  nearLoot: GroundItem | null = null
  surviveStart = 0
  bloom = 0
  private switchLockUntil = 0
  private pendingReload: { w: WeaponInst; end: number } | null = null
  private chute: THREE.Group | null = null
  private stepAcc = 0
  private sens = 0.0023
  blockInput = false

  constructor() {
    super()
    this.isPlayer = true
    this.name = '你'
    this.hp = 100
  }

  init(scene: THREE.Scene, x: number, z: number) {
    this.buildModel(scene, 0xb9a06a)
    this.pos.set(x, 150, z)
    // 降落伞
    const chute = new THREE.Group()
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.3, 1.7, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xc9a23f, side: THREE.DoubleSide }),
    )
    canopy.position.y = 4.4
    chute.add(canopy)
    for (const [sx, sz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) {
      const lineGeo = new THREE.BoxGeometry(0.03, 2.2, 0.03)
      const line = new THREE.Mesh(lineGeo, new THREE.MeshLambertMaterial({ color: 0x3c4045 }))
      line.position.set(sx * 0.7, 2.9, sz * 0.7)
      line.rotation.z = sx * -0.35
      line.rotation.x = sz * 0.35
      chute.add(line)
    }
    this.model.add(chute)
    this.chute = chute
  }

  currentWeapon(): WeaponInst | null {
    if (this.slot === 0 || this.slot === 1) return this.primary[this.slot]
    if (this.slot === 2) return this.sidearm
    return null
  }

  nadeType(): 'frag' | 'smoke' | 'flash' {
    return NADE_TYPES[this.nadeSel]
  }
  nadeCount(): number {
    return this.inv.count(this.nadeType())
  }
  totalNades(): number {
    return NADE_TYPES.reduce((s, t) => s + this.inv.count(t), 0)
  }

  private refreshHands() {
    this.meleeDef = this.hasPan ? WEAPONS.pan : FISTS
    this.weapon = this.currentWeapon()
    this.setWeaponVisual()
  }

  trySwitch(i: number, ctx: Ctx): boolean {
    if (i === this.slot) return false
    const ok =
      (i <= 1 && this.primary[i] !== null) ||
      (i === 2 && this.sidearm !== null) ||
      i === 3 ||
      (i === 4 && this.totalNades() > 0)
    if (!ok) return false
    this.slot = i
    this.switchLockUntil = ctx.time + 0.4
    this.cancelReload()
    this.cancelCast(ctx, false)
    this.refreshHands()
    ctx.sfx.equip()
    return true
  }

  private cancelReload() {
    if (this.pendingReload) {
      this.pendingReload.w.reloadEnd = -1
      this.pendingReload = null
    }
  }

  startReload(ctx: Ctx) {
    const w = this.currentWeapon()
    if (!w || !w.def.ammo) return
    if (w.reloading(ctx.time) || w.mag >= w.magSize) return
    if (this.inv.ammo[w.def.ammo] <= 0) {
      ctx.hud.notice('没有弹药')
      ctx.sfx.noAmmo()
      return
    }
    w.reloadEnd = ctx.time + w.def.reload
    this.pendingReload = { w, end: w.reloadEnd }
    ctx.sfx.reload()
  }

  private cancelCast(ctx: Ctx, sound = true) {
    if (this.casting) {
      this.casting = null
      if (sound) ctx.hud.notice('已打断')
    }
  }

  startMed(ctx: Ctx) {
    if (this.casting) return
    if (this.hp >= 99.5) { ctx.hud.notice('生命值已满'); return }
    let id: string | null = null
    if (this.hp < 74) {
      if (this.inv.count('firstaid') > 0) id = 'firstaid'
      else if (this.inv.count('bandage') > 0) id = 'bandage'
      else if (this.inv.count('medkit') > 0) id = 'medkit'
    } else if (this.inv.count('medkit') > 0) id = 'medkit'
    if (!id) { ctx.hud.notice(this.hp < 74 ? '没有可用药品' : '只有医疗箱能恢复到满血') ; return }
    this.beginCast(ctx, id)
  }

  startBoost(ctx: Ctx) {
    if (this.casting) return
    if (this.boost >= 95) { ctx.hud.notice('能量已满'); return }
    const id = this.inv.count('drink') > 0 ? 'drink' : this.inv.count('pills') > 0 ? 'pills' : null
    if (!id) { ctx.hud.notice('没有能量物品'); return }
    this.beginCast(ctx, id)
  }

  beginCast(ctx: Ctx, itemId: string) {
    const def = ITEMS[itemId]
    if (!def || this.inv.count(itemId) <= 0) return
    this.casting = { itemId, label: `正在使用 ${def.name}…`, dur: def.castTime ?? 3, t: 0 }
    this.cancelReload()
  }

  private finishCast(ctx: Ctx) {
    const id = this.casting!.itemId
    const def = ITEMS[id]
    this.casting = null
    if (!this.inv.removeItem(id, 1)) return
    if (def.kind === 'med') {
      if (def.healCap && def.healCap > 0) this.hp = Math.min(def.healCap, this.hp + (def.heal ?? 0))
      else this.hp = Math.min(100, this.hp + (def.heal ?? 100))
      ctx.sfx.heal()
    } else if (def.kind === 'boost') {
      this.boost = Math.min(100, this.boost + (def.boostAdd ?? 40))
      ctx.sfx.boost()
    }
  }

  /** 当前散布（度） */
  spreadDeg(): number {
    const w = this.currentWeapon()
    if (!w) return 0
    let s = (this.ads ? w.def.spreadAds : w.def.spreadHip) * w.spreadMult
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    s *= 1 + (hSpeed / 7) * (this.ads ? 0.7 : 1)
    if (!this.onGround) s *= 2.2
    if (this.crouching) s *= 0.8
    return s + this.bloom
  }

  // ---------------- 跳伞 ----------------

  updateDrop(dt: number, ctx: Ctx) {
    const input = ctx.input
    this.yaw -= input.mouseDX * this.sens
    this.pitch = clamp(this.pitch - input.mouseDY * this.sens, -1.3, 1.35)

    let fwd = 0, str = 0
    if (input.key('KeyW')) fwd++
    if (input.key('KeyS')) fwd--
    if (input.key('KeyD')) str++
    if (input.key('KeyA')) str--
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
    let dx = fx * fwd + rx * str
    let dz = fz * fwd + rz * str
    const dl = Math.hypot(dx, dz)
    if (dl > 1) { dx /= dl; dz /= dl }

    this.fastDrop = input.key('KeyF')
    this.vel.x = damp(this.vel.x, dx * 15, 2.4, dt)
    this.vel.z = damp(this.vel.z, dz * 15, 2.4, dt)
    this.vel.y = damp(this.vel.y, this.fastDrop ? -36 : -10.5, 2.4, dt)

    this.pos.addScaledVector(this.vel, dt)
    this.pos.x = clamp(this.pos.x, -380, 380)
    this.pos.z = clamp(this.pos.z, -380, 380)

    const g = ctx.world.col.groundAt(this.pos.x, this.pos.z, this.pos.y)
    if (this.pos.y <= g + 0.05) {
      this.pos.y = g
      this.vel.set(0, 0, 0)
      this.dropping = false
      this.onGround = true
      this.surviveStart = ctx.time
      if (this.chute) { this.model.remove(this.chute); this.chute = null }
      ctx.sfx.land()
      ctx.fx.addShake(0.4)
      ctx.hud.banner('已着陆 — 搜刮装备，留意安全区', 'amber', 3)
    }
    this.animate(dt)
    // 跳伞期间身体下垂姿态
    this.legL.rotation.x = 0.35
    this.legR.rotation.x = -0.25
  }

  // ---------------- 战斗主循环 ----------------

  updatePlay(dt: number, ctx: Ctx) {
    if (!this.alive) return
    const input = ctx.input
    const t = ctx.time
    const w = this.currentWeapon()

    if (!this.blockInput) {
      // 视角
      const fovScale = ctx.camera.fov / 70
      this.yaw -= input.mouseDX * this.sens * fovScale
      this.pitch = clamp(this.pitch - input.mouseDY * this.sens * fovScale, -1.3, 1.35)
    }

    // 移动意图
    let fwd = 0, str = 0
    if (input.key('KeyW')) fwd++
    if (input.key('KeyS')) fwd--
    if (input.key('KeyD')) str++
    if (input.key('KeyA')) str--
    if (input.pressed('KeyC')) this.crouching = !this.crouching

    this.ads = !this.blockInput && input.rmb && this.slot <= 2 && w !== null
    this.sprinting = input.key('ShiftLeft') && fwd > 0 && !this.ads && !this.crouching

    if (this.sprinting && this.casting) this.cancelCast(ctx)

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
    let dx = fx * fwd + rx * str
    let dz = fz * fwd + rz * str
    const dl = Math.hypot(dx, dz)
    if (dl > 1) { dx /= dl; dz /= dl }
    this.wishX = dx
    this.wishZ = dz

    let speed = 4.3
    if (this.sprinting) speed = 6.8
    if (this.crouching) speed = 2.4
    if (this.ads) speed = Math.min(speed, 3.0)
    if (this.casting) speed = Math.min(speed, 2.4)
    if (this.wading) speed *= 0.55
    if (this.boost > 60) speed *= 1.05
    this.wishSpeed = speed

    if (input.pressed('Space') && this.onGround && !this.blockInput) {
      this.wantJump = true
      this.crouching = false
      this.cancelCast(ctx)
    }

    // 武器切换
    if (!this.blockInput) {
      for (let i = 0; i < 5; i++) {
        if (input.pressed(`Digit${i + 1}`)) this.trySwitch(i, ctx)
      }
      if (input.pressed('KeyR')) this.startReload(ctx)
      if (input.pressed('KeyT')) {
        for (let k = 1; k <= 3; k++) {
          const ni = (this.nadeSel + k) % 3
          if (this.inv.count(NADE_TYPES[ni]) > 0 || k === 3) { this.nadeSel = ni; break }
        }
        ctx.hud.notice(`投掷物：${ITEMS[this.nadeType()].name} ×${this.nadeCount()}`)
      }
      if (input.pressed('KeyG')) this.throwNade(ctx)
      if (input.pressed('KeyH')) this.startMed(ctx)
      if (input.pressed('KeyJ')) this.startBoost(ctx)
    }

    // 换弹完成
    if (this.pendingReload && t >= this.pendingReload.end) {
      const rw = this.pendingReload.w
      this.pendingReload = null
      const ammoT = rw.def.ammo!
      const need = rw.magSize - rw.mag
      const take = Math.min(need, this.inv.ammo[ammoT])
      rw.mag += take
      this.inv.ammo[ammoT] -= take
      ctx.sfx.reloadDone()
    }

    // 开火
    if (!this.blockInput && t > this.switchLockUntil) {
      this.handleFire(ctx, w)
    }

    // 施法
    if (this.casting) {
      this.casting.t += dt
      if (this.casting.t >= this.casting.dur) this.finishCast(ctx)
    }

    // 拾取
    this.nearLoot = ctx.loot.nearest(this.pos.x, this.pos.y, this.pos.z, 2.5)
    if (!this.blockInput && input.pressed('KeyE') && this.nearLoot) {
      this.tryPickup(ctx, this.nearLoot)
    }

    this.bloom = Math.max(0, this.bloom - dt * 3.6)
    super.update(dt, ctx)

    // 脚步声
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (this.onGround && hSpeed > 1.2) {
      this.stepAcc += hSpeed * dt
      if (this.stepAcc > 2.4) {
        this.stepAcc = 0
        ctx.sfx.footstep(hSpeed / 7)
      }
    }
  }

  private handleFire(ctx: Ctx, w: WeaponInst | null) {
    const input = ctx.input
    const t = ctx.time
    if (this.slot === 3) {
      // 近战
      if (input.lmbPressed) {
        if (this.casting) { this.cancelCast(ctx); return }
        if (t - this.meleeLastT > 60 / this.meleeDef.rpm) {
          this.meleeLastT = t
          ctx.combat.melee(ctx, this)
          ctx.fx.addShake(0.08)
        }
      }
      return
    }
    if (this.slot === 4) {
      if (input.lmbPressed) {
        if (this.casting) { this.cancelCast(ctx); return }
        this.throwNade(ctx)
      }
      return
    }
    if (!w) return
    const wantFire = w.def.auto ? input.lmb : input.lmbPressed
    if (!wantFire) return
    if (this.casting) {
      if (input.lmbPressed) this.cancelCast(ctx)
      return
    }
    if (w.mag <= 0) {
      if (input.lmbPressed) {
        ctx.sfx.noAmmo()
        this.startReload(ctx)
      }
      return
    }
    if (w.reloading(t)) return

    // 从相机中心取瞄准点
    ctx.camera.getWorldDirection(_camDir)
    const camPos = ctx.camera.position
    const hit = ctx.world.col.raycast(camPos.x, camPos.y, camPos.z, _camDir.x, _camDir.y, _camDir.z, 420)
    if (hit) _aim.set(hit.x, hit.y, hit.z)
    else _aim.copy(camPos).addScaledVector(_camDir, 420)
    this.muzzleWorld(_muzzle)
    _shotDir.copy(_aim).sub(_muzzle).normalize()

    if (ctx.combat.tryFire(ctx, this, w, _muzzle, _shotDir, this.spreadDeg())) {
      const r = w.recoil
      this.pitch += r * DEG * (0.85 + Math.random() * 0.3)
      this.yaw += r * DEG * (Math.random() - 0.5) * 0.5
      this.bloom = Math.min(2.2, this.bloom + r * 0.55)
      ctx.fx.addShake(0.05 + r * 0.04)
    }
  }
  private meleeLastT = -99

  private throwNade(ctx: Ctx) {
    const type = this.nadeType()
    if (this.inv.count(type) <= 0) {
      // 尝试切到有库存的类型
      for (let k = 0; k < 3; k++) {
        if (this.inv.count(NADE_TYPES[k]) > 0) { this.nadeSel = k; break }
      }
      if (this.inv.count(this.nadeType()) <= 0) { ctx.hud.notice('没有投掷物'); return }
    }
    ctx.camera.getWorldDirection(_camDir)
    _muzzle.set(this.pos.x + _camDir.x * 0.5, this.pos.y + this.eyeH, this.pos.z + _camDir.z * 0.5)
    ctx.combat.throwGrenade(ctx, this, this.nadeType(), _muzzle, _camDir)
    this.inv.removeItem(this.nadeType(), 1)
    if (this.slot === 4 && this.totalNades() === 0) this.trySwitch(3, ctx)
  }

  // ---------------- 拾取 ----------------

  tryPickup(ctx: Ctx, gi: GroundItem) {
    if (gi.kind === 'weapon') {
      const w = gi.weapon!
      let targetSlot: number
      if (w.def.cls === 'PISTOL') {
        if (this.sidearm) ctx.loot.spawnWeaponInst(this.pos.x, this.pos.y + 0.05, this.pos.z, this.sidearm)
        this.sidearm = w
        targetSlot = 2
      } else {
        let si: number
        if (this.primary[0] === null) si = 0
        else if (this.primary[1] === null) si = 1
        else si = this.slot <= 1 ? this.slot : 0
        if (this.primary[si]) ctx.loot.spawnWeaponInst(this.pos.x, this.pos.y + 0.05, this.pos.z, this.primary[si]!)
        this.primary[si] = w
        targetSlot = si
      }
      ctx.loot.remove(gi)
      ctx.sfx.equip()
      this.slot = targetSlot
      this.switchLockUntil = ctx.time + 0.4
      this.cancelReload()
      this.refreshHands()
      ctx.hud.notice(`已装备 ${gi.name}`)
      return
    }
    if (gi.kind === 'ammo') {
      const can = this.inv.canAddAmmo(gi.ammoType!, gi.count)
      if (can <= 0) { ctx.hud.notice('背包已满'); return }
      this.inv.addAmmo(gi.ammoType!, can)
      gi.count -= can
      ctx.sfx.pickup()
      if (gi.count <= 0) ctx.loot.remove(gi)
      else gi.name = `${gi.name.split(' ×')[0]} ×${gi.count}`
      return
    }
    const def = ITEMS[gi.itemId!]
    switch (def.kind) {
      case 'armor': case 'helmet': {
        const cur = def.kind === 'armor' ? this.armor : this.helmet
        if ((cur?.level ?? 0) >= (def.level ?? 1)) { ctx.hud.notice('已有同级或更好的装备'); return }
        if (cur) ctx.loot.spawnItem(this.pos.x, this.pos.y + 0.05, this.pos.z, `${def.kind === 'armor' ? 'armor' : 'helm'}${cur.level}`, 1)
        const piece = { level: def.level ?? 1, dur: ARMOR_DURABILITY[def.level ?? 1] }
        if (def.kind === 'armor') { this.armor = piece; this.setArmorVisual() }
        else { this.helmet = piece; this.setHelmetVisual() }
        ctx.loot.remove(gi)
        ctx.sfx.equip()
        ctx.hud.notice(`已装备 ${def.name}`)
        return
      }
      case 'bag': {
        if (this.inv.bagLevel >= (def.level ?? 1)) { ctx.hud.notice('已有同级或更好的背包'); return }
        if (this.inv.bagLevel > 0) ctx.loot.spawnItem(this.pos.x, this.pos.y + 0.05, this.pos.z, `bag${this.inv.bagLevel}`, 1)
        this.inv.bagLevel = def.level ?? 1
        this.setBagVisual(this.inv.bagLevel)
        ctx.loot.remove(gi)
        ctx.sfx.equip()
        ctx.hud.notice(`已装备 ${def.name}（容量 ${this.inv.capacity}）`)
        return
      }
      case 'attach': {
        const candidates = [this.currentWeapon(), this.primary[0], this.primary[1], this.sidearm]
        for (const cw of candidates) {
          if (!cw) continue
          if (cw.canAttach(gi.itemId!) === null) {
            const old = cw.attachItem(gi.itemId!)
            if (old && this.inv.canAddItem(old)) this.inv.addItem(old)
            else if (old) ctx.loot.spawnItem(this.pos.x, this.pos.y + 0.05, this.pos.z, old, 1)
            ctx.loot.remove(gi)
            ctx.sfx.equip()
            this.refreshHands()
            ctx.hud.notice(`已安装 ${def.name} → ${cw.def.name}`)
            return
          }
        }
        if (this.inv.canAddItem(gi.itemId!)) {
          this.inv.addItem(gi.itemId!)
          ctx.loot.remove(gi)
          ctx.sfx.pickup()
          ctx.hud.notice(`${def.name} 已放入背包`)
        } else ctx.hud.notice('没有兼容武器且背包已满')
        return
      }
      case 'meleeWeapon': {
        this.hasPan = true
        ctx.loot.remove(gi)
        ctx.sfx.equip()
        this.refreshHands()
        ctx.hud.notice('已装备 铸铁平底锅（近战槽）')
        return
      }
      default: {
        if (!this.inv.canAddItem(gi.itemId!, gi.count)) { ctx.hud.notice('背包已满'); return }
        this.inv.addItem(gi.itemId!, gi.count)
        ctx.loot.remove(gi)
        ctx.sfx.pickup()
        return
      }
    }
  }

  /** 从背包丢弃物品 */
  dropItem(ctx: Ctx, itemId: string, count = 1) {
    if (!this.inv.removeItem(itemId, count)) return
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    ctx.loot.spawnItem(this.pos.x + fx * 1.2, this.pos.y + 0.05, this.pos.z + fz * 1.2, itemId, count)
    ctx.sfx.ui()
  }

  /** 丢弃武器槽 */
  dropWeapon(ctx: Ctx, where: 'p0' | 'p1' | 'side') {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    let w: WeaponInst | null = null
    if (where === 'p0') { w = this.primary[0]; this.primary[0] = null }
    else if (where === 'p1') { w = this.primary[1]; this.primary[1] = null }
    else { w = this.sidearm; this.sidearm = null }
    if (!w) return
    ctx.loot.spawnWeaponInst(this.pos.x + fx * 1.2, this.pos.y + 0.05, this.pos.z + fz * 1.2, w)
    this.cancelReload()
    this.refreshHands()
    ctx.sfx.ui()
  }

  /** 背包中使用物品 */
  useItem(ctx: Ctx, itemId: string) {
    const def = ITEMS[itemId]
    if (!def) return
    if (def.kind === 'med') { if (!this.casting) this.beginCast(ctx, itemId) }
    else if (def.kind === 'boost') { if (!this.casting) this.beginCast(ctx, itemId) }
    else if (def.kind === 'attach') {
      const candidates = [this.currentWeapon(), this.primary[0], this.primary[1], this.sidearm]
      for (const cw of candidates) {
        if (!cw) continue
        if (cw.canAttach(itemId) === null) {
          this.inv.removeItem(itemId, 1)
          const old = cw.attachItem(itemId)
          if (old) this.inv.addItem(old)
          this.refreshHands()
          ctx.sfx.equip()
          ctx.hud.notice(`已安装 ${def.name} → ${cw.def.name}`)
          return
        }
      }
      ctx.hud.notice('没有兼容的武器插槽')
    } else if (def.kind === 'nade') {
      const idx = NADE_TYPES.indexOf(itemId as (typeof NADE_TYPES)[number])
      if (idx >= 0) {
        this.nadeSel = idx
        this.trySwitch(4, ctx)
        ctx.hud.notice(`已选择 ${def.name}`)
      }
    }
  }
}
