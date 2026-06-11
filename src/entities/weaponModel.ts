import * as THREE from 'three'
import { WeaponDef, AttachSlot } from '../items/defs'
import { surface, bareMetal, polymer, wood as woodMat } from '../rendering/materials'

/**
 * weaponModel：程序化枪械模型。
 * 每类枪（AR/SMG/DMR/SR/SG/LMG/XBOW/PISTOL/MELEE）有独立轮廓，
 * 配件（消音/补偿/红点/4x/8x/握把/扩容弹匣）以可见构件方式挂载。
 * 约定：+z 为枪口方向，原点在握把上方机匣处。
 */

export interface GunMeshResult {
  group: THREE.Group
  /** 枪口距原点长度（muzzleObj 定位用） */
  len: number
}

const dark = () => polymer(0x2e3338)
const metal = () => bareMetal(0x4a5158)
const wood = () => woodMat(0x5d4a32)
const blued = () => surface({ color: 0x33383f, roughness: 0.4, metalness: 0.55, flatShading: true })

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

/** 弹匣：弯/直两种，扩容弹匣加长 */
function addMag(add: Adder, x: number, y: number, z: number, curved: boolean, extended: boolean) {
  const len = extended ? 0.26 : 0.18
  const mag = add(new THREE.BoxGeometry(0.045, len, 0.08), blued(), x, y - len / 2 + 0.02, z)
  mag.rotation.x = curved ? 0.32 : 0.1
  if (extended) add(new THREE.BoxGeometry(0.05, 0.03, 0.085), dark(), x, y - len + 0.015, z + (curved ? len * 0.3 : len * 0.08))
}

/** 枪托（含贴腮板） */
function addStock(add: Adder, z0: number, h = 0.09, len = 0.24) {
  add(new THREE.BoxGeometry(0.05, h, len), dark(), 0, -0.02, z0 - len / 2)
  add(new THREE.BoxGeometry(0.052, 0.035, len * 0.55), dark(), 0, 0.035, z0 - len * 0.42)
}

/** 握把 + 扳机护圈 */
function addGrip(add: Adder, z = 0.06) {
  const grip = add(new THREE.BoxGeometry(0.045, 0.14, 0.06), dark(), 0, -0.1, z)
  grip.rotation.x = -0.25
  add(new THREE.BoxGeometry(0.012, 0.012, 0.07), dark(), 0, -0.055, z + 0.06)
}

/** 机械瞄具：准星 + 照门 */
function addIrons(add: Adder, frontZ: number, rearZ: number, y = 0.075) {
  add(new THREE.BoxGeometry(0.012, 0.035, 0.012), dark(), 0, y, frontZ)
  add(new THREE.BoxGeometry(0.04, 0.025, 0.015), dark(), 0, y - 0.005, rearZ)
}

