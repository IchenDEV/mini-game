import * as THREE from 'three'
import { clamp } from '../utils/math'
import type { Effects } from '../fx/effects'

/** 开局运输机：四发涡桨军用运输机，沿直线航线穿越地图，玩家与 AI 从尾舱门跳伞 */
export class PlaneRide {
  mesh = new THREE.Group()
  sx = 0
  sz = 0
  dirX = 0
  dirZ = 1
  len = 1100
  s = 0
  speed = 55
  alt = 150
  done = false

  private props: THREE.Group[] = []
  private beacon: THREE.Mesh | null = null
  private navTime = 0
  private trailT = 0
  /** 引擎尾迹本地挂点（世界坐标由姿态换算） */
  private engineLocal: THREE.Vector3[] = []

  constructor(scene: THREE.Scene, angle: number, offX: number, offZ: number, mapHalf = 400, alt = 150, speed = 55) {
    this.dirX = Math.cos(angle)
    this.dirZ = Math.sin(angle)
    this.len = mapHalf * 2.4
    this.alt = alt
    this.speed = speed
    this.sx = offX - this.dirX * this.len * 0.5
    this.sz = offZ - this.dirZ * this.len * 0.5
    this.buildMesh()
    scene.add(this.mesh)
    this.place()
  }

  get x(): number { return this.sx + this.dirX * this.s }
  get z(): number { return this.sz + this.dirZ * this.s }
  get y(): number { return this.alt }
  get ex(): number { return this.sx + this.dirX * this.len }
  get ez(): number { return this.sz + this.dirZ * this.len }

  /** 航线上离给定点最近处的里程 */
  sAtNearest(px: number, pz: number): number {
    return clamp((px - this.sx) * this.dirX + (pz - this.sz) * this.dirZ, 0, this.len)
  }

