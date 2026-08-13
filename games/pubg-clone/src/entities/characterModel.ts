import * as THREE from 'three'
import { surface, skin as skinMat } from '../rendering/materials'
import { rbox, caps, cyl, sph, dome, torus } from '../rendering/smoothGeo'
import { pbr } from '../rendering/pbrTextures'
import { camo } from '../world/textures'
import { getSkin, type SkinDef } from '../content/skins'

/**
 * characterModel：角色身体程序化模型（与逻辑解耦）。
 * 输出关节组引用（rig），由 Character 持有并交给动画系统驱动。
 * 全部件平滑几何（圆角盒 / 高细分胶囊球），织物实拍法线贴图；
 * 细节件：肩带、胸挂、弹匣包、水袋背包、电台天线、手套、护膝、
 * 靴带、通讯耳机、作训帽 + 帽檐、简化五官。
 */

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

/** 布料材质：实拍织物法线 + 粗糙度（颜色可调，模块级共享缓存由 surface 保证） */
function fabricMat(color: number, roughness = 0.92): THREE.MeshStandardMaterial {
  const f = pbr('fabric')
  return surface({
    color, normalMap: f.normalMap, roughnessMap: f.roughnessMap,
    normalScale: 0.55, roughness, metalness: 0,
  })
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
  /** 服装皮肤；缺省按 bodyColor 走旧迷彩路径 */
  skin?: SkinDef
}

// ---- 模块级共享几何（30 个角色复用同一份顶点数据）----

let torsoGeoCache: THREE.BufferGeometry | null = null
/** 收腰躯干：高细分圆角盒 + 肩宽腰窄剖面变形（无任何硬棱） */
function torsoGeo(): THREE.BufferGeometry {
  if (torsoGeoCache) return torsoGeoCache
  const g = rbox(0.47, 0.62, 0.28, 0.1, 5).clone()
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = (y + 0.31) / 0.62 // 0=髋 1=肩
    // 宽度曲线：髋 0.97 → 腰 0.88 → 胸 1.02 → 肩 1.0
    const wCurve = t < 0.35
      ? 0.97 + (0.88 - 0.97) * (t / 0.35)
      : t < 0.75
        ? 0.88 + (1.02 - 0.88) * ((t - 0.35) / 0.4)
        : 1.02 + (1.0 - 1.02) * ((t - 0.75) / 0.25)
    // 厚度曲线：腰薄胸厚
    const dCurve = 0.93 + 0.1 * Math.sin(t * Math.PI)
    pos.setX(i, pos.getX(i) * wCurve)
    pos.setZ(i, pos.getZ(i) * dCurve)
  }
  g.computeVertexNormals()
  torsoGeoCache = g
  return g
}

