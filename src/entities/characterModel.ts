import * as THREE from 'three'
import { surface, cloth, skin as skinMat, polymer } from '../rendering/materials'
import { fabric, camo } from '../world/textures'

/**
 * characterModel：角色身体程序化模型（与逻辑解耦）。
 * 输出关节组引用（rig），由 Character 持有并交给动画系统驱动。
 * 细节件：肩带、胸挂、弹匣包、水袋背包、电台天线、手套、护膝、
 * 靴带、通讯耳机、作训帽 + 帽檐、简化五官。
 */

let fabricTexCache: THREE.Texture | null = null
function getFabricTex(): THREE.Texture {
  if (!fabricTexCache) fabricTexCache = fabric()
  return fabricTexCache
}

/** 迷彩贴图按服装基色缓存（贴图自带颜色） */
const camoTexCache = new Map<number, THREE.Texture>()
function getCamoTex(color: number): THREE.Texture {
  let t = camoTexCache.get(color)
  if (!t) {
    t = camo(color)
    camoTexCache.set(color, t)
  }
  return t
}

export interface CharacterRig {
  model: THREE.Group
  upper: THREE.Group
  headGrp: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  gunGroup: THREE.Group
  muzzleObj: THREE.Object3D
  headMesh: THREE.Mesh
}

export interface CharacterModelOptions {
  bodyColor: number
  skinColor?: number
}

