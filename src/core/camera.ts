import * as THREE from 'three'
import { clamp, damp } from '../utils/math'
import type { Ctx } from './ctx'

const _f = new THREE.Vector3()
const _right = new THREE.Vector3()
const _pivot = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _dir = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** 第三人称越肩相机：碰撞收缩 + ADS 变焦 + 抖动 */
export class TPCamera {
  private boom = 4.0
  private curFov = 70

  update(dt: number, ctx: Ctx) {
    const p = ctx.player
    const cam = ctx.camera

    let targetFov = 70
    let targetBoom = 4.0
    if (p.dropping) {
      targetBoom = 6.5
      targetFov = 78
    } else if (p.ads && p.currentWeapon()) {
      targetFov = p.currentWeapon()!.adsFov
      targetBoom = 1.7
    } else if (p.sprinting) {
      targetFov = 75
    }
    this.curFov = damp(this.curFov, targetFov, 10, dt)
    this.boom = damp(this.boom, targetBoom, 11, dt)
    cam.fov = this.curFov
    cam.updateProjectionMatrix()

    const cp = Math.cos(p.pitch)
    _f.set(Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp)
    _right.crossVectors(_f, UP).normalize()

    _pivot.set(p.pos.x, p.pos.y + p.eyeH + 0.18, p.pos.z)
    _desired.copy(_pivot).addScaledVector(_f, -this.boom).addScaledVector(_right, -0.55)

    // 相机碰撞
    _dir.copy(_desired).sub(_pivot)
    const dist = _dir.length()
    if (dist > 0.01) {
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
