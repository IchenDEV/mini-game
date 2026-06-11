import * as THREE from 'three'

/**
 * cinematicMaterials：全局 MeshStandardMaterial 工厂（带缓存）。
 * 建筑、车辆、角色、武器统一从这里取材质，保证同参数只创建一份；
 * 地形 / 植被 / 草等大批量实例仍走轻量 Lambert，不经过本工厂。
 */

export interface SurfaceOptions {
  color: number
  map?: THREE.Texture
  roughness?: number
  metalness?: number
  emissive?: number
  alphaTest?: number
  transparent?: boolean
  opacity?: number
  flatShading?: boolean
  side?: THREE.Side
}

const cache = new Map<string, THREE.MeshStandardMaterial>()

export function surface(opts: SurfaceOptions): THREE.MeshStandardMaterial {
  const key = [
    opts.color, opts.map?.uuid ?? '', opts.roughness ?? 0.85, opts.metalness ?? 0,
    opts.emissive ?? 0, opts.alphaTest ?? 0, opts.transparent ? 1 : 0, opts.opacity ?? 1,
    opts.flatShading ? 1 : 0, opts.side ?? THREE.FrontSide,
  ].join('|')
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: opts.color,
      map: opts.map ?? null,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flatShading ?? false,
      side: opts.side ?? THREE.FrontSide,
    })
    if (opts.emissive) m.emissive.setHex(opts.emissive)
    if (opts.alphaTest) m.alphaTest = opts.alphaTest
    if (opts.transparent) {
      m.transparent = true
      m.opacity = opts.opacity ?? 1
      m.depthWrite = (opts.opacity ?? 1) > 0.8
    }
    cache.set(key, m)
  }
  return m
}

// ---- 常用表面预设（粗糙度 / 金属度按真实材质标定）----

/** 木材：粗糙无金属 */
export const wood = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.8, metalness: 0 })

/** 涂装金属（枪身 / 车身 / 集装箱） */
export const metal = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.45, metalness: 0.35 })

/** 裸金属（枪管 / 管线，反射更强） */
export const bareMetal = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.34, metalness: 0.7 })

/** 布料（服装 / 战术装具 / 帐篷） */
export const cloth = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.9, metalness: 0 })

/** 哑光聚合物（枪托 / 头盔 / 塑料件） */
export const polymer = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.58, metalness: 0.06 })

/** 皮肤 */
export const skin = (color: number) =>
  surface({ color, roughness: 0.62, metalness: 0 })

/** 玻璃（窗 / 风挡 / 镜片） */
export const glass = (color = 0x9fc4d4) =>
  surface({ color, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.38 })

/** 砖石 / 灰泥 / 混凝土等粗糙墙体 */
export const masonry = (color: number, map?: THREE.Texture) =>
  surface({ color, map, roughness: 0.94, metalness: 0 })
