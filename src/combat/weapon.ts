import { WeaponDef, Rarity, ITEMS, AttachSlot } from '../items/defs'

/** 武器实例：携带稀有度、弹匣状态与配件 */
export class WeaponInst {
  mag = 0
  attach: Partial<Record<AttachSlot, string>> = {}
  lastShot = -99
  reloadEnd = -1

  constructor(public def: WeaponDef, public rarity: Rarity) {}

  get magSize(): number {
    const m = this.attach.mag ? ITEMS[this.attach.mag].magMult ?? 1 : 1
    return Math.round(this.def.mag * m)
  }
  get dmg(): number {
    return this.def.dmg * (1 + this.rarity * 0.05)
  }
  get recoil(): number {
    let r = this.def.recoil * (1 - this.rarity * 0.07)
    if (this.attach.muzzle) r *= ITEMS[this.attach.muzzle].recoilMult ?? 1
    if (this.attach.grip) r *= ITEMS[this.attach.grip].recoilMult ?? 1
    return r
  }
  get spreadMult(): number {
    return 1 - this.rarity * 0.08
  }
  get silenced(): boolean {
    return this.attach.muzzle ? !!ITEMS[this.attach.muzzle].silenced : false
  }
  get adsFov(): number {
    if (this.attach.scope) return ITEMS[this.attach.scope].zoomFov ?? this.def.adsFov
    return this.def.adsFov
  }
  get scopeName(): string {
    return this.attach.scope ? ITEMS[this.attach.scope].name : ''
  }
  /** 是否高倍镜（开镜时显示瞄准镜遮罩） */
  get isScoped(): boolean {
    return this.attach.scope === 'scope_4x' || this.attach.scope === 'scope_8x'
  }
  get fireInterval(): number {
    return 60 / this.def.rpm
  }
  reloading(t: number): boolean {
    return t < this.reloadEnd
  }
  canFire(t: number): boolean {
    return t - this.lastShot >= this.fireInterval && !this.reloading(t)
  }
  /** 可附加该配件？返回错误信息或 null */
  canAttach(itemId: string): string | null {
    const it = ITEMS[itemId]
    if (!it || it.kind !== 'attach' || !it.attachSlot) return '不是配件'
    if (!this.def.slots.includes(it.attachSlot)) return '该武器无此插槽'
    if (it.clsAllow && !it.clsAllow.includes(this.def.cls)) return '武器类型不兼容'
    if (this.attach[it.attachSlot] === itemId) return '已安装相同配件'
    return null
  }
  attachItem(itemId: string): string | null {
    const it = ITEMS[itemId]
    const slot = it.attachSlot!
    const old = this.attach[slot] ?? null
    this.attach[slot] = itemId
    return old
  }
  attachSummary(): string {
    const parts: string[] = []
    for (const s of ['scope', 'muzzle', 'grip', 'mag'] as AttachSlot[]) {
      if (this.attach[s]) parts.push(ITEMS[this.attach[s]!].name)
    }
    return parts.join(' · ')
  }
}
