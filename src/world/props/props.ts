import type { World } from '../world'
import type { LocalBox } from '../poi/buildingParts'

/**
 * props：室内外家具道具（桌椅/柜子/货架/床垫/油桶），
 * 作为掩体与视觉内容填充建筑内部。
 */

/** 木桌：桌面 + 四腿（桌面参与碰撞，可作低掩体） */
export function table(B: LocalBox, lx: number, g: number, lz: number) {
  B(1.6, 0.08, 0.9, lx, g + 0.7, lz, 0x8a6e4a, true, 'wood')
  for (const [sx, sz] of [[-0.7, -0.36], [0.7, -0.36], [-0.7, 0.36], [0.7, 0.36]]) {
    B(0.08, 0.7, 0.08, lx + sx, g, lz + sz, 0x6e563a, false, 'wood')
  }
}

/** 木椅：坐面 + 靠背 + 四腿 */
export function chair(B: LocalBox, lx: number, g: number, lz: number, back: -1 | 1 = 1) {
  B(0.46, 0.06, 0.46, lx, g + 0.45, lz, 0x7a6044, true, 'wood')
  B(0.46, 0.52, 0.06, lx, g + 0.51, lz + back * 0.2, 0x7a6044, false, 'wood')
  for (const [sx, sz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    B(0.05, 0.45, 0.05, lx + sx, g, lz + sz, 0x66503a, false, 'wood')
  }
}

/** 立柜：柜体 + 双门缝 + 把手 */
export function cabinet(B: LocalBox, lx: number, g: number, lz: number, c = 0x74583c) {
  B(1.1, 1.9, 0.52, lx, g, lz, c, true, 'wood')
  B(0.025, 1.62, 0.03, lx, g + 0.16, lz + 0.26, 0x4d3b28, false)
  B(0.05, 0.16, 0.04, lx - 0.12, g + 0.92, lz + 0.27, 0x3a2e20, false)
  B(0.05, 0.16, 0.04, lx + 0.12, g + 0.92, lz + 0.27, 0x3a2e20, false)
}

/** 仓库货架：立柱 + 三层板 + 散件货物 */
export function shelfRack(w: World, B: LocalBox, lx: number, g: number, lz: number, alongX = true) {
  const frameC = 0x5d6a74, boardC = 0x8a7350
  const len = 3.4, dep = 0.7
  const wD = alongX ? len : dep, dD = alongX ? dep : len
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    B(0.09, 2.2, 0.09, lx + sx * (wD / 2 - 0.06), g, lz + sz * (dD / 2 - 0.06), frameC, false, 'metal')
  }
  for (const h of [0.12, 0.85, 1.58]) {
    B(wD, 0.07, dD, lx, g + h, lz, boardC, true, 'wood')
  }
  for (const h of [0.19, 0.92, 1.65]) {
    const n = 1 + w.rng.int(0, 2)
    for (let i = 0; i < n; i++) {
      const t = w.rng.range(-len / 2 + 0.5, len / 2 - 0.5)
      const s = w.rng.range(0.35, 0.6)
      const c = w.rng.pick([0x8a703f, 0x6f7a55, 0x7a6a50, 0x9a8a60])
      if (alongX) B(s, s, s, lx + t, g + h, lz + w.rng.range(-0.08, 0.08), c, false, 'wood')
      else B(s, s, s, lx + w.rng.range(-0.08, 0.08), g + h, lz + t, c, false, 'wood')
    }
  }
}

/** 床垫：垫体 + 枕头 + 毛毯 */
export function mattress(B: LocalBox, lx: number, g: number, lz: number) {
  B(0.95, 0.22, 1.95, lx, g, lz, 0xa8a092, false)
  B(0.6, 0.12, 0.4, lx, g + 0.22, lz - 0.68, 0xc2bcae, false)
  B(0.97, 0.05, 1.0, lx, g + 0.22, lz + 0.4, 0x6e7a55, false)
}

/** 油桶（世界坐标） */
export function barrel(w: World, x: number, z: number, c = 0xa84a32) {
  const g = w.groundHeight(x, z)
  w.box(0.62, 0.92, 0.62, x, g, z, c, true, true, 'metal')
  w.box(0.66, 0.05, 0.66, x, g + 0.4, z, 0x3a3f44, false, false, 'metal')
}