export function buildCharacterModel(opts: CharacterModelOptions): CharacterRig {
  const bodyColor = opts.bodyColor
  const skinColor = opts.skinColor ?? 0xc9a583
  const camoTex = getCamoTex(bodyColor)
  const fabricTex = getFabricTex()

  // 迷彩自带颜色，上下身用色相区分（裤子压暗）；布料走 PBR cloth 粗糙度
  const matBody = surface({ color: 0xffffff, map: camoTex, roughness: 0.88 })
  const matPants = surface({ color: 0xb4b6ac, map: camoTex, roughness: 0.9 })
  const matGear = cloth(0x474d42, fabricTex)
  const matDark = cloth(0x2e3230, fabricTex)
  const matSkin = skinMat(skinColor)
  const matBoot = polymer(0x33342e)
  const matStrap = cloth(0x3a3f38, fabricTex)

  const model = new THREE.Group()
  const upper = new THREE.Group()
  const headGrp = new THREE.Group()
  const legL = new THREE.Group(), legR = new THREE.Group()
  const kneeL = new THREE.Group(), kneeR = new THREE.Group()
  const armL = new THREE.Group(), armR = new THREE.Group()
  const elbowL = new THREE.Group(), elbowR = new THREE.Group()
  const gunGroup = new THREE.Group()
  const muzzleObj = new THREE.Object3D()

  const mk = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = shadow
    parent.add(m)
    return m
  }

  model.rotation.order = 'YXZ'

  // ---- 骨盆 ----
  mk(model, new THREE.BoxGeometry(0.38, 0.2, 0.25), matPants, 0, 0.97, 0)

  // ---- 腿（大腿 → 膝 → 小腿 + 战术靴）----
  const thighGeo = new THREE.CapsuleGeometry(0.105, 0.3, 3, 8)
  const calfGeo = new THREE.CapsuleGeometry(0.085, 0.28, 3, 8)
  for (const [hip, knee, sx] of [[legL, kneeL, -0.13], [legR, kneeR, 0.13]] as [THREE.Group, THREE.Group, number][]) {
    hip.position.set(sx, 0.92, 0)
    mk(hip, thighGeo, matPants, 0, -0.21, 0)
    knee.position.set(0, -0.45, 0)
    mk(knee, calfGeo, matPants, 0, -0.18, 0)
    // 护膝
    mk(knee, new THREE.BoxGeometry(0.12, 0.1, 0.05), matDark, 0, -0.04, 0.075)
    // 靴 + 鞋底 + 靴带
    mk(knee, new THREE.BoxGeometry(0.15, 0.12, 0.27), matBoot, 0, -0.4, 0.045)
    mk(knee, new THREE.BoxGeometry(0.16, 0.035, 0.29), matDark, 0, -0.465, 0.05)
    mk(knee, new THREE.BoxGeometry(0.155, 0.025, 0.06), matStrap, 0, -0.37, 0.13, false)
    mk(knee, new THREE.BoxGeometry(0.155, 0.025, 0.06), matStrap, 0, -0.345, 0.05, false)
    hip.add(knee)
    model.add(hip)
  }
  // 右腿挂枪套
  mk(legR, new THREE.BoxGeometry(0.07, 0.2, 0.13), matDark, 0.1, -0.16, 0.03)

  // ---- 躯干 ----
  const torso = mk(upper, new THREE.BoxGeometry(0.48, 0.6, 0.26), matBody, 0, 1.26, 0)
  torso.receiveShadow = true
  // 肩部垫片 + 领口
  mk(upper, new THREE.BoxGeometry(0.13, 0.07, 0.2), matBody, -0.27, 1.53, 0)
  mk(upper, new THREE.BoxGeometry(0.13, 0.07, 0.2), matBody, 0.27, 1.53, 0)
  mk(upper, new THREE.BoxGeometry(0.2, 0.05, 0.18), matGear, 0, 1.575, 0)
  // 双肩带（胸挂吊带，过肩连到背包）
  for (const sx of [-0.14, 0.14]) {
    const strapF = mk(upper, new THREE.BoxGeometry(0.06, 0.3, 0.03), matStrap, sx, 1.42, 0.145)
    strapF.rotation.x = 0.1
    const strapT = mk(upper, new THREE.BoxGeometry(0.06, 0.03, 0.26), matStrap, sx, 1.555, 0)
    strapT.rotation.x = 0
    const strapB = mk(upper, new THREE.BoxGeometry(0.06, 0.26, 0.03), matStrap, sx, 1.44, -0.15)
    strapB.rotation.x = -0.08
  }
  // 战术胸挂：主板 + 三联弹匣包 + 杂物包
  mk(upper, new THREE.BoxGeometry(0.44, 0.3, 0.07), matGear, 0, 1.34, 0.155)
  for (const px of [-0.13, 0, 0.13]) {
    mk(upper, new THREE.BoxGeometry(0.1, 0.14, 0.05), matDark, px, 1.25, 0.2)
    mk(upper, new THREE.BoxGeometry(0.08, 0.02, 0.055), matStrap, px, 1.3, 0.2, false)
  }
  mk(upper, new THREE.BoxGeometry(0.16, 0.09, 0.05), matDark, 0.02, 1.43, 0.19)
  // 背部水袋包 + 电台 + 天线
  mk(upper, new THREE.BoxGeometry(0.3, 0.34, 0.08), matBody, 0, 1.32, -0.165)
  mk(upper, new THREE.BoxGeometry(0.1, 0.15, 0.06), matDark, 0.13, 1.43, -0.2)
  const ant = mk(upper, new THREE.CylinderGeometry(0.008, 0.005, 0.3, 4), matDark, 0.13, 1.64, -0.2, false)
  ant.rotation.z = -0.12
  // 腰带 + 侧包
  mk(upper, new THREE.BoxGeometry(0.5, 0.07, 0.28), matGear, 0, 0.995, 0)
  mk(upper, new THREE.BoxGeometry(0.09, 0.13, 0.15), matGear, -0.27, 0.93, 0.02)

  // ---- 头（颈 → 头组：五官 + 耳机 + 作训帽）----
  mk(upper, new THREE.CylinderGeometry(0.065, 0.078, 0.1, 8), matSkin, 0, 1.585, 0)
  headGrp.position.set(0, 1.68, 0)
  const headMesh = mk(headGrp, new THREE.SphereGeometry(0.165, 14, 11), matSkin, 0, 0, 0)
  // 简化五官：眉、眼、鼻、嘴（近看有人样，远看不抢轮廓）
  const matHair = polymer(0x3a322a)
  for (const ex of [-0.055, 0.055]) {
    mk(headGrp, new THREE.BoxGeometry(0.026, 0.016, 0.012), matDark, ex, 0.012, 0.152, false)
    mk(headGrp, new THREE.BoxGeometry(0.04, 0.01, 0.012), matHair, ex, 0.045, 0.15, false)
  }
  mk(headGrp, new THREE.BoxGeometry(0.022, 0.045, 0.025), matSkin, 0, -0.02, 0.158, false)
  mk(headGrp, new THREE.BoxGeometry(0.05, 0.008, 0.01), surface({ color: 0x8a5d4a, roughness: 0.7 }), 0, -0.075, 0.148, false)
  // 通讯耳机
  for (const ex of [-0.16, 0.16]) {
    const cup = mk(headGrp, new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8), matDark, ex, -0.01, 0, false)
    cup.rotation.z = Math.PI / 2
  }
  const band = mk(headGrp, new THREE.CylinderGeometry(0.17, 0.17, 0.03, 10, 1, false, -0.5, Math.PI + 1), matDark, 0, 0.02, 0, false)
  band.rotation.x = Math.PI / 2
  band.rotation.z = Math.PI / 2
  // 作训帽 + 帽檐
  const cap = mk(headGrp, new THREE.SphereGeometry(0.175, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), matBody, 0, 0.022, 0)
  cap.receiveShadow = true
  const brim = mk(headGrp, new THREE.CylinderGeometry(0.168, 0.188, 0.024, 10, 1, false, -0.6, 1.2), matBody, 0, 0.045, 0.1)
  brim.castShadow = false
  upper.add(headGrp)

  // ---- 手臂（肩 → 上臂 → 肘 → 前臂 + 战术手套）----
  const upperArmGeo = new THREE.CapsuleGeometry(0.07, 0.24, 3, 8)
  const foreArmGeo = new THREE.CapsuleGeometry(0.058, 0.22, 3, 8)
  const gloveGeo = new THREE.SphereGeometry(0.062, 8, 6)
  for (const [shoulder, elbow, sx] of [[armL, elbowL, -0.305], [armR, elbowR, 0.305]] as [THREE.Group, THREE.Group, number][]) {
    shoulder.position.set(sx, 1.51, 0.01)
    mk(shoulder, upperArmGeo, matBody, 0, -0.155, 0)
    // 臂章
    mk(shoulder, new THREE.BoxGeometry(0.025, 0.07, 0.06), matGear, sx > 0 ? 0.068 : -0.068, -0.1, 0, false)
    elbow.position.set(0, -0.32, 0)
    mk(elbow, foreArmGeo, matBody, 0, -0.135, 0)
    mk(elbow, gloveGeo, matDark, 0, -0.285, 0)
    // 护腕带
    mk(elbow, new THREE.CylinderGeometry(0.062, 0.062, 0.03, 8), matStrap, 0, -0.235, 0, false)
    shoulder.add(elbow)
    upper.add(shoulder)
  }

  // ---- 枪挂点 ----
  gunGroup.position.set(0.17, 1.39, 0.31)
  upper.add(gunGroup)
  model.add(upper)

  return {
    model, upper, headGrp,
    legL, legR, kneeL, kneeR,
    armL, armR, elbowL, elbowR,
    gunGroup, muzzleObj, headMesh,
  }
}
