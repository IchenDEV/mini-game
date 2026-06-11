import * as THREE from 'three'
import { WeaponInst } from '../combat/weapon'
import { FISTS, WeaponDef, ARMOR_REDUCE } from '../items/defs'
import type { Ctx } from '../core/ctx'
import { clamp, damp } from '../utils/math'

export interface ArmorPiece {
  level: number
  dur: number
}

let nextCharId = 1
const GRAVITY = 20
const JUMP_V = 6.4

/** 玩家与 AI 共用的角色基类：物理、模型、伤害 */
export class Character {
  id = nextCharId++
  name = '行动者'
  isPlayer = false
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  hp = 100
  boost = 0
  alive = true
  crouching = false
  onGround = false
  radius = 0.38
  kills = 0
  damageDealt = 0
  armor: ArmorPiece | null = null
  helmet: ArmorPiece | null = null
  weapon: WeaponInst | null = null
  meleeDef: WeaponDef = FISTS
  lastDamageT = -99
  lastAttacker: Character | null = null
  stunnedUntil = -1
  wading = false
  dropping = false

  // 控制意图（由控制器每帧写入）
  wishX = 0
  wishZ = 0
  wishSpeed = 0
  wantJump = false
  sprinting = false

  // 模型
  model = new THREE.Group()
  protected upper = new THREE.Group()
  protected legL = new THREE.Group()
  protected legR = new THREE.Group()
  protected armL = new THREE.Group()
  protected armR = new THREE.Group()
  gunGroup = new THREE.Group()
  protected muzzleObj = new THREE.Object3D()
  protected headMesh!: THREE.Mesh
  protected helmetMesh: THREE.Mesh | null = null
  protected vestMesh: THREE.Mesh | null = null
  protected bagMesh: THREE.Mesh | null = null
  protected walkPhase = 0
  protected bodyColor = 0x8a8a6a

  get height(): number { return this.crouching ? 1.3 : 1.8 }
  get eyeH(): number { return this.crouching ? 1.05 : 1.55 }
  headWorldY(): number { return this.pos.y + (this.crouching ? 1.15 : 1.64) }
  forwardX(): number { return Math.sin(this.yaw) }
  forwardZ(): number { return Math.cos(this.yaw) }

