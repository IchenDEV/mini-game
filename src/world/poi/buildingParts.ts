import * as THREE from 'three'
import type { World, TexKind } from '../world'

/**
 * buildingParts：建筑通用构件（门框/窗框/檐口/排水管/空调箱/沙袋/围栏/碎砖）。
 * 所有构件基于 World.localBuilder 返回的局部盒子构建器 B，自动继承 POI 的旋转。
 */

export type LocalBox = (
  lw: number, lh: number, ld: number,
  lx: number, ly: number, lz: number,
  color: number, collide?: boolean, tk?: TexKind | null,
) => THREE.Mesh

/** 门框：两侧门柱 + 门楣（凸出墙面，不参与碰撞） */
export function doorFrame(B: LocalBox, lx: number, g: number, lz: number, doorW: number, doorH: number, c = 0x8a7a64) {
  B(0.16, doorH + 0.08, 0.4, lx - doorW / 2 - 0.06, g, lz, c, false, 'wood')
  B(0.16, doorH + 0.08, 0.4, lx + doorW / 2 + 0.06, g, lz, c, false, 'wood')
  B(doorW + 0.44, 0.18, 0.4, lx, g + doorH + 0.05, lz, c, false, 'wood')
}

/**
 * 窗：白框 + 玻璃 + 竖梃 + 凸出窗台。
 * axis 'z'：窗开在法线朝 ±z 的墙上，along 为 x 坐标，lp 为墙外皮面坐标，sign 为外法线方向。
 */
export function framedWindow(B: LocalBox, axis: 'x' | 'z', along: number, g: number, lp: number, sign: number, frameC = 0xe2dccb) {
  const f = lp - sign * 0.045
  const gl = lp - sign * 0.04
  const mu = lp - sign * 0.035
  const si = lp - sign * 0.1
  if (axis === 'z') {
    B(1.5, 1.18, 0.07, along, g + 1.11, f, frameC, false)
    B(1.3, 1.0, 0.1, along, g + 1.2, gl, 0x222a31, false)
    B(0.06, 1.0, 0.12, along, g + 1.2, mu, frameC, false)
    B(1.62, 0.1, 0.26, along, g + 1.0, si, frameC, false)
  } else {
    B(0.07, 1.18, 1.5, f, g + 1.11, along, frameC, false)
    B(0.1, 1.0, 1.3, gl, g + 1.2, along, 0x222a31, false)
    B(0.12, 1.0, 0.06, mu, g + 1.2, along, frameC, false)
    B(0.26, 0.1, 1.62, si, g + 1.0, along, frameC, false)
  }
}

/** 檐口：墙顶四周外凸线脚 */
export function cornice(B: LocalBox, w: number, d: number, g: number, wallH: number, c: number) {
  B(w + 0.34, 0.16, 0.2, 0, g + wallH - 0.16, d / 2 + 0.04, c, false)
  B(w + 0.34, 0.16, 0.2, 0, g + wallH - 0.16, -d / 2 - 0.04, c, false)
  B(0.2, 0.16, d + 0.3, w / 2 + 0.04, g + wallH - 0.16, 0, c, false)
  B(0.2, 0.16, d + 0.3, -w / 2 - 0.04, g + wallH - 0.16, 0, c, false)
}

/** 排水管：墙角立管 + 底部弯头 */
export function drainPipe(B: LocalBox, lx: number, g: number, lz: number, h: number, c = 0x6d7378) {
  B(0.12, h - 0.28, 0.12, lx, g + 0.24, lz, c, false, 'metal')
  B(0.12, 0.14, 0.32, lx, g + 0.08, lz + 0.12, c, false, 'metal')
}

/** 空调外机：挂墙金属箱 + 格栅（axis/lp/sign 语义同 framedWindow） */
export function acUnit(B: LocalBox, axis: 'x' | 'z', along: number, ly: number, lp: number, sign: number) {
  const off = lp + sign * 0.19
  if (axis === 'z') {
    B(0.86, 0.6, 0.34, along, ly, off, 0xb9bdbf, false, 'metal')
    B(0.7, 0.42, 0.03, along, ly + 0.09, off + sign * 0.17, 0x84898d, false)
  } else {
    B(0.34, 0.6, 0.86, off, ly, along, 0xb9bdbf, false, 'metal')
    B(0.03, 0.42, 0.7, off + sign * 0.17, ly + 0.09, along, 0x84898d, false)
  }
}