export function buildCharacterModel(opts: CharacterModelOptions): CharacterRig {
  const sk = opts.skin ?? { ...getSkin('woodland'), jacket: opts.bodyColor, pants: opts.bodyColor }
  const skinColor = opts.skinColor ?? sk.skinTone

  // 迷彩自带颜色（贴图从 jacket 色派生，裤子压暗区分）；纯色皮肤走织物法线材质
  const fab = pbr('fabric')
  const matBody = sk.camo
    ? surface({ color: 0xffffff, map: getCamoTex(sk.jacket), normalMap: fab.normalMap, normalScale: 0.5, roughness: 0.88 })
    : fabricMat(sk.jacket)
  const matPants = sk.camo
    ? surface({ color: 0xb4b6ac, map: getCamoTex(sk.jacket), normalMap: fab.normalMap, normalScale: 0.5, roughness: 0.9 })
    : fabricMat(sk.pants)
  const matGear = fabricMat(sk.gear)
  const matDark = fabricMat(sk.gloves)
  const matSkin = skinMat(skinColor)
  const matBoot = surface({ color: sk.boots, roughness: 0.52, metalness: 0.05 })
  const matStrap = fabricMat(0x3a3f38, 0.95)

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
  mk(model, rbox(0.4, 0.22, 0.27, 0.09, 4), matPants, 0, 0.97, 0)

  // ---- 腿（大腿 → 膝 → 小腿 + 战术靴）----
  const thighGeo = caps(0.108, 0.3, 6, 14)
  const calfGeo = caps(0.086, 0.28, 6, 14)
  for (const [hip, knee, sx] of [[legL, kneeL, -0.13], [legR, kneeR, 0.13]] as [THREE.Group, THREE.Group, number][]) {
    hip.position.set(sx, 0.92, 0)
    mk(hip, thighGeo, matPants, 0, -0.21, 0)
    knee.position.set(0, -0.45, 0)
    mk(knee, calfGeo, matPants, 0, -0.18, 0)
    // 护膝（弧面壳）
    const kneePad = mk(knee, dome(0.085, Math.PI * 0.52, 14, 7), matDark, 0, -0.03, 0.052)
    kneePad.rotation.x = Math.PI / 2 - 0.25
    kneePad.scale.set(0.8, 1, 0.85)
    // 靴 + 圆头鞋尖 + 鞋底 + 靴带
    mk(knee, rbox(0.15, 0.13, 0.24, 0.045, 4), matBoot, 0, -0.395, 0.02)
    const toe = mk(knee, sph(0.072, 14, 10), matBoot, 0, -0.42, 0.15)
    toe.scale.set(1.0, 0.82, 1.1)
    mk(knee, rbox(0.16, 0.04, 0.3, 0.015, 3), matDark, 0, -0.465, 0.05)
    mk(knee, cyl(0.082, 0.082, 0.05, 14), matStrap, 0, -0.345, 0.01, false)
    hip.add(knee)
    model.add(hip)
  }
  // 右腿挂枪套
  mk(legR, rbox(0.07, 0.2, 0.13, 0.025, 3), matDark, 0.1, -0.16, 0.03)

  // ---- 躯干 ----
  const torso = mk(upper, torsoGeo(), matBody, 0, 1.26, 0)
  torso.receiveShadow = true
  // 肩部三角肌鼓包（圆球穿插，肩头浑圆）
  for (const sx of [-0.255, 0.255]) {
    const sh = mk(upper, sph(0.095, 16, 12), matBody, sx, 1.5, 0.01)
    sh.scale.set(1.05, 0.9, 1.0)
  }
  // 领口
  mk(upper, cyl(0.1, 0.115, 0.07, 16), matGear, 0, 1.565, 0)
  // 双肩带（胸挂吊带，过肩连到背包）
  for (const sx of [-0.14, 0.14]) {
    const strapF = mk(upper, rbox(0.06, 0.3, 0.025, 0.01, 2), matStrap, sx, 1.42, 0.15)
    strapF.rotation.x = 0.1
    mk(upper, rbox(0.06, 0.025, 0.26, 0.01, 2), matStrap, sx, 1.553, 0)
    const strapB = mk(upper, rbox(0.06, 0.26, 0.025, 0.01, 2), matStrap, sx, 1.44, -0.152)
    strapB.rotation.x = -0.08
  }
  // 战术胸挂：主板 + 三联弹匣包 + 杂物包（全部圆角）
  mk(upper, rbox(0.42, 0.3, 0.06, 0.025, 3), matGear, 0, 1.34, 0.165)
  for (const px of [-0.13, 0, 0.13]) {
    mk(upper, rbox(0.1, 0.14, 0.05, 0.02, 3), matDark, px, 1.25, 0.21)
    mk(upper, rbox(0.08, 0.02, 0.055, 0.008, 2), matStrap, px, 1.3, 0.21, false)
  }
  mk(upper, rbox(0.16, 0.09, 0.05, 0.02, 3), matDark, 0.02, 1.43, 0.2)
  // 背部水袋包 + 电台 + 天线
  mk(upper, rbox(0.3, 0.36, 0.09, 0.035, 3), matBody, 0, 1.32, -0.175)
  mk(upper, rbox(0.1, 0.15, 0.06, 0.02, 3), matDark, 0.13, 1.43, -0.21)
  const ant = mk(upper, cyl(0.007, 0.005, 0.3, 8), matDark, 0.13, 1.64, -0.21, false)
  ant.rotation.z = -0.12
  // 腰带 + 侧包
  mk(upper, rbox(0.5, 0.07, 0.3, 0.025, 3), matGear, 0, 1.03, 0)
  mk(upper, rbox(0.09, 0.13, 0.15, 0.03, 3), matGear, -0.27, 0.96, 0.02)

  // ---- 头（颈 → 头组：五官 + 耳机 + 作训帽）----
  mk(upper, cyl(0.066, 0.08, 0.1, 14), matSkin, 0, 1.585, 0)
  headGrp.position.set(0, 1.68, 0)
  const headMesh = mk(headGrp, sph(0.165, 24, 18), matSkin, 0, 0, 0)
  headMesh.scale.set(0.96, 1.04, 1.0)
  // 简化五官：眉、眼、鼻、嘴（近看有人样，远看不抢轮廓）
  const matHair = surface({ color: 0x3a322a, roughness: 0.7, metalness: 0 })
  for (const ex of [-0.055, 0.055]) {
    mk(headGrp, rbox(0.026, 0.016, 0.012, 0.005, 2), matDark, ex, 0.012, 0.152, false)
    mk(headGrp, rbox(0.04, 0.01, 0.012, 0.004, 2), matHair, ex, 0.045, 0.15, false)
  }
  const noseM = mk(headGrp, caps(0.013, 0.03, 4, 8), matSkin, 0, -0.02, 0.16, false)
  noseM.rotation.x = 0.35
  mk(headGrp, rbox(0.05, 0.009, 0.01, 0.004, 2), surface({ color: 0x8a5d4a, roughness: 0.7 }), 0, -0.075, 0.148, false)
  // 通讯耳机（圆罐 + 头带）
  for (const ex of [-0.158, 0.158]) {
    const cup = mk(headGrp, cyl(0.046, 0.046, 0.028, 16), matDark, ex, -0.01, 0, false)
    cup.rotation.z = Math.PI / 2
  }
  const band = mk(headGrp, torus(0.165, 0.014, 8, 24), matDark, 0, 0.015, 0, false)
  band.rotation.y = Math.PI / 2
  band.scale.set(1, 1.05, 1)
  // 帽型按皮肤分支：作训帽 / 毛线帽 / 阔边帽 / 露发
  if (sk.cap === 'cap') {
    const cap = mk(headGrp, dome(0.175, Math.PI * 0.52, 22, 12), matBody, 0, 0.022, 0)
    cap.receiveShadow = true
    const brim = mk(headGrp, cyl(0.168, 0.19, 0.022, 22, false), matBody, 0, 0.05, 0.1)
    brim.scale.set(1, 1, 1.25)
    brim.castShadow = false
  } else if (sk.cap === 'beanie') {
    const cap = mk(headGrp, dome(0.178, Math.PI * 0.46, 22, 12), matDark, 0, 0.018, 0)
    cap.receiveShadow = true
    // 卷边
    mk(headGrp, cyl(0.177, 0.181, 0.05, 22), matDark, 0, 0.045, 0, false)
  } else if (sk.cap === 'boonie') {
    const cap = mk(headGrp, dome(0.172, Math.PI * 0.5, 22, 12), matBody, 0, 0.03, 0)
    cap.receiveShadow = true
    // 全周阔檐（微下垂）
    const wide = mk(headGrp, cyl(0.17, 0.24, 0.026, 24), matBody, 0, 0.055, 0)
    wide.castShadow = false
    // 帽带
    mk(headGrp, cyl(0.175, 0.175, 0.02, 22), matStrap, 0, 0.085, 0, false)
  } else {
    // 露发：发色球冠 + 后脑勺略厚
    const hair = mk(headGrp, dome(0.17, Math.PI * 0.42, 22, 12), matHair, 0, 0.018, -0.01)
    hair.receiveShadow = true
    mk(headGrp, dome(0.155, Math.PI * 0.55, 18, 10), matHair, 0, 0.012, -0.045, false)
  }
  upper.add(headGrp)

  // ---- 手臂（肩 → 上臂 → 肘 → 前臂 + 战术手套）----
  const upperArmGeo = caps(0.072, 0.24, 6, 14)
  const foreArmGeo = caps(0.058, 0.22, 6, 14)
  const gloveGeo = sph(0.064, 14, 10)
  for (const [shoulder, elbow, sx] of [[armL, elbowL, -0.305], [armR, elbowR, 0.305]] as [THREE.Group, THREE.Group, number][]) {
    shoulder.position.set(sx, 1.51, 0.01)
    mk(shoulder, upperArmGeo, matBody, 0, -0.155, 0)
    // 臂章
    mk(shoulder, rbox(0.022, 0.07, 0.06, 0.008, 2), matGear, sx > 0 ? 0.07 : -0.07, -0.1, 0, false)
    elbow.position.set(0, -0.32, 0)
    mk(elbow, foreArmGeo, matBody, 0, -0.135, 0)
    const glove = mk(elbow, gloveGeo, matDark, 0, -0.285, 0)
    glove.scale.set(0.94, 1.08, 1.0)
    // 护腕带
    mk(elbow, cyl(0.062, 0.062, 0.03, 14), matStrap, 0, -0.235, 0, false)
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
