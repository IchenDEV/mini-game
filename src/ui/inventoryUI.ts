import type { Ctx } from '../core/ctx'
import { ITEMS, AMMO_META, AmmoType, RARITY_COLORS, RARITY_NAMES } from '../items/defs'

const panel = () => document.getElementById('inventory-panel')!

/** 背包面板：查看 / 使用 / 装备 / 丢弃 */
export class InventoryUI {
  open = false

  toggle(ctx: Ctx, show?: boolean) {
    this.open = show ?? !this.open
    panel().classList.toggle('hidden', !this.open)
    if (this.open) {
      this.render(ctx)
      ctx.input.unlock()
    } else {
      ctx.input.requestLock()
    }
  }

  render(ctx: Ctx) {
    if (!this.open) return
    const p = ctx.player
    const inv = p.inv
    const weight = inv.weight()
    const rows: string[] = []
    rows.push(`<h2>背 包</h2>`)
    rows.push(
      `<div id="inv-cap">容量 ${Math.round(weight)} / ${inv.capacity}` +
      `<span class="cap-track"><span class="cap-fill" style="width:${Math.min(100, (weight / inv.capacity) * 100)}%"></span></span>` +
      `背包等级 Lv${inv.bagLevel}</div>`,
    )
    rows.push(`<div class="inv-cols"><div class="inv-col">`)

    // 武器
    rows.push(`<h3>武器</h3>`)
    const weaponRow = (label: string, w: import('../combat/weapon').WeaponInst | null, dropKey: string) => {
      if (!w) return `<div class="inv-row"><span class="nm" style="color:#5d676e">${label}：空</span></div>`
      const attach = w.attachSummary()
      return (
        `<div class="inv-row"><span class="nm"><span style="color:${RARITY_COLORS[w.rarity]}">${w.def.name}</span>` +
        `<span class="ct">（${RARITY_NAMES[w.rarity]}${attach ? ' · ' + attach : ''}）</span></span>` +
        `<button class="drop" data-act="dropw" data-id="${dropKey}">丢弃</button></div>`
      )
    }
    rows.push(weaponRow('主武器 1', p.primary[0], 'p0'))
    rows.push(weaponRow('主武器 2', p.primary[1], 'p1'))
    rows.push(weaponRow('手枪', p.sidearm, 'side'))
    rows.push(`<div class="inv-row"><span class="nm">近战：${p.meleeDef.name}</span></div>`)

    // 装备
    rows.push(`<h3>装备</h3>`)
    rows.push(`<div class="inv-row"><span class="nm">护甲：${p.armor ? `Lv${p.armor.level}（耐久 ${Math.max(0, Math.round(p.armor.dur))}）` : '无'}</span></div>`)
    rows.push(`<div class="inv-row"><span class="nm">头盔：${p.helmet ? `Lv${p.helmet.level}（耐久 ${Math.max(0, Math.round(p.helmet.dur))}）` : '无'}</span></div>`)

    // 弹药
    rows.push(`<h3>弹药</h3>`)
    for (const t of Object.keys(inv.ammo) as AmmoType[]) {
      if (inv.ammo[t] <= 0) continue
      rows.push(`<div class="inv-row"><span class="nm">${AMMO_META[t].name}</span><span class="ct">×${inv.ammo[t]}</span></div>`)
    }
    if (Object.values(inv.ammo).every((v) => v <= 0)) rows.push(`<div class="inv-empty">没有弹药</div>`)

    rows.push(`</div><div class="inv-col">`)

    // 物品
    rows.push(`<h3>物品</h3>`)
    if (inv.items.size === 0) {
      rows.push(`<div class="inv-empty">背包是空的 — 去建筑里搜刮吧</div>`)
    } else {
      for (const [id, n] of inv.items) {
        const def = ITEMS[id]
        if (!def) continue
        const useLabel = def.kind === 'med' || def.kind === 'boost' ? '使用'
          : def.kind === 'attach' ? '安装'
          : def.kind === 'nade' ? '选用'
          : def.kind === 'fuel' ? '加油' : ''
        rows.push(
          `<div class="inv-row"><span class="nm">${def.name}</span><span class="ct">×${n}</span>` +
          (useLabel ? `<button data-act="use" data-id="${id}">${useLabel}</button>` : '') +
          `<button class="drop" data-act="drop" data-id="${id}">丢弃</button></div>`,
        )
      }
    }
    rows.push(`</div></div>`)
    rows.push(`<div id="inv-close-hint">Tab / Esc 关闭背包</div>`)
    panel().innerHTML = rows.join('')

    panel().querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act
        const id = btn.dataset.id!
        if (act === 'use') {
          ctx.player.useItem(ctx, id)
          if (ITEMS[id]?.kind === 'med' || ITEMS[id]?.kind === 'boost' || ITEMS[id]?.kind === 'nade') {
            this.toggle(ctx, false)
          } else {
            this.render(ctx)
          }
        } else if (act === 'drop') {
          ctx.player.dropItem(ctx, id, 1)
          this.render(ctx)
        } else if (act === 'dropw') {
          ctx.player.dropWeapon(ctx, id as 'p0' | 'p1' | 'side')
          this.render(ctx)
        }
      })
    })
  }
}
