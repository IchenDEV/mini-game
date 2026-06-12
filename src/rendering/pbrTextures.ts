import * as THREE from 'three'

/**
 * pbrTextures：CC0 实拍 PBR 纹理集加载（ambientCG，public/textures/）。
 * 每集三张：颜色（sRGB）/ 法线（GL 约定）/ 粗糙度。
 * TextureLoader 同步返回纹理对象、异步填充像素，与同步世界构建流程兼容；
 * 单张加载失败只影响该贴图槽（材质自动回退到纯色 + 程序化补充）。
 */

export type PbrSetId =
  | 'brick' | 'plaster' | 'concrete' | 'metalSiding' | 'roofTiles'
  | 'planks' | 'bark' | 'grass' | 'dirt' | 'sand' | 'metal' | 'fabric' | 'rock' | 'paintedMetal'

/** 集合 ID → 文件名前缀（public/textures/<prefix>_{col,nrm,rgh}.jpg） */
const FILES: Record<PbrSetId, string> = {
  brick: 'brick', plaster: 'plaster', concrete: 'concrete',
  metalSiding: 'metal_siding', roofTiles: 'roof_tiles',
  planks: 'planks', bark: 'bark', grass: 'grass', dirt: 'dirt',
  sand: 'sand', metal: 'metal', fabric: 'fabric', rock: 'rock',
  paintedMetal: 'painted_metal',
}

export interface PbrMaps {
  map: THREE.Texture
  normalMap: THREE.Texture | null
  roughnessMap: THREE.Texture | null
}

const loader = new THREE.TextureLoader()
const cache = new Map<string, PbrMaps>()
const assetBase = new URL(import.meta.env.BASE_URL, window.location.href)

function textureBaseUrl(id: PbrSetId): string {
  return new URL(`textures/${FILES[id]}`, assetBase).href
}

function loadOne(url: string, srgb: boolean, onFail?: () => void, repeatX = 1, repeatY = 1): THREE.Texture {
  const tex = loader.load(url, undefined, undefined, onFail)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * 取一套 PBR 贴图（缓存）。repeat 由材质使用方按世界尺寸设定（geoSized UV 已归一化到米）。
 */
export function pbr(id: PbrSetId): PbrMaps {
  let set = cache.get(id)
  if (!set) {
    const p = textureBaseUrl(id)
    const result: PbrMaps = {
      map: loadOne(`${p}_col.jpg`, true),
      normalMap: loadOne(`${p}_nrm.jpg`, false, () => { result.normalMap = null }),
      roughnessMap: loadOne(`${p}_rgh.jpg`, false, () => { result.roughnessMap = null }),
    }
    set = result
    cache.set(id, set)
  }
  return set
}

/** 独立 repeat 的贴图组（地形等需要不同平铺密度的场合） */
export function pbrRepeated(id: PbrSetId, repeatX: number, repeatY: number): PbrMaps {
  const p = textureBaseUrl(id)
  const result: PbrMaps = {
    map: loadOne(`${p}_col.jpg`, true, undefined, repeatX, repeatY),
    normalMap: loadOne(`${p}_nrm.jpg`, false, () => { result.normalMap = null }, repeatX, repeatY),
    roughnessMap: loadOne(`${p}_rgh.jpg`, false, () => { result.roughnessMap = null }, repeatX, repeatY),
  }
  return result
}
