import * as THREE from 'three'
import { clamp } from '../utils/math'

/** 开局运输机：沿直线航线穿越地图，玩家与 AI 从机上跳伞 */
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
    const body = new THREE.MeshLambertMaterial({ color: 0x76836e, flatShading: true, emissive: 0x1c211a })
    const dark = new THREE.MeshLambertMaterial({ color: 0x57625a, flatShading: true, emissive: 0x141815 })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.rotation.x = rx
      m.rotation.z = rz
      this.mesh.add(m)
      return m
    }
    // 机身（沿 +z 为机头方向）
    add(new THREE.CylinderGeometry(1.5, 1.5, 11, 10), body, 0, 0, 0, Math.PI / 2)
    add(new THREE.ConeGeometry(1.5, 3.2, 10), body, 0, 0, 7.1, Math.PI / 2)
    // 尾部上翘
    add(new THREE.CylinderGeometry(1.5, 0.7, 4.5, 10), body, 0, 0.35, -7.5, Math.PI / 2 + 0.16)
    // 主翼
    add(new THREE.BoxGeometry(16, 0.22, 2.6), dark, 0, 1.1, 1.2)
    // 翼上引擎短舱
    add(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8), dark, -4.2, 0.7, 1.7, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8), dark, 4.2, 0.7, 1.7, Math.PI / 2)
    // 平尾 + 垂尾
    add(new THREE.BoxGeometry(6, 0.18, 1.6), dark, 0, 1.3, -8.6)
    add(new THREE.BoxGeometry(0.18, 2.6, 2.2), dark, 0, 2.2, -8.8)
    this.mesh.traverse((o) => { o.castShadow = false })
  }

  private place() {
    this.mesh.position.set(this.x, this.alt, this.z)
    this.mesh.rotation.y = Math.atan2(this.dirX, this.dirZ)
  }

  update(dt: number, scene: THREE.Scene) {
    if (this.done) return
    this.s += this.speed * dt
    if (this.s >= this.len) {
      this.done = true
      scene.remove(this.mesh)
      return
    }
    this.place()
  }
}
