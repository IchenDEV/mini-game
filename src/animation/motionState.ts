/**
 * motionState：角色动作状态定义与上身动作时间线。
 * 只描述"角色正在做什么"，不接触输入与战斗逻辑。
 */

/** 主运动状态（互斥）：决定下肢与躯干基础姿态 */
export type CharacterMotionState =
  | 'idle' | 'walk' | 'run' | 'crouch' | 'jump'
  | 'freefall' | 'chute' | 'drive' | 'dead'

/** 上身动作层（叠加在主状态之上） */
export type ActionKind = 'none' | 'reload' | 'throw' | 'heal' | 'boost' | 'hit' | 'melee'

/** 姿态计算输入快照（由 Character 每帧构造） */
export interface MotionInput {
  state: CharacterMotionState
  /** 行走混合 0-1 */
  moveK: number
  /** 奔跑混合 0-1 */
  runK: number
  /** 步态相位（弧度） */
  walkPhase: number
  /** 呼吸波 -1..1 */
  breath: number
  /** 手持武器模型（含近战锅） */
  armed: boolean
  /** 据枪瞄准 */
  aiming: boolean
  sprinting: boolean
  /** 静止站立（呼吸细节） */
  idle: boolean
  /** 视角俯仰（用于上身前倾） */
  pitch: number
  /** 当前上身动作 */
  action: ActionKind
  /** 动作进度 0-1 */
  actionK: number
  /** 开火后坐冲量 0-1（指数衰减） */
  fireK: number
  /** 受击方向：-1 左 / +1 右 / 0 正面 */
  hitDir: number
}

/**
 * 上身动作时间线：以 dt 递减计时，互斥单动作。
 * reload/heal 由游戏逻辑给出时长；throw/hit/melee 用固定短时长。
 */
export class ActionTimeline {
  kind: ActionKind = 'none'
  private dur = 1
  private rem = 0

  start(kind: ActionKind, dur: number) {
    this.kind = kind
    this.dur = Math.max(0.08, dur)
    this.rem = this.dur
  }

  /** 取消指定动作（不传则取消任意动作） */
  cancel(...kinds: ActionKind[]) {
    if (kinds.length === 0 || kinds.includes(this.kind)) {
      this.kind = 'none'
      this.rem = 0
    }
  }

  /** 每帧推进，返回当前进度 0-1（无动作返回 0） */
  tick(dt: number): number {
    if (this.kind === 'none') return 0
    this.rem -= dt
    if (this.rem <= 0) {
      this.kind = 'none'
      return 0
    }
    return 1 - this.rem / this.dur
  }

  get active(): boolean { return this.kind !== 'none' }
}
