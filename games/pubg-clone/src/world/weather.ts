import * as THREE from 'three'
import type { BiomeDef, BiomeId } from './biome'

/**
 * weatherSystem：每局开场抽取天气（晴 / 阴 / 雨 / 暴雨），
 * 修正光照、雾距、天空与风力，雨天附带雨幕粒子与雷电。
 */

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm'

export interface WeatherDef {
  kind: WeatherKind
  label: string
  /** 太阳直射强度系数 */
  sunMul: number
  hemiMul: number
  fogNearMul: number
  fogFarMul: number
  /** 雾色向该色偏移的比例（0 不偏） */
  fogTint: number
  fogTintAmt: number
  /** 天空渐变覆盖（null 用 biome 默认） */
  skyOverride: [string, string, string, string] | null
  cloudMul: number
  /** 云体压暗（0 不变 → 1 全黑） */
  cloudDark: number
  /** 雨幕线段数（0 = 无雨） */
  rainCount: number
  /** 雷电：平均间隔秒（0 = 无雷） */
  lightningEvery: number
  /** 草树风力倍率 */
  windMul: number
}

const DEFS: Record<WeatherKind, WeatherDef> = {
  clear: {
    kind: 'clear', label: '晴',
    sunMul: 1, hemiMul: 1, fogNearMul: 1, fogFarMul: 1,
    fogTint: 0x000000, fogTintAmt: 0, skyOverride: null,
    cloudMul: 1, cloudDark: 0, rainCount: 0, lightningEvery: 0, windMul: 1,
  },
  overcast: {
    kind: 'overcast', label: '阴',
    sunMul: 0.62, hemiMul: 0.92, fogNearMul: 0.72, fogFarMul: 0.82,
    fogTint: 0x9aa4ac, fogTintAmt: 0.45,
    skyOverride: ['#7d8d9a', '#97a5ae', '#aab4b8', '#b8bcb8'],
    cloudMul: 2.2, cloudDark: 0.28, rainCount: 0, lightningEvery: 0, windMul: 1.35,
  },
  rain: {
    kind: 'rain', label: '雨',
    sunMul: 0.42, hemiMul: 0.78, fogNearMul: 0.5, fogFarMul: 0.62,
    fogTint: 0x8a949c, fogTintAmt: 0.6,
    skyOverride: ['#6d7d8a', '#84929c', '#98a2a6', '#a5a9a5'],
    cloudMul: 2.8, cloudDark: 0.4, rainCount: 1300, lightningEvery: 0, windMul: 1.7,
  },
  storm: {
    kind: 'storm', label: '暴雨',
    sunMul: 0.3, hemiMul: 0.66, fogNearMul: 0.38, fogFarMul: 0.5,
    fogTint: 0x76828c, fogTintAmt: 0.7,
    skyOverride: ['#56646f', '#6d7a84', '#838c90', '#90938e'],
    cloudMul: 3.4, cloudDark: 0.52, rainCount: 2400, lightningEvery: 11, windMul: 2.3,
  },
}

/** 各地图天气概率（沙漠几乎不下雨，雨林多雨） */
const ODDS: Record<BiomeId, [WeatherKind, number][]> = {
  grassland: [['clear', 0.46], ['overcast', 0.26], ['rain', 0.2], ['storm', 0.08]],
  desert: [['clear', 0.74], ['overcast', 0.22], ['rain', 0.04], ['storm', 0]],
  jungle: [['clear', 0.3], ['overcast', 0.26], ['rain', 0.28], ['storm', 0.16]],
}

export function pickWeather(biome: BiomeDef, forced?: string | null): WeatherDef {
  if (forced && forced in DEFS) return DEFS[forced as WeatherKind]
  const odds = ODDS[biome.id]
  let roll = Math.random()
  for (const [kind, p] of odds) {
    roll -= p
    if (roll <= 0) return DEFS[kind]
  }
  return DEFS.clear
}

/**
 * 雨幕 + 雷电特效。雨用一组竖向线段跟随相机循环下落，
 * 雷电随机间隔触发：半球光短暂提亮 + 延迟雷声。
 */
