import type * as THREE from 'three'
import * as TEX from './textures'

/**
 * biomeSystem：定义草原 / 沙漠 / 雨林的地形材质、植被、建筑风格与环境光。
 * 地图配置（mapConfig）引用某个 BiomeDef，世界生成器据此渲染。
 */

export type BiomeId = 'grassland' | 'desert' | 'jungle'

export interface BiomeDef {
  id: BiomeId
  /** 天空渐变（上→地平线） */
  sky: [string, string, string, string]
  fogColor: number
  /** 雾距（米） */
  fogNear: number
  fogFar: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  sunColor: number
  sunIntensity: number
  cloudCount: number
  cloudOpacity: number

  // 地形高度参数
  baseH: number
  hillAmp: number
  hillFreq: number
  detailAmp: number
  /** 沙丘长波（仅沙漠 > 0） */
  duneAmp: number
  waterY: number
  waterColor: number
  waterOpacity: number

  // 地表配色
  gBase: number
  gAlt: number
  gDry: number
  gLow: number
  gRock: number
  gRoad: number
  groundDetail: () => THREE.Texture

  // 植被
  treeCount: number
  forestChance: number
  openChance: number
  trunkColor: number
  canopyColors: number[]
  treeScale: [number, number]
  /** 树型：broad=阔叶 dead=枯树 palmish=高大雨林树 */
  treeForm: 'broad' | 'dead' | 'tall'
  cactusCount: number
  bushCount: number
  bushColors: number[]
  /** 玩家周围动态草量（约 ±170m 视野圈内的草簇数） */
  grassCount: number
  grassHue: number
  grassSat: number
  grassLight: number
  grassTint: number
  rockCount: number
  rockColors: number[]

  // 建筑风格
  houseWalls: number[]
  houseRoofs: number[]
  wallTexBias: { brick: number; plaster: number; wood: number }

  // 战斗节奏
  botSkillMul: number
  /** AI 视野系数（雨林更短） */
  aiVisionMul: number
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  grassland: {
    id: 'grassland',
    sky: ['#7fa6c8', '#aec8da', '#cdd9e0', '#d8dcd8'],
    fogColor: 0xc4d2dc, fogNear: 310, fogFar: 1300,
    hemiSky: 0xdcebf7, hemiGround: 0x68754f, hemiIntensity: 0.95,
    sunColor: 0xfff2dd, sunIntensity: 1.9,
    cloudCount: 14, cloudOpacity: 0.55,

    baseH: 6, hillAmp: 13, hillFreq: 0.0042, detailAmp: 1.1, duneAmp: 0,
    waterY: 0, waterColor: 0x3f7f96, waterOpacity: 0.85,

    gBase: 0x6f8b4f, gAlt: 0x86975a, gDry: 0x9aa05c, gLow: 0xc7b483, gRock: 0x7e7f78, gRoad: 0xa08868,
    groundDetail: TEX.grassDetail,

    treeCount: 3400, forestChance: 0.95, openChance: 0.14,
    trunkColor: 0x6b5236,
    canopyColors: [0x4d6b3a, 0x5a7a40, 0x6b8a4a, 0x46603a, 0x7d8a4d],
    treeScale: [0.8, 1.5], treeForm: 'broad',
    cactusCount: 0,
    bushCount: 1300, bushColors: [0x44603c, 0x52703f, 0x5d6e3c],
    grassCount: 11000, grassHue: 0.21, grassSat: 0.34, grassLight: 0.5, grassTint: 0xa8b478,
    rockCount: 650, rockColors: [0x7e7f78, 0x8a8a82, 0x6e6f6a],

    houseWalls: [0xd5c6ae, 0xc9b89c, 0xb6bdc2, 0xccbaa0],
    houseRoofs: [0xb05a40, 0x88959f, 0x9a7a55],
    wallTexBias: { brick: 0.45, plaster: 0.55, wood: 0 },

    botSkillMul: 1, aiVisionMul: 1,
  },

