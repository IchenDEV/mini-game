import * as THREE from 'three'
import { World } from '../world/world'
import { LootSystem } from '../items/loot'
import { Effects } from '../fx/effects'
import { Sfx } from './sfx'
import { SafeZone } from '../zone/zone'
import { Combat } from '../combat/combat'
import { HUD } from '../ui/hud'
import { InventoryUI } from '../ui/inventoryUI'
import { Input } from './input'
import { Player } from '../entities/player'
import { Bot, botName } from '../entities/bot'
import { Character } from '../entities/character'
import { TPCamera } from './camera'
import { RNG } from '../utils/rng'
import { clamp } from '../utils/math'
import type { Ctx } from './ctx'

const BOT_COUNT = 28

export class Game {
  private renderer: THREE.WebGLRenderer
  private ctx: Ctx
  private cam = new TPCamera()
  private invUI = new InventoryUI()
  private corpses: { ch: Character; t: number }[] = []
  private started = false
  private ended = false
  private lastZoneIdx = -1
  private sun: THREE.DirectionalLight
  private clock = new THREE.Clock()

  private kill = (victim: Character, attacker: Character | null, weaponName: string) => {
    const ctx = this.ctx
    if (!victim.alive) return
    victim.lieDown()
    this.corpses.push({ ch: victim, t: ctx.time })
    ctx.loot.dropCorpseLoot(victim)
    ctx.aliveCount = ctx.chars.filter((c) => c.alive).length
    if (attacker && attacker !== victim) attacker.kills++
    ctx.hud.feed(attacker ? attacker.name : '蓝色辐射区', victim.name, weaponName, attacker?.isPlayer ?? false, victim.isPlayer)
    if (attacker?.isPlayer && !victim.isPlayer) {
      ctx.sfx.kill()
      ctx.hud.banner(`已淘汰 ${victim.name} — 共 ${attacker.kills} 杀`, 'amber', 2)
    }
    if (victim.isPlayer) {
      this.endGame(false)
    } else if (ctx.player.alive && ctx.aliveCount === 1) {
      this.endGame(true)
    }
  }