  private buildMesh() {
    // 军绿涂装：机身亮一档、翼面暗一档、机腹灰
    const body = new THREE.MeshLambertMaterial({ color: 0x7d8a73, emissive: 0x20251c })
    const wing = new THREE.MeshLambertMaterial({ color: 0x646f5e, emissive: 0x191e17 })
    const belly = new THREE.MeshLambertMaterial({ color: 0x99a096, emissive: 0x262924 })
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3030, emissive: 0x0d0f0f })
    const glass = new THREE.MeshLambertMaterial({ color: 0x39505e, emissive: 0x16242c })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.rotation.set(rx, ry, rz)
      this.mesh.add(m)
      return m
    }

    // ---- 机身（+z 为机头）----
    add(new THREE.CylinderGeometry(1.7, 1.7, 10.5, 14), body, 0, 0, 0.6, Math.PI / 2)
    // 机腹货舱鼓包（C-130 特征的下垂腹部）
    add(new THREE.CylinderGeometry(1.25, 1.25, 9, 12), belly, 0, -0.75, 0.4, Math.PI / 2)
    // 机头：圆滑过渡 + 雷达罩
    add(new THREE.SphereGeometry(1.68, 14, 10), body, 0, 0, 5.9)
    add(new THREE.SphereGeometry(0.95, 10, 8), dark, 0, -0.35, 7.15)
    // 驾驶舱风挡（环带）
    add(new THREE.CylinderGeometry(1.45, 1.62, 1.05, 12, 1, false, -0.85, 1.7), glass, 0, 0.62, 5.55, Math.PI / 2 - 0.32)
    // 机尾收锥上翘（货舱坡道区）
    add(new THREE.CylinderGeometry(1.7, 0.62, 5.6, 12), body, 0, 0.45, -7.2, Math.PI / 2 + 0.17)
    // 尾舱跳伞门（开口暗面）
    add(new THREE.BoxGeometry(1.9, 1.5, 0.18), dark, 0, -0.45, -5.2, 0.42)

    // ---- 上单翼（带 1.5° 上反）----
    const wingY = 1.45
    add(new THREE.BoxGeometry(19.5, 0.3, 3.1), wing, 0, wingY, 1.0, 0, 0.026)
    // 翼根整流罩
    add(new THREE.BoxGeometry(3.4, 0.85, 4.2), wing, 0, wingY - 0.12, 1.0)
    // 翼尖小翼
    add(new THREE.BoxGeometry(0.16, 0.7, 1.5), wing, -9.65, wingY + 0.55, 0.9)
    add(new THREE.BoxGeometry(0.16, 0.7, 1.5), wing, 9.65, wingY + 0.55, 0.9)

    // ---- 四发涡桨引擎 + 旋转桨盘 ----
    for (const ex of [-6.4, -3.4, 3.4, 6.4]) {
      add(new THREE.CylinderGeometry(0.52, 0.46, 2.6, 10), wing, ex, wingY - 0.34, 1.7, Math.PI / 2)
      const prop = new THREE.Group()
      // 桨毂 + 4 叶
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), dark)
      prop.add(hub)
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.05), dark)
        blade.position.y = 0
        blade.rotation.z = (b / 4) * Math.PI * 2
        blade.translateY(0.8)
        prop.add(blade)
      }
      prop.position.set(ex, wingY - 0.34, 3.05)
      this.mesh.add(prop)
      this.props.push(prop)
      this.engineLocal.push(new THREE.Vector3(ex, wingY - 0.34, 1.0))
    }

    // ---- 尾翼 ----
    add(new THREE.BoxGeometry(7.6, 0.22, 2.0), wing, 0, 1.5, -9.0)
    // 高垂尾（C-130 大直尾）
    add(new THREE.BoxGeometry(0.22, 3.6, 2.6), wing, 0, 3.0, -9.2, -0.12)
    add(new THREE.BoxGeometry(0.26, 1.0, 1.1), body, 0, 4.7, -9.7, -0.12)

    // ---- 起落架鼓包（机身两侧）----
    add(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 8, 1, false, 0, Math.PI), belly, -1.72, -0.9, 0.8, Math.PI / 2, 0, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 8, 1, false, 0, Math.PI), belly, 1.72, -0.9, 0.8, Math.PI / 2, 0, -Math.PI / 2)

    // ---- 航行灯：左红右绿 + 尾部白色防撞灯（闪烁） ----
    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3326 }))
    navL.position.set(-9.7, 1.5, 1.0)
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2dff5e }))
    navR.position.set(9.7, 1.5, 1.0)
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    this.beacon.position.set(0, 5.3, -9.7)
    this.mesh.add(navL, navR, this.beacon)

    // ---- 机身天线 ----
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), dark, 0, 1.95, 3.4)

    this.mesh.traverse((o) => { o.castShadow = false })
  }

  private place() {
    this.mesh.position.set(this.x, this.alt, this.z)
    this.mesh.rotation.y = Math.atan2(this.dirX, this.dirZ)
  }

  update(dt: number, scene: THREE.Scene, fx?: Effects) {
    if (this.done) return
    this.s += this.speed * dt
    if (this.s >= this.len) {
      this.done = true
      scene.remove(this.mesh)
      return
    }
    this.place()
    // 螺旋桨高速旋转（相邻反转）
    for (let i = 0; i < this.props.length; i++) {
      this.props[i].rotation.z += dt * 38 * (i % 2 === 0 ? 1 : -1)
    }
    // 防撞灯闪烁：1.1s 周期短亮
    this.navTime += dt
    if (this.beacon) this.beacon.visible = (this.navTime % 1.1) < 0.12
    // 引擎凝结尾迹
    if (fx) {
      this.trailT -= dt
      if (this.trailT <= 0) {
        this.trailT = 0.07
        const v = new THREE.Vector3()
        for (const e of this.engineLocal) {
          v.copy(e)
          this.mesh.localToWorld(v)
          fx.contrail(v.x, v.y, v.z)
        }
      }
    }
  }
}