  desert: {
    id: 'desert',
    sky: ['#8db4d4', '#c4d3da', '#e8d9bc', '#f0e2c0'],
    fogColor: 0xe8dcc0, fogNear: 430, fogFar: 1700,
    hemiSky: 0xfdeed2, hemiGround: 0x9d8866, hemiIntensity: 0.92,
    sunColor: 0xfff0d0, sunIntensity: 2.25,
    cloudCount: 5, cloudOpacity: 0.35,

    baseH: 7, hillAmp: 9, hillFreq: 0.0036, detailAmp: 0.8, duneAmp: 14,
    waterY: -60, waterColor: 0x3f7f96, waterOpacity: 0.85,

    gBase: 0xc9ad77, gAlt: 0xd6bb84, gDry: 0xb5945e, gLow: 0xdcc89a, gRock: 0x97825f, gRoad: 0x8e7c5e,
    groundDetail: TEX.sandDetail,

    treeCount: 420, forestChance: 0.5, openChance: 0.05,
    trunkColor: 0x7a6248,
    canopyColors: [0x8a8a55, 0x9a8e58, 0x7d7a48],
    treeScale: [0.7, 1.2], treeForm: 'dead',
    cactusCount: 380,
    bushCount: 700, bushColors: [0x8a8455, 0x96885a, 0x7d7548],
    grassCount: 1600, grassHue: 0.14, grassSat: 0.25, grassLight: 0.52, grassTint: 0xbfae78,
    rockCount: 1400, rockColors: [0xa28a64, 0x8d7a58, 0xb09a72],

    houseWalls: [0xe0cfae, 0xd5c29c, 0xccb893, 0xc2b091],
    houseRoofs: [0xb88a58, 0xa3805c, 0x8a949e],
    wallTexBias: { brick: 0.3, plaster: 0.7, wood: 0 },

    botSkillMul: 1.05, aiVisionMul: 1.25,
  },

  jungle: {
    id: 'jungle',
    // 雨林保留雾气，但抬高天空补光与太阳强度，避免中间调发黑
    sky: ['#5f8a9c', '#8fb3b4', '#b8ccb8', '#c6d2bc'],
    fogColor: 0xafc3ae, fogNear: 165, fogFar: 850,
    hemiSky: 0xd6e8da, hemiGround: 0x55694e, hemiIntensity: 1.12,
    sunColor: 0xeef5dc, sunIntensity: 1.8,
    cloudCount: 18, cloudOpacity: 0.7,

    baseH: 7, hillAmp: 21, hillFreq: 0.005, detailAmp: 1.6, duneAmp: 0,
    waterY: 0.4, waterColor: 0x3e7066, waterOpacity: 0.88,

    gBase: 0x42603a, gAlt: 0x567540, gDry: 0x6d7d46, gLow: 0x8d845c, gRock: 0x66695c, gRoad: 0x77624a,
    groundDetail: TEX.jungleDetail,

    treeCount: 13000, forestChance: 0.97, openChance: 0.42,
    trunkColor: 0x53462f,
    canopyColors: [0x2c4a28, 0x35592e, 0x3f6a35, 0x28401f, 0x4a7240],
    treeScale: [1.1, 2.2], treeForm: 'tall',
    cactusCount: 0,
    bushCount: 4200, bushColors: [0x2e4a2a, 0x3a5c32, 0x44663a],
    grassCount: 14000, grassHue: 0.3, grassSat: 0.4, grassLight: 0.45, grassTint: 0x7e9a5e,
    rockCount: 700, rockColors: [0x6c705f, 0x5d6354, 0x7a7e6c],

    houseWalls: [0xab9a75, 0x9e8c6a, 0xb6a886],
    houseRoofs: [0x6e8252, 0x82705a, 0x687458],
    wallTexBias: { brick: 0.15, plaster: 0.25, wood: 0.6 },

    botSkillMul: 0.95, aiVisionMul: 0.62,
  },
}