/** 构建枪体（按类区分轮廓），返回枪口长度 */
function buildBody(def: WeaponDef, g: THREE.Group, extMag: boolean): number {
  const add = mkAdder(g)
  let len = 0.6
  switch (def.cls) {
    case 'AR': {
      len = 0.78
      // 机匣 + 提把导轨
      add(new THREE.BoxGeometry(0.07, 0.1, 0.34), blued(), 0, 0, 0.05)
      add(new THREE.BoxGeometry(0.05, 0.018, 0.3), dark(), 0, 0.062, 0.05)
      // 护木（八角形近似：上下两条）
      add(new THREE.BoxGeometry(0.065, 0.075, 0.26), dark(), 0, 0, 0.34)
      add(new THREE.BoxGeometry(0.045, 0.02, 0.24), dark(), 0, -0.052, 0.33)
      // 枪管 + 准星座
      add(new THREE.CylinderGeometry(0.02, 0.022, 0.3, 8), metal(), 0, 0.01, 0.62, Math.PI / 2)
      addIrons(add, 0.5, -0.08)
      addMag(add, 0, -0.05, 0.16, true, extMag)
      addGrip(add)
      addStock(add, -0.12)
      break
    }
    case 'DMR': {
      len = 0.92
      add(new THREE.BoxGeometry(0.06, 0.1, 0.42), blued(), 0, 0, 0.1)
      // 木质护木 + 通条
      add(new THREE.BoxGeometry(0.058, 0.08, 0.34), wood(), 0, -0.01, 0.42)
      add(new THREE.CylinderGeometry(0.019, 0.019, 0.42, 8), metal(), 0, 0.012, 0.72, Math.PI / 2)
      // 气动管
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 6), metal(), 0, 0.045, 0.55, Math.PI / 2)
      addIrons(add, 0.86, -0.1)
      addMag(add, 0, -0.05, 0.12, false, extMag)
      addGrip(add, 0.02)
      // 木托带贴腮
      add(new THREE.BoxGeometry(0.05, 0.1, 0.28), wood(), 0, -0.02, -0.26)
      add(new THREE.BoxGeometry(0.052, 0.04, 0.16), wood(), 0, 0.04, -0.3)
      break
    }
    case 'SR': {
      len = 1.02
      // 全长木托身
      add(new THREE.BoxGeometry(0.06, 0.09, 0.6), wood(), 0, -0.01, 0.16)
      add(new THREE.BoxGeometry(0.055, 0.11, 0.3), wood(), 0, -0.03, -0.26)
      add(new THREE.BoxGeometry(0.057, 0.05, 0.18), wood(), 0, 0.045, -0.3)
      // 机匣 + 栓动拉柄
      add(new THREE.BoxGeometry(0.05, 0.06, 0.2), blued(), 0, 0.045, -0.02)
      const bolt = add(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), metal(), 0.045, 0.05, -0.05)
      bolt.rotation.z = -1.0
      add(new THREE.SphereGeometry(0.018, 6, 5), metal(), 0.075, 0.028, -0.05)
      // 长枪管
      add(new THREE.CylinderGeometry(0.018, 0.02, 0.56, 8), metal(), 0, 0.012, 0.74, Math.PI / 2)
      addIrons(add, 0.98, 0.08, 0.085)
      break
    }
    case 'SG': {
      len = 0.86
      add(new THREE.BoxGeometry(0.07, 0.1, 0.32), blued(), 0, 0, 0.04)
      // 双管：枪管 + 下置弹管
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.46, 8), metal(), 0, 0.018, 0.56, Math.PI / 2)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), metal(), 0, -0.035, 0.52, Math.PI / 2)
      // 泵动护木
      add(new THREE.BoxGeometry(0.06, 0.055, 0.16), wood(), 0, -0.035, 0.38)
      addIrons(add, 0.76, -0.06)
      addGrip(add, 0.0)
      add(new THREE.BoxGeometry(0.05, 0.1, 0.24), wood(), 0, -0.02, -0.2)
      break
    }
    case 'SMG': {
      len = 0.55
      add(new THREE.BoxGeometry(0.07, 0.1, 0.3), blued(), 0, 0, 0.06)
      // 散热孔短护筒
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), dark(), 0, 0.01, 0.27, Math.PI / 2)
      add(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 6), metal(), 0, 0.01, 0.4, Math.PI / 2)
      // 长弹匣 + 折叠骨架托
      addMag(add, 0, -0.05, 0.1, false, true)
      addGrip(add, -0.02)
      add(new THREE.BoxGeometry(0.02, 0.02, 0.2), metal(), 0.02, 0.02, -0.2)
      add(new THREE.BoxGeometry(0.02, 0.08, 0.02), metal(), 0.02, -0.02, -0.29)
      addIrons(add, 0.34, -0.06)
      break
    }
    case 'LMG': {
      len = 0.95
      // 厚重机匣 + 提把
      add(new THREE.BoxGeometry(0.08, 0.12, 0.4), blued(), 0, 0, 0.08)
      add(new THREE.BoxGeometry(0.02, 0.05, 0.14), dark(), 0, 0.1, 0.04)
      // 重枪管 + 两脚架（折叠）
      add(new THREE.CylinderGeometry(0.025, 0.028, 0.44, 8), metal(), 0, 0.012, 0.62, Math.PI / 2)
      const legL = add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), metal(), -0.03, -0.05, 0.72)
      legL.rotation.x = 1.25
      const legR = add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), metal(), 0.03, -0.05, 0.72)
      legR.rotation.x = 1.25
      // 弹鼓
      add(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12), blued(), 0, -0.1, 0.12, 0, Math.PI / 2)
      addGrip(add, -0.04)
      addStock(add, -0.14, 0.1, 0.26)
      addIrons(add, 0.8, -0.1)
      break
    }
    case 'XBOW': {
      len = 0.62
      // 弩身导轨 + 弩臂 + 弦
      add(new THREE.BoxGeometry(0.05, 0.06, 0.6), polymer(0x3c4438), 0, 0, 0.12)
      const limbL = add(new THREE.BoxGeometry(0.3, 0.025, 0.04), polymer(0x2e3632), -0.17, 0.02, 0.4)
      limbL.rotation.y = 0.5
      const limbR = add(new THREE.BoxGeometry(0.3, 0.025, 0.04), polymer(0x2e3632), 0.17, 0.02, 0.4)
      limbR.rotation.y = -0.5
      const strL = add(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4), dark(), -0.15, 0.02, 0.28)
      strL.rotation.set(0, 0, Math.PI / 2)
      strL.rotation.y = -0.35
      const strR = add(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4), dark(), 0.15, 0.02, 0.28)
      strR.rotation.set(0, 0, Math.PI / 2)
      strR.rotation.y = 0.35
      // 上弦箭
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.5, 5), woodMat(0x8a6a42), 0, 0.045, 0.24, Math.PI / 2)
      addGrip(add, -0.02)
      addStock(add, -0.1, 0.08, 0.2)
      break
    }
    case 'PISTOL': {
      const heavy = def.id === 'bison'
      len = heavy ? 0.36 : 0.3
      // 套筒 + 击锤
      add(new THREE.BoxGeometry(heavy ? 0.055 : 0.05, 0.075, heavy ? 0.3 : 0.24), blued(), 0, 0.01, 0.08)
      add(new THREE.BoxGeometry(0.02, 0.03, 0.02), metal(), 0, 0.02, -0.05)
      if (heavy) add(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 8), metal(), 0, -0.01, 0.05, Math.PI / 2)
      // 握把 + 护圈
      const grip = add(new THREE.BoxGeometry(0.045, 0.14, 0.06), polymer(0x4a4038), 0, -0.085, -0.02)
      grip.rotation.x = -0.18
      add(new THREE.BoxGeometry(0.012, 0.012, 0.06), dark(), 0, -0.05, 0.045)
      addIrons(add, 0.18, -0.03, 0.06)
      break
    }
    case 'MELEE':
      if (def.id === 'pan') {
        len = 0.4
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12), bareMetal(0x5a6166), 0, 0, 0.3, Math.PI / 2)
        add(new THREE.BoxGeometry(0.04, 0.04, 0.24), dark(), 0, 0, 0.08)
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
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 10), polymer(0x23272b), 0, def.cls === 'PISTOL' ? 0.01 : 0.012, len + 0.06, Math.PI / 2)
    extra = 0.14
  } else if (attach.muzzle === 'muzzle_comp') {
    const comp = add(new THREE.CylinderGeometry(0.026, 0.03, 0.07, 8), metal(), 0, def.cls === 'PISTOL' ? 0.01 : 0.012, len + 0.02, Math.PI / 2)
    comp.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), dark()))
    extra = 0.06
  }
  // 瞄具
  const scopeY = 0.095
  if (attach.scope === 'scope_red') {
    add(new THREE.BoxGeometry(0.045, 0.045, 0.07), dark(), 0, scopeY, 0.1)
    const lens = add(new THREE.BoxGeometry(0.034, 0.034, 0.01), surface({ color: 0xcc3322, roughness: 0.2, metalness: 0.4, emissive: 0x661108 }), 0, scopeY, 0.065)
    lens.castShadow = false
  } else if (attach.scope === 'scope_4x') {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), dark(), 0, scopeY, 0.08, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.036, 0.03, 0.03, 8), dark(), 0, scopeY, 0.165, Math.PI / 2)
    add(new THREE.BoxGeometry(0.02, 0.04, 0.06), dark(), 0, scopeY - 0.04, 0.08)
  } else if (attach.scope === 'scope_8x') {
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 8), dark(), 0, scopeY + 0.005, 0.07, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.042, 0.034, 0.045, 8), dark(), 0, scopeY + 0.005, 0.19, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.034, 0.038, 0.03, 8), dark(), 0, scopeY + 0.005, -0.045, Math.PI / 2)
    add(new THREE.BoxGeometry(0.02, 0.045, 0.06), dark(), 0, scopeY - 0.04, 0.07)
  }
  // 垂直握把
  if (attach.grip && def.cls !== 'PISTOL') {
    const fg = add(new THREE.BoxGeometry(0.04, 0.1, 0.05), dark(), 0, -0.09, Math.min(len * 0.5, 0.36))
    fg.rotation.x = 0.18
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