  buildModel(scene: THREE.Scene, bodyColor: number, skinColor = 0xc9a583) {
    this.bodyColor = bodyColor
    const matBody = new THREE.MeshLambertMaterial({ color: bodyColor, flatShading: true })
    const matDark = new THREE.MeshLambertMaterial({ color: 0x3c4045, flatShading: true })
    const matSkin = new THREE.MeshLambertMaterial({ color: skinColor, flatShading: true })

    // 腿
    const legGeo = new THREE.BoxGeometry(0.17, 0.88, 0.2)
    for (const [grp, sx] of [[this.legL, -0.12], [this.legR, 0.12]] as [THREE.Group, number][]) {
      grp.position.set(sx, 0.92, 0)
      const leg = new THREE.Mesh(legGeo, matDark)
      leg.position.y = -0.44
      leg.castShadow = true
      grp.add(leg)
      this.model.add(grp)
    }
    // 上身
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), matBody)
    torso.position.y = 1.24
    torso.castShadow = true
    this.upper.add(torso)
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 7), matSkin)
    this.headMesh.position.y = 1.68
    this.headMesh.castShadow = true
    this.upper.add(this.headMesh)
    // 手臂（持枪姿态）
    const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.13)
    for (const [grp, sx] of [[this.armL, -0.33], [this.armR, 0.33]] as [THREE.Group, number][]) {
      grp.position.set(sx, 1.5, 0.02)
      const arm = new THREE.Mesh(armGeo, matBody)
      arm.position.y = -0.22
      arm.castShadow = true
      grp.add(arm)
      grp.rotation.x = -1.1
      this.upper.add(grp)
    }
    // 枪
    this.gunGroup.position.set(0.18, 1.42, 0.3)
    this.upper.add(this.gunGroup)
    this.model.add(this.upper)
    this.setWeaponVisual()
    scene.add(this.model)
  }

  /** 重建手中武器模型 */
  setWeaponVisual() {
    while (this.gunGroup.children.length) this.gunGroup.remove(this.gunGroup.children[0])
    const def = this.weapon ? this.weapon.def : this.meleeDef
    const grp = buildGunMesh(def, this.weapon?.attach.scope)
    this.gunGroup.add(grp.group)
    this.muzzleObj.position.set(0, 0.02, grp.len)
    this.gunGroup.add(this.muzzleObj)
  }

  setWeapon(w: WeaponInst | null) {
    this.weapon = w
    this.setWeaponVisual()
  }

  setArmorVisual() {
    if (this.vestMesh) { this.upper.remove(this.vestMesh); this.vestMesh = null }
    if (this.armor) {
      const colors = [0, 0x7a8a99, 0x46698c, 0x2c3d52]
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.46, 0.36),
        new THREE.MeshLambertMaterial({ color: colors[this.armor.level], flatShading: true }),
      )
      m.position.y = 1.26
      m.castShadow = true
      this.vestMesh = m
      this.upper.add(m)
    }
  }

  setHelmetVisual() {
    if (this.helmetMesh) { this.upper.remove(this.helmetMesh); this.helmetMesh = null }
    if (this.helmet) {
      const colors = [0, 0xb0a890, 0x5d7a4a, 0x32404c]
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: colors[this.helmet.level], flatShading: true }),
      )
      m.position.y = 1.68
      m.castShadow = true
      this.helmetMesh = m
      this.upper.add(m)
    }
  }

  setBagVisual(level: number) {
    if (this.bagMesh) { this.upper.remove(this.bagMesh); this.bagMesh = null }
    if (level > 0) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.36 + level * 0.1, 0.2 + level * 0.04),
        new THREE.MeshLambertMaterial({ color: 0x6e5a3c, flatShading: true }),
      )
      m.position.set(0, 1.26, -0.28)
      m.castShadow = true
      this.bagMesh = m
      this.upper.add(m)
    }
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.model.updateMatrixWorld(true)
    return this.muzzleObj.getWorldPosition(out)
  }

  /** 物理与动画更新 */
  update(dt: number, ctx: Ctx) {
    if (!this.alive) return
    const accel = this.onGround ? 13 : 2.6
    this.vel.x = damp(this.vel.x, this.wishX * this.wishSpeed, accel, dt)
    this.vel.z = damp(this.vel.z, this.wishZ * this.wishSpeed, accel, dt)
    this.vel.y -= GRAVITY * dt

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    this.pos.y += this.vel.y * dt
    this.pos.x = clamp(this.pos.x, -392, 392)
    this.pos.z = clamp(this.pos.z, -392, 392)

    const col = ctx.world.col
    const p = { x: this.pos.x, z: this.pos.z }
    col.resolveCircle(p, this.pos.y, this.pos.y + this.height, this.radius)
    this.pos.x = p.x
    this.pos.z = p.z

    const g = col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1)
    if (this.pos.y <= g + 0.02) {
      const hardLand = !this.onGround && this.vel.y < -10
      this.pos.y = g
      this.vel.y = 0
      this.onGround = true
      if (hardLand) {
        ctx.fx.dust(this.pos.x, this.pos.y, this.pos.z, 8)
        if (this.isPlayer) {
          ctx.sfx.land()
          ctx.fx.addShake(0.25)
        }
      }
      if (this.wantJump) {
        this.vel.y = JUMP_V
        this.onGround = false
      }
    } else if (this.onGround && this.pos.y - g < 0.35 && this.vel.y <= 0) {
      this.pos.y = g
      this.vel.y = 0
    } else {
      this.onGround = false
    }
    this.wantJump = false

    this.wading = this.onGround && ctx.world.groundHeight(this.pos.x, this.pos.z) < ctx.world.waterY - 0.15

    // 能量条
    if (this.boost > 0) {
      this.boost = Math.max(0, this.boost - dt * 0.42)
      const regen = this.boost > 60 ? 0.5 : 0.27
      this.hp = Math.min(100, this.hp + regen * dt)
    }

    this.animate(dt)
  }

  protected animate(dt: number) {
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    this.walkPhase += hSpeed * dt * 1.7
    const sw = Math.sin(this.walkPhase) * 0.72 * clamp(hSpeed / 4.5, 0, 1)
    if (this.onGround) {
      this.legL.rotation.x = sw
      this.legR.rotation.x = -sw
    } else {
      this.legL.rotation.x = 0.5
      this.legR.rotation.x = -0.3
    }
    if (this.crouching) {
      this.upper.position.y = -0.42
      this.legL.rotation.x = 0.85
      this.legR.rotation.x = -0.4
    } else {
      this.upper.position.y = 0
    }
    this.upper.rotation.x = -this.pitch * 0.5
    this.model.rotation.y = this.yaw
    this.model.position.copy(this.pos)
  }

  takeDamage(amount: number, isHead: boolean, attacker: Character | null, weaponName: string, ctx: Ctx) {
    if (!this.alive) return
    let dmg = amount
    const piece = isHead ? this.helmet : this.armor
    if (piece) {
      const absorbed = dmg * ARMOR_REDUCE[piece.level]
      piece.dur -= absorbed
      dmg -= absorbed
      if (piece.dur <= 0) {
        if (isHead) { this.helmet = null; this.setHelmetVisual() }
        else { this.armor = null; this.setArmorVisual() }
        if (this.isPlayer) ctx.sfx.armorBreak()
      }
    }
    const before = this.hp
    this.hp -= dmg
    this.lastDamageT = ctx.time
    this.lastAttacker = attacker
    if (attacker) attacker.damageDealt += Math.min(dmg, Math.max(0, before))
    if (this.isPlayer) {
      ctx.sfx.hurt()
      let ang = 0
      if (attacker) {
        ang = Math.atan2(attacker.pos.x - this.pos.x, attacker.pos.z - this.pos.z) - this.yaw
      }
      ctx.hud.damageFlash(ang, attacker !== null)
      ctx.fx.addShake(0.18)
    }
    if (this.hp <= 0) {
      ctx.kill(this, attacker, weaponName)
    }
  }

  /** 死亡姿态 */
  lieDown() {
    this.alive = false
    this.model.rotation.x = -Math.PI / 2
    this.model.position.y = this.pos.y + 0.25
    this.upper.rotation.x = 0
  }

  removeModel(scene: THREE.Scene) {
    scene.remove(this.model)
  }
}

