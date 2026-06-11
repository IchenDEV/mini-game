import { AmmoType, AMMO_META, BAG_CAPACITY, ITEMS } from './defs'

/** 玩家背包：弹药池 + 可堆叠物品（药品/能量/投掷物/未安装配件） */
export class Inventory {
  ammo: Record<AmmoType, number> = { light: 0, rifle: 0, sniper: 0, shell: 0 }
  items = new Map<string, number>()
  bagLevel = 0

  get capacity(): number {
    return BAG_CAPACITY[this.bagLevel]
  }

  weight(): number {
    let w = 0
    for (const t of Object.keys(this.ammo) as AmmoType[]) w += this.ammo[t] * AMMO_META[t].w
    for (const [id, n] of this.items) w += (ITEMS[id]?.w ?? 1) * n
    return w
  }

  free(): number {
    return this.capacity - this.weight()
  }

  canAddAmmo(type: AmmoType, count: number): number {
    const per = AMMO_META[type].w
    const fit = Math.floor(this.free() / per)
    return Math.max(0, Math.min(count, fit))
  }

  addAmmo(type: AmmoType, count: number) {
    this.ammo[type] += count
  }

  canAddItem(id: string, count = 1): boolean {
    return this.free() >= (ITEMS[id]?.w ?? 1) * count
  }

  addItem(id: string, count = 1) {
    this.items.set(id, (this.items.get(id) ?? 0) + count)
  }

  removeItem(id: string, count = 1): boolean {
    const cur = this.items.get(id) ?? 0
    if (cur < count) return false
    if (cur === count) this.items.delete(id)
    else this.items.set(id, cur - count)
    return true
  }

  count(id: string): number {
    return this.items.get(id) ?? 0
  }
}
