/** 键鼠输入与指针锁定管理 */
export class Input {
  keys = new Set<string>()
  private pressedThisFrame = new Set<string>()
  mouseDX = 0
  mouseDY = 0
  lmb = false
  rmb = false
  lmbPressed = false
  rmbPressed = false
  onLockChange: ((locked: boolean) => void)[] = []
  private el: HTMLElement

  constructor(el: HTMLElement) {
    this.el = el
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'KeyM' || e.code === 'F1') e.preventDefault()
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code)
      this.keys.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX
        this.mouseDY += e.movementY
      }
    })
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true }
      if (e.button === 2) { this.rmb = true; this.rmbPressed = true }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false
      if (e.button === 2) this.rmb = false
    })
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('pointerlockchange', () => {
      const locked = this.locked
      document.body.classList.toggle('locked', locked)
      if (!locked) { this.lmb = false; this.rmb = false; this.keys.clear() }
      for (const cb of this.onLockChange) cb(locked)
    })
  }

  get locked(): boolean {
    return document.pointerLockElement === this.el
  }

  requestLock() {
    if (!this.locked) this.el.requestPointerLock()
  }

  unlock() {
    if (this.locked) document.exitPointerLock()
  }

  key(code: string): boolean {
    return this.keys.has(code)
  }

  /** 本帧首次按下 */
  pressed(code: string): boolean {
    return this.pressedThisFrame.has(code)
  }

  /** 每帧结束时调用 */
  endFrame() {
    this.pressedThisFrame.clear()
    this.mouseDX = 0
    this.mouseDY = 0
    this.lmbPressed = false
    this.rmbPressed = false
  }
}
