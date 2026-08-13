import * as THREE from 'three'
import { WeaponDef, AttachSlot } from '../items/defs'
import { surface } from '../rendering/materials'
import { rbox, caps, cyl, sph, torus } from '../rendering/smoothGeo'

/**
 * weaponModel：程序化枪械模型（平滑高细分版）。
 * 每类枪（AR/SMG/DMR/SR/SG/LMG/XBOW/PISTOL/MELEE）有独立轮廓，
 * 机匣圆角化、枪管 16 段、弹匣带弧度、配件构件精细化。
 * 约定：+z 为枪口方向，原点在握把上方机匣处。
 */

export interface GunMeshResult {
  group: THREE.Group
  /** 枪口距原点长度（muzzleObj 定位用） */
  len: number
}

const dark = () => surface({ color: 0x2e3338, roughness: 0.55, metalness: 0.12 })
const metal = () => surface({ color: 0x4a5158, roughness: 0.3, metalness: 0.75, envMapIntensity: 0.7 })
const wood = () => surface({ color: 0x5d4a32, roughness: 0.62, metalness: 0 })
const blued = () => surface({ color: 0x33383f, roughness: 0.36, metalness: 0.6, envMapIntensity: 0.65 })
const rubber = () => surface({ color: 0x26292c, roughness: 0.92, metalness: 0 })

type Adder = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx?: number, rz?: number) => THREE.Mesh

function mkAdder(g: THREE.Group): Adder {
  return (geo, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.x = rx
    m.rotation.z = rz
    m.castShadow = true
    g.add(m)
    return m
  }
}

/** 弹匣：弯/直两种，扩容弹匣加长；圆角壳 + 底板 */
function addMag(add: Adder, x: number, y: number, z: number, curved: boolean, extended: boolean) {
  const len = extended ? 0.26 : 0.18
  const mag = add(rbox(0.046, len, 0.082, 0.014, 3), blued(), x, y - len / 2 + 0.02, z)
  mag.rotation.x = curved ? 0.32 : 0.1
  // 底板（橡胶缓冲）
  const plate = add(rbox(0.052, 0.025, 0.09, 0.01, 2), rubber(), x, y - len + 0.02, z + (curved ? len * 0.31 : len * 0.09))
  plate.rotation.x = curved ? 0.32 : 0.1
}

/** 枪托（含贴腮板 + 橡胶垫肩） */
function addStock(add: Adder, z0: number, h = 0.09, len = 0.24) {
  add(rbox(0.05, h, len, 0.018, 3), dark(), 0, -0.02, z0 - len / 2)
  add(rbox(0.052, 0.035, len * 0.55, 0.014, 2), dark(), 0, 0.035, z0 - len * 0.42)
  // 垫肩
  add(rbox(0.056, h + 0.02, 0.03, 0.012, 2), rubber(), 0, -0.018, z0 - len + 0.012)
}

/** 握把 + 扳机护圈（圆环弧，侧立面） */
function addGrip(add: Adder, z = 0.06) {
  const grip = add(rbox(0.046, 0.14, 0.062, 0.018, 3), dark(), 0, -0.1, z)
  grip.rotation.x = -0.25
  // 护圈：侧立扁圆环（法线沿 x）
  const guard = add(torus(0.042, 0.007, 6, 18), dark(), 0, -0.05, z + 0.045)
  guard.rotation.y = Math.PI / 2
  guard.scale.set(1.35, 1, 1)
}

/** 机械瞄具：准星圆柱 + 照门圆角块 */
function addIrons(add: Adder, frontZ: number, rearZ: number, y = 0.075) {
  add(cyl(0.005, 0.005, 0.03, 8), dark(), 0, y, frontZ)
  add(rbox(0.014, 0.018, 0.012, 0.004, 2), dark(), 0, y + 0.018, frontZ)
  add(rbox(0.04, 0.025, 0.016, 0.007, 2), dark(), 0, y - 0.005, rearZ)
}

/** 皮卡汀尼导轨：横齿条 */
function addRail(add: Adder, z: number, len: number, y = 0.062) {
  add(rbox(0.05, 0.016, len, 0.005, 2), dark(), 0, y, z)
  const n = Math.floor(len / 0.03)
  for (let i = 0; i < n; i++) {
    add(rbox(0.052, 0.006, 0.012, 0.002, 1), metal(), 0, y + 0.009, z - len / 2 + 0.018 + i * 0.03)
  }
}

