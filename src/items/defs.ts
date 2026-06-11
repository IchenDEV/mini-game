/** 武器与物品静态数据定义（全部为原创虚构名称） */

export type WeaponClass = 'AR' | 'DMR' | 'SR' | 'SG' | 'SMG' | 'LMG' | 'XBOW' | 'PISTOL' | 'MELEE'
export type AmmoType = 'light' | 'rifle' | 'sniper' | 'shell' | 'bolt'
export type AttachSlot = 'scope' | 'muzzle' | 'grip' | 'mag'
export type Rarity = 0 | 1 | 2 | 3

export interface WeaponDef {
  id: string
  name: string
  cls: WeaponClass
  auto: boolean
  mag: number
  dmg: number
  rpm: number
  reload: number
  range: number
  ammo: AmmoType | null
  pellets: number
  headMult: number
  /** 腰射散布（度） */
  spreadHip: number
  /** 瞄准散布（度） */
  spreadAds: number
  /** 每发上扬后坐力（度） */
  recoil: number
  /** 机瞄 ADS 视场角 */
  adsFov: number
  slots: AttachSlot[]
  /** AI 选择武器评分基准 */
  tier: number
}

export const WEAPONS: Record<string, WeaponDef> = {
  raptor: {
    id: 'raptor', name: '猛禽突击步枪', cls: 'AR', auto: true,
    mag: 30, dmg: 24, rpm: 600, reload: 2.4, range: 280, ammo: 'rifle',
    pellets: 1, headMult: 2.2, spreadHip: 2.4, spreadAds: 0.18, recoil: 0.34,
    adsFov: 50, slots: ['scope', 'muzzle', 'grip', 'mag'], tier: 5,
  },
  vista: {
    id: 'vista', name: '远望精确步枪', cls: 'DMR', auto: false,
    mag: 10, dmg: 42, rpm: 220, reload: 2.7, range: 380, ammo: 'rifle',
    pellets: 1, headMult: 2.3, spreadHip: 2.2, spreadAds: 0.1, recoil: 0.62,
    adsFov: 42, slots: ['scope', 'muzzle', 'mag'], tier: 4.6,
  },
  longfang: {
    id: 'longfang', name: '长牙栓动狙击枪', cls: 'SR', auto: false,
    mag: 5, dmg: 78, rpm: 36, reload: 3.8, range: 500, ammo: 'sniper',
    pellets: 1, headMult: 2.5, spreadHip: 4.5, spreadAds: 0.04, recoil: 1.7,
    adsFov: 30, slots: ['scope', 'muzzle'], tier: 4.4,
  },
  backdraft: {
    id: 'backdraft', name: '回火泵动霰弹枪', cls: 'SG', auto: false,
    mag: 5, dmg: 13, rpm: 62, reload: 3.4, range: 42, ammo: 'shell',
    pellets: 8, headMult: 1.5, spreadHip: 4.2, spreadAds: 3.2, recoil: 1.2,
    adsFov: 55, slots: ['muzzle'], tier: 3.0,
  },
  wasp: {
    id: 'wasp', name: '黄蜂冲锋枪', cls: 'SMG', auto: true,
    mag: 30, dmg: 16, rpm: 860, reload: 2.1, range: 160, ammo: 'light',
    pellets: 1, headMult: 1.8, spreadHip: 1.9, spreadAds: 0.25, recoil: 0.15,
    adsFov: 52, slots: ['scope', 'muzzle', 'grip', 'mag'], tier: 3.4,
  },
  p9: {
    id: 'p9', name: 'P9 半自动手枪', cls: 'PISTOL', auto: false,
    mag: 12, dmg: 20, rpm: 380, reload: 1.8, range: 120, ammo: 'light',
    pellets: 1, headMult: 1.8, spreadHip: 1.6, spreadAds: 0.5, recoil: 0.32,
    adsFov: 58, slots: ['muzzle', 'mag'], tier: 1,
  },
  pan: {
    id: 'pan', name: '铸铁平底锅', cls: 'MELEE', auto: false,
    mag: 0, dmg: 60, rpm: 75, reload: 0, range: 1.9, ammo: null,
    pellets: 1, headMult: 1.5, spreadHip: 0, spreadAds: 0, recoil: 0,
    adsFov: 62, slots: [], tier: 0.5,
  },
  boar: {
    id: 'boar', name: '野猪轻机枪', cls: 'LMG', auto: true,
    mag: 75, dmg: 23, rpm: 640, reload: 5.4, range: 320, ammo: 'rifle',
    pellets: 1, headMult: 2.0, spreadHip: 3.2, spreadAds: 0.3, recoil: 0.42,
    adsFov: 52, slots: ['scope', 'muzzle'], tier: 4.9,
  },
  tempest: {
    id: 'tempest', name: '风暴连发霰弹枪', cls: 'SG', auto: true,
    mag: 8, dmg: 11, rpm: 190, reload: 4.0, range: 36, ammo: 'shell',
    pellets: 7, headMult: 1.5, spreadHip: 4.6, spreadAds: 3.6, recoil: 0.95,
    adsFov: 55, slots: ['muzzle', 'mag'], tier: 4.1,
  },
  whisper: {
    id: 'whisper', name: '猎影弩', cls: 'XBOW', auto: false,
    mag: 1, dmg: 88, rpm: 26, reload: 3.0, range: 130, ammo: 'bolt',
    pellets: 1, headMult: 2.4, spreadHip: 1.4, spreadAds: 0.12, recoil: 0.2,
    adsFov: 46, slots: ['scope'], tier: 2.8,
  },
  bison: {
    id: 'bison', name: '野牛重型手枪', cls: 'PISTOL', auto: false,
    mag: 7, dmg: 42, rpm: 150, reload: 2.6, range: 160, ammo: 'rifle',
    pellets: 1, headMult: 2.1, spreadHip: 2.2, spreadAds: 0.4, recoil: 0.85,
    adsFov: 54, slots: ['muzzle'], tier: 2.6,
  },
  thunder: {
    id: 'thunder', name: '雷霆战略狙击枪', cls: 'SR', auto: false,
    mag: 5, dmg: 105, rpm: 32, reload: 4.4, range: 620, ammo: 'sniper',
    pellets: 1, headMult: 2.5, spreadHip: 4.5, spreadAds: 0.03, recoil: 1.9,
    adsFov: 28, slots: ['scope', 'muzzle'], tier: 6.2,
  },
}

