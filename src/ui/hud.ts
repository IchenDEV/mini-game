import * as THREE from 'three'
import type { Ctx } from '../core/ctx'
import { RARITY_COLORS, RARITY_NAMES, AMMO_META, ITEMS } from '../items/defs'
import { clamp, fmtTime, DEG } from '../utils/math'

const _v = new THREE.Vector3()

const $ = (id: string) => document.getElementById(id)!

/** HUD：血条、武器卡、小地图、击杀流、横幅、提示 */
export class HUD {
  private hpFill = $('hp-fill')
  private hpText = $('hp-text')
  private armorFill = $('armor-fill')
  private boostFill = $('boost-fill')
  private rankText = $('rank-text')
  private equipLine = $('equip-line')
  private wpnName = $('wpn-name')
  private wpnAttach = $('wpn-attach')
  private ammoMag = $('ammo-mag')
  private ammoPool = $('ammo-pool')
  private wpnMode = $('wpn-mode')
  private slotEls = Array.from(document.querySelectorAll('#slots .slot')) as HTMLElement[]
  private zonePill = $('zone-pill')
  private zoneLabel = $('zone-label')
  private zoneTimer = $('zone-timer')
  private aliveCount = $('alive-count')
  private killCount = $('kill-count')
  private killfeed = $('killfeed')
  private bannerEl = $('banner')
  private promptEl = $('prompt')
  private castbar = $('castbar')
  private castFill = $('cast-fill')
  private castLabel = $('cast-label')
  private hitmarkerEl = $('hitmarker')
  private vignette = $('vignette')
  private flashEl = $('flashwhite')
  private dmgDir = $('dmg-dir')
  private crosshair = $('crosshair')
  private chT = document.querySelector('.ch-t') as HTMLElement
  private chB = document.querySelector('.ch-b') as HTMLElement
  private chL = document.querySelector('.ch-l') as HTMLElement
  private chR = document.querySelector('.ch-r') as HTMLElement
  private scopeOverlay = $('scope-overlay')
  private hints = $('hints')
  private minimapC = $('minimap') as HTMLCanvasElement
  private minimapCoord = $('minimap-coord')
  private fullmapWrap = $('fullmap-wrap')
  private fullmapC = $('fullmap') as HTMLCanvasElement

  private dmgNums: { x: number; y: number; z: number; t: number; el: HTMLElement }[] = []
  private bannerT = 0
  private noticeT = 0
  private hitT = 0
  private vignetteV = 0
  private flashV = 0
  private dmgDirT = 0
  private dmgDirAng = 0
  private zonePainT = 0
  private hintsT = 26

  show() {
    $('hud').classList.remove('hidden')
  }

  banner(text: string, cls: 'amber' | 'danger' | '' = '', dur = 2.4) {
    this.bannerEl.textContent = text
    this.bannerEl.className = `show ${cls}`
    this.bannerT = dur
  }

  /** 小通知（复用横幅位置下方？直接用横幅，时间短） */
  notice(text: string) {
    this.banner(text, '', 1.4)
  }

  feed(killer: string, victim: string, weapon: string, killerIsPlayer: boolean, victimIsPlayer: boolean) {
    const div = document.createElement('div')
    div.className = 'feed-item'
    const k = killerIsPlayer ? `<span class="k">你</span>` : `<span class="${victimIsPlayer ? 'v' : ''}">${killer}</span>`
    const v = victimIsPlayer ? `<span class="v">你</span>` : `<span>${victim}</span>`
    div.innerHTML = `${k} ▸ ${v} <span class="w">[${weapon}]</span>`
    this.killfeed.prepend(div)
    while (this.killfeed.children.length > 6) this.killfeed.removeChild(this.killfeed.lastChild!)
    setTimeout(() => { div.style.opacity = '0' }, 5200)
    setTimeout(() => div.remove(), 6000)
  }

  hitmarker(head: boolean, kill: boolean) {
    this.hitT = 0.22
    this.hitmarkerEl.className = kill ? 'kill' : head ? 'head' : ''
  }

  damageFlash(relAngle: number, hasDir: boolean) {
    this.vignetteV = Math.min(1, this.vignetteV + 0.55)
    if (hasDir) {
      this.dmgDirAng = relAngle
      this.dmgDirT = 1.0
    }
  }

  zonePain() {
    this.zonePainT = 0.4
  }

  /** 世界坐标伤害飘字 */
  damageNumber(x: number, y: number, z: number, dmg: number, head: boolean, ctx: Ctx) {
    const el = document.createElement('div')
    el.className = `dmgnum${head ? ' head' : ''}`
    el.textContent = String(Math.round(dmg))
    $('hud').appendChild(el)
    this.dmgNums.push({ x, y: y + 0.25, z, t: 0, el })
    if (this.dmgNums.length > 12) {
      this.dmgNums.shift()!.el.remove()
    }
  }

