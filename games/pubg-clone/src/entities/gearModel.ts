import * as THREE from 'three'
import { surface } from '../rendering/materials'
import { rbox, caps, cyl, dome } from '../rendering/smoothGeo'
import { pbr } from '../rendering/pbrTextures'

/**
 * gearModel：头盔 / 护甲 / 背包的三级程序化模型。
 * 等级差异做在轮廓上：第三人称距离即可分辨队友与敌人的装备水平。
 * 全部件平滑几何：盔壳球冠、护甲圆角板、背包圆角袋体。
 */

function fabricMat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  const f = pbr('fabric')
  return surface({
    color, normalMap: f.normalMap, roughnessMap: f.roughnessMap,
    normalScale: 0.55, roughness, metalness: 0,
  })
}

const shellMatOf = (c: number) => surface({ color: c, roughness: 0.5, metalness: 0.08 })

const mk = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = shadow
  parent.add(m)
  return m
}

export const HELMET_COLORS = [0, 0xb0a890, 0x5d7a4a, 0x32404c]
export const VEST_COLORS = [0, 0x7a8a99, 0x46698c, 0x2c3d52]

/**
 * 头盔（挂 headGrp 原点）：
 * 一级半盔 / 二级战术盔（带导轨与护耳）/ 三级全覆盔（带面罩）。
 */
