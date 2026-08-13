/**
 * skins：角色服装皮肤定义。玩家在启动页选择（localStorage 记忆），
 * AI 随机分配。皮肤决定上衣/裤子/靴子/手套/装具配色、迷彩与帽型。
 */

export interface SkinDef {
  id: string
  name: string
  /** 上衣基色（camo=true 时迷彩从此色派生） */
  jacket: number
  pants: number
  boots: number
  gloves: number
  /** 胸挂 / 腰带 / 装具 */
  gear: number
  skinTone: number
  /** 帽型：作训帽 / 毛线帽 / 阔边帽 / 无（露发） */
  cap: 'cap' | 'beanie' | 'boonie' | 'none'
  /** true: 上衣裤子用迷彩贴图；false: 纯色布料 */
  camo: boolean
}

export const SKINS: SkinDef[] = [
  {
    id: 'woodland', name: '丛林迷彩',
    jacket: 0x6e7a52, pants: 0x5c6648, boots: 0x33342e, gloves: 0x2e3230,
    gear: 0x474d42, skinTone: 0xc9a583, cap: 'cap', camo: true,
  },
  {
    id: 'desert', name: '荒漠迷彩',
    jacket: 0xa89368, pants: 0x96825c, boots: 0x4d4438, gloves: 0x3d382e,
    gear: 0x6e6250, skinTone: 0xb98f6e, cap: 'boonie', camo: true,
  },
  {
    id: 'urban', name: '城区灰彩',
    jacket: 0x767c80, pants: 0x5e6468, boots: 0x2c2e30, gloves: 0x303436,
    gear: 0x44484c, skinTone: 0xc9a583, cap: 'cap', camo: true,
  },
  {
    id: 'shadow', name: '暗影特勤',
    jacket: 0x2e3236, pants: 0x26292c, boots: 0x1d1f21, gloves: 0x1a1c1e,
    gear: 0x383d40, skinTone: 0xc9a583, cap: 'beanie', camo: false,
  },
  {
    id: 'ranger', name: '游骑兵',
    jacket: 0x5d5440, pants: 0x4a452f, boots: 0x36302a, gloves: 0x2e3230,
    gear: 0x3f4438, skinTone: 0xa97f5e, cap: 'cap', camo: false,
  },
  {
    id: 'arctic', name: '极地雪装',
    jacket: 0xc9ced2, pants: 0xb2b8bd, boots: 0x5a5e62, gloves: 0x787e82,
    gear: 0x8f969a, skinTone: 0xd8b294, cap: 'beanie', camo: true,
  },
  {
    id: 'ember', name: '余烬机师',
    jacket: 0xb35f2c, pants: 0x3a3a3c, boots: 0x232325, gloves: 0x2c2c2e,
    gear: 0x4c443c, skinTone: 0xc9a583, cap: 'none', camo: false,
  },
  {
    id: 'navy', name: '蓝盾行动',
    jacket: 0x3e5468, pants: 0x33424f, boots: 0x22282e, gloves: 0x262d33,
    gear: 0x46525c, skinTone: 0xb98f6e, cap: 'cap', camo: false,
  },
]

export function getSkin(id: string | null | undefined): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

const LS_KEY = 'lc_skin'

export function playerSkin(): SkinDef {
  try {
    return getSkin(localStorage.getItem(LS_KEY))
  } catch {
    return SKINS[0]
  }
}

export function setPlayerSkin(id: string) {
  try {
    localStorage.setItem(LS_KEY, id)
  } catch { /* 隐私模式下静默失败 */ }
}

/** AI 随机皮肤：rand 传 [0,1) 随机数生成器 */
export function randomSkin(rand: () => number): SkinDef {
  return SKINS[Math.floor(rand() * SKINS.length)]
}
