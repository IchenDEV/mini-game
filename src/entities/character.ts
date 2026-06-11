import * as THREE from 'three'
import { WeaponInst } from '../combat/weapon'
import { FISTS, WeaponDef, ARMOR_REDUCE } from '../items/defs'
import type { Ctx } from '../core/ctx'
import { clamp, damp } from '../utils/math'
import { fabric, camo, chuteGores } from '../world/textures'

let fabricTexCache: THREE.Texture | null = null
function getFabricTex(): THREE.Texture {
  if (!fabricTexCache) fabricTexCache = fabric()
  return fabricTexCache
}

/** 迷彩贴图按服装基色缓存（贴图自带颜色） */
const camoTexCache = new Map<number, THREE.Texture>()
function getCamoTex(color: number): THREE.Texture {
  let t = camoTexCache.get(color)
  if (!t) {
    t = camo(color)
    camoTexCache.set(color, t)
  }
  return t
}

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
  protected helmetMesh: THREE.Mesh | null = null
  protected vestMesh: THREE.Mesh | null = null
  protected bagMesh: THREE.Mesh | null = null
  protected walkPhase = 0
  protected bodyColor = 0x8a8a6a
  /** 降落伞（attachChute 创建，落地 detachChute） */
  chuteObj: THREE.Group | null = null

  // 动画状态
  protected animT = Math.random() * 10
  protected punchT = -9
  protected handsBusy = false
  protected bobV = 0
  protected leanZ = 0
  protected modelTilt = 0
  protected prevYaw = 0

  get height(): number { return this.crouching ? 1.3 : 1.8 }
  get eyeH(): number { return this.crouching ? 1.05 : 1.55 }
  headWorldY(): number { return this.pos.y + (this.crouching ? 1.15 : 1.64) }
  forwardX(): number { return Math.sin(this.yaw) }
  forwardZ(): number { return Math.cos(this.yaw) }

  buildModel(scene: THREE.Scene, bodyColor: number, skinColor = 0xc9a583) {
    this.bodyColor = bodyColor
    const camoTex = getCamoTex(bodyColor)
    const fabricTex = getFabricTex()
    // 迷彩自带颜色，上下身用色相区分（裤子压暗）
    const matBody = new THREE.MeshLambertMaterial({ map: camoTex })
    const matPants = new THREE.MeshLambertMaterial({ map: camoTex, color: 0xb4b6ac })
    const matGear = new THREE.MeshLambertMaterial({ color: 0x474d42, map: fabricTex })
    const matDark = new THREE.MeshLambertMaterial({ color: 0x2e3230, map: fabricTex })
    const matSkin = new THREE.MeshLambertMaterial({ color: skinColor })
    const matBoot = new THREE.MeshLambertMaterial({ color: 0x33342e })

    const mk = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.castShadow = shadow
      parent.add(m)
      return m
    }

    this.model.rotation.order = 'YXZ'

    // ---- 骨盆 ----
    mk(this.model, new THREE.BoxGeometry(0.38, 0.2, 0.25), matPants, 0, 0.97, 0)

    // ---- 腿（大腿 → 膝 → 小腿 + 战术靴）----
    const thighGeo = new THREE.CapsuleGeometry(0.105, 0.3, 3, 8)
    const calfGeo = new THREE.CapsuleGeometry(0.085, 0.28, 3, 8)
    for (const [hip, knee, sx] of [[this.legL, this.kneeL, -0.13], [this.legR, this.kneeR, 0.13]] as [THREE.Group, THREE.Group, number][]) {
      hip.position.set(sx, 0.92, 0)
      mk(hip, thighGeo, matPants, 0, -0.21, 0)
      knee.position.set(0, -0.45, 0)
      mk(knee, calfGeo, matPants, 0, -0.18, 0)
      // 护膝
      mk(knee, new THREE.BoxGeometry(0.12, 0.1, 0.05), matDark, 0, -0.04, 0.075)
      // 靴 + 鞋底
      mk(knee, new THREE.BoxGeometry(0.15, 0.12, 0.27), matBoot, 0, -0.4, 0.045)
      mk(knee, new THREE.BoxGeometry(0.16, 0.035, 0.29), matDark, 0, -0.465, 0.05)
      hip.add(knee)
      this.model.add(hip)
    }
    // 右腿挂枪套
    mk(this.legR, new THREE.BoxGeometry(0.07, 0.2, 0.13), matDark, 0.1, -0.16, 0.03)

    // ---- 躯干 ----
    const torso = mk(this.upper, new THREE.BoxGeometry(0.48, 0.6, 0.26), matBody, 0, 1.26, 0)
    torso.receiveShadow = true
    // 肩部垫片 + 领口
    mk(this.upper, new THREE.BoxGeometry(0.13, 0.07, 0.2), matBody, -0.27, 1.53, 0)
    mk(this.upper, new THREE.BoxGeometry(0.13, 0.07, 0.2), matBody, 0.27, 1.53, 0)
    mk(this.upper, new THREE.BoxGeometry(0.2, 0.05, 0.18), matGear, 0, 1.575, 0)
    // 战术胸挂：主板 + 三联弹匣包 + 杂物包
    mk(this.upper, new THREE.BoxGeometry(0.44, 0.3, 0.07), matGear, 0, 1.34, 0.155)
    for (const px of [-0.13, 0, 0.13]) {
      mk(this.upper, new THREE.BoxGeometry(0.1, 0.14, 0.05), matDark, px, 1.25, 0.2)
    }
    mk(this.upper, new THREE.BoxGeometry(0.16, 0.09, 0.05), matDark, 0.02, 1.43, 0.19)
    // 背部水袋包 + 电台 + 天线
    mk(this.upper, new THREE.BoxGeometry(0.3, 0.34, 0.08), matBody, 0, 1.32, -0.165)
    mk(this.upper, new THREE.BoxGeometry(0.1, 0.15, 0.06), matDark, 0.13, 1.43, -0.2)
    const ant = mk(this.upper, new THREE.CylinderGeometry(0.008, 0.005, 0.3, 4), matDark, 0.13, 1.64, -0.2, false)
    ant.rotation.z = -0.12
    // 腰带 + 侧包
    mk(this.upper, new THREE.BoxGeometry(0.5, 0.07, 0.28), matGear, 0, 0.995, 0)
    mk(this.upper, new THREE.BoxGeometry(0.09, 0.13, 0.15), matGear, -0.27, 0.93, 0.02)

    // ---- 头（颈 → 头组：脸 + 耳机 + 作训帽）----
    mk(this.upper, new THREE.CylinderGeometry(0.065, 0.078, 0.1, 8), matSkin, 0, 1.585, 0)
    this.headGrp.position.set(0, 1.68, 0)
    this.headMesh = mk(this.headGrp, new THREE.SphereGeometry(0.165, 14, 11), matSkin, 0, 0, 0)
    // 眼睛（轻微提神，不近看几乎不可见）
    for (const ex of [-0.055, 0.055]) {
      mk(this.headGrp, new THREE.BoxGeometry(0.026, 0.016, 0.012), matDark, ex, 0.012, 0.152, false)
    }
    // 通讯耳机
    for (const ex of [-0.16, 0.16]) {
      const cup = mk(this.headGrp, new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8), matDark, ex, -0.01, 0, false)
      cup.rotation.z = Math.PI / 2
    }
    const band = mk(this.headGrp, new THREE.CylinderGeometry(0.17, 0.17, 0.03, 10, 1, false, -0.5, Math.PI + 1), matDark, 0, 0.02, 0, false)
    band.rotation.x = Math.PI / 2
    band.rotation.z = Math.PI / 2
    // 作训帽 + 帽檐
    const cap = mk(this.headGrp, new THREE.SphereGeometry(0.175, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), matBody, 0, 0.022, 0)
    cap.receiveShadow = true
    const brim = mk(this.headGrp, new THREE.CylinderGeometry(0.168, 0.188, 0.024, 10, 1, false, -0.6, 1.2), matBody, 0, 0.045, 0.1)
    brim.castShadow = false
    this.upper.add(this.headGrp)

    // ---- 手臂（肩 → 上臂 → 肘 → 前臂 + 战术手套）----
    const upperArmGeo = new THREE.CapsuleGeometry(0.07, 0.24, 3, 8)
    const foreArmGeo = new THREE.CapsuleGeometry(0.058, 0.22, 3, 8)
    const gloveGeo = new THREE.SphereGeometry(0.062, 8, 6)
    for (const [shoulder, elbow, sx] of [[this.armL, this.elbowL, -0.305], [this.armR, this.elbowR, 0.305]] as [THREE.Group, THREE.Group, number][]) {
      shoulder.position.set(sx, 1.51, 0.01)
      mk(shoulder, upperArmGeo, matBody, 0, -0.155, 0)
      elbow.position.set(0, -0.32, 0)
      mk(elbow, foreArmGeo, matBody, 0, -0.135, 0)
      mk(elbow, gloveGeo, matDark, 0, -0.285, 0)
      shoulder.add(elbow)
      this.upper.add(shoulder)
    }

    // ---- 枪 ----
    this.gunGroup.position.set(0.17, 1.39, 0.31)
    this.upper.add(this.gunGroup)
    this.model.add(this.upper)
    this.setWeaponVisual()
    this.prevYaw = this.yaw
    scene.add(this.model)
  }

  /** 重建手中武器模型 */
  setWeaponVisual() {
    while (this.gunGroup.children.length) this.gunGroup.remove(this.gunGroup.children[0])
    const def = this.weapon ? this.weapon.def : this.meleeDef
    const grp = buildGunMesh(def, this.weapon?.attach.scope)
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
      const colors = [0, 0x7a8a99, 0x46698c, 0x2c3d52]
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.44, 0.36),
        new THREE.MeshLambertMaterial({ color: colors[this.armor.level], map: getFabricTex() }),
      )
      m.position.y = 1.27
      m.castShadow = true
      this.vestMesh = m
      this.upper.add(m)
    }
  }

  setHelmetVisual() {
    if (this.helmetMesh) { this.headGrp.remove(this.helmetMesh); this.helmetMesh = null }
    if (this.helmet) {
      const colors = [0, 0xb0a890, 0x5d7a4a, 0x32404c]
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: colors[this.helmet.level] }),
      )
      m.position.y = 0.012
      m.castShadow = true
      this.helmetMesh = m
      this.headGrp.add(m)
    }
  }

  setBagVisual(level: number) {
    if (this.bagMesh) { this.upper.remove(this.bagMesh); this.bagMesh = null }
    if (level > 0) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.36 + level * 0.1, 0.2 + level * 0.04),
        new THREE.MeshLambertMaterial({ color: 0x6e5a3c, map: getFabricTex() }),
      )
      m.position.set(0, 1.26, -0.28)
      m.castShadow = true
      this.bagMesh = m
      this.upper.add(m)
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
    this.punchT = this.animT + 0.28
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

  /**
   * 姿态动画：所有关节角向目标值阻尼过渡（消除"僵尸感"），
   * 覆盖 站立呼吸 / 行走 / 奔跑 / 蹲伏 / 跳跃 / 跳伞 / 驾驶坐姿 / 出拳。
   */
  protected animate(dt: number) {
    this.animT += dt
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const moveK = clamp(hSpeed / 4.2, 0, 1)
    const runK = clamp((hSpeed - 4.4) / 2.4, 0, 1)
    this.walkPhase += hSpeed * dt * 1.6
    const armed = this.handsBusy
    const aiming = armed && this.poseAiming && this.weapon !== null
    const freefall = this.dropping && (!this.chuteObj || !this.chuteObj.visible)
    const hanging = this.dropping && !freefall
    const idle = hSpeed < 0.4 && this.onGround && !this.dropping && !this.seated

    const sw = Math.sin(this.walkPhase)
    const breath = Math.sin(this.animT * 1.8)

    // ---- 目标关节角 ----
    let tThL = 0, tThR = 0, tKnL = 0.06, tKnR = 0.06
    let tArmLx = 0, tArmLz = -0.06, tElbL = 0.16
    let tArmRx = 0, tArmRz = 0.06, tElbR = 0.16
    let tUpperY = 0, tBob = 0, tGunRx = 0

    if (this.seated) {
      // 驾驶坐姿：大腿前伸、小腿下垂、双手向前握方向盘
      tThL = tThR = -1.42
      tKnL = tKnR = 1.3
      tArmLx = tArmRx = -0.92
      tArmLz = 0.24; tArmRz = -0.24
      tElbL = tElbR = 0.62
    } else if (hanging) {
      // 伞降悬挂：腿微前摆，双手抓握伞绳
      tThL = -0.34; tThR = -0.22
      tKnL = 0.6; tKnR = 0.48
      tArmLx = tArmRx = -2.5
      tArmLz = -0.32; tArmRz = 0.32
      tElbL = tElbR = 0.42
    } else if (freefall) {
      // 自由落体：四肢展开
      tThL = 0.3; tThR = 0.45
      tKnL = 0.85; tKnR = 0.7
      tArmLx = tArmRx = -0.35
      tArmLz = -1.2; tArmRz = 1.2
      tElbL = tElbR = 0.45
    } else if (!this.onGround) {
      // 跳跃滞空：前后分腿
      tThL = -0.55; tThR = 0.28
      tKnL = 0.95; tKnR = 0.5
    } else if (this.crouching) {
      const cs = sw * 0.38 * moveK
      tThL = -0.92 + cs
      tThR = -0.68 - cs
      tKnL = 1.18; tKnR = 1.02
      tUpperY = -0.42
      tBob = Math.abs(Math.cos(this.walkPhase)) * 0.02 * moveK
    } else {
      // 行走/奔跑：大腿摆动 + 回摆腿屈膝 + 身体起伏
      const amp = 0.12 + moveK * 0.5 + runK * 0.2
      tThL = sw * amp
      tThR = -sw * amp
      const kneeAmp = (0.45 + runK * 0.7) * moveK
      tKnL = Math.max(0, -sw) * kneeAmp + 0.06
      tKnR = Math.max(0, sw) * kneeAmp + 0.06
      tBob = Math.abs(Math.cos(this.walkPhase)) * (0.028 + 0.05 * runK) * moveK
    }

    // ---- 手臂 ----
    if (!this.seated && !this.dropping) {
      if (aiming) {
        // 据枪瞄准：右手扣扳机、左手托护木
        tArmRx = -1.18; tArmRz = -0.06; tElbR = 0.5
        tArmLx = -1.0; tArmLz = 0.44; tElbL = 0.95
        tGunRx = 0
      } else if (armed) {
        if (this.sprinting) {
          // 持枪冲刺：枪口下压、随步伐小幅泵动
          tArmRx = -0.6 + sw * 0.14; tElbR = 0.92
          tArmLx = -0.48 - sw * 0.14; tArmLz = 0.32; tElbL = 1.0
          tGunRx = 0.6
        } else {
          // 低持枪戒备
          tArmRx = -0.8 + sw * 0.05 * moveK; tElbR = 0.55
          tArmLx = -0.62 - sw * 0.05 * moveK; tArmLz = 0.36; tElbL = 0.85
          tGunRx = 0.36
        }
      } else {
        // 徒手：自然摆臂 + 屈肘
        const armAmp = 0.14 + 0.4 * moveK + 0.22 * runK
        tArmLx = -sw * armAmp
        tArmRx = sw * armAmp
        tElbL = 0.18 + Math.max(0, sw) * 0.55 * moveK
        tElbR = 0.18 + Math.max(0, -sw) * 0.55 * moveK
        if (idle) {
          tArmLx += breath * 0.025
          tArmRx += breath * 0.025
        }
      }
      // 出拳/近战挥击覆盖右臂
      if (this.animT < this.punchT) {
        const k = 1 - (this.punchT - this.animT) / 0.28
        const ext = Math.sin(clamp(k, 0, 1) * Math.PI)
        tArmRx = -0.25 - 1.25 * ext
        tArmRz = -0.1
        tElbR = 0.15 + (1 - ext) * 0.9
        tGunRx = -0.3 * ext
      }
    }

    // ---- 应用关节（阻尼过渡） ----
    const J = (o: THREE.Object3D, ax: 'x' | 'y' | 'z', v: number, sp = 14) => {
      o.rotation[ax] = damp(o.rotation[ax], v, sp, dt)
    }
    J(this.legL, 'x', tThL); J(this.legR, 'x', tThR)
    J(this.kneeL, 'x', tKnL); J(this.kneeR, 'x', tKnR)
    J(this.armL, 'x', tArmLx); J(this.armL, 'z', tArmLz); J(this.elbowL, 'x', tElbL)
    J(this.armR, 'x', tArmRx); J(this.armR, 'z', tArmRz); J(this.elbowR, 'x', tElbR)
    J(this.gunGroup, 'x', tGunRx, 11)

    // ---- 躯干 / 头部 ----
    this.upper.position.y = damp(this.upper.position.y, tUpperY, 12, dt)
    const leanF = this.seated ? 0.1 : runK * 0.16 + moveK * 0.04
    const pitchLean = this.seated || this.dropping ? 0 : -this.pitch * 0.5
    this.upper.rotation.x = damp(this.upper.rotation.x, pitchLean + leanF, 15, dt)
    this.upper.rotation.z = damp(this.upper.rotation.z, sw * 0.04 * moveK, 9, dt)
    const headPitch = this.seated || this.dropping ? 0 : -this.pitch * 0.24
    this.headGrp.rotation.x = damp(this.headGrp.rotation.x, headPitch, 15, dt)

    // ---- 转向侧倾（重心感） ----
    const yawNow = this.lockYaw ?? this.yaw
    let dY = yawNow - this.prevYaw
    while (dY > Math.PI) dY -= Math.PI * 2
    while (dY < -Math.PI) dY += Math.PI * 2
    this.prevYaw = yawNow
    const leanT = clamp((dY / Math.max(dt, 1e-4)) * 0.022, -0.09, 0.09) * Math.max(moveK, this.dropping ? 0.5 : 0)
    this.leanZ = damp(this.leanZ, leanT, 6, dt)

    // ---- 整体变换 ----
    this.modelTilt = damp(this.modelTilt, freefall ? 0.95 : 0, 5, dt)
    this.model.rotation.y = yawNow
    this.model.rotation.x = this.modelTilt
    this.model.rotation.z = this.leanZ
    this.bobV = damp(this.bobV, tBob, 16, dt)
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

  /** 死亡姿态：仰倒 + 四肢摊开 */
  lieDown() {
    this.alive = false
    this.detachChute()
    this.model.rotation.x = -Math.PI / 2
    this.model.rotation.z = 0
    this.model.position.y = this.pos.y + 0.22
    this.upper.rotation.set(0, 0, 0)
    this.upper.position.y = 0
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