  constructor(container: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xc4d2dc)
    scene.fog = new THREE.Fog(0xc4d2dc, 170, 760)

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1500)
    camera.position.set(0, 160, 0)

    const hemi = new THREE.HemisphereLight(0xd8e8f5, 0x5d6b4a, 0.85)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1)
    sun.position.set(120, 190, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -120
    sun.shadow.camera.right = 120
    sun.shadow.camera.top = 120
    sun.shadow.camera.bottom = -120
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 600
    sun.shadow.bias = -0.0008
    scene.add(sun)
    scene.add(sun.target)
    this.sun = sun

    // 世界与系统
    const world = new World()
    world.build(scene)
    const fx = new Effects(scene)
    const loot = new LootSystem(scene, world, fx)
    loot.spawnInitial()
    const sfx = new Sfx()
    const input = new Input(renderer.domElement)
    const hud = new HUD()
    const combat = new Combat()
    const rng = new RNG((Date.now() % 1000000007) + 11)
    const zone = new SafeZone(scene, rng)
    const player = new Player()

    this.ctx = {
      scene, camera, world, loot, fx, sfx, zone, combat, hud, input, player,
      bots: [], chars: [], time: 0, state: 'drop', shots: [],
      aliveCount: BOT_COUNT + 1, graceUntil: 20,
      kill: this.kill,
    }

    // 玩家跳伞起点
    const pa = rng.range(0, Math.PI * 2)
    const px = clamp(zone.cur.x + Math.cos(pa) * rng.range(60, 240), -340, 340)
    const pz = clamp(zone.cur.z + Math.sin(pa) * rng.range(60, 240), -340, 340)
    player.init(scene, px, pz)
    this.ctx.chars.push(player)

    // AI
    const spawns = [...world.botSpawns]
    for (let i = spawns.length - 1; i > 0; i--) {
      const j = rng.int(0, i)
      const tmp = spawns[i]; spawns[i] = spawns[j]; spawns[j] = tmp
    }
    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = new Bot(rng.int(1, 1 << 30))
      bot.name = botName(i)
      const sp = spawns[i % spawns.length]
      bot.init(scene, sp.x + rng.range(-3, 3), sp.z + rng.range(-3, 3), this.ctx)
      this.ctx.bots.push(bot)
      this.ctx.chars.push(bot)
    }
    this.ctx.aliveCount = this.ctx.chars.length

    // UI 接线
    document.getElementById('btn-lock')!.addEventListener('click', () => {
      sfx.ensure()
      this.started = true
      input.requestLock()
      document.getElementById('overlay-lock')!.classList.add('hidden')
      hud.show()
    })
    document.getElementById('btn-restart')!.addEventListener('click', () => location.reload())
    input.onLockChange.push(() => this.refreshLockOverlay())
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    })

    document.getElementById('loading')!.classList.add('hidden')
    document.getElementById('overlay-lock')!.classList.remove('hidden')
  }

  private refreshLockOverlay() {
    const ctx = this.ctx
    const overlay = document.getElementById('overlay-lock')!
    const shouldShow = this.started && !this.ended && !ctx.input.locked && !this.invUI.open
    overlay.classList.toggle('hidden', !shouldShow)
    if (shouldShow) {
      overlay.querySelector('h1')!.textContent = '已暂停瞄准'
      overlay.querySelector('p')!.textContent = '鼠标已解锁'
      document.getElementById('btn-lock')!.textContent = '点击继续战斗'
    }
  }

  private endGame(win: boolean) {
    if (this.ended) return
    this.ended = true
    const ctx = this.ctx
    ctx.state = 'end'
    ctx.input.unlock()
    this.invUI.toggle(ctx, false)
    document.getElementById('overlay-lock')!.classList.add('hidden')
    if (win) ctx.sfx.win()
    else ctx.sfx.lose()
    const rank = win ? 1 : ctx.aliveCount + 1
    ctx.hud.showEnd(win, {
      rank,
      total: BOT_COUNT + 1,
      kills: ctx.player.kills,
      dmg: ctx.player.damageDealt,
      time: Math.max(0, ctx.time - ctx.player.surviveStart),
    })
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick())
  }

  /** 调试用 */
  get debugCtx(): Ctx {
    return this.ctx
  }

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const ctx = this.ctx

    if (this.started && ctx.state !== 'end') {
      ctx.time += dt

      // 面板快捷键
      if (ctx.input.pressed('Tab')) {
        this.invUI.toggle(ctx)
        this.refreshLockOverlay()
      }
      if (ctx.input.pressed('KeyM')) ctx.hud.toggleFullmap()
      if (ctx.input.pressed('Escape') && this.invUI.open) {
        this.invUI.toggle(ctx, false)
        this.refreshLockOverlay()
      }
      ctx.player.blockInput = this.invUI.open

      if (ctx.state === 'drop') {
        ctx.player.updateDrop(dt, ctx)
        if (!ctx.player.dropping) {
          ctx.state = 'play'
        }
      } else {
        ctx.player.updatePlay(dt, ctx)
      }

      for (const bot of ctx.bots) bot.update(dt, ctx)
      ctx.combat.update(ctx, dt)
      ctx.zone.update(dt, ctx)

      // 阶段推进通知与空投
      if (ctx.zone.idx !== this.lastZoneIdx) {
        this.lastZoneIdx = ctx.zone.idx
        if (ctx.zone.idx > 0) {
          ctx.hud.banner(`进入第 ${ctx.zone.idx + 1} 阶段`, '', 2.2)
        }
        if (ctx.zone.idx === 2 || ctx.zone.idx === 4) {
          const zt = ctx.zone.target
          const a = Math.random() * Math.PI * 2
          const r = Math.sqrt(Math.random()) * Math.max(10, zt.r * 0.7)
          ctx.loot.callAirdrop(zt.x + Math.cos(a) * r, zt.z + Math.sin(a) * r)
          ctx.sfx.airdropAlert()
          ctx.hud.banner('空投正在抵达 — 注意地图标记', 'amber', 3)
        }
      }

      // 枪声列表修剪
      while (ctx.shots.length > 0 && ctx.time - ctx.shots[0].t > 2.5) ctx.shots.shift()

      // 尸体清理
      for (let i = this.corpses.length - 1; i >= 0; i--) {
        if (ctx.time - this.corpses[i].t > 22) {
          this.corpses[i].ch.removeModel(ctx.scene)
          this.corpses.splice(i, 1)
        }
      }

      ctx.hud.update(dt, ctx)
      if (this.invUI.open) {
        // 背包实时刷新（低频）
        if (Math.floor(ctx.time * 2) !== Math.floor((ctx.time - dt) * 2)) this.invUI.render(ctx)
      }
    }

    // 太阳跟随玩家（保证阴影贴图覆盖）
    const p = this.ctx.player.pos
    this.sun.position.set(p.x + 120, p.y + 190, p.z + 60)
    this.sun.target.position.set(p.x, p.y, p.z)

    this.cam.update(dt, ctx)
    ctx.fx.update(dt)
    ctx.loot.update(dt, ctx.time)
    ctx.sfx.setListener(ctx.camera.position, ctx.player.yaw)
    ctx.input.endFrame()
    this.renderer.render(ctx.scene, ctx.camera)
  }
}
