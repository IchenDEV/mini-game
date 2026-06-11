import * as THREE from 'three'
import type { Ctx } from '../core/ctx'
import { RNG } from '../utils/rng'
import { lerp } from '../utils/math'

interface Phase { r: number; wait: number; shrink: number; dps: number }

export const PHASES: Phase[] = [
  { r: 330, wait: 45, shrink: 24, dps: 1 },
  { r: 225, wait: 36, shrink: 21, dps: 2 },
  { r: 150, wait: 30, shrink: 18, dps: 4 },
  { r: 95, wait: 26, shrink: 15, dps: 7 },
  { r: 55, wait: 22, shrink: 13, dps: 10 },
  { r: 26, wait: 18, shrink: 11, dps: 13 },
  { r: 0.01, wait: 14, shrink: 40, dps: 16 },
]

interface Circle { x: number; z: number; r: number }

/** 安全区/缩圈系统 */
export class SafeZone {
  idx = 0
  mode: 'wait' | 'shrink' | 'done' = 'wait'
  tLeft = PHASES[0].wait
  cur: Circle
  target: Circle
  private start: Circle
  private wall: THREE.Mesh
  private rng: RNG
  private outsideBeepT = 0

  constructor(scene: THREE.Scene, rng: RNG) {
    this.rng = rng
    const a = rng.range(0, Math.PI * 2)
    const d = rng.range(0, 30)
    this.cur = { x: Math.cos(a) * d, z: Math.sin(a) * d + 10, r: PHASES[0].r }
    this.start = { ...this.cur }
    this.target = this.computeNext()

    const geo = new THREE.CylinderGeometry(1, 1, 260, 72, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x57b8ff, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false,
    })
    this.wall = new THREE.Mesh(geo, mat)
    this.wall.position.y = 110
    scene.add(this.wall)
    this.updateWall()
  }

  private computeNext(): Circle {
    const next = PHASES[Math.min(this.idx + 1, PHASES.length - 1)]
    const margin = Math.max(0, this.cur.r - next.r)
    const a = this.rng.range(0, Math.PI * 2)
    const d = Math.sqrt(this.rng.next()) * margin * 0.85
    return { x: this.cur.x + Math.cos(a) * d, z: this.cur.z + Math.sin(a) * d, r: next.r }
  }

  get dps(): number {
    return PHASES[Math.min(this.idx, PHASES.length - 1)].dps
  }

  outside(x: number, z: number): boolean {
    const dx = x - this.cur.x, dz = z - this.cur.z
    return dx * dx + dz * dz > this.cur.r * this.cur.r
  }

  private updateWall() {
    this.wall.scale.set(Math.max(this.cur.r, 0.5), 1, Math.max(this.cur.r, 0.5))
    this.wall.position.x = this.cur.x
    this.wall.position.z = this.cur.z
  }

  update(dt: number, ctx: Ctx) {
    if (this.mode !== 'done') {
      this.tLeft -= dt
      if (this.mode === 'wait' && this.tLeft <= 0) {
        if (this.idx >= PHASES.length - 1) {
          this.mode = 'done'
        } else {
          this.mode = 'shrink'
          this.tLeft = PHASES[this.idx + 1].shrink
          this.start = { ...this.cur }
          ctx.sfx.zoneAlert()
          ctx.hud.banner('安全区正在缩小！', 'danger', 2.6)
        }
      } else if (this.mode === 'shrink') {
        const dur = PHASES[this.idx + 1].shrink
        const k = 1 - Math.max(0, this.tLeft) / dur
        this.cur.x = lerp(this.start.x, this.target.x, k)
        this.cur.z = lerp(this.start.z, this.target.z, k)
        this.cur.r = lerp(this.start.r, this.target.r, k)
        if (this.tLeft <= 0) {
          this.idx++
          this.cur = { ...this.target }
          if (this.idx >= PHASES.length - 1) {
            this.mode = 'done'
          } else {
            this.mode = 'wait'
            this.tLeft = PHASES[this.idx].wait
            this.target = this.computeNext()
          }
        }
      }
      this.updateWall()
    }

    // 圈外伤害
    for (const c of ctx.chars) {
      if (!c.alive) continue
      if (this.outside(c.pos.x, c.pos.z)) {
        c.hp -= this.dps * dt
        c.lastDamageT = ctx.time
        if (c.isPlayer) {
          ctx.hud.zonePain()
          this.outsideBeepT -= dt
          if (this.outsideBeepT <= 0) {
            this.outsideBeepT = 1.4
            ctx.sfx.zoneTick()
          }
        }
        if (c.hp <= 0) ctx.kill(c, null, '蓝色辐射区')
      }
    }
  }

  /** HUD 文本：阶段状态 */
  statusLabel(): { label: string; warn: 'ok' | 'warn' | 'danger' } {
    if (this.mode === 'done') return { label: '最终圈', warn: 'danger' }
    if (this.mode === 'wait') return { label: `第 ${this.idx + 1} 阶段 · 缩圈倒计时`, warn: this.tLeft < 10 ? 'warn' : 'ok' }
    return { label: `第 ${this.idx + 1} 阶段 · 缩圈中`, warn: 'danger' }
  }
}