/** 沙袋墙：双层错缝堆叠（整体一个碰撞盒） */
export function sandbagLine(B: LocalBox, lx: number, g: number, lz: number, len: number, alongX: boolean, c = 0x8d825f) {
  const n = Math.max(2, Math.round(len / 0.62))
  for (let row = 0; row < 2; row++) {
    const y = g + row * 0.27
    const off = row % 2 === 0 ? 0 : 0.3
    for (let i = 0; i < n - (row % 2); i++) {
      const t = -len / 2 + 0.32 + off + i * 0.62
      if (alongX) B(0.58, 0.28, 0.42, lx + t, y, lz, c, false)
      else B(0.42, 0.28, 0.58, lx, y, lz + t, c, false)
    }
  }
  if (alongX) B(len, 0.56, 0.44, lx, g, lz, c, true)
  else B(0.44, 0.56, len, lx, g, lz, c, true)
}

/** 铁丝网围栏：立柱 + 顶轨 + 薄网板（可挡人） */
export function fenceRun(B: LocalBox, lx: number, g: number, lz: number, len: number, alongX: boolean, h = 2.0) {
  const postC = 0x70787e, meshC = 0x9aa2a8
  const n = Math.max(2, Math.round(len / 3))
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len / n) * i
    if (alongX) B(0.1, h, 0.1, lx + t, g, lz, postC, false, 'metal')
    else B(0.1, h, 0.1, lx, g, lz + t, postC, false, 'metal')
  }
  if (alongX) {
    B(len, 0.06, 0.06, lx, g + h - 0.06, lz, postC, false, 'metal')
    B(len, h - 0.14, 0.04, lx, g, lz, meshC, true)
  } else {
    B(0.06, 0.06, len, lx, g + h - 0.06, lz, postC, false, 'metal')
    B(0.04, h - 0.14, len, lx, g, lz, meshC, true)
  }
}

/**
 * 直跑楼梯：实心踏步（每级一个从地面到踏面的盒子，全部参与碰撞，
 * 级高 ≤ STEP_H 玩家可自动逐级走上）。
 * dir：爬升方向（局部坐标）。lx/lz 为第一级踏步中心，g 为起步地面，rise 为总升高。
 */
export function stairRun(
  B: LocalBox, lx: number, g: number, lz: number,
  rise: number, dir: '+x' | '-x' | '+z' | '-z', width = 1.05, c = 0x8a8d90,
) {
  const n = Math.max(2, Math.ceil(rise / 0.42))
  const stepH = rise / n
  const depth = 0.34
  for (let i = 0; i < n; i++) {
    const adv = i * depth
    const h = stepH * (i + 1)
    const ax = dir === '+x' ? adv : dir === '-x' ? -adv : 0
    const az = dir === '+z' ? adv : dir === '-z' ? -adv : 0
    const alongX = dir === '+x' || dir === '-x'
    B(alongX ? depth : width, h, alongX ? width : depth, lx + ax, g, lz + az, c, true, 'concrete')
  }
}

/** 阳台/平台护栏：水平扶手 + 竖条；len 沿 alongX 方向，可挡人 */
export function railing(B: LocalBox, lx: number, g: number, lz: number, len: number, alongX: boolean, h = 0.85, c = 0x5d6a74) {
  if (alongX) {
    B(len, 0.07, 0.07, lx, g + h - 0.07, lz, c, false, 'metal')
    B(len, h - 0.1, 0.04, lx, g, lz, c, true)
  } else {
    B(0.07, 0.07, len, lx, g + h - 0.07, lz, c, false, 'metal')
    B(0.04, h - 0.1, len, lx, g, lz, c, true)
  }
  const n = Math.max(2, Math.round(len / 1.1))
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len / n) * i
    if (alongX) B(0.06, h - 0.07, 0.06, lx + t, g, lz, c, false, 'metal')
    else B(0.06, h - 0.07, 0.06, lx, g, lz + t, c, false, 'metal')
  }
}

/** 破损墙顶：随机残齿 + 墙根碎砖堆 */
export function brokenWallTop(w: World, B: LocalBox, lx: number, g: number, lz: number, len: number, h: number, alongX: boolean, c: number) {
  const n = 2 + w.rng.int(0, 2)
  for (let i = 0; i < n; i++) {
    const t = w.rng.range(-len / 2 + 0.4, len / 2 - 0.4)
    const bw = w.rng.range(0.35, 0.9)
    const bh = w.rng.range(0.18, 0.5)
    if (alongX) B(bw, bh, 0.45, lx + t, g + h, lz, c, false, 'brick')
    else B(0.45, bh, bw, lx, g + h, lz + t, c, false, 'brick')
  }
  for (let i = 0; i < 2; i++) {
    const t = w.rng.range(-len / 2, len / 2)
    const s = w.rng.range(0.25, 0.55)
    if (alongX) B(s, s * 0.6, s, lx + t, g, lz + w.rng.range(0.5, 1.1), c, false, 'brick')
    else B(s, s * 0.6, s, lx + w.rng.range(0.5, 1.1), g, lz + t, c, false, 'brick')
  }
}
