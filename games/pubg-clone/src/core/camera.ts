import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import type { Ctx } from './ctx'

const _f = new THREE.Vector3()
const _right = new THREE.Vector3()
const _pivot = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _dir = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** 越肩第三人称 / 第一人称双模相机：肩部惯性 + 碰撞收缩 + ADS 变焦/呼吸 + 冲击与抖动 */
export class TPCamera {
  firstPerson = false
  private boom = 4.0
  private side = -0.55
  private curFov = 70
  /** 肩部惯性：实际取景方向滞后于输入方向 */
  private lagYaw = 0
  private lagPitch = 0
  private lagInit = false
  private breathT = 0

  update(dt: number, ctx: Ctx) {
    const p = ctx.player
    const cam = ctx.camera

    const fpp = this.firstPerson && p.alive && !p.dropping && !p.vehicle && ctx.state === 'play'
    const ads = p.ads && p.currentWeapon() !== null
    let targetFov = 70
    let targetBoom = fpp ? 0 : 4.0
    let targetSide = fpp ? 0 : -0.55
    if (p.vehicle) {
      targetBoom = 6.8
      targetSide = 0
      targetFov = 76
    } else if (p.dropping) {
      targetBoom = 6.5
      targetFov = 78
    } else if (ads) {
      targetFov = p.currentWeapon()!.adsFov
      if (!fpp) targetBoom = 1.7
    } else if (p.sprinting) {
      targetFov = 75
    }
    this.curFov = damp(this.curFov, targetFov, 10, dt)
    this.boom = damp(this.boom, targetBoom, fpp ? 18 : 11, dt)
    this.side = damp(this.side, targetSide, 14, dt)
    cam.fov = this.curFov
    cam.updateProjectionMatrix()

    // 第一人称：拉近后隐藏自身模型（机上隐藏；驾车时展示坐姿；死亡尸体始终可见）
    p.model.visible = p.alive ? !p.inPlane && this.boom > 0.55 : true

    // 肩部惯性：第三人称转向时镜头轻微滞后；ADS / 第一人称几乎即时
    if (!this.lagInit) {
      this.lagYaw = p.yaw
      this.lagPitch = p.pitch
      this.lagInit = true
    }
    const lagSpeed = fpp || ads ? 60 : 17
    this.lagYaw = damp(this.lagYaw, p.yaw, lagSpeed, dt)
    this.lagPitch = damp(this.lagPitch, p.pitch, lagSpeed + 4, dt)

    // ADS 呼吸漂移（双频叠加的轻微指向浮动）
    this.breathT += dt
    let bYaw = 0, bPitch = 0
    if (ads && ctx.state === 'play') {
      bPitch = Math.sin(this.breathT * 1.9) * 0.0016 + Math.sin(this.breathT * 3.1 + 1.2) * 0.0007
      bYaw = Math.sin(this.breathT * 1.4 + 0.6) * 0.0012
    }

    // 命名冲击（开火/受击/爆炸/撞车/落地/近弹）
    const imp = ctx.fx.impulse.update(dt)

    const vYaw = this.lagYaw + bYaw + imp.yaw
    const vPitch = clamp(this.lagPitch + bPitch + imp.pitch, -1.45, 1.45)
    const cp = Math.cos(vPitch)
    _f.set(Math.sin(vYaw) * cp, Math.sin(vPitch), Math.cos(vYaw) * cp)
    _right.crossVectors(_f, UP).normalize()

    const pivotH = this.boom < 0.55 ? p.eyeH : p.eyeH + 0.18
    _pivot.set(p.pos.x, p.pos.y + pivotH, p.pos.z)
    _desired.copy(_pivot).addScaledVector(_f, -this.boom).addScaledVector(_right, this.side)

    // 相机碰撞
    _dir.copy(_desired).sub(_pivot)
    const dist = _dir.length()
    if (dist > 0.05) {
      _dir.divideScalar(dist)
      const hit = ctx.world.col.raycast(_pivot.x, _pivot.y, _pivot.z, _dir.x, _dir.y, _dir.z, dist)
      if (hit) _desired.copy(_pivot).addScaledVector(_dir, Math.max(0.3, hit.t - 0.2))
      // 地形高度限制
      const g = ctx.world.groundHeight(_desired.x, _desired.z)
      if (_desired.y < g + 0.3) _desired.y = g + 0.3
    }

    // 抖动
    const s = ctx.fx.shake
    if (s > 0.001) {
      _desired.x += (Math.random() - 0.5) * s * 0.22
      _desired.y += (Math.random() - 0.5) * s * 0.22
      _desired.z += (Math.random() - 0.5) * s * 0.22
    }

    cam.position.copy(_desired)
    cam.lookAt(_pivot.x + _f.x * 30, _pivot.y + _f.y * 30, _pivot.z + _f.z * 30)
    // 冲击侧倾（lookAt 后绕视轴滚转）
    if (Math.abs(imp.roll) > 0.0004) cam.rotateZ(imp.roll)
  }

  get fovScale(): number {
    return clamp(this.curFov / 70, 0.1, 1.2)
  }
}
