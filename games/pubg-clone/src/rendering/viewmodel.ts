import * as THREE from 'three'
import { buildGunMesh } from '../entities/weaponModel'
import { damp } from '../utils/math'
import type { Ctx } from '../core/ctx'

/**
 * 第一人称武器视图模型：挂在相机下，腰射位 / ADS 居中位插值，
 * 移动呼吸晃动 + 转向摆动 + 开火后坐。
 */
export class Viewmodel {
  private root = new THREE.Group()
  private gun: THREE.Group | null = null
  private curKey = ''
  private bobT = 0
  private swayYaw = 0
  private swayPitch = 0
  private kick = 0
  private prevShot = -99
  private adsK = 0

  attach(camera: THREE.Camera) {
    camera.add(this.root)
    this.root.visible = false
  }

  update(dt: number, ctx: Ctx, fpp: boolean) {
    const p = ctx.player
    const w = p.currentWeapon()
    const show = fpp && p.alive && !p.dropping && !p.vehicle && ctx.state === 'play' && !!w && w.def.cls !== 'MELEE'
    this.root.visible = show
    if (!show) { this.curKey = ''; return }

    // 换枪 / 换配件时重建
    const key = w!.def.id + '|' + JSON.stringify(w!.attach)
    if (key !== this.curKey) {
      this.curKey = key
      if (this.gun) this.root.remove(this.gun)
      const { group } = buildGunMesh(w!.def, w!.attach)
      group.traverse((o) => { o.castShadow = false; o.receiveShadow = false })
      // 枪口朝 -z（相机前方）
      group.rotation.y = Math.PI
      this.gun = group
      this.root.add(group)
    }

    // 开火检测（lastShot 时间戳变化）→ 后坐脉冲
    if (w!.lastShot !== this.prevShot && ctx.time - w!.lastShot < 0.12) {
      this.kick = Math.min(1.6, this.kick + 0.55 + w!.def.recoil * 18)
    }
    this.prevShot = w!.lastShot
    this.kick = damp(this.kick, 0, 11, dt)

    // ADS 插值
    this.adsK = damp(this.adsK, p.ads ? 1 : 0, 14, dt)

    // 移动呼吸：速度越快摆动越大
    const speed = Math.hypot(p.vel.x, p.vel.z)
    this.bobT += dt * (3.6 + speed * 1.15)
    const bobAmp = (0.0045 + speed * 0.0016) * (1 - this.adsK * 0.82)
    const bobX = Math.sin(this.bobT) * bobAmp
    const bobY = Math.abs(Math.cos(this.bobT)) * bobAmp * 1.25

    // 转向摆动：鼠标增量平滑反馈
    const sens = 0.00055 * (1 - this.adsK * 0.7)
    this.swayYaw = damp(this.swayYaw, -ctx.input.mouseDX * sens, 9, dt)
    this.swayPitch = damp(this.swayPitch, -ctx.input.mouseDY * sens, 9, dt)

    // 腰射位 → ADS 位
    const hipX = 0.265, hipY = -0.255, hipZ = -0.5
    const adsX = 0, adsY = -0.166, adsZ = -0.44
    const k = this.adsK
    this.root.position.set(
      hipX + (adsX - hipX) * k + bobX + this.swayYaw * 0.6,
      hipY + (adsY - hipY) * k + bobY + this.swayPitch * 0.5,
      hipZ + (adsZ - hipZ) * k + this.kick * 0.085,
    )
    this.root.rotation.set(
      this.swayPitch * 2.2 - this.kick * 0.05,
      this.swayYaw * 2.2,
      this.swayYaw * 1.1,
    )
  }
}