  flashWhite(strength: number) {
    this.flashV = Math.min(1, strength)
  }

  promptShow(html: string) {
    this.promptEl.innerHTML = html
    this.promptEl.classList.remove('hidden')
  }
  promptHide() {
    this.promptEl.classList.add('hidden')
  }

  toggleFullmap(show?: boolean): boolean {
    const want = show ?? this.fullmapWrap.classList.contains('hidden')
    this.fullmapWrap.classList.toggle('hidden', !want)
    return want
  }
  get fullmapOpen(): boolean {
    return !this.fullmapWrap.classList.contains('hidden')
  }

  update(dt: number, ctx: Ctx) {
    const p = ctx.player

    // 血条
    const hp = Math.max(0, p.hp)
    this.hpFill.style.width = `${hp}%`
    this.hpFill.className = hp < 25 ? 'low' : hp < 55 ? 'mid' : ''
    this.hpText.textContent = String(Math.ceil(hp))
    this.armorFill.style.width = p.armor ? `${clamp((p.armor.dur / 180) * 100, 4, 100)}%` : '0%'
    this.boostFill.style.width = `${p.boost}%`
    this.rankText.textContent = `存活 ${ctx.aliveCount}`
    const eq: string[] = []
    eq.push(p.armor ? `护甲 Lv${p.armor.level}` : '无护甲')
    eq.push(p.helmet ? `头盔 Lv${p.helmet.level}` : '无头盔')
    eq.push(p.inv.bagLevel > 0 ? `背包 Lv${p.inv.bagLevel}` : '无背包')
    eq.push(`负重 ${Math.round(p.inv.weight())}/${p.inv.capacity}`)
    this.equipLine.textContent = eq.join(' · ')

    // 武器卡
    const w = p.currentWeapon()
    if (p.slot === 3) {
      this.wpnName.textContent = p.meleeDef.name
      this.wpnName.style.color = '#e8ecef'
      this.wpnAttach.textContent = ''
      this.ammoMag.textContent = '—'
      this.ammoPool.textContent = '—'
      this.wpnMode.textContent = '近战'
    } else if (p.slot === 4) {
      const nt = p.nadeType()
      this.wpnName.textContent = ITEMS[nt].name
      this.wpnName.style.color = '#e8ecef'
      this.wpnAttach.textContent = 'T 切换投掷物'
      this.ammoMag.textContent = String(p.nadeCount())
      this.ammoPool.textContent = String(p.totalNades())
      this.wpnMode.textContent = '投掷'
    } else if (w) {
      this.wpnName.textContent = w.def.name
      this.wpnName.style.color = RARITY_COLORS[w.rarity]
      this.wpnAttach.textContent = w.attachSummary() || RARITY_NAMES[w.rarity]
      this.ammoMag.textContent = String(w.mag)
      this.ammoPool.textContent = w.def.ammo ? String(p.inv.ammo[w.def.ammo]) : '0'
      const modes: Record<string, string> = { AR: '全自动', SMG: '全自动', DMR: '半自动', PISTOL: '半自动', SG: '泵动', SR: '栓动' }
      this.wpnMode.textContent = w.reloading(ctx.time) ? '装填中…' : modes[w.def.cls] ?? ''
    } else {
      this.wpnName.textContent = '空槽'
      this.wpnName.style.color = '#9aa6ad'
      this.wpnAttach.textContent = ''
      this.ammoMag.textContent = '--'
      this.ammoPool.textContent = '--'
      this.wpnMode.textContent = ''
    }

    // 槽位
    const slotLabels = [
      p.primary[0] ? p.primary[0].def.name.slice(0, 2) : '1',
      p.primary[1] ? p.primary[1].def.name.slice(0, 2) : '2',
      p.sidearm ? 'P9' : '3',
      p.hasPan ? '锅' : '拳',
      p.totalNades() > 0 ? `雷${p.totalNades()}` : '5',
    ]
    this.slotEls.forEach((el, i) => {
      el.textContent = slotLabels[i]
      el.classList.toggle('active', p.slot === i)
      el.classList.toggle('has', (i === 0 && !!p.primary[0]) || (i === 1 && !!p.primary[1]) || (i === 2 && !!p.sidearm) || i === 3 || (i === 4 && p.totalNades() > 0))
    })

    // 顶部
    if (ctx.state === 'plane') {
      this.zoneLabel.textContent = '运输机航行中 — 选择跳伞时机'
      this.zoneTimer.textContent = ''
      this.zonePill.className = 'pill'
    } else {
      const zs = ctx.zone.statusLabel()
      this.zoneLabel.textContent = zs.label
      this.zoneTimer.textContent = ctx.zone.mode === 'done' ? '' : fmtTime(ctx.zone.tLeft)
      this.zonePill.className = `pill${zs.warn === 'warn' ? ' warn' : ''}${zs.warn === 'danger' ? ' danger' : ''}`
    }
    this.aliveCount.textContent = String(ctx.aliveCount)
    this.killCount.textContent = String(p.kills)

    // 准星
    const showCross = !p.dropping && !(p.ads && w?.isScoped)
    this.crosshair.style.display = showCross ? '' : 'none'
    if (showCross) {
      const fovV = ctx.camera.fov * DEG
      const px = Math.tan((p.spreadDeg() * DEG) / 1.2) * (window.innerHeight / 2) / Math.tan(fovV / 2) + 7
      this.chT.style.transform = `translateY(${-px - 9}px)`
      this.chB.style.transform = `translateY(${px}px)`
      this.chL.style.transform = `translateX(${-px - 9}px)`
      this.chR.style.transform = `translateX(${px}px)`
    }
    this.scopeOverlay.classList.toggle('hidden', !(p.ads && w?.isScoped && !p.dropping))

    // 命中标记
    if (this.hitT > 0) {
      this.hitT -= dt
      this.hitmarkerEl.style.opacity = String(clamp(this.hitT / 0.22, 0, 1))
      this.hitmarkerEl.style.transform = `translate(-50%,-50%) scale(${1 + (1 - this.hitT / 0.22) * 0.4})`
    } else this.hitmarkerEl.style.opacity = '0'

    // 受击反馈
    this.vignetteV = Math.max(0, this.vignetteV - dt * 1.6)
    const zonePulse = this.zonePainT > 0 ? 0.4 + Math.sin(ctx.time * 6) * 0.1 : 0
    this.zonePainT = Math.max(0, this.zonePainT - dt)
    this.vignette.style.opacity = String(Math.max(this.vignetteV, zonePulse))
    this.flashV = Math.max(0, this.flashV - dt * 0.45)
    this.flashEl.style.opacity = String(this.flashV)
    if (this.dmgDirT > 0) {
      this.dmgDirT -= dt
      this.dmgDir.style.opacity = String(clamp(this.dmgDirT, 0, 0.85))
      this.dmgDir.style.transform = `translate(-50%,-50%) rotate(${this.dmgDirAng / DEG}deg)`
    } else this.dmgDir.style.opacity = '0'

    // 横幅
    if (this.bannerT > 0) {
      this.bannerT -= dt
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show')
    }

    // 拾取/跳伞提示
    if (ctx.state === 'plane') {
      this.promptShow(`<b>空格</b> 跳伞`)
    } else if (p.nearLoot && !p.dropping) {
      const colorCls = `r${p.nearLoot.rarity}`
      this.promptShow(`<b>E</b> 拾取 <span class="${colorCls}">${p.nearLoot.name}</span>`)
    } else this.promptHide()

    // 施法条
    if (p.casting) {
      this.castbar.classList.remove('hidden')
      this.castLabel.textContent = p.casting.label
      this.castFill.style.width = `${(p.casting.t / p.casting.dur) * 100}%`
    } else this.castbar.classList.add('hidden')

    // 提示渐隐
    if (this.hintsT > 0) {
      this.hintsT -= dt
      if (this.hintsT <= 0) this.hints.style.opacity = '0'
    }

    // 伤害飘字
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i]
      d.t += dt
      if (d.t > 0.85) {
        d.el.remove()
        this.dmgNums.splice(i, 1)
        continue
      }
      _v.set(d.x, d.y + d.t * 1.1, d.z).project(ctx.camera)
      if (_v.z > 1) {
        d.el.style.opacity = '0'
        continue
      }
      const sx = (_v.x * 0.5 + 0.5) * window.innerWidth
      const sy = (-_v.y * 0.5 + 0.5) * window.innerHeight
      d.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-100%) scale(${d.t < 0.12 ? 0.7 + d.t * 4 : 1.18})`
      d.el.style.opacity = String(clamp(1.5 - d.t * 1.8, 0, 1))
    }

    this.minimapCoord.textContent = `${Math.round(p.pos.x)} , ${Math.round(p.pos.z)}`
    this.drawMap(this.minimapC, ctx, 0.62, true)
    if (this.fullmapOpen) this.drawMap(this.fullmapC, ctx, this.fullmapC.width / 820, false)
  }

  private drawMap(canvas: HTMLCanvasElement, ctx: Ctx, pxPerM: number, followPlayer: boolean) {
    const g = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const p = ctx.player
    const cx = followPlayer ? p.pos.x : 0
    const cz = followPlayer ? p.pos.z : 0
    g.clearRect(0, 0, W, H)
    g.fillStyle = '#2c4456'
    g.fillRect(0, 0, W, H)

    const base = ctx.world.minimap
    const baseScale = base.width / 800 // px per meter in base
    const viewMeters = W / pxPerM
    const sx = (cx + 400 - viewMeters / 2) * baseScale
    const sy = (cz + 400 - viewMeters / 2) * baseScale
    const sw = viewMeters * baseScale
    g.imageSmoothingEnabled = true
    g.drawImage(base, sx, sy, sw, sw, 0, 0, W, H)

    const toC = (wx: number, wz: number): [number, number] => [
      (wx - cx) * pxPerM + W / 2,
      (wz - cz) * pxPerM + H / 2,
    ]

    // 安全区
    const zone = ctx.zone
    g.lineWidth = 2
    g.strokeStyle = 'rgba(120,190,255,0.95)'
    g.beginPath()
    const [zx, zy] = toC(zone.cur.x, zone.cur.z)
    g.arc(zx, zy, zone.cur.r * pxPerM, 0, Math.PI * 2)
    g.stroke()
    if (zone.mode !== 'done') {
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.setLineDash([6, 5])
      g.beginPath()
      const [tx, ty] = toC(zone.target.x, zone.target.z)
      g.arc(tx, ty, zone.target.r * pxPerM, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
    }

    // 运输机航线
    const pl = ctx.plane
    if (pl && !pl.done) {
      const [lax, lay] = toC(pl.sx, pl.sz)
      const [lbx, lby] = toC(pl.ex, pl.ez)
      g.strokeStyle = 'rgba(255,255,255,0.55)'
      g.lineWidth = 1.5
      g.setLineDash([4, 6])
      g.beginPath()
      g.moveTo(lax, lay)
      g.lineTo(lbx, lby)
      g.stroke()
      g.setLineDash([])
      const [pfx, pfy] = toC(pl.x, pl.z)
      if (pfx > -14 && pfx < W + 14 && pfy > -14 && pfy < H + 14) {
        g.save()
        g.translate(pfx, pfy)
        g.rotate(Math.atan2(pl.dirX, -pl.dirZ))
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.moveTo(0, -8)
        g.lineTo(3, 0)
        g.lineTo(8, 2)
        g.lineTo(8, 4.5)
        g.lineTo(1.5, 3.5)
        g.lineTo(1.5, 7)
        g.lineTo(3.5, 9)
        g.lineTo(-3.5, 9)
        g.lineTo(-1.5, 7)
        g.lineTo(-1.5, 3.5)
        g.lineTo(-8, 4.5)
        g.lineTo(-8, 2)
        g.lineTo(-3, 0)
        g.closePath()
        g.fill()
        g.restore()
      }
    }

    // 空投
    for (const a of ctx.loot.airdrops) {
      const [ax, ay] = toC(a.x, a.z)
      if (ax < -10 || ax > W + 10 || ay < -10 || ay > H + 10) continue
      g.fillStyle = a.landed ? '#ff5d4d' : '#f0b35c'
      g.beginPath()
      g.arc(ax, ay, 4.5, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.6)'
      g.lineWidth = 1
      g.stroke()
    }

    // 枪声指示
    for (const s of ctx.shots) {
      const age = ctx.time - s.t
      if (age > 1.4 || s.shooter === p) continue
      const [sx2, sy2] = toC(s.x, s.z)
      if (sx2 < 0 || sx2 > W || sy2 < 0 || sy2 > H) continue
      g.strokeStyle = `rgba(255,210,130,${(1 - age / 1.4) * 0.9})`
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(sx2, sy2, 3 + age * 9, 0, Math.PI * 2)
      g.stroke()
    }

    // 玩家箭头
    const [px2, py2] = toC(p.pos.x, p.pos.z)
    g.save()
    g.translate(px2, py2)
    g.rotate(Math.atan2(Math.sin(p.yaw), -Math.cos(p.yaw)))
    g.fillStyle = '#ffffff'
    g.strokeStyle = 'rgba(0,0,0,0.7)'
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(0, -7)
    g.lineTo(5, 6)
    g.lineTo(0, 3)
    g.lineTo(-5, 6)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()

    // 边框 N 标
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.font = 'bold 10px sans-serif'
    g.textAlign = 'center'
    g.fillText('N', W / 2, 11)
  }

  showEnd(win: boolean, stats: { rank: number; total: number; kills: number; dmg: number; time: number }) {
    const title = $('end-title')
    title.textContent = win ? '大获全胜！' : '已被淘汰'
    title.className = win ? 'win' : 'lose'
    $('end-stats').innerHTML =
      `最终排名 <b>#${stats.rank}</b> / ${stats.total}<br/>` +
      `击杀 <b>${stats.kills}</b> · 造成伤害 <b>${Math.round(stats.dmg)}</b><br/>` +
      `存活时间 <b>${fmtTime(stats.time)}</b> · 评分 <b>${Math.round(stats.kills * 100 + stats.time + stats.dmg * 0.4)}</b>`
    $('end-screen').classList.remove('hidden')
  }
}
