import { BIOMES, BiomeDef } from './biome'

/**
 * mapConfigs：定义地图尺寸、主题、资源点、道路、安全区参数与 AI 规模。
 * 新增地图（雪地/海岛/城市…）：新建一个 MapConfig + 必要时新建 BiomeDef 即可。
 */

export type PoiKind = 'town' | 'village' | 'depot' | 'military' | 'farm' | 'gas' | 'ruins' | 'camp' | 'huts'

export interface PoiDef {
  kind: PoiKind
  name: string
  x: number
  z: number
  r: number
  /** 资源等级 1-3：决定战利品质量与 AI 密度 */
  tier: number
}

export interface ZonePhase { r: number; wait: number; shrink: number; dps: number }

export interface RiverDef {
  /** z = z0 + sin(x·f1)·a1 + sin(x·f2 + p2)·a2 */
  z0: number; a1: number; f1: number; a2: number; f2: number; p2: number
  width: number
}

export interface MapConfig {
  id: string
  name: string
  subtitle: string
  biome: BiomeDef
  /** 地图半边长（米），可玩区域约 ±(half-40) */
  half: number
  seed: number
  river: RiverDef | null
  /** 沿河自动放桥的 x 坐标 */
  bridges: number[]
  pois: PoiDef[]
  roads: [number, number][][]
  forests: { x: number; z: number; r: number }[]
  loneHouses: number
  carWrecks: number
  /** 可驾驶载具数量 */
  vehicles: number
  botCount: number
  zonePhases: ZonePhase[]
  planeAlt: number
  planeSpeed: number
}

const ZONES_BIG: ZonePhase[] = [
  { r: 1050, wait: 70, shrink: 40, dps: 1 },
  { r: 640, wait: 55, shrink: 34, dps: 2 },
  { r: 390, wait: 45, shrink: 28, dps: 4 },
  { r: 235, wait: 36, shrink: 22, dps: 7 },
  { r: 135, wait: 28, shrink: 17, dps: 10 },
  { r: 70, wait: 22, shrink: 13, dps: 14 },
  { r: 0.01, wait: 16, shrink: 50, dps: 18 },
]

const ZONES_JUNGLE: ZonePhase[] = [
  { r: 980, wait: 60, shrink: 36, dps: 1 },
  { r: 580, wait: 48, shrink: 30, dps: 2.5 },
  { r: 350, wait: 40, shrink: 25, dps: 4.5 },
  { r: 210, wait: 32, shrink: 20, dps: 7 },
  { r: 120, wait: 25, shrink: 15, dps: 11 },
  { r: 60, wait: 20, shrink: 12, dps: 15 },
  { r: 0.01, wait: 14, shrink: 45, dps: 18 },
]

