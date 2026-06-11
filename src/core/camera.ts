import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import type { Ctx } from './ctx'

const _f = new THREE.Vector3()
const _right = new THREE.Vector3()
const _pivot = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _dir = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** 越肩第三人称 / 第一人称双模相机：碰撞收缩 + ADS 变焦 + 抖动 */
export class TPCamera {
  firstPerson = false
  private boom = 4.0
  private side = -0.55
  private curFov = 70

  update(dt: number, ctx: Ctx) {
    const p = ctx.player
    const cam = ctx.camera

    const fpp = this.firstPerson && p.alive && !p.dropping && ctx.state === 'play'
    let targetFov = 70
    let targetBoom = fpp ? 0 : 4.0
    let targetSide = fpp ? 0 : -0.55
    if (p.dropping) {
      targetBoom = 6.5
      targetFov = 78
    } else if (p.ads && p.currentWeapon()) {
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

    // 第一人称：拉近后隐藏自身模型（机上也隐藏；死亡尸体始终可见）
    p.model.visible = p.alive ? !p.inPlane && this.boom > 0.55 : true

    const cp = Math.cos(p.pitch)
    _f.set(Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp)
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
  }

  get fovScale(): number {
    return clamp(this.curFov / 70, 0.1, 1.2)
  }
}