/** 降落伞模型（玩家与 AI 共用） */
export function buildChute(color = 0xc9a23f): THREE.Group {
  const chute = new THREE.Group()
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(2.3, 1.7, 8, 1, true),
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
  )
  canopy.position.y = 4.4
  chute.add(canopy)
  for (const [sx, sz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 2.2, 0.03),
      new THREE.MeshLambertMaterial({ color: 0x3c4045 }),
    )
    line.position.set(sx * 0.7, 2.9, sz * 0.7)
    line.rotation.z = sx * -0.35
    line.rotation.x = sz * 0.35
    chute.add(line)
  }
  return chute
}

/** 程序化枪模型 */
export function buildGunMesh(def: WeaponDef, scopeId?: string): { group: THREE.Group; len: number } {
  const g = new THREE.Group()
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3338, flatShading: true })
  const wood = new THREE.MeshLambertMaterial({ color: 0x5d4a32, flatShading: true })
  const metal = new THREE.MeshLambertMaterial({ color: 0x4a5158, flatShading: true })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.x = rx
    m.castShadow = true
    g.add(m)
    return m
  }
  let len = 0.6
  switch (def.cls) {
    case 'AR':
      len = 0.78
      add(new THREE.BoxGeometry(0.07, 0.1, 0.55), dark, 0, 0, 0.16)
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 6), metal, 0, 0.01, 0.6, Math.PI / 2)
      add(new THREE.BoxGeometry(0.05, 0.18, 0.07), dark, 0, -0.12, 0.1)
      add(new THREE.BoxGeometry(0.05, 0.09, 0.22), wood, 0, -0.02, -0.22)
      break
    case 'DMR':
      len = 0.92
      add(new THREE.BoxGeometry(0.06, 0.1, 0.6), wood, 0, 0, 0.2)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), metal, 0, 0.01, 0.7, Math.PI / 2)
      add(new THREE.BoxGeometry(0.05, 0.16, 0.06), dark, 0, -0.11, 0.12)
      add(new THREE.BoxGeometry(0.05, 0.1, 0.26), wood, 0, -0.02, -0.24)
      break
    case 'SR':
      len = 1.02
      add(new THREE.BoxGeometry(0.06, 0.09, 0.62), wood, 0, 0, 0.18)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.56, 6), metal, 0, 0.012, 0.74, Math.PI / 2)
      add(new THREE.BoxGeometry(0.05, 0.11, 0.3), wood, 0, -0.03, -0.26)
      break
    case 'SG':
      len = 0.86
      add(new THREE.BoxGeometry(0.07, 0.1, 0.5), wood, 0, 0, 0.12)
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 6), metal, 0, 0.015, 0.6, Math.PI / 2)
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 6), metal, 0, -0.035, 0.56, Math.PI / 2)
      add(new THREE.BoxGeometry(0.05, 0.1, 0.24), wood, 0, -0.02, -0.2)
      break
    case 'SMG':
      len = 0.55
      add(new THREE.BoxGeometry(0.07, 0.11, 0.38), dark, 0, 0, 0.08)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), metal, 0, 0.01, 0.38, Math.PI / 2)
      add(new THREE.BoxGeometry(0.045, 0.2, 0.06), dark, 0, -0.13, 0.06)
      break
    case 'PISTOL':
      len = 0.3
      add(new THREE.BoxGeometry(0.05, 0.08, 0.24), dark, 0, 0, 0.08)
      add(new THREE.BoxGeometry(0.045, 0.14, 0.06), dark, 0, -0.09, -0.02)
      break
    case 'MELEE':
      if (def.id === 'pan') {
        len = 0.4
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 10), metal, 0, 0, 0.3, Math.PI / 2)
        add(new THREE.BoxGeometry(0.04, 0.04, 0.24), dark, 0, 0, 0.08)
      } else {
        len = 0.2
        // 徒手：无模型
      }
      break
  }
  if (scopeId && def.cls !== 'MELEE') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, scopeId === 'scope_red' ? 0.08 : 0.18, 6), dark)
    scope.rotation.x = Math.PI / 2
    scope.position.set(0, 0.085, 0.16)
    g.add(scope)
  }
  return { group: g, len }
}