export const MAPS: Record<string, MapConfig> = {
  grassland: {
    id: 'grassland',
    name: '绿野围城',
    subtitle: '草原 · 乡村战场',
    biome: BIOMES.grassland,
    half: 1260,
    seed: 20260611,
    river: { z0: 440, a1: 110, f1: 0.003, a2: 60, f2: 0.0011, p2: 2.0, width: 34 },
    bridges: [60, -520, 640],
    pois: [
      { kind: 'town', name: '河畔镇', x: -380, z: -130, r: 95, tier: 1 },
      { kind: 'military', name: '军备库', x: 760, z: -380, r: 85, tier: 3 },
      { kind: 'depot', name: '北货场', x: -190, z: 780, r: 70, tier: 2 },
      { kind: 'farm', name: '老农场', x: 190, z: -880, r: 70, tier: 1 },
      { kind: 'town', name: '河口镇', x: 380, z: 1000, r: 90, tier: 2 },
      { kind: 'village', name: '南湾村', x: 570, z: 690, r: 60, tier: 1 },
      { kind: 'village', name: '西岭村', x: -880, z: 250, r: 60, tier: 1 },
      { kind: 'depot', name: '东郊仓库', x: 980, z: 320, r: 70, tier: 2 },
      { kind: 'gas', name: '十字加油站', x: 130, z: 230, r: 40, tier: 1 },
      { kind: 'ruins', name: '旧矿废墟', x: -690, z: -760, r: 65, tier: 2 },
      { kind: 'camp', name: '猎人营地', x: -310, z: -1060, r: 45, tier: 1 },
      { kind: 'camp', name: '高地哨所', x: 1060, z: -940, r: 50, tier: 2 },
    ],
    roads: [
      [[190, -1180], [190, -880], [130, -560], [60, -180], [60, 440], [-60, 780], [-190, 800], [-340, 950], [-340, 1180]],
      [[-1180, -130], [-820, -130], [-380, -130], [-180, -160], [60, -180], [320, -250], [540, -310], [760, -380], [980, -410], [1180, -410]],
      [[-380, -130], [-190, -440], [0, -690], [190, -880]],
      [[60, 440], [380, 700], [380, 1000], [380, 1180]],
      [[-880, 250], [-470, 240], [130, 230], [620, 280], [980, 320]],
      [[760, -380], [1010, -660], [1060, -940]],
      [[-690, -760], [-380, -480], [-180, -160]],
    ],
    forests: [
      { x: -700, z: 470, r: 240 }, { x: 500, z: 380, r: 200 }, { x: -790, z: -630, r: 230 },
      { x: 570, z: -820, r: 180 }, { x: -95, z: 280, r: 130 }, { x: 950, z: 900, r: 260 },
      { x: -1000, z: 900, r: 220 }, { x: 130, z: -350, r: 120 }, { x: 1000, z: -100, r: 150 },
    ],
    loneHouses: 26,
    carWrecks: 30,
    vehicles: 9,
    botCount: 36,
    zonePhases: ZONES_BIG,
    planeAlt: 240,
    planeSpeed: 115,
  },

  desert: {
    id: 'desert',
    name: '烈日荒原',
    subtitle: '沙漠 · 远距战场',
    biome: BIOMES.desert,
    half: 1260,
    seed: 99173,
    // 干河床：无水，河道成为可通行干谷
    river: { z0: -260, a1: 130, f1: 0.0026, a2: 70, f2: 0.001, p2: 0.7, width: 44 },
    bridges: [],
    pois: [
      { kind: 'town', name: '绿洲镇', x: 60, z: 60, r: 100, tier: 2 },
      { kind: 'military', name: '边防军营', x: -760, z: -690, r: 90, tier: 3 },
      { kind: 'gas', name: '47 号油站', x: 500, z: -440, r: 42, tier: 1 },
      { kind: 'gas', name: '北线油站', x: -380, z: 630, r: 42, tier: 1 },
      { kind: 'village', name: '公路镇', x: 820, z: 570, r: 70, tier: 1 },
      { kind: 'depot', name: '旧仓库区', x: -950, z: 380, r: 75, tier: 2 },
      { kind: 'ruins', name: '峡谷废墟', x: 380, z: -950, r: 70, tier: 2 },
      { kind: 'ruins', name: '荒村遗址', x: -250, z: -250, r: 55, tier: 1 },
      { kind: 'farm', name: '干河农庄', x: 950, z: -60, r: 65, tier: 1 },
      { kind: 'camp', name: '边境营地', x: -570, z: 980, r: 50, tier: 1 },
      { kind: 'depot', name: '矿区货站', x: 1000, z: 980, r: 70, tier: 2 },
      { kind: 'village', name: '南丘村', x: 130, z: 760, r: 58, tier: 1 },
    ],
    roads: [
      [[-1180, -690], [-760, -690], [-380, -520], [-60, -250], [60, 60], [130, 440], [130, 760], [130, 1180]],
      [[1180, 570], [820, 570], [440, 380], [60, 60], [-250, -250], [-570, -440], [-950, -440], [-1180, -440]],
      [[500, -440], [380, -700], [380, -950], [320, -1180]],
      [[-950, 380], [-630, 500], [-380, 630], [-130, 700], [130, 760]],
      [[820, 570], [950, 760], [1000, 980]],
      [[950, -60], [630, -250], [500, -440]],
    ],
    forests: [
      { x: 60, z: 100, r: 130 }, { x: 880, z: -150, r: 110 }, { x: -420, z: 700, r: 90 },
    ],
    loneHouses: 16,
    carWrecks: 44,
    vehicles: 13,
    botCount: 36,
    zonePhases: ZONES_BIG,
    planeAlt: 250,
    planeSpeed: 115,
  },

  jungle: {
    id: 'jungle',
    name: '雾林行动',
    subtitle: '雨林 · 近战战场',
    biome: BIOMES.jungle,
    half: 1260,
    seed: 4417731,
    river: { z0: -60, a1: 170, f1: 0.0024, a2: 90, f2: 0.0009, p2: 4.1, width: 30 },
    bridges: [-440, 250, 880],
    pois: [
      { kind: 'huts', name: '河谷竹寨', x: -440, z: 190, r: 70, tier: 1 },
      { kind: 'ruins', name: '密林神庙', x: 570, z: -500, r: 85, tier: 3 },
      { kind: 'camp', name: '雨林前哨', x: 130, z: 690, r: 55, tier: 2 },
      { kind: 'camp', name: '猎径营地', x: -760, z: -630, r: 50, tier: 1 },
      { kind: 'village', name: '河港村', x: 760, z: 440, r: 65, tier: 1 },
      { kind: 'depot', name: '伐木场', x: -820, z: 760, r: 70, tier: 2 },
      { kind: 'military', name: '山顶哨站', x: 950, z: -950, r: 75, tier: 3 },
      { kind: 'huts', name: '沼泽水屋', x: 250, z: -60, r: 55, tier: 1 },
      { kind: 'town', name: '瀑布镇', x: -250, z: -950, r: 85, tier: 2 },
      { kind: 'ruins', name: '废弃矿洞', x: -1010, z: -130, r: 60, tier: 2 },
      { kind: 'village', name: '雾谷村', x: 60, z: 1010, r: 60, tier: 1 },
    ],
    roads: [
      [[-250, -1180], [-250, -950], [-130, -630], [-60, -310], [-60, -60], [-130, 320], [-250, 630], [-440, 820], [-820, 760]],
      [[-1180, -130], [-1010, -130], [-690, -60], [-440, 190], [-130, 320], [250, 380], [570, 440], [760, 440], [1180, 500]],
      [[570, -500], [440, -250], [250, -60], [130, 250], [130, 690], [60, 1010]],
      [[950, -950], [760, -690], [570, -500]],
      [[-760, -630], [-500, -500], [-250, -310], [-60, -310]],
    ],
    forests: [
      { x: 0, z: 0, r: 1150 },
    ],
    loneHouses: 14,
    carWrecks: 18,
    vehicles: 6,
    botCount: 34,
    zonePhases: ZONES_JUNGLE,
    planeAlt: 260,
    planeSpeed: 115,
  },
}

export function randomMapId(): string {
  const ids = Object.keys(MAPS)
  return ids[Math.floor(Math.random() * ids.length)]
}
