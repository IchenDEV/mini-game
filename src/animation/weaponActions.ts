import type { PoseTargets } from './characterPose'

/**
 * weaponActions：武器相关上身动作（换弹 / 投掷 / 开火后坐）。
 * 输入 pose 目标值并就地修改，不接触战斗逻辑。
 */

/** 投掷动作的出手时刻（进度比例）：此前为拉手+后摆，此后为前甩 */
export const THROW_RELEASE = 0.55

const PI = Math.PI

function ease(k: number): number {
  return k * k * (3 - 2 * k)
}

/**
 * 换弹：三段式
 * 0-0.35  右手下探抽出弹匣（枪口下垂）
 * 0.35-0.7 右手送回新弹匣
 * 0.7-1   右手上拉机柄复位
 */
export function applyReload(p: PoseTargets, k: number) {
  p.gunRx = 0.5
  if (k < 0.35) {
    const s = ease(k / 0.35)
    p.armRx = -0.8 + s * 0.55
    p.elbR = 0.55 + s * 0.75
    p.armRz = 0.1 * s
  } else if (k < 0.7) {
    const s = ease((k - 0.35) / 0.35)
    p.armRx = -0.25 - s * 0.62
    p.elbR = 1.3 - s * 0.5
    p.armRz = 0.1 - 0.12 * s
  } else {
    const s = ease((k - 0.7) / 0.3)
    const pull = Math.sin(s * PI)
    p.armRx = -0.87 - pull * 0.18
    p.elbR = 0.8 + pull * 0.45
    p.gunRx = 0.5 - s * 0.5
  }
  // 左手稳枪
  p.armLx = -0.74
  p.armLz = 0.4
  p.elbL = 0.9
  p.upperRx += 0.05
}

/**
 * 投掷：三段式
 * 0-0.25   拉手：手收向胸前
 * 0.25-0.55 后摆：手臂后拉，上身后转
 * 0.55-1   前甩：快速过顶前挥，上身前倾
 */
export function applyThrow(p: PoseTargets, k: number) {
  if (k < 0.25) {
    const s = ease(k / 0.25)
    p.armRx = -0.3 - s * 0.6
    p.elbR = 0.2 + s * 1.1
    p.armRz = -0.1 * s
  } else if (k < THROW_RELEASE) {
    const s = ease((k - 0.25) / (THROW_RELEASE - 0.25))
    p.armRx = -0.9 + s * 0.55
    p.armRz = -0.1 + s * 0.55
    p.elbR = 1.3 - s * 0.35
    p.upperRy = -0.5 * s
    p.upperRx += -0.06 * s
  } else {
    const s = ease((k - THROW_RELEASE) / (1 - THROW_RELEASE))
    p.armRx = -0.35 - s * 1.75
    p.armRz = 0.45 - s * 0.5
    p.elbR = 0.95 - s * 0.8
    p.upperRy = -0.5 + s * 0.9
    p.upperRx += -0.06 + s * 0.2
  }
  // 左手护胸平衡
  p.armLx = -0.5
  p.elbL = 0.7
  p.armLz = 0.2
}

/** 开火后坐：枪身上跳 + 右肩回拉（k 为冲量 0-1，指数衰减） */
export function applyFireKick(p: PoseTargets, k: number) {
  p.gunRx -= 0.085 * k
  p.armRx += 0.06 * k
  p.elbR += 0.1 * k
  p.upperRx += 0.022 * k
}