export const FISTS: WeaponDef = {
  id: 'fists', name: '徒手', cls: 'MELEE', auto: false,
  mag: 0, dmg: 22, rpm: 95, reload: 0, range: 1.6, ammo: null,
  pellets: 1, headMult: 1.4, spreadHip: 0, spreadAds: 0, recoil: 0,
  adsFov: 62, slots: [], tier: 0,
}

export const RARITY_NAMES = ['普通', '精良', '稀有', '史诗'] as const
export const RARITY_COLORS = ['#d8d8d8', '#5fd663', '#4aa3ff', '#c66bff'] as const
export const RARITY_HEX = [0xd8d8d8, 0x5fd663, 0x4aa3ff, 0xc66bff] as const

export const AMMO_META: Record<AmmoType, { name: string; w: number; stack: number }> = {
  light: { name: '轻型弹', w: 0.25, stack: 30 },
  rifle: { name: '步枪弹', w: 0.3, stack: 30 },
  sniper: { name: '狙击弹', w: 0.7, stack: 10 },
  shell: { name: '霰弹', w: 1.0, stack: 8 },
  bolt: { name: '弩箭', w: 0.55, stack: 8 },
}

/** 护甲/头盔减伤比例与耐久 */
export const ARMOR_REDUCE = [0, 0.3, 0.4, 0.5]
export const ARMOR_DURABILITY = [0, 80, 120, 180]
export const BAG_CAPACITY = [70, 110, 150, 200]

export type ItemKind = 'ammo' | 'med' | 'boost' | 'armor' | 'helmet' | 'bag' | 'attach' | 'nade' | 'meleeWeapon' | 'fuel'

