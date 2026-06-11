import * as THREE from 'three'
import { WeaponInst } from '../combat/weapon'
import { FISTS, WeaponDef, ARMOR_REDUCE } from '../items/defs'
import type { Ctx } from '../core/ctx'
import { clamp, damp } from '../utils/math'
import { chuteGores } from '../world/textures'
import { buildCharacterModel } from './characterModel'
import { buildGunMesh } from './weaponModel'
import { buildHelmetModel, buildVestModel, buildBagModel } from './gearModel'
import { ActionTimeline, type CharacterMotionState, type MotionInput } from '../animation/motionState'
import { computePose } from '../animation/characterPose'

const chuteTexCache = new Map<number, THREE.Texture>()
function getChuteTex(color: number): THREE.Texture {
  let t = chuteTexCache.get(color)
  if (!t) {
    const c = new THREE.Color(color)
    const c2 = c.clone().lerp(new THREE.Color(0xe8e2d4), 0.55)
    t = chuteGores(c.getHex(), c2.getHex())
    chuteTexCache.set(color, t)
  }
  return t
}

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
  /** 坐在载具里（驾驶坐姿） */
  seated = false
  /** 模型朝向锁定（驾驶时锁定为车头方向） */
  lockYaw: number | null = null
  /** 举枪瞄准姿态（由控制器写入） */
  poseAiming = false

  // 控制意图（由控制器每帧写入）
  wishX = 0
  wishZ = 0
  wishSpeed = 0
  wantJump = false
  sprinting = false

  // 模型骨架
  model = new THREE.Group()
  protected upper = new THREE.Group()
  protected headGrp = new THREE.Group()
  protected legL = new THREE.Group()
  protected legR = new THREE.Group()
  protected kneeL = new THREE.Group()
  protected kneeR = new THREE.Group()
  protected armL = new THREE.Group()
  protected armR = new THREE.Group()
  protected elbowL = new THREE.Group()
  protected elbowR = new THREE.Group()
  gunGroup = new THREE.Group()
  protected muzzleObj = new THREE.Object3D()
  protected headMesh!: THREE.Mesh
  protected helmetMesh: THREE.Object3D | null = null
  protected vestMesh: THREE.Object3D | null = null
  protected bagMesh: THREE.Object3D | null = null
  protected walkPhase = 0
  protected bodyColor = 0x8a8a6a
  /** 降落伞（attachChute 创建，落地 detachChute） */
  chuteObj: THREE.Group | null = null

  // 动画状态
  protected animT = Math.random() * 10
  protected handsBusy = false
  protected bobV = 0
  protected leanZ = 0
  protected modelTilt = 0
  protected prevYaw = 0
  /** 上身动作时间线（换弹/投掷/治疗/受击/近战） */
  action = new ActionTimeline()
  /** 受击侧向：-1 左 / +1 右 */
  protected hitDir = 0
  /** 最近一次 update 的全局时间（开火后坐衰减用） */
  protected ctxTime = 0

  get height(): number { return this.crouching ? 1.3 : 1.8 }
  get eyeH(): number { return this.crouching ? 1.05 : 1.55 }
  headWorldY(): number { return this.pos.y + (this.crouching ? 1.15 : 1.64) }
  forwardX(): number { return Math.sin(this.yaw) }
  forwardZ(): number { return Math.cos(this.yaw) }

  buildModel(scene: THREE.Scene, bodyColor: number, skinColor = 0xc9a583) {
    this.bodyColor = bodyColor
    const rig = buildCharacterModel({ bodyColor, skinColor })
    this.model = rig.model
    this.upper = rig.upper
    this.headGrp = rig.headGrp
    this.legL = rig.legL; this.legR = rig.legR
    this.kneeL = rig.kneeL; this.kneeR = rig.kneeR
    this.armL = rig.armL; this.armR = rig.armR
    this.elbowL = rig.elbowL; this.elbowR = rig.elbowR
    this.gunGroup = rig.gunGroup
    this.muzzleObj = rig.muzzleObj
    this.headMesh = rig.headMesh
    this.setWeaponVisual()
    this.prevYaw = this.yaw
    scene.add(this.model)
  }

  /** 重建手中武器模型（含配件可视化） */
  setWeaponVisual() {
    while (this.gunGroup.children.length) this.gunGroup.remove(this.gunGroup.children[0])
    const def = this.weapon ? this.weapon.def : this.meleeDef
    const grp = buildGunMesh(def, this.weapon?.attach ?? {})
    this.handsBusy = grp.group.children.length > 0
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
      this.vestMesh = buildVestModel(this.armor.level)
      this.upper.add(this.vestMesh)
    }
  }

  setHelmetVisual() {
    if (this.helmetMesh) { this.headGrp.remove(this.helmetMesh); this.helmetMesh = null }
    if (this.helmet) {
      this.helmetMesh = buildHelmetModel(this.helmet.level)
      this.headGrp.add(this.helmetMesh)
    }
  }

  setBagVisual(level: number) {
    if (this.bagMesh) { this.upper.remove(this.bagMesh); this.bagMesh = null }
    if (level > 0) {
      this.bagMesh = buildBagModel(level)
      this.upper.add(this.bagMesh)
    }
  }

  // ---------------- 降落伞 ----------------

  attachChute(color = 0xc9a23f) {
    if (this.chuteObj) return
    this.chuteObj = buildChute(color)
    this.model.add(this.chuteObj)
  }

  setChuteVisible(v: boolean) {
    if (this.chuteObj) this.chuteObj.visible = v
  }

  detachChute() {
    if (this.chuteObj) {
      this.model.remove(this.chuteObj)
      this.chuteObj = null
    }
  }

  /** 近战出拳动画触发 */
  triggerPunch() {
    this.action.start('melee', 0.28)
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.model.updateMatrixWorld(true)
    return this.muzzleObj.getWorldPosition(out)
  }

  /** 物理与动画更新 */
  update(dt: number, ctx: Ctx) {
    if (!this.alive) return
    this.ctxTime = ctx.time
    const accel = this.onGround ? 13 : 2.6
    this.vel.x = damp(this.vel.x, this.wishX * this.wishSpeed, accel, dt)
    this.vel.z = damp(this.vel.z, this.wishZ * this.wishSpeed, accel, dt)
    this.vel.y -= GRAVITY * dt

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    this.pos.y += this.vel.y * dt
    this.pos.x = clamp(this.pos.x, -ctx.world.play - 12, ctx.world.play + 12)
    this.pos.z = clamp(this.pos.z, -ctx.world.play - 12, ctx.world.play + 12)

    const col = ctx.world.col
    const p = { x: this.pos.x, z: this.pos.z }
    col.resolveCircle(p, this.pos.y, this.pos.y + this.height, this.radius)
    this.pos.x = p.x
    this.pos.z = p.z

    const g = col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1)
    if (this.pos.y <= g + 0.02) {
      const impact = -this.vel.y
      const hardLand = !this.onGround && impact > 10
      this.pos.y = g
      this.vel.y = 0
      this.onGround = true
      if (hardLand) {
        ctx.fx.dust(this.pos.x, this.pos.y, this.pos.z, 8)
        if (this.isPlayer) {
          ctx.sfx.land()
          ctx.fx.addShake(0.25)
          ctx.fx.kick('hardGround', Math.min(1.4, impact / 13))
        }
        // 高处坠落伤害（无视护甲）
        if (impact > 14) {
          const dmg = (impact - 14) * 4.5
          this.hp -= dmg
          this.lastDamageT = ctx.time
          if (this.isPlayer) {
            ctx.sfx.hurt()
            ctx.hud.damageFlash(0, false)
          }
          if (this.hp <= 0) ctx.kill(this, null, '高处坠落')
          if (!this.alive) return
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

  /** 当前主运动状态（供姿态计算与外部查询） */
  motionState(): CharacterMotionState {
    if (!this.alive) return 'dead'
    if (this.seated) return 'drive'
    if (this.dropping) {
      return !this.chuteObj || !this.chuteObj.visible ? 'freefall' : 'chute'
    }
    if (!this.onGround) return 'jump'
    if (this.crouching) return 'crouch'
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (hSpeed < 0.4) return 'idle'
    return hSpeed > 5.2 ? 'run' : 'walk'
  }

  /**
   * 姿态动画：读取状态 → computePose 计算关节目标 → 阻尼应用到骨架。
   * 覆盖 站立/行走/奔跑/蹲伏/跳跃/跳伞/驾驶 + 换弹/投掷/治疗/受击/近战动作层。
   */
  protected animate(dt: number) {
    this.animT += dt
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const moveK = clamp(hSpeed / 4.2, 0, 1)
    const runK = clamp((hSpeed - 4.4) / 2.4, 0, 1)
    this.walkPhase += hSpeed * dt * 1.6
    const state = this.motionState()
    const armed = this.handsBusy
    const aiming = armed && this.poseAiming && this.weapon !== null && state !== 'drive' && state !== 'chute' && state !== 'freefall'
    const idle = state === 'idle'
    const sw = Math.sin(this.walkPhase)
    const breath = Math.sin(this.animT * 1.8)

    // 上身动作仅在地面状态生效；跳伞/驾驶时挂起
    const actionBlocked = state === 'drive' || state === 'chute' || state === 'freefall'
    const actionK = actionBlocked ? 0 : this.action.tick(dt)
    const action = actionBlocked ? 'none' : this.action.kind

    // 开火后坐冲量（指数衰减，基于武器最后开火时刻）
    let fireK = 0
    if (this.weapon && armed) {
      const since = Math.max(0, this.ctxTime - this.weapon.lastShot)
      if (since < 0.4) fireK = Math.exp(-since * 16)
    }

    const m: MotionInput = {
      state,
      moveK, runK,
      walkPhase: this.walkPhase,
      breath,
      armed, aiming,
      sprinting: this.sprinting,
      idle,
      pitch: this.pitch,
      action, actionK,
      fireK,
      hitDir: this.hitDir,
    }
    const pose = computePose(m)

    // ---- 应用关节（阻尼过渡；动作层用更快的响应） ----
    const sp = action !== 'none' ? 22 : 14
    const J = (o: THREE.Object3D, ax: 'x' | 'y' | 'z', v: number, s = sp) => {
      o.rotation[ax] = damp(o.rotation[ax], v, s, dt)
    }
    J(this.legL, 'x', pose.thL); J(this.legR, 'x', pose.thR)
    J(this.kneeL, 'x', pose.knL); J(this.kneeR, 'x', pose.knR)
    J(this.armL, 'x', pose.armLx); J(this.armL, 'z', pose.armLz); J(this.elbowL, 'x', pose.elbL)
    J(this.armR, 'x', pose.armRx); J(this.armR, 'z', pose.armRz); J(this.elbowR, 'x', pose.elbR)
    J(this.gunGroup, 'x', pose.gunRx, action !== 'none' ? 18 : 11)

    // ---- 躯干 / 头部 ----
    this.upper.position.y = damp(this.upper.position.y, pose.upperY, 12, dt)
    const leanF = this.seated ? 0.1 : runK * 0.16 + moveK * 0.04
    const pitchLean = this.seated || this.dropping ? 0 : -this.pitch * 0.5
    this.upper.rotation.x = damp(this.upper.rotation.x, pitchLean + leanF + pose.upperRx, 15, dt)
    this.upper.rotation.y = damp(this.upper.rotation.y, pose.upperRy, 13, dt)
    this.upper.rotation.z = damp(this.upper.rotation.z, sw * 0.04 * moveK, 9, dt)
    const headPitch = this.seated || this.dropping ? 0 : -this.pitch * 0.24
    this.headGrp.rotation.x = damp(this.headGrp.rotation.x, headPitch + pose.headRx, 15, dt)

    // ---- 转向侧倾（重心感） ----
    const yawNow = this.lockYaw ?? this.yaw
    let dY = yawNow - this.prevYaw
    while (dY > Math.PI) dY -= Math.PI * 2
    while (dY < -Math.PI) dY += Math.PI * 2
    this.prevYaw = yawNow
    const leanT = clamp((dY / Math.max(dt, 1e-4)) * 0.022, -0.09, 0.09) * Math.max(moveK, this.dropping ? 0.5 : 0)
    this.leanZ = damp(this.leanZ, leanT, 6, dt)

    // ---- 整体变换 ----
    this.modelTilt = damp(this.modelTilt, state === 'freefall' ? 0.95 : 0, 5, dt)
    this.model.rotation.y = yawNow
    this.model.rotation.x = this.modelTilt
    this.model.rotation.z = this.leanZ
    this.bobV = damp(this.bobV, pose.bob, 16, dt)
    const idleBreath = idle ? breath * 0.007 : 0
    this.model.position.set(this.pos.x, this.pos.y + this.bobV + idleBreath, this.pos.z)

    // ---- 降落伞摇摆 ----
    if (this.chuteObj && this.chuteObj.visible) {
      this.chuteObj.rotation.z = Math.sin(this.animT * 0.85) * 0.05
      this.chuteObj.rotation.x = Math.sin(this.animT * 0.62 + 1.3) * 0.045
      const canopy = this.chuteObj.userData.canopy as THREE.Mesh | undefined
      if (canopy) {
        const s = 1 + Math.sin(this.animT * 1.5) * 0.02
        canopy.scale.set(s, 1 - Math.sin(this.animT * 1.5) * 0.012, s)
      }
    }
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
    // 受击动作：上身短促偏移（不打断换弹/投掷等长动作）
    if (!this.action.active || this.action.kind === 'hit') {
      if (attacker) {
        // 攻击者相对朝向决定上身偏转方向
        const rel = Math.atan2(attacker.pos.x - this.pos.x, attacker.pos.z - this.pos.z) - this.yaw
        this.hitDir = Math.sin(rel) >= 0 ? 1 : -1
      } else {
        this.hitDir = Math.random() < 0.5 ? -1 : 1
      }
      this.action.start('hit', 0.26)
    }
    // AI 受重击短时停顿（硬直）
    if (!this.isPlayer && dmg > 14) {
      this.stunnedUntil = Math.max(this.stunnedUntil, ctx.time + 0.16)
    }
    if (this.isPlayer) {
      ctx.sfx.hurt()
      let ang = 0
      if (attacker) {
        ang = Math.atan2(attacker.pos.x - this.pos.x, attacker.pos.z - this.pos.z) - this.yaw
      }
      ctx.hud.damageFlash(ang, attacker !== null)
      ctx.fx.addShake(0.18)
      ctx.fx.kick('hit', 0.55 + Math.min(1, dmg / 45) * 0.6)
    }
    if (this.hp <= 0) {
      ctx.kill(this, attacker, weaponName)
    }
  }

  /**
   * 死亡姿态：按伤害来向选择倒地方向。
   * 正面中弹 → 后倒；背面中弹 → 前扑；侧面中弹 → 向同侧倒。
   */
  lieDown(attacker: Character | null = null) {
    this.alive = false
    this.detachChute()
    this.action.cancel()

    // 伤害来向（相对自身朝向）；无攻击者则随机后倒/侧倒
    let mode: 'back' | 'front' | 'left' | 'right' = 'back'
    const src = attacker ?? this.lastAttacker
    if (src) {
      let rel = Math.atan2(src.pos.x - this.pos.x, src.pos.z - this.pos.z) - this.yaw
      while (rel > Math.PI) rel -= Math.PI * 2
      while (rel < -Math.PI) rel += Math.PI * 2
      const a = Math.abs(rel)
      if (a < Math.PI * 0.3) mode = 'back'        // 正面被击 → 向后倒
      else if (a > Math.PI * 0.7) mode = 'front'  // 背后被击 → 向前扑
      else mode = rel > 0 ? 'right' : 'left'      // 侧面 → 向受击对侧倒
    } else if (Math.random() < 0.4) {
      mode = Math.random() < 0.5 ? 'left' : 'right'
    }

    this.upper.position.y = 0
    this.upper.rotation.set(0, 0, 0)
    this.model.rotation.z = 0

    if (mode === 'front') {
      // 前扑：脸朝下，手臂前伸
      this.model.rotation.x = Math.PI / 2
      this.model.position.y = this.pos.y + 0.16
      this.headGrp.rotation.set(-0.15, 0.25, 0)
      this.armL.rotation.set(-2.6, 0, -0.25)
      this.armR.rotation.set(-2.4, 0, 0.3)
      this.elbowL.rotation.x = 0.2
      this.elbowR.rotation.x = 0.35
      this.legL.rotation.x = 0.08
      this.legR.rotation.x = -0.14
      this.kneeL.rotation.x = 0.25
      this.kneeR.rotation.x = 0.45
    } else if (mode === 'left' || mode === 'right') {
      // 侧倒：蜷缩
      const s = mode === 'right' ? 1 : -1
      this.model.rotation.x = 0
      this.model.rotation.z = s * Math.PI / 2
      this.model.position.y = this.pos.y + 0.3
      this.headGrp.rotation.set(0.3, s * 0.3, 0)
      this.armL.rotation.set(-0.7, 0, -0.5)
      this.armR.rotation.set(-0.55, 0, 0.45)
      this.elbowL.rotation.x = 0.85
      this.elbowR.rotation.x = 0.7
      this.legL.rotation.x = -0.55
      this.legR.rotation.x = -0.3
      this.kneeL.rotation.x = 0.9
      this.kneeR.rotation.x = 0.65
    } else {
      // 后倒：仰面四肢摊开
      this.model.rotation.x = -Math.PI / 2
      this.model.position.y = this.pos.y + 0.22
      this.headGrp.rotation.set(0.2, 0.3, 0)
      this.armL.rotation.set(-0.45, 0, -1.05)
      this.armR.rotation.set(0.3, 0, 0.85)
      this.elbowL.rotation.x = 0.35
      this.elbowR.rotation.x = 0.2
      this.legL.rotation.x = -0.12
      this.legR.rotation.x = 0.18
      this.kneeL.rotation.x = 0.3
      this.kneeR.rotation.x = 0.12
    }
  }

  removeModel(scene: THREE.Scene) {
    scene.remove(this.model)
  }
}

/** 高精度降落伞：幅条伞衣 + 伞绳收束 + 双肩背带（玩家与 AI 共用） */
export function buildChute(color = 0xc9a23f): THREE.Group {
  const chute = new THREE.Group()
  const tex = getChuteTex(color)

  // 伞衣：开口半球穹顶（幅条贴图沿周向环绕）
  const canopyGeo = new THREE.SphereGeometry(2.75, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.46)
  const canopyMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })
  const canopy = new THREE.Mesh(canopyGeo, canopyMat)
  canopy.position.y = 4.35
  canopy.castShadow = true
  chute.add(canopy)
  chute.userData.canopy = canopy

  // 顶孔环
  const vent = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.035, 5, 10),
    new THREE.MeshLambertMaterial({ color: 0x3a342c }),
  )
  vent.rotation.x = Math.PI / 2
  vent.position.y = 4.35 + 2.74
  chute.add(vent)

  // 伞绳：从伞衣裙边收束到双肩挂点
  const rimY = 4.35 + 2.75 * Math.cos(Math.PI * 0.46)
  const rimR = 2.75 * Math.sin(Math.PI * 0.46)
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c2 })
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const N = 10
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / N
    const top = new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR)
    const anchor = new THREE.Vector3(Math.cos(a) >= 0 ? 0.21 : -0.21, 1.58, 0.03)
    dir.copy(top).sub(anchor)
    const len = dir.length()
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, len, 3), lineMat)
    line.position.copy(anchor).addScaledVector(dir, 0.5)
    line.quaternion.setFromUnitVectors(up, dir.normalize())
    chute.add(line)
  }

  // 双肩背带 + 胸扣
  const strapMat = new THREE.MeshLambertMaterial({ color: 0x4a4438 })
  for (const sx of [-0.21, 0.21]) {
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.05), strapMat)
    riser.position.set(sx, 1.72, 0.05)
    riser.rotation.z = sx > 0 ? -0.22 : 0.22
    chute.add(riser)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.34), strapMat)
    strap.position.set(sx, 1.5, 0)
    chute.add(strap)
  }
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), strapMat)
  buckle.position.set(0, 1.32, 0.16)
  chute.add(buckle)
  return chute
}