/** 构建枪体（按类区分轮廓），返回枪口长度 */
function buildBody(def: WeaponDef, g: THREE.Group, extMag: boolean): number {
  const add = mkAdder(g)
  let len = 0.6
  switch (def.cls) {
    case 'AR': {
      len = 0.78
      // 机匣（上下分体观感：上机匣略宽）+ 抛壳口
      add(rbox(0.07, 0.055, 0.34, 0.014, 3), blued(), 0, 0.026, 0.05)
      add(rbox(0.066, 0.05, 0.32, 0.014, 3), blued(), 0, -0.025, 0.05)
      add(rbox(0.014, 0.022, 0.07, 0.004, 2), metal(), 0.034, 0.015, 0.1)
      addRail(add, 0.05, 0.3)
      // 圆管护木（散热孔由分段圆环暗示）
      add(cyl(0.034, 0.034, 0.26, 16), dark(), 0, 0.005, 0.34, Math.PI / 2)
      for (const hz of [0.26, 0.34, 0.42]) {
        add(torus(0.035, 0.004, 6, 16), dark(), 0, 0.005, hz, 0, 0)
      }
      // 枪管 + 准星座
      add(cyl(0.02, 0.022, 0.3, 16), metal(), 0, 0.01, 0.62, Math.PI / 2)
      addIrons(add, 0.5, -0.08)
      addMag(add, 0, -0.05, 0.16, true, extMag)
      addGrip(add)
      addStock(add, -0.12)
      break
    }
    case 'DMR': {
      len = 0.92
      add(rbox(0.06, 0.1, 0.42, 0.018, 3), blued(), 0, 0, 0.1)
      addRail(add, 0.06, 0.24)
      // 木质护木（圆润）+ 通条
      add(rbox(0.058, 0.078, 0.34, 0.024, 4), wood(), 0, -0.012, 0.42)
      add(cyl(0.019, 0.019, 0.42, 16), metal(), 0, 0.012, 0.72, Math.PI / 2)
      // 气动管
      add(cyl(0.011, 0.011, 0.3, 10), metal(), 0, 0.045, 0.55, Math.PI / 2)
      addIrons(add, 0.86, -0.1)
      addMag(add, 0, -0.05, 0.12, false, extMag)
      addGrip(add, 0.02)
      // 木托带贴腮（圆角）
      add(rbox(0.05, 0.1, 0.28, 0.02, 3), wood(), 0, -0.02, -0.26)
      add(rbox(0.052, 0.04, 0.16, 0.016, 3), wood(), 0, 0.04, -0.3)
      add(rbox(0.056, 0.1, 0.024, 0.01, 2), rubber(), 0, -0.02, -0.39)
      break
    }
    case 'SR': {
      len = 1.02
      // 全长木托身（圆角流线）
      add(rbox(0.06, 0.088, 0.6, 0.026, 4), wood(), 0, -0.012, 0.16)
      add(rbox(0.055, 0.11, 0.3, 0.024, 4), wood(), 0, -0.03, -0.26)
      add(rbox(0.057, 0.05, 0.18, 0.02, 3), wood(), 0, 0.045, -0.3)
      add(rbox(0.06, 0.11, 0.024, 0.01, 2), rubber(), 0, -0.03, -0.4)
      // 机匣 + 栓动拉柄（球头）
      add(rbox(0.05, 0.06, 0.2, 0.016, 3), blued(), 0, 0.045, -0.02)
      const bolt = add(cyl(0.012, 0.012, 0.07, 10), metal(), 0.045, 0.05, -0.05)
      bolt.rotation.z = -1.0
      add(sph(0.018, 12, 9), metal(), 0.075, 0.028, -0.05)
      // 长枪管（锥度）
      add(cyl(0.016, 0.021, 0.56, 16), metal(), 0, 0.012, 0.74, Math.PI / 2)
      addIrons(add, 0.98, 0.08, 0.085)
      break
    }
    case 'SG': {
      len = 0.86
      add(rbox(0.07, 0.1, 0.32, 0.02, 3), blued(), 0, 0, 0.04)
      // 双管：枪管 + 下置弹管（端口圆环）
      add(cyl(0.026, 0.026, 0.46, 16), metal(), 0, 0.018, 0.56, Math.PI / 2)
      add(cyl(0.02, 0.02, 0.4, 16), metal(), 0, -0.035, 0.52, Math.PI / 2)
      add(torus(0.026, 0.004, 6, 16), metal(), 0, 0.018, 0.785)
      // 泵动护木（圆角 + 防滑槽）
      add(rbox(0.06, 0.054, 0.16, 0.02, 3), wood(), 0, -0.035, 0.38)
      for (const gz of [0.33, 0.38, 0.43]) {
        add(torus(0.033, 0.003, 5, 14), wood(), 0, -0.035, gz)
      }
      addIrons(add, 0.76, -0.06)
      addGrip(add, 0.0)
      add(rbox(0.05, 0.1, 0.24, 0.02, 3), wood(), 0, -0.02, -0.2)
      add(rbox(0.054, 0.1, 0.024, 0.01, 2), rubber(), 0, -0.02, -0.31)
      break
    }
    case 'SMG': {
      len = 0.55
      add(rbox(0.068, 0.096, 0.3, 0.022, 3), blued(), 0, 0, 0.06)
      addRail(add, 0.06, 0.2)
      // 散热孔短护筒（多孔圆筒观感：环带）
      add(cyl(0.027, 0.027, 0.14, 16), dark(), 0, 0.01, 0.27, Math.PI / 2)
      for (const hz of [0.23, 0.27, 0.31]) {
        add(torus(0.028, 0.0035, 5, 14), metal(), 0, 0.01, hz)
      }
      add(cyl(0.017, 0.017, 0.16, 14), metal(), 0, 0.01, 0.4, Math.PI / 2)
      // 长弹匣 + 折叠骨架托（圆管）
      addMag(add, 0, -0.05, 0.1, false, true)
      addGrip(add, -0.02)
      add(cyl(0.009, 0.009, 0.2, 10), metal(), 0.02, 0.02, -0.2, Math.PI / 2)
      add(cyl(0.009, 0.009, 0.08, 10), metal(), 0.02, -0.02, -0.29)
      add(rbox(0.04, 0.05, 0.02, 0.008, 2), rubber(), 0.02, -0.055, -0.295)
      addIrons(add, 0.34, -0.06)
      break
    }
    case 'LMG': {
      len = 0.95
      // 厚重机匣 + 提把（圆管 + 两立柱）
      add(rbox(0.08, 0.12, 0.4, 0.024, 3), blued(), 0, 0, 0.08)
      add(cyl(0.009, 0.009, 0.13, 10), dark(), 0, 0.105, 0.04, Math.PI / 2)
      add(rbox(0.02, 0.034, 0.05, 0.008, 2), dark(), 0, 0.075, 0.105)
      add(rbox(0.02, 0.034, 0.05, 0.008, 2), dark(), 0, 0.075, -0.025)
      // 枪管套筒（衔接机匣）+ 重枪管（带散热筋）+ 两脚架（折叠）
      add(cyl(0.034, 0.04, 0.16, 16), blued(), 0, 0.012, 0.34, Math.PI / 2)
      add(cyl(0.024, 0.028, 0.5, 16), metal(), 0, 0.012, 0.62, Math.PI / 2)
      for (const fz of [0.46, 0.54, 0.62, 0.7]) {
        add(torus(0.027, 0.003, 5, 14), metal(), 0, 0.012, fz)
      }
      const legL = add(cyl(0.008, 0.006, 0.2, 8), metal(), -0.03, -0.05, 0.72)
      legL.rotation.x = 1.25
      const legR = add(cyl(0.008, 0.006, 0.2, 8), metal(), 0.03, -0.05, 0.72)
      legR.rotation.x = 1.25
      // 弹鼓（圆滚 + 端盖纹）
      add(cyl(0.085, 0.085, 0.06, 20), blued(), 0, -0.1, 0.12, 0, Math.PI / 2)
      add(torus(0.085, 0.006, 6, 20), blued(), 0, -0.1, 0.152)
      addGrip(add, -0.04)
      addStock(add, -0.14, 0.1, 0.26)
      addIrons(add, 0.8, -0.1)
      break
    }
    case 'XBOW': {
      len = 0.62
      // 弩身导轨 + 反曲弩臂（短内段 + 后弯外段）+ 弦
      add(rbox(0.05, 0.06, 0.6, 0.018, 3), surface({ color: 0x3c4438, roughness: 0.55, metalness: 0.08 }), 0, 0, 0.12)
      const limbMat = surface({ color: 0x2e3632, roughness: 0.5, metalness: 0.1 })
      const tipPos: [number, number][] = []
      for (const s of [-1, 1]) {
        // 内段：从弩身斜向外前方
        const inner = add(rbox(0.13, 0.018, 0.04, 0.008, 2), limbMat, s * 0.075, 0.02, 0.395)
        inner.rotation.y = -s * 0.35
        // 外段：继续向外并向后弯（反曲）
        const outer = add(rbox(0.12, 0.015, 0.034, 0.007, 2), limbMat, s * 0.185, 0.02, 0.37)
        outer.rotation.y = s * 0.32
        tipPos.push([s * 0.24, 0.352])
      }
      // 弦：精确连接弩臂端 → 卡箭槽
      const nock: [number, number] = [0, 0.175]
      for (const [tx, tz] of tipPos) {
        const dx = nock[0] - tx, dz = nock[1] - tz
        const segLen = Math.hypot(dx, dz)
        const str = add(cyl(0.0032, 0.0032, segLen, 6), dark(), (tx + nock[0]) / 2, 0.02, (tz + nock[1]) / 2)
        str.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / segLen, 0, dz / segLen))
      }
      // 上弦箭（木杆 + 羽尾）
      add(cyl(0.006, 0.006, 0.5, 8), surface({ color: 0x8a6a42, roughness: 0.6 }), 0, 0.045, 0.24, Math.PI / 2)
      add(cyl(0.014, 0.003, 0.05, 8), surface({ color: 0xb84a38, roughness: 0.8 }), 0, 0.045, 0.015, Math.PI / 2)
      addGrip(add, -0.02)
      addStock(add, -0.1, 0.08, 0.2)
      break
    }
    case 'PISTOL': {
      const heavy = def.id === 'bison'
      len = heavy ? 0.36 : 0.3
      // 套筒（圆角 + 防滑槽）+ 击锤
      add(rbox(heavy ? 0.054 : 0.05, 0.072, heavy ? 0.3 : 0.24, 0.016, 3), blued(), 0, 0.012, 0.08)
      for (const gz of [-0.01, 0.005, 0.02]) {
        add(rbox(heavy ? 0.056 : 0.052, 0.05, 0.006, 0.002, 1), metal(), 0, 0.012, gz)
      }
      add(rbox(0.018, 0.028, 0.018, 0.006, 2), metal(), 0, 0.02, -0.048)
      if (heavy) add(cyl(0.034, 0.034, 0.05, 16), metal(), 0, -0.01, 0.05, Math.PI / 2)
      // 握把（带弧度）+ 护圈
      const grip = add(rbox(0.044, 0.14, 0.062, 0.018, 3), surface({ color: 0x4a4038, roughness: 0.7, metalness: 0.04 }), 0, -0.085, -0.02)
      grip.rotation.x = -0.18
      const guard = add(torus(0.038, 0.006, 6, 16), dark(), 0, -0.045, 0.03)
      guard.rotation.y = Math.PI / 2
      guard.scale.set(1.3, 1, 1)
      addIrons(add, 0.18, -0.03, 0.06)
      break
    }
    case 'MELEE':
      if (def.id === 'pan') {
        len = 0.4
        // 锅体竖立（锅面法向侧向 x，像握剑姿势）：圆盘 + 弧形沿圈 + 手柄
        const panMat = surface({ color: 0x5a6166, roughness: 0.35, metalness: 0.75, envMapIntensity: 0.8 })
        add(cyl(0.115, 0.115, 0.022, 28), panMat, 0, 0.04, 0.27, 0, Math.PI / 2)
        const rim = add(torus(0.115, 0.01, 8, 28), surface({ color: 0x4a5056, roughness: 0.4, metalness: 0.7 }), -0.014, 0.04, 0.27)
        rim.rotation.y = Math.PI / 2
        add(rbox(0.022, 0.035, 0.2, 0.01, 3), dark(), 0, 0, 0.06)
      } else {
        len = 0.2
        // 徒手：无模型
      }
      break
  }
  return len
}

