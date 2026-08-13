import * as THREE from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { CINEMATIC_HIGH } from '../rendering/quality'
import { createPostProcessing } from '../rendering/postProcessing'
import { createLighting, applyEnvironment } from '../rendering/lighting'
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
import { PlaneRide } from '../world/plane'
import { Vehicle, type VehicleKind } from '../world/vehicle'
import { MAPS, MapConfig } from '../world/mapConfig'
import { WorldEvents } from '../world/events/worldEvents'
import { pickWeather, WeatherFX } from '../world/weather'
import { TPCamera } from './camera'
import { Viewmodel } from '../rendering/viewmodel'
import { RNG } from '../utils/rng'
import { clamp } from '../utils/math'
import type { Ctx } from './ctx'

export class Game {
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private ctx: Ctx
  private cfg: MapConfig
  private cam = new TPCamera()
  private vm = new Viewmodel()
  private invUI = new InventoryUI()
  private corpses: { ch: Character; t: number }[] = []
  private started = false
  private ended = false
  private lastZoneIdx = -1
  private sun: THREE.DirectionalLight
  private clock = new THREE.Clock()
  private weatherFX: WeatherFX
  private windMul = 1

  private kill = (victim: Character, attacker: Character | null, weaponName: string) => {
    const ctx = this.ctx
    if (!victim.alive) return
    victim.lieDown(attacker)
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

  constructor(container: HTMLElement, mapId = 'grassland') {
    const cfg = MAPS[mapId] ?? MAPS.grassland
    this.cfg = cfg
    const biome = cfg.biome

    const quality = CINEMATIC_HIGH
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = quality.exposure
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    // 环境氛围由生物群系 + 本局天气共同决定
    const urlQ = new URLSearchParams(location.search)
    // 调试参数：?bots=N 覆盖 AI 数量（验证场景用）
    const botsOverride = urlQ.get('bots')
    if (botsOverride !== null) cfg.botCount = Math.max(0, parseInt(botsOverride) || 0)
    const weather = pickWeather(biome, urlQ.get('weather'))
    this.windMul = weather.windMul
    const fogColor = new THREE.Color(biome.fogColor).lerp(new THREE.Color(weather.fogTint), weather.fogTintAmt)
    const scene = new THREE.Scene()
    scene.background = fogColor.clone()
    scene.fog = new THREE.Fog(fogColor, biome.fogNear * weather.fogNearMul, biome.fogFar * weather.fogFarMul)

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, cfg.half * 2.6)
    camera.position.set(0, cfg.planeAlt + 10, 0)
    // 相机入场景图：第一人称 viewmodel 挂相机下渲染
    scene.add(camera)
    this.vm.attach(camera)

    const lights = createLighting(scene, biome, quality)
    lights.sun.intensity *= weather.sunMul
    lights.hemi.intensity *= weather.hemiMul
    this.sun = lights.sun
    applyEnvironment(renderer, scene)
    this.composer = createPostProcessing(renderer, scene, camera, quality)
    const composer = this.composer

    // 世界与系统
    const world = new World(cfg, weather)
    world.build(scene)
    this.weatherFX = new WeatherFX(weather, scene)
    const fx = new Effects(scene)
    const loot = new LootSystem(scene, world, fx)
    loot.spawnInitial()
    const sfx = new Sfx()
    const input = new Input(renderer.domElement)
    const hud = new HUD()
    const combat = new Combat()
    const rng = new RNG((Date.now() % 1000000007) + 11)
    const zone = new SafeZone(scene, rng, cfg.zonePhases, cfg.half * 0.09)
    const player = new Player()

    // 运输机航线：随机方向，穿过安全区中心附近
    const plane = new PlaneRide(
      scene,
      rng.range(0, Math.PI * 2),
      zone.cur.x + rng.range(-cfg.half * 0.2, cfg.half * 0.2),
      zone.cur.z + rng.range(-cfg.half * 0.2, cfg.half * 0.2),
      cfg.half, cfg.planeAlt, cfg.planeSpeed,
    )

    this.ctx = {
      scene, camera, world, loot, fx, sfx, zone, combat, events: new WorldEvents(), hud, input, player, plane,
      vehicles: [], bots: [], chars: [], time: 0, state: 'plane', shots: [],
      aliveCount: cfg.botCount + 1, graceUntil: 40,
      kill: this.kill,
    }
    this.weatherFX.bindLightning(lights.hemi, scene, () => sfx.thunder())

    player.init(scene, plane.x, plane.z)
    this.ctx.chars.push(player)

    // AI：每人分配落点，跳伞里程取航线上最近处加抖动
    const spawns = [...world.botSpawns]
    for (let i = spawns.length - 1; i > 0; i--) {
      const j = rng.int(0, i)
      const tmp = spawns[i]; spawns[i] = spawns[j]; spawns[j] = tmp
    }
    for (let i = 0; i < cfg.botCount; i++) {
      const bot = new Bot(rng.int(1, 1 << 30))
      bot.name = botName(i)
      const sp = spawns[i % spawns.length]
      bot.init(scene, sp.x + rng.range(-3, 3), sp.z + rng.range(-3, 3), this.ctx)
      bot.jumpS = clamp(plane.sAtNearest(sp.x, sp.z) + rng.range(-60, 60), plane.len * 0.06, plane.len * 0.94)
      this.ctx.bots.push(bot)
      this.ctx.chars.push(bot)
    }
    this.ctx.aliveCount = this.ctx.chars.length

    // 载具：按地图分布车型（沙漠多皮卡、雨林多吉普、草原偏均衡）
    const vehiclePool: VehicleKind[] =
      cfg.biome.id === 'desert' ? ['pickup', 'pickup', 'buggy', 'van']
      : cfg.biome.id === 'jungle' ? ['buggy', 'buggy', 'pickup']
      : ['buggy', 'pickup', 'van', 'buggy']
    for (let i = 0; i < world.vehicleSpawns.length; i++) {
      const vs = world.vehicleSpawns[i]
      const g = world.groundHeight(vs.x, vs.z)
      this.ctx.vehicles.push(new Vehicle(scene, vs.x, vs.z, vs.yaw, g, vehiclePool[i % vehiclePool.length]))
    }

    // 顶栏地图名 + 锁定卡片地图说明（含本局天气）
    hud.setMapName(`${cfg.name} · ${cfg.subtitle} · ${weather.label}`)
    const lockSub = document.querySelector('#overlay-lock .lock-card p')
    if (lockSub) lockSub.textContent = `${cfg.name} — ${cfg.subtitle} · 天气：${weather.label}`

    // UI 接线
    document.getElementById('btn-lock')!.addEventListener('click', () => {
      sfx.ensure()
      sfx.ambientStart()
      if (this.weatherFX.def.rainCount > 0) {
        sfx.rainStart(this.weatherFX.def.kind === 'storm' ? 1 : 0.5)
      }
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
      composer.setSize(window.innerWidth, window.innerHeight)
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
      total: this.cfg.botCount + 1,
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
      if (ctx.input.pressed('KeyV')) {
        this.cam.firstPerson = !this.cam.firstPerson
        ctx.hud.notice(this.cam.firstPerson ? '第一人称视角' : '第三人称视角')
      }
      if (ctx.input.pressed('Escape') && this.invUI.open) {
        this.invUI.toggle(ctx, false)
        this.refreshLockOverlay()
      }
      ctx.player.blockInput = this.invUI.open

      // 运输机飞行与 AI 跳伞投放
      const pl = ctx.plane
      if (pl && !pl.done) {
        pl.update(dt, ctx.scene, ctx.fx)
        for (const bot of ctx.bots) {
          if (bot.inPlane && (pl.s >= bot.jumpS || pl.done)) {
            bot.jumpOut(pl.x + Math.random() * 4 - 2, pl.alt - 3, pl.z + Math.random() * 4 - 2)
          }
        }
        ctx.sfx.planeUpdate(pl.x, pl.alt, pl.z)
        if (pl.done) ctx.sfx.planeStop()
      }

      if (ctx.state === 'plane') {
        const plane = pl!
        // 机上视角环视
        if (!ctx.player.blockInput) {
          ctx.player.yaw -= ctx.input.mouseDX * 0.0023
          ctx.player.pitch = clamp(ctx.player.pitch - ctx.input.mouseDY * 0.0023, -1.3, 1.35)
        }
        ctx.player.pos.set(plane.x, plane.alt - 5.5, plane.z)
        const wantJump = !ctx.player.blockInput &&
          (ctx.input.pressed('Space') || ctx.input.pressed('KeyF') || ctx.input.pressed('KeyE'))
        if (wantJump || plane.done || plane.s >= plane.len - 55) {
          ctx.player.jumpOut(plane.x, plane.alt - 3.5, plane.z)
          ctx.state = 'drop'
          ctx.hud.banner('自由落体 — Shift/F 加速下降', 'amber', 2.6)
        }
      } else if (ctx.state === 'drop') {
        ctx.player.updateDrop(dt, ctx)
        if (!ctx.player.dropping) {
          ctx.state = 'play'
        }
      } else {
        ctx.player.updatePlay(dt, ctx)
      }

      for (const bot of ctx.bots) bot.update(dt, ctx)
      // 无人载具滑行
      for (const v of ctx.vehicles) {
        if (!v.occupied) v.idle(dt, ctx)
      }
      ctx.sfx.engineTick(dt)
      ctx.combat.update(ctx, dt)
      if (ctx.state !== 'plane') ctx.zone.update(dt, ctx)
      ctx.events.update(ctx, dt)

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

    // 玩家周围动态铺草（跨 cell 时重建）
    this.ctx.world.updateGrass(p.x, p.z)

    this.cam.update(dt, ctx)
    this.vm.update(dt, ctx, this.cam.firstPerson)
    ctx.fx.update(dt)
    ctx.loot.update(dt, ctx.time)
    ctx.sfx.setListener(ctx.camera.position, ctx.player.yaw)
    ctx.input.endFrame()
    ctx.world.windT.value += dt * this.windMul
    this.weatherFX.update(dt, ctx.time, ctx.camera.position, ctx.scene)
    this.composer.render()
  }
}
