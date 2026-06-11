import * as THREE from 'three'
import { clamp } from '../utils/math'
import { CameraImpulse, type ImpulseKind } from '../animation/cameraImpulse'

function radialTex(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

interface Tracer { mesh: THREE.Mesh; life: number }
interface Flash { sprite: THREE.Sprite; life: number; maxLife: number }
interface Smoke {
  sprites: THREE.Sprite[]
  mats: THREE.SpriteMaterial[]
  t: number
  dur: number
  x: number; y: number; z: number
}
interface Flare { x: number; y: number; z: number; r: number; g: number; b: number; until: number }
interface Puff { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; maxLife: number; vy: number; grow: number }
interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; maxLife: number; maxR: number }

const PARTICLE_MAX = 700

/** 战斗视觉特效：曳光、枪口火光、粒子、烟雾、爆炸、信号烟 */
export class Effects {
  private scene: THREE.Scene
  private tracers: Tracer[] = []
  private flashes: Flash[] = []
  private smokes: Smoke[] = []
  private flares: Flare[] = []
  private puffs: Puff[] = []
  private rings: Ring[] = []
  smokeBlockers: { x: number; y: number; z: number; r: number; until: number }[] = []
  shake = 0
  time = 0
  /** 命名相机冲击（camera.update 消费） */
  readonly impulse = new CameraImpulse()

  // 复用光源（构造时入场景，避免运行时材质重编译卡顿）
  private muzzleLight = new THREE.PointLight(0xffc070, 0, 11, 1.8)
  private boomLight = new THREE.PointLight(0xff9540, 0, 30, 1.6)
  private boomLightI = 0
  private muzzleLightI = 0

  private pGeo: THREE.BufferGeometry
  private pPos: Float32Array
  private pVel: Float32Array
  private pLife: Float32Array
  private pCol: Float32Array
  private pIdx = 0

