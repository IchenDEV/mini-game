/**
 * cameraImpulse：命名相机冲击。
 * 每种冲击 = 衰减振荡（pitch/yaw/roll 角度偏移），多个冲击可叠加。
 * 与 fx.shake（随机位移抖动）互补：冲击有方向感，抖动是噪声。
 */

export type ImpulseKind = 'fire' | 'hit' | 'explosion' | 'vehicleCrash' | 'hardGround' | 'nearMiss'

interface ImpulseSpec {
  /** 俯仰幅度（弧度，正值起跳方向为抬头） */
  pitch: number
  /** 偏航幅度（随机左右） */
  yaw: number
  /** 侧倾幅度（随机方向） */
  roll: number
  /** 振荡角频率 rad/s */
  freq: number
  /** 指数衰减速率 */
  decay: number
}

const SPECS: Record<ImpulseKind, ImpulseSpec> = {
  fire:         { pitch: 0.010, yaw: 0.005, roll: 0.004, freq: 34, decay: 14 },
  hit:          { pitch: 0.020, yaw: 0.017, roll: 0.012, freq: 22, decay: 9 },
  explosion:    { pitch: 0.052, yaw: 0.040, roll: 0.030, freq: 15, decay: 4.5 },
  vehicleCrash: { pitch: 0.040, yaw: 0.030, roll: 0.028, freq: 18, decay: 6 },
  hardGround:   { pitch: 0.034, yaw: 0.008, roll: 0.012, freq: 21, decay: 8.5 },
  nearMiss:     { pitch: 0.006, yaw: 0.013, roll: 0.010, freq: 30, decay: 11 },
}

interface Active {
  t: number
  pitchA: number
  yawA: number
  rollA: number
  freq: number
  decay: number
}

export interface ImpulseOffset {
  pitch: number
  yaw: number
  roll: number
}

export class CameraImpulse {
  private list: Active[] = []
  private out: ImpulseOffset = { pitch: 0, yaw: 0, roll: 0 }

  add(kind: ImpulseKind, scale = 1) {
    if (scale <= 0.01) return
    const s = SPECS[kind]
    this.list.push({
      t: 0,
      pitchA: s.pitch * scale,
      yawA: s.yaw * scale * (Math.random() < 0.5 ? -1 : 1),
      rollA: s.roll * scale * (Math.random() < 0.5 ? -1 : 1),
      freq: s.freq,
      decay: s.decay,
    })
    if (this.list.length > 10) this.list.shift()
  }

  /** 每帧推进并返回叠加角度偏移 */
  update(dt: number): ImpulseOffset {
    let p = 0, y = 0, r = 0
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i]
      a.t += dt
      const env = Math.exp(-a.decay * a.t)
      if (env < 0.02) {
        this.list.splice(i, 1)
        continue
      }
      const osc = Math.cos(a.freq * a.t) * env
      p += a.pitchA * osc
      y += a.yawA * osc
      r += a.rollA * osc
    }
    this.out.pitch = p
    this.out.yaw = y
    this.out.roll = r
    return this.out
  }
}
