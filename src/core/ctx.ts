import type * as THREE from 'three'
import type { World } from '../world/world'
import type { LootSystem } from '../items/loot'
import type { Effects } from '../fx/effects'
import type { Sfx } from './sfx'
import type { SafeZone } from '../zone/zone'
import type { Combat } from '../combat/combat'
import type { HUD } from '../ui/hud'
import type { Input } from './input'
import type { Player } from '../entities/player'
import type { Bot } from '../entities/bot'
import type { Character } from '../entities/character'
import type { PlaneRide } from '../world/plane'
import type { Vehicle } from '../world/vehicle'
import type { WorldEvents } from '../world/events/worldEvents'

export type GameState = 'plane' | 'drop' | 'play' | 'end'

export interface ShotEvent {
  x: number; y: number; z: number
  t: number
  loud: number
  shooter: Character
}

/** 各子系统共享的游戏上下文 */
export interface Ctx {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  world: World
  loot: LootSystem
  fx: Effects
  sfx: Sfx
  zone: SafeZone
  combat: Combat
  events: WorldEvents
  hud: HUD
  input: Input
  player: Player
  plane: PlaneRide | null
  vehicles: Vehicle[]
  bots: Bot[]
  chars: Character[]
  time: number
  state: GameState
  shots: ShotEvent[]
  aliveCount: number
  graceUntil: number
  kill(victim: Character, attacker: Character | null, weaponName: string): void
}