  private smokeTex = radialTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)')
  private glowTex = radialTex('rgba(255,230,160,1)', 'rgba(255,160,40,0)')
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, depthWrite: false })
  private boxGeo = new THREE.BoxGeometry(1, 1, 1)

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.pPos = new Float32Array(PARTICLE_MAX * 3)
    this.pVel = new Float32Array(PARTICLE_MAX * 3)
    this.pLife = new Float32Array(PARTICLE_MAX)
    this.pCol = new Float32Array(PARTICLE_MAX * 3)
    this.pPos.fill(-9999)
    this.pGeo = new THREE.BufferGeometry()
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3))
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3))
    const pMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
    const points = new THREE.Points(this.pGeo, pMat)
    points.frustumCulled = false
    scene.add(points)
    scene.add(this.muzzleLight)
    scene.add(this.boomLight)
  }

  addShake(v: number) {
    this.shake = clamp(this.shake + v, 0, 1.6)
  }

  /** 命名相机冲击快捷入口 */
  kick(kind: ImpulseKind, scale = 1) {
    this.impulse.add(kind, scale)
  }

  private particle(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number) {
    const i = this.pIdx
    this.pIdx = (this.pIdx + 1) % PARTICLE_MAX
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz
    this.pLife[i] = life
    this.pCol[i * 3] = r; this.pCol[i * 3 + 1] = g; this.pCol[i * 3 + 2] = b
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const len = Math.hypot(bx - ax, by - ay, bz - az)
    if (len < 1.5) return
    const mesh = new THREE.Mesh(this.boxGeo, this.tracerMat)
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    mesh.lookAt(bx, by, bz)
    mesh.scale.set(0.035, 0.035, len)
    this.scene.add(mesh)
    this.tracers.push({ mesh, life: 0.06 })
  }

  muzzle(x: number, y: number, z: number) {
    const mat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffcf7d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const s = new THREE.Sprite(mat)
    s.position.set(x, y, z)
    const sc = 0.5 + Math.random() * 0.35
    s.scale.set(sc, sc, sc)
    this.scene.add(s)
    this.flashes.push({ sprite: s, life: 0.05, maxLife: 0.05 })
    // 短时枪口点光源（复用单灯，最后开火者优先）
    this.muzzleLight.position.set(x, y, z)
    this.muzzleLightI = 5.5
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, color = 0x9a8d72) {
    const c = new THREE.Color(color)
    for (let i = 0; i < 6; i++) {
      const vx = nx * 2.2 + (Math.random() - 0.5) * 2.4
      const vy = ny * 2.2 + Math.random() * 2.4
      const vz = nz * 2.2 + (Math.random() - 0.5) * 2.4
      this.particle(x, y, z, vx, vy, vz, 0.3 + Math.random() * 0.2, c.r, c.g, c.b)
    }
  }

  /** 抛弹壳：向射手右侧弹出 */
  shell(x: number, y: number, z: number, rx: number, rz: number) {
    this.particle(
      x, y - 0.06, z,
      rx * (1.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
      1.8 + Math.random() * 1.2,
      rz * (1.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
      0.55, 0.86, 0.64, 0.22,
    )
  }

  /** 落地/奔跑扬尘 */
  dust(x: number, y: number, z: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.8 + Math.random() * 1.8
      this.particle(
        x, y + 0.12, z,
        Math.cos(a) * sp, 0.6 + Math.random() * 1.4, Math.sin(a) * sp,
        0.4 + Math.random() * 0.35, 0.6, 0.54, 0.42,
      )
    }
  }

  blood(x: number, y: number, z: number) {
    for (let i = 0; i < 8; i++) {
      this.particle(
        x, y, z,
        (Math.random() - 0.5) * 2.6, Math.random() * 2.2, (Math.random() - 0.5) * 2.6,
        0.25 + Math.random() * 0.2, 0.62, 0.06, 0.06,
      )
    }
  }

  explosion(x: number, y: number, z: number) {
    // 火光核心
    const mat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffb054, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const s = new THREE.Sprite(mat)
    s.position.set(x, y + 0.6, z)
    s.scale.set(7, 7, 7)
    this.scene.add(s)
    this.flashes.push({ sprite: s, life: 0.22, maxLife: 0.22 })
    // 点光源脉冲
    this.boomLight.position.set(x, y + 1.4, z)
    this.boomLightI = 60
    // 碎片 + 暗烟粒子
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 3 + Math.random() * 8
      const up = Math.random() * 7
      const dark = Math.random() < 0.5
      this.particle(
        x, y + 0.4, z,
        Math.cos(a) * sp, up, Math.sin(a) * sp,
        0.5 + Math.random() * 0.5,
        dark ? 0.18 : 0.95, dark ? 0.16 : 0.6, dark ? 0.15 : 0.2,
      )
    }
    // 高速火星
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 9 + Math.random() * 10
      this.particle(
        x, y + 0.5, z,
        Math.cos(a) * sp, 2 + Math.random() * 9, Math.sin(a) * sp,
        0.22 + Math.random() * 0.2, 1.0, 0.78, 0.3,
      )
    }
    // 上升烟柱
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x4c453c, transparent: true, opacity: 0.7, depthWrite: false })
      const sp = new THREE.Sprite(m)
      sp.position.set(x + (Math.random() - 0.5) * 1.4, y + 0.8 + i * 0.7, z + (Math.random() - 0.5) * 1.4)
      sp.scale.set(1.6, 1.6, 1.6)
      this.scene.add(sp)
      this.puffs.push({ sprite: sp, mat: m, life: 1.7 + Math.random() * 0.7, maxLife: 2.4, vy: 1.6 + Math.random(), grow: 2.6 })
    }
    // 地面冲击波环
    const rg = new THREE.RingGeometry(0.8, 1.0, 26)
    const rm = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    const ring = new THREE.Mesh(rg, rm)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, y + 0.12, z)
    this.scene.add(ring)
    this.rings.push({ mesh: ring, mat: rm, life: 0.5, maxLife: 0.5, maxR: 10 })
  }

  smoke(x: number, y: number, z: number) {
    const sprites: THREE.Sprite[] = []
    const mats: THREE.SpriteMaterial[] = []
    for (let i = 0; i < 11; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xb8bcbe, transparent: true, opacity: 0, depthWrite: false })
      const s = new THREE.Sprite(mat)
      const a = (i / 11) * Math.PI * 2
      const r = i === 0 ? 0 : 2.2 + Math.random() * 1.6
      s.position.set(x + Math.cos(a) * r, y + 1.2 + Math.random() * 2.2, z + Math.sin(a) * r)
      s.scale.set(0.5, 0.5, 0.5)
      this.scene.add(s)
      sprites.push(s)
      mats.push(mat)
    }
    this.smokes.push({ sprites, mats, t: 0, dur: 16, x, y, z })
    this.smokeBlockers.push({ x, y: y + 1.5, z, r: 6.5, until: this.time + 16 })
  }

  /** 持续信号烟（空投） */
  flare(x: number, y: number, z: number, r: number, g: number, b: number, dur: number) {
    this.flares.push({ x, y, z, r, g, b, until: this.time + dur })
  }

  smokeBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    for (const s of this.smokeBlockers) {
      if (this.time > s.until) continue
      // 线段与球求交
      const dx = bx - ax, dy = by - ay, dz = bz - az
      const fx = ax - s.x, fy = ay - s.y, fz = az - s.z
      const a = dx * dx + dy * dy + dz * dz
      if (a < 1e-6) continue
      const t = clamp(-(fx * dx + fy * dy + fz * dz) / a, 0, 1)
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z
      if (px * px + py * py + pz * pz < s.r * s.r) return true
    }
    return false
  }

  update(dt: number) {
    this.time += dt
    this.shake = Math.max(0, this.shake - dt * 2.6)

    // 复用光源衰减
    if (this.muzzleLightI > 0) {
      this.muzzleLightI = Math.max(0, this.muzzleLightI - dt * 110)
      this.muzzleLight.intensity = this.muzzleLightI
    }
    if (this.boomLightI > 0) {
      this.boomLightI = Math.max(0, this.boomLightI - dt * 150)
      this.boomLight.intensity = this.boomLightI
    }

    // 爆炸烟柱
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.life -= dt
      if (p.life <= 0) {
        this.scene.remove(p.sprite)
        p.mat.dispose()
        this.puffs.splice(i, 1)
        continue
      }
      const k = 1 - p.life / p.maxLife
      p.sprite.position.y += p.vy * dt
      const sc = 1.6 + k * p.grow
      p.sprite.scale.set(sc, sc, sc)
      p.mat.opacity = 0.7 * (p.life / p.maxLife)
    }

    // 冲击波环
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.life -= dt
      if (r.life <= 0) {
        this.scene.remove(r.mesh)
        r.mesh.geometry.dispose()
        r.mat.dispose()
        this.rings.splice(i, 1)
        continue
      }
      const k = 1 - r.life / r.maxLife
      const sc = 1 + k * r.maxR
      r.mesh.scale.set(sc, sc, 1)
      r.mat.opacity = 0.55 * (1 - k)
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.life -= dt
      if (t.life <= 0) {
        this.scene.remove(t.mesh)
        this.tracers.splice(i, 1)
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.life -= dt
      ;(f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, f.life / f.maxLife)
      if (f.life <= 0) {
        this.scene.remove(f.sprite)
        ;(f.sprite.material as THREE.SpriteMaterial).dispose()
        this.flashes.splice(i, 1)
      }
    }
    // 粒子
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (this.pLife[i] <= 0) continue
      this.pLife[i] -= dt
      if (this.pLife[i] <= 0) {
        this.pPos[i * 3 + 1] = -9999
        continue
      }
      this.pVel[i * 3 + 1] -= 9.5 * dt
      this.pPos[i * 3] += this.pVel[i * 3] * dt
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt
    }
    ;(this.pGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.pGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true

    // 烟雾
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]
      s.t += dt
      const grow = Math.min(1, s.t / 1.6)
      const fade = s.t > s.dur - 3 ? Math.max(0, (s.dur - s.t) / 3) : 1
      for (let j = 0; j < s.sprites.length; j++) {
        const sc = 0.5 + grow * (4.2 + (j % 3))
        s.sprites[j].scale.set(sc, sc, sc)
        s.mats[j].opacity = 0.88 * grow * fade
      }
      if (s.t >= s.dur) {
        for (const sp of s.sprites) this.scene.remove(sp)
        for (const m of s.mats) m.dispose()
        this.smokes.splice(i, 1)
      }
    }
    this.smokeBlockers = this.smokeBlockers.filter((b) => this.time <= b.until)

    // 信号烟
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i]
      if (this.time > f.until) {
        this.flares.splice(i, 1)
        continue
      }
      this.particle(
        f.x + (Math.random() - 0.5) * 0.6, f.y + 0.3, f.z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4,
        1.4, f.r, f.g, f.b,
      )
    }
  }
}