export interface ItemDef {
  id: string
  kind: ItemKind
  name: string
  w: number
  ammoType?: AmmoType
  /** med：heal 为回复量，healCap 为回复上限（0 表示无上限） */
  heal?: number
  healCap?: number
  castTime?: number
  boostAdd?: number
  level?: number
  attachSlot?: AttachSlot
  zoomFov?: number
  recoilMult?: number
  silenced?: boolean
  magMult?: number
  nadeType?: 'frag' | 'smoke' | 'flash'
  /** 限定可安装的武器类型 */
  clsAllow?: WeaponClass[]
}

export const ITEMS: Record<string, ItemDef> = {
  bandage: { id: 'bandage', kind: 'med', name: '绷带', w: 2, heal: 15, healCap: 75, castTime: 3.2 },
  firstaid: { id: 'firstaid', kind: 'med', name: '急救包', w: 10, heal: 75, healCap: 75, castTime: 5.5 },
  medkit: { id: 'medkit', kind: 'med', name: '医疗箱', w: 20, heal: 100, healCap: 0, castTime: 7.5 },
  drink: { id: 'drink', kind: 'boost', name: '能量饮料', w: 4, boostAdd: 40, castTime: 3.5 },
  pills: { id: 'pills', kind: 'boost', name: '止痛药', w: 10, boostAdd: 60, castTime: 5 },
  armor1: { id: 'armor1', kind: 'armor', name: '一级护甲', w: 0, level: 1 },
  armor2: { id: 'armor2', kind: 'armor', name: '二级护甲', w: 0, level: 2 },
  armor3: { id: 'armor3', kind: 'armor', name: '三级护甲', w: 0, level: 3 },
  helm1: { id: 'helm1', kind: 'helmet', name: '一级头盔', w: 0, level: 1 },
  helm2: { id: 'helm2', kind: 'helmet', name: '二级头盔', w: 0, level: 2 },
  helm3: { id: 'helm3', kind: 'helmet', name: '三级头盔', w: 0, level: 3 },
  bag1: { id: 'bag1', kind: 'bag', name: '一级背包', w: 0, level: 1 },
  bag2: { id: 'bag2', kind: 'bag', name: '二级背包', w: 0, level: 2 },
  bag3: { id: 'bag3', kind: 'bag', name: '三级背包', w: 0, level: 3 },
  scope_red: { id: 'scope_red', kind: 'attach', name: '红点瞄准镜', w: 6, attachSlot: 'scope', zoomFov: 40 },
  scope_4x: { id: 'scope_4x', kind: 'attach', name: '4 倍瞄准镜', w: 8, attachSlot: 'scope', zoomFov: 17 },
  scope_8x: { id: 'scope_8x', kind: 'attach', name: '8 倍瞄准镜', w: 8, attachSlot: 'scope', zoomFov: 9, clsAllow: ['DMR', 'SR'] },
  muzzle_comp: { id: 'muzzle_comp', kind: 'attach', name: '枪口补偿器', w: 6, attachSlot: 'muzzle', recoilMult: 0.75 },
  muzzle_sup: { id: 'muzzle_sup', kind: 'attach', name: '消音器', w: 6, attachSlot: 'muzzle', recoilMult: 0.9, silenced: true },
  grip: { id: 'grip', kind: 'attach', name: '垂直握把', w: 6, attachSlot: 'grip', recoilMult: 0.8 },
  extmag: { id: 'extmag', kind: 'attach', name: '扩容弹匣', w: 6, attachSlot: 'mag', magMult: 1.4 },
  frag: { id: 'frag', kind: 'nade', name: '破片手雷', w: 9, nadeType: 'frag' },
  smoke: { id: 'smoke', kind: 'nade', name: '烟雾弹', w: 7, nadeType: 'smoke' },
  flash: { id: 'flash', kind: 'nade', name: '闪光弹', w: 7, nadeType: 'flash' },
  pan_item: { id: 'pan_item', kind: 'meleeWeapon', name: '铸铁平底锅', w: 6 },
  fuelcan: { id: 'fuelcan', kind: 'fuel', name: '汽油桶', w: 12 },
}

export const ammoItemName = (t: AmmoType) => AMMO_META[t].name

/** AI 武器评分 */
export const weaponScore = (def: WeaponDef, rarity: Rarity) => def.tier + rarity * 0.6
