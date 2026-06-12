import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp } from '../utils/math'
import { cyl, sph, lathe } from '../rendering/smoothGeo'
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

  /** 翼型剖面挤出（前缘圆弧 + 尖后缘），返回沿 z 挤出居中的几何；steps 给翼展方向分段供锥度变形 */
  private airfoilGeo(chord: number, thick: number, span: number, steps = 16): THREE.BufferGeometry {
    const s = new THREE.Shape()
    const c2 = chord / 2, t2 = thick / 2
    // 前缘在 +x：上弧线从后缘到前缘再回后缘
    s.moveTo(-c2, 0)
    s.quadraticCurveTo(-c2 * 0.2, t2 * 1.15, c2 * 0.35, t2)
    s.quadraticCurveTo(c2 * 0.92, t2 * 0.75, c2, 0)
    s.quadraticCurveTo(c2 * 0.92, -t2 * 0.6, c2 * 0.35, -t2 * 0.8)
    s.quadraticCurveTo(-c2 * 0.2, -t2 * 0.9, -c2, 0)
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(s, {
      depth: span, bevelEnabled: false, curveSegments: 10, steps,
    })
    g.translate(0, 0, -span / 2)
    g = mergeVertices(g, 1e-4)
    g.computeVertexNormals()
    return g
  }

  private buildMesh() {
    // 军绿涂装：机身亮一档、翼面暗一档（Standard 材质有高光层次）
    const body = new THREE.MeshStandardMaterial({ color: 0x7d8a73, roughness: 0.5, metalness: 0.35, emissive: 0x1a1f17 })
    const wing = new THREE.MeshStandardMaterial({ color: 0x646f5e, roughness: 0.55, metalness: 0.3, emissive: 0x141812 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b3030, roughness: 0.6, metalness: 0.2, emissive: 0x0d0f0f })
    const glassM = new THREE.MeshStandardMaterial({ color: 0x39505e, roughness: 0.15, metalness: 0.3, emissive: 0x16242c })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.rotation.set(rx, ry, rz)
      this.mesh.add(m)
      return m
    }

    // ---- 一体车削机身（+z 为机头）：尾锥 → 主筒 → 机头雷达罩，无接缝 ----
    const fuselage = lathe([
      [0.06, -10.2], [0.34, -9.4], [0.78, -8.2], [1.25, -6.6], [1.58, -5.0],
      [1.7, -3.6], [1.7, 3.4], [1.66, 4.4], [1.5, 5.3], [1.22, 6.1],
      [0.85, 6.75], [0.42, 7.15], [0.06, 7.32],
    ], 28, 'plane-fuselage').clone()
    {
      // 尾部上掠（C-130 货舱坡道特征）：尾段顶点整体上弯 + 横向略收
      // rotateX(π/2) 映射：(x,y,z)→(x,-z,y)，即车削轴 +y→+z（机头），径向 -z→+y（上）
      const pos = fuselage.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) // 车削轴（旋转前 = 机身纵轴）
        if (y < -4.2) {
          const k = (-y - 4.2) / 6.0
          pos.setZ(i, pos.getZ(i) - k * k * 1.55)
          pos.setX(i, pos.getX(i) * (1 - k * 0.18))
        }
      }
      fuselage.computeVertexNormals()
      fuselage.rotateX(Math.PI / 2)
    }
    const fuselageMesh = new THREE.Mesh(fuselage, body)
    fuselageMesh.position.set(0, 0, -1.2)
    this.mesh.add(fuselageMesh)

    // 机腹货舱鼓包（下垂腹部，横放半胶囊）
    const bellyPod = add(new THREE.CapsuleGeometry(1.18, 7.6, 6, 16), body, 0, -0.78, -0.6, Math.PI / 2)
    bellyPod.scale.set(1, 1, 0.62)
    // 雷达罩（机头黑鼻，仅尖端一小块）
    add(sph(0.5, 18, 13), dark, 0, -0.18, 6.15).scale.set(1, 0.88, 1.15)
    // 驾驶舱风挡（高细分环带）
    add(new THREE.CylinderGeometry(1.42, 1.6, 1.0, 20, 1, false, -0.85, 1.7), glassM, 0, 0.66, 4.4, Math.PI / 2 - 0.32)
    // 尾舱跳伞门（开口暗面，圆角）
    const door = add(new THREE.CapsuleGeometry(0.85, 0.9, 4, 10), dark, 0, -0.62, -5.6, 0.42)
    door.scale.set(1.1, 1, 0.18)

    // ---- 上单翼：翼型剖面 + 翼尖收窄 + 1.5° 上反 ----
    const wingY = 1.45
    const wingGeo = this.airfoilGeo(3.1, 0.42, 19.5)
    {
      // 翼展方向（挤出 z）→ 旋转后世界 x；先做锥度与上反角顶点变形
      const pos = wingGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const zSpan = pos.getZ(i)
        const a = Math.abs(zSpan) / 9.75
        const taper = a > 0.45 ? 1 - (a - 0.45) * 0.65 : 1
        pos.setX(i, pos.getX(i) * taper)
        pos.setY(i, pos.getY(i) * taper + Math.abs(zSpan) * 0.028)
      }
      wingGeo.computeVertexNormals()
      wingGeo.rotateY(-Math.PI / 2) // 挤出 z→翼展 x，前缘 +x→机头 +z
    }
    const wingMesh = new THREE.Mesh(wingGeo, wing)
    wingMesh.position.set(0, wingY, 1.0)
    this.mesh.add(wingMesh)
    // 翼根整流罩（机背鼓包）
    const fairing = add(sph(1.6, 18, 12), wing, 0, wingY - 0.35, 1.0)
    fairing.scale.set(1.05, 0.42, 1.5)

    // ---- 四发涡桨引擎短舱（车削圆头舱）+ 旋转桨盘 ----
    const nacelleGeo = lathe([
      [0.06, -1.3], [0.3, -1.15], [0.46, -0.7], [0.52, 0.0],
      [0.5, 0.7], [0.4, 1.1], [0.18, 1.28], [0.05, 1.32],
    ], 18, 'plane-nacelle')
    for (const ex of [-6.4, -3.4, 3.4, 6.4]) {
      const nac = new THREE.Mesh(nacelleGeo, wing)
      nac.rotation.x = Math.PI / 2
      nac.position.set(ex, wingY - 0.34, 1.85)
      this.mesh.add(nac)
      const prop = new THREE.Group()
      // 桨毂（圆锥头）+ 4 叶（扁圆角叶带扭转）
      const hub = new THREE.Mesh(cyl(0.08, 0.18, 0.34, 12), dark)
      hub.rotation.x = Math.PI / 2
      prop.add(hub)
      const bladeGeo = new THREE.CapsuleGeometry(0.13, 1.3, 6, 10)
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(bladeGeo, dark)
        blade.scale.set(1, 1, 0.2)
        blade.rotation.z = (b / 4) * Math.PI * 2
        blade.rotation.y = 0.42 // 桨距扭转
        blade.translateY(0.8)
        prop.add(blade)
      }
      prop.position.set(ex, wingY - 0.34, 3.2)
      this.mesh.add(prop)
      this.props.push(prop)
      this.engineLocal.push(new THREE.Vector3(ex, wingY - 0.34, 1.0))
    }

    // ---- 尾翼（翼型剖面：平尾 + 大垂尾）----
    const hTailGeo = this.airfoilGeo(2.0, 0.22, 7.6)
    hTailGeo.rotateY(-Math.PI / 2)
    const hTail = new THREE.Mesh(hTailGeo, wing)
    hTail.position.set(0, 1.5, -8.6)
    this.mesh.add(hTail)
    const vTailGeo = this.airfoilGeo(2.6, 0.24, 3.8)
    {
      // 垂尾后掠：顶端向后偏移
      const pos = vTailGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const zUp = pos.getZ(i) + 1.9 // 0..3.8
        pos.setX(i, pos.getX(i) * (1 - zUp * 0.1) - zUp * 0.34)
      }
      vTailGeo.computeVertexNormals()
      // 前缘 +x→机头 +z，挤出 z→垂直 y
      vTailGeo.rotateX(-Math.PI / 2)
      vTailGeo.rotateY(-Math.PI / 2)
    }
    const vTail = new THREE.Mesh(vTailGeo, wing)
    vTail.position.set(0, 2.0, -8.3)
    this.mesh.add(vTail)

    // ---- 起落架鼓包（机身两侧，平滑胶囊）----
    for (const sx of [-1, 1]) {
      const pod = add(new THREE.CapsuleGeometry(0.52, 2.6, 6, 12), body, sx * 1.6, -0.95, 0.8, Math.PI / 2)
      pod.scale.set(0.7, 1, 1)
    }

    // ---- 航行灯：左红右绿 + 尾部白色防撞灯（闪烁） ----
    const navL = new THREE.Mesh(sph(0.15, 12, 9), new THREE.MeshBasicMaterial({ color: 0xff3326 }))
    navL.position.set(-9.6, 1.72, 1.0)
    const navR = new THREE.Mesh(sph(0.15, 12, 9), new THREE.MeshBasicMaterial({ color: 0x2dff5e }))
    navR.position.set(9.6, 1.72, 1.0)
    this.beacon = new THREE.Mesh(sph(0.17, 12, 9), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    this.beacon.position.set(0, 5.0, -9.3)
    this.mesh.add(navL, navR, this.beacon)

    // ---- 机身天线 ----
    add(cyl(0.018, 0.018, 0.9, 8), dark, 0, 1.95, 3.4)

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
