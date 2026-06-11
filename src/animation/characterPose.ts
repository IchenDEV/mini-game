import { clamp } from '../utils/math'
import type { MotionInput } from './motionState'
import { applyReload, applyThrow, applyFireKick } from './weaponActions'

/**
 * characterPose：纯函数姿态计算。
 * 输入 MotionInput 快照，输出全部关节目标值；不读输入设备、不碰战斗状态。
 * Character.animate() 负责将目标值阻尼应用到骨架。
 */

export interface PoseTargets {
  thL: number; thR: number
  knL: number; knR: number
  armLx: number; armLz: number; elbL: number
  armRx: number; armRz: number; elbR: number
  /** 躯干下蹲位移 */
  upperY: number
  /** 躯干附加前倾（叠加到俯仰前倾上） */
  upperRx: number
  /** 躯干扭转（投掷/受击用） */
  upperRy: number
  /** 头部附加低头 */
  headRx: number
  /** 身体起伏 */
  bob: number
  /** 枪组俯仰 */
  gunRx: number
}

export function computePose(m: MotionInput): PoseTargets {
  const p: PoseTargets = {
    thL: 0, thR: 0, knL: 0.06, knR: 0.06,
    armLx: 0, armLz: -0.06, elbL: 0.16,
    armRx: 0, armRz: 0.06, elbR: 0.16,
    upperY: 0, upperRx: 0, upperRy: 0, headRx: 0,
    bob: 0, gunRx: 0,
  }
  const sw = Math.sin(m.walkPhase)

  // ---- 下肢 / 躯干基础姿态（按主状态） ----
  switch (m.state) {
    case 'drive':
      p.thL = p.thR = -1.42
      p.knL = p.knR = 1.3
      p.armLx = p.armRx = -0.92
      p.armLz = 0.24; p.armRz = -0.24
      p.elbL = p.elbR = 0.62
      return p
    case 'chute':
      p.thL = -0.34; p.thR = -0.22
      p.knL = 0.6; p.knR = 0.48
      p.armLx = p.armRx = -2.5
      p.armLz = -0.32; p.armRz = 0.32
      p.elbL = p.elbR = 0.42
      return p
    case 'freefall':
      p.thL = 0.3; p.thR = 0.45
      p.knL = 0.85; p.knR = 0.7
      p.armLx = p.armRx = -0.35
      p.armLz = -1.2; p.armRz = 1.2
      p.elbL = p.elbR = 0.45
      return p
    case 'jump':
      p.thL = -0.55; p.thR = 0.28
      p.knL = 0.95; p.knR = 0.5
      break
    case 'crouch': {
      const cs = sw * 0.38 * m.moveK
      p.thL = -0.92 + cs
      p.thR = -0.68 - cs
      p.knL = 1.18; p.knR = 1.02
      p.upperY = -0.42
      p.bob = Math.abs(Math.cos(m.walkPhase)) * 0.02 * m.moveK
      break
    }
    default: {
      // idle / walk / run
      const amp = 0.12 + m.moveK * 0.5 + m.runK * 0.2
      p.thL = sw * amp
      p.thR = -sw * amp
      const kneeAmp = (0.45 + m.runK * 0.7) * m.moveK
      p.knL = Math.max(0, -sw) * kneeAmp + 0.06
      p.knR = Math.max(0, sw) * kneeAmp + 0.06
      p.bob = Math.abs(Math.cos(m.walkPhase)) * (0.028 + 0.05 * m.runK) * m.moveK
    }
  }

  // ---- 手臂基础（持枪 / 徒手） ----
  if (m.aiming) {
    p.armRx = -1.18; p.armRz = -0.06; p.elbR = 0.5
    p.armLx = -1.0; p.armLz = 0.44; p.elbL = 0.95
    p.gunRx = 0
  } else if (m.armed) {
    if (m.sprinting) {
      p.armRx = -0.6 + sw * 0.14; p.elbR = 0.92
      p.armLx = -0.48 - sw * 0.14; p.armLz = 0.32; p.elbL = 1.0
      p.gunRx = 0.6
    } else {
      p.armRx = -0.8 + sw * 0.05 * m.moveK; p.elbR = 0.55
      p.armLx = -0.62 - sw * 0.05 * m.moveK; p.armLz = 0.36; p.elbL = 0.85
      p.gunRx = 0.36
    }
  } else {
    const armAmp = 0.14 + 0.4 * m.moveK + 0.22 * m.runK
    p.armLx = -sw * armAmp
    p.armRx = sw * armAmp
    p.elbL = 0.18 + Math.max(0, sw) * 0.55 * m.moveK
    p.elbR = 0.18 + Math.max(0, -sw) * 0.55 * m.moveK
    if (m.idle) {
      p.armLx += m.breath * 0.025
      p.armRx += m.breath * 0.025
    }
  }

  // ---- 上身动作层 ----
  applyAction(p, m)

  // ---- 开火后坐 ----
  if (m.fireK > 0.01) applyFireKick(p, m.fireK)

  return p
}

/** 上身动作叠加：换弹/投掷交给 weaponActions，治疗/受击/出拳在此处理 */
function applyAction(p: PoseTargets, m: MotionInput) {
  const k = clamp(m.actionK, 0, 1)
  switch (m.action) {
    case 'reload':
      applyReload(p, k)
      break
    case 'throw':
      applyThrow(p, k)
      break
    case 'heal':
    case 'boost': {
      // 左手胸前反复操作（打针/包扎/进食），上身微低头
      const cyc = Math.sin(k * Math.PI * 6)
      p.armLx = -1.05 + cyc * 0.12
      p.armLz = 0.5
      p.elbL = 1.25 + cyc * 0.1
      p.armRx = -0.55
      p.armRz = 0.15
      p.elbR = 0.9
      p.upperRx += 0.12
      p.headRx = 0.28
      p.gunRx = 0.7
      break
    }
    case 'hit': {
      // 短促受击：进度 0→1 表示冲击衰减（启动瞬间最大）
      const s = Math.sin(clamp(1 - k, 0, 1) * Math.PI * 0.5)
      p.upperRx += -0.16 * s
      p.upperRy = m.hitDir * 0.22 * s
      p.headRx = -0.12 * s
      break
    }
    case 'melee': {
      // 出拳/挥击：右臂前突
      const ext = Math.sin(k * Math.PI)
      p.armRx = -0.25 - 1.25 * ext
      p.armRz = -0.1
      p.elbR = 0.15 + (1 - ext) * 0.9
      p.gunRx = -0.3 * ext
      p.upperRy = -0.14 * ext
      break
    }
  }
}