export class WeatherFX {
  readonly def: WeatherDef
  private rain: THREE.LineSegments | null = null
  private rainPos: Float32Array | null = null
  private rainVel: Float32Array | null = null
  private readonly rainR = 26
  private readonly rainH = 30
  /** 闪电状态：>0 表示余辉剩余秒数 */
  private flash = 0
  private nextBolt = 0
  private thunderAt = 0
  private hemi: THREE.HemisphereLight | null = null
  private hemiBase = 1
  private bgBase = new THREE.Color()
  private onThunder: (() => void) | null = null

  constructor(def: WeatherDef, scene: THREE.Scene) {
    this.def = def
    if (def.rainCount > 0) {
      const n = def.rainCount
      const pos = new Float32Array(n * 6)
      const vel = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * this.rainR
        const x = Math.cos(a) * r, z = Math.sin(a) * r
        const y = Math.random() * this.rainH
        const len = 0.55 + Math.random() * 0.5
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = y + len; pos[i * 6 + 5] = z
        vel[i] = 19 + Math.random() * 9
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.LineBasicMaterial({
        color: 0xb8c4cc, transparent: true, opacity: def.kind === 'storm' ? 0.34 : 0.26,
        fog: false, depthWrite: false,
      })
      this.rain = new THREE.LineSegments(geo, mat)
      this.rain.frustumCulled = false
      this.rain.renderOrder = 5
      scene.add(this.rain)
      this.rainPos = pos
      this.rainVel = vel
    }
    if (def.lightningEvery > 0) {
      this.nextBolt = def.lightningEvery * (0.5 + Math.random())
    }
  }

  /** 绑定雷电提亮目标与雷声回调（Game 创建灯光后调用） */
  bindLightning(hemi: THREE.HemisphereLight, scene: THREE.Scene, onThunder: () => void) {
    this.hemi = hemi
    this.hemiBase = hemi.intensity
    if (scene.background instanceof THREE.Color) this.bgBase.copy(scene.background)
    this.onThunder = onThunder
  }

  update(dt: number, time: number, cam: THREE.Vector3, scene: THREE.Scene) {
    // ---- 雨幕：相对相机循环下落 ----
    if (this.rain && this.rainPos && this.rainVel) {
      this.rain.position.set(cam.x, cam.y - this.rainH * 0.45, cam.z)
      const pos = this.rainPos, vel = this.rainVel
      const n = vel.length
      for (let i = 0; i < n; i++) {
        const dy = vel[i] * dt
        pos[i * 6 + 1] -= dy
        pos[i * 6 + 4] -= dy
        if (pos[i * 6 + 1] < 0) {
          // 回到顶部并重新随机水平位置（避免相机移动后雨幕镂空）
          const a = Math.random() * Math.PI * 2
          const r = Math.sqrt(Math.random()) * this.rainR
          const x = Math.cos(a) * r, z = Math.sin(a) * r
          const len = 0.55 + Math.random() * 0.5
          pos[i * 6] = x; pos[i * 6 + 2] = z
          pos[i * 6 + 3] = x; pos[i * 6 + 5] = z
          pos[i * 6 + 1] = this.rainH
          pos[i * 6 + 4] = this.rainH + len
        }
      }
      ;(this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    }
    // ---- 雷电 ----
    if (this.def.lightningEvery > 0 && this.hemi) {
      if (this.flash > 0) {
        this.flash -= dt
        const k = Math.max(0, this.flash / 0.14)
        this.hemi.intensity = this.hemiBase * (1 + 2.6 * k)
        if (scene.background instanceof THREE.Color) {
          scene.background.copy(this.bgBase).lerp(new THREE.Color(0xdce8f2), 0.55 * k)
        }
      }
      if (time > this.nextBolt) {
        this.flash = 0.14
        this.nextBolt = time + this.def.lightningEvery * (0.55 + Math.random() * 0.9)
        this.thunderAt = time + 0.5 + Math.random() * 1.6
      }
      if (this.thunderAt > 0 && time > this.thunderAt) {
        this.thunderAt = 0
        this.onThunder?.()
      }
    }
  }
}