export function buildHelmetModel(level: number): THREE.Group {
  const g = new THREE.Group()
  const c = HELMET_COLORS[level] ?? HELMET_COLORS[1]
  const shellMat = shellMatOf(c)
  const dark = surface({ color: 0x2a2e2c, roughness: 0.6, metalness: 0.05 })

  if (level <= 1) {
    // 半盔：薄壳 + 颌带
    mk(g, dome(0.195, Math.PI * 0.46, 22, 12), shellMat, 0, 0.018, 0)
    const strap = mk(g, cyl(0.166, 0.172, 0.02, 18, true), dark, 0, -0.05, 0, false)
    strap.rotation.z = 0.12
  } else if (level === 2) {
    // 战术盔：深壳 + 侧导轨 + 后枕加固
    mk(g, dome(0.2, Math.PI * 0.56, 24, 14), shellMat, 0, 0.012, 0)
    for (const sx of [-0.188, 0.188]) {
      mk(g, rbox(0.024, 0.05, 0.2, 0.01, 2), dark, sx, -0.02, 0.01)
    }
    mk(g, rbox(0.1, 0.06, 0.03, 0.012, 2), dark, 0, 0.02, -0.198)
    // 前缘护檐
    mk(g, rbox(0.16, 0.024, 0.05, 0.01, 2), shellMat, 0, 0.085, 0.168)
  } else {
    // 全覆盔：整壳 + 透明面罩 + 通气孔
    mk(g, dome(0.205, Math.PI * 0.62, 26, 16), shellMat, 0, 0.01, 0)
    const visorMat = surface({ color: 0x6a7d88, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    mk(g, new THREE.SphereGeometry(0.19, 18, 10, -0.85, 1.7, Math.PI * 0.32, Math.PI * 0.3), visorMat, 0, 0.012, 0.022, false)
    mk(g, rbox(0.2, 0.045, 0.06, 0.018, 2), dark, 0, -0.085, 0.135)
    for (const sx of [-0.06, 0.06]) {
      mk(g, cyl(0.012, 0.012, 0.02, 10), dark, sx, -0.08, 0.178, false)
    }
    mk(g, rbox(0.07, 0.04, 0.03, 0.012, 2), dark, 0, 0.1, -0.192)
  }
  return g
}

/**
 * 护甲（挂 upper，胸口中心 y≈1.27）：
 * 一级薄背心 / 二级战术背心（弹匣袋）/ 三级重型护板（肩甲 + 护颈）。
 */
export function buildVestModel(level: number): THREE.Group {
  const g = new THREE.Group()
  const c = VEST_COLORS[level] ?? VEST_COLORS[1]
  const mat = fabricMat(c)
  const dark = fabricMat(0x2c322f)
  const plate = surface({ color: new THREE.Color(c).multiplyScalar(0.8).getHex(), roughness: 0.5, metalness: 0.12 })

  if (level <= 1) {
    // 薄背心：前后软板 + 侧带
    mk(g, rbox(0.5, 0.4, 0.33, 0.06, 4), mat, 0, 1.27, 0)
    mk(g, rbox(0.52, 0.07, 0.35, 0.025, 3), dark, 0, 1.07, 0)
  } else if (level === 2) {
    // 战术背心：硬胸板 + 双弹匣袋 + 肩带
    mk(g, rbox(0.54, 0.44, 0.37, 0.07, 4), mat, 0, 1.27, 0)
    mk(g, rbox(0.4, 0.26, 0.05, 0.022, 3), plate, 0, 1.31, 0.2)
    for (const px of [-0.1, 0.04]) {
      mk(g, rbox(0.11, 0.15, 0.06, 0.02, 3), dark, px, 1.16, 0.215)
    }
    for (const sx of [-0.17, 0.17]) {
      mk(g, rbox(0.09, 0.05, 0.3, 0.02, 3), dark, sx, 1.515, 0)
    }
  } else {
    // 重型护板：厚壳 + 护颈 + 双肩甲 + 腹板
    mk(g, rbox(0.58, 0.48, 0.41, 0.08, 4), mat, 0, 1.27, 0)
    mk(g, rbox(0.44, 0.3, 0.06, 0.025, 3), plate, 0, 1.33, 0.22)
    mk(g, rbox(0.42, 0.26, 0.06, 0.025, 3), plate, 0, 1.31, -0.22)
    mk(g, rbox(0.3, 0.07, 0.22, 0.028, 3), plate, 0, 1.56, 0)
    for (const sx of [-0.3, 0.3]) {
      const sp = mk(g, dome(0.115, Math.PI * 0.5, 16, 8), plate, sx, 1.52, 0)
      sp.scale.set(1.1, 0.7, 1.05)
      sp.rotation.z = sx > 0 ? -0.28 : 0.28
    }
    mk(g, rbox(0.34, 0.12, 0.05, 0.022, 3), dark, 0, 1.05, 0.2)
  }
  return g
}

/**
 * 背包（挂 upper，背部 z 负向）：
 * 一级小包 / 二级登山包（侧袋 + 睡垫卷）/ 三级远征包（更高 + 顶包 + 杂物）。
 */
export function buildBagModel(level: number): THREE.Group {
  const g = new THREE.Group()
  const base = [0, 0x6e5a3c, 0x5d6248, 0x4e5345][level] ?? 0x6e5a3c
  const mat = fabricMat(base)
  const dark = fabricMat(0x3c382e)

  if (level <= 1) {
    mk(g, rbox(0.38, 0.4, 0.21, 0.07, 4), mat, 0, 1.28, -0.27)
    mk(g, rbox(0.24, 0.16, 0.06, 0.025, 3), dark, 0, 1.2, -0.39)
  } else if (level === 2) {
    mk(g, rbox(0.42, 0.52, 0.27, 0.08, 4), mat, 0, 1.27, -0.3)
    mk(g, rbox(0.28, 0.18, 0.08, 0.03, 3), dark, 0, 1.16, -0.45)
    for (const sx of [-0.235, 0.235]) {
      mk(g, rbox(0.08, 0.3, 0.18, 0.03, 3), dark, sx, 1.22, -0.3)
    }
    // 顶部睡垫卷
    const roll = mk(g, caps(0.07, 0.3, 5, 12), dark, 0, 1.58, -0.3)
    roll.rotation.z = Math.PI / 2
  } else {
    mk(g, rbox(0.46, 0.66, 0.31, 0.09, 4), mat, 0, 1.26, -0.32)
    mk(g, rbox(0.3, 0.2, 0.1, 0.035, 3), dark, 0, 1.1, -0.5)
    for (const sx of [-0.26, 0.26]) {
      mk(g, rbox(0.09, 0.4, 0.2, 0.035, 3), dark, sx, 1.22, -0.32)
    }
    // 顶包 + 捆扎带 + 卷垫
    mk(g, rbox(0.36, 0.16, 0.25, 0.05, 3), mat, 0, 1.66, -0.33)
    const roll = mk(g, caps(0.08, 0.32, 5, 12), dark, 0, 0.96, -0.36)
    roll.rotation.z = Math.PI / 2
    for (const sy of [1.18, 1.42]) {
      mk(g, rbox(0.47, 0.03, 0.32, 0.012, 2), fabricMat(0x2e2b24, 0.95), 0, sy, -0.32, false)
    }
  }
  return g
}