/** 配件可视化：按 attach 槽位挂构件，返回枪口长度增量 */
function buildAttachments(def: WeaponDef, g: THREE.Group, len: number, attach: Partial<Record<AttachSlot, string>>): number {
  const add = mkAdder(g)
  let extra = 0
  // 枪口
  if (attach.muzzle === 'muzzle_sup') {
    const y = def.cls === 'PISTOL' ? 0.01 : 0.012
    add(cyl(0.032, 0.032, 0.16, 20), surface({ color: 0x23272b, roughness: 0.5, metalness: 0.3 }), 0, y, len + 0.06, Math.PI / 2)
    add(torus(0.032, 0.004, 6, 20), dark(), 0, y, len + 0.135)
    add(torus(0.032, 0.004, 6, 20), dark(), 0, y, len - 0.01)
    extra = 0.14
  } else if (attach.muzzle === 'muzzle_comp') {
    const y = def.cls === 'PISTOL' ? 0.01 : 0.012
    add(cyl(0.026, 0.03, 0.07, 16), metal(), 0, y, len + 0.02, Math.PI / 2)
    // 泄气侧孔（横杆暗示）
    add(rbox(0.07, 0.01, 0.012, 0.004, 1), dark(), 0, y + 0.016, len + 0.02)
    extra = 0.06
  }
  // 瞄具
  const scopeY = 0.095
  if (attach.scope === 'scope_red') {
    // 红点：方框壳 + 圆镜片 + 旋钮
    add(rbox(0.045, 0.045, 0.07, 0.012, 2), dark(), 0, scopeY, 0.1)
    const lens = add(cyl(0.017, 0.017, 0.008, 16), surface({ color: 0xcc3322, roughness: 0.15, metalness: 0.45, emissive: 0x661108 }), 0, scopeY, 0.064, Math.PI / 2)
    lens.castShadow = false
    add(cyl(0.008, 0.008, 0.012, 10), metal(), 0.026, scopeY, 0.1, 0, Math.PI / 2)
    extra = Math.max(extra, 0)
  } else if (attach.scope === 'scope_4x') {
    add(cyl(0.03, 0.03, 0.15, 18), dark(), 0, scopeY, 0.08, Math.PI / 2)
    add(cyl(0.036, 0.03, 0.03, 18), dark(), 0, scopeY, 0.165, Math.PI / 2)
    add(torus(0.036, 0.0035, 6, 18), metal(), 0, scopeY, 0.182)
    add(rbox(0.02, 0.04, 0.06, 0.007, 2), dark(), 0, scopeY - 0.04, 0.08)
    add(cyl(0.012, 0.012, 0.018, 12), metal(), 0, scopeY + 0.036, 0.08)
  } else if (attach.scope === 'scope_8x') {
    add(cyl(0.032, 0.032, 0.22, 18), dark(), 0, scopeY + 0.005, 0.07, Math.PI / 2)
    add(cyl(0.042, 0.034, 0.045, 18), dark(), 0, scopeY + 0.005, 0.19, Math.PI / 2)
    add(torus(0.042, 0.004, 6, 18), metal(), 0, scopeY + 0.005, 0.215)
    add(cyl(0.034, 0.038, 0.03, 18), dark(), 0, scopeY + 0.005, -0.045, Math.PI / 2)
    add(rbox(0.02, 0.045, 0.06, 0.007, 2), dark(), 0, scopeY - 0.04, 0.07)
    add(cyl(0.013, 0.013, 0.02, 12), metal(), 0, scopeY + 0.042, 0.07)
    add(cyl(0.013, 0.013, 0.02, 12), metal(), 0.026, scopeY + 0.005, 0.07, 0, Math.PI / 2)
  }
  // 垂直握把
  if (attach.grip && def.cls !== 'PISTOL') {
    const fg = add(rbox(0.038, 0.1, 0.05, 0.015, 3), dark(), 0, -0.09, Math.min(len * 0.5, 0.36))
    fg.rotation.x = 0.18
    add(torus(0.02, 0.004, 5, 12), dark(), 0, -0.135, Math.min(len * 0.5, 0.36) + 0.025)
  }
  return extra
}

/** 程序化枪模型：返回带配件的完整模型组与枪口长度 */
export function buildGunMesh(def: WeaponDef, attach: Partial<Record<AttachSlot, string>> = {}): GunMeshResult {
  const g = new THREE.Group()
  const len = buildBody(def, g, attach.mag === 'extmag')
  const extra = def.cls === 'MELEE' ? 0 : buildAttachments(def, g, len, attach)
  return { group: g, len: len + extra }
}
