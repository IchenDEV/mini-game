import type {
  BaitConfig,
  BaitId,
  FishRarity,
  FishSpeciesConfig,
  FishSpeciesId,
  GearConfig,
  GearId,
  LocationConfig,
  LocationId,
  WeatherConfig,
  WeatherId,
} from "../game/types";

export const FISH_SPECIES = {
  "red-bream": {
    id: "red-bream",
    name: "赤鲷",
    description: "海湾里最亲切的老朋友，红亮的鳞片很受餐馆欢迎。",
    atlasFrame: 0,
    rarity: "common",
    minWeight: 0.7,
    maxWeight: 2.4,
    valuePerKg: 24,
    reelDifficulty: 1,
    habitats: ["sunny-cove", "coral-reef"],
  },
  mackerel: {
    id: "mackerel",
    name: "青花鱼",
    description: "成群穿过浪尖，个头不大却很会突然转向。",
    atlasFrame: 1,
    rarity: "common",
    minWeight: 0.5,
    maxWeight: 1.8,
    valuePerKg: 28,
    reelDifficulty: 2,
    habitats: ["sunny-cove", "moonlit-deep"],
  },
  "sea-bass": {
    id: "sea-bass",
    name: "海鲈",
    description: "沉稳有力的近岸猎手，是码头订单中的常客。",
    atlasFrame: 2,
    rarity: "uncommon",
    minWeight: 1.4,
    maxWeight: 4.8,
    valuePerKg: 34,
    reelDifficulty: 2,
    habitats: ["sunny-cove", "coral-reef", "moonlit-deep"],
  },
  "golden-fin": {
    id: "golden-fin",
    name: "金鳍鱼",
    description: "金色鱼鳍会在珊瑚间一闪而过，收藏家愿意出高价。",
    atlasFrame: 3,
    rarity: "rare",
    minWeight: 1.1,
    maxWeight: 3.7,
    valuePerKg: 72,
    reelDifficulty: 3,
    habitats: ["coral-reef", "moonlit-deep"],
  },
  "blue-spotted": {
    id: "blue-spotted",
    name: "蓝斑鱼",
    description: "身上的蓝色斑点像海面碎光，爆发力出乎意料。",
    atlasFrame: 4,
    rarity: "rare",
    minWeight: 2,
    maxWeight: 5.6,
    valuePerKg: 78,
    reelDifficulty: 4,
    habitats: ["coral-reef", "moonlit-deep"],
  },
  "moon-ray": {
    id: "moon-ray",
    name: "月光鳐",
    description: "只在深海星光下现身的传说鱼种，像一轮月影掠过水底。",
    atlasFrame: 5,
    rarity: "legendary",
    minWeight: 4.5,
    maxWeight: 10.5,
    valuePerKg: 125,
    reelDifficulty: 5,
    habitats: ["moonlit-deep"],
  },
} as const satisfies Record<FishSpeciesId, FishSpeciesConfig>;

export const FISH_SPECIES_LIST = Object.values(FISH_SPECIES);

export const BAITS = {
  bread: {
    id: "bread",
    name: "海蚯蚓",
    description: "便宜可靠，适合海湾里的常见鱼。",
    price: 6,
    rarityBoost: 0,
    weightBoost: 0,
  },
  shrimp: {
    id: "shrimp",
    name: "鲜虾饵",
    description: "更容易吸引大鱼和稀有鱼。",
    price: 18,
    rarityBoost: 0.45,
    weightBoost: 0.12,
  },
  "glow-worm": {
    id: "glow-worm",
    name: "星光虫",
    description: "深海鱼无法抗拒的发光鱼饵。",
    price: 38,
    rarityBoost: 1.05,
    weightBoost: 0.22,
  },
} as const satisfies Record<BaitId, BaitConfig>;

export const BAIT_LIST = Object.values(BAITS);

export const GEAR = {
  rod: {
    id: "rod",
    name: "鱼竿",
    description: "提升安全收线时获得的进度。",
    upgradeCosts: [150, 420],
    benefitLabels: ["标准收线", "收线进度 +20%", "收线进度 +40%"],
  },
  reel: {
    id: "reel",
    name: "卷线器",
    description: "扩大张力安全区并降低失控速度。",
    upgradeCosts: [140, 390],
    benefitLabels: ["宽松张力区", "安全区 +10%", "安全区 +20%"],
  },
  cooler: {
    id: "cooler",
    name: "冷藏箱",
    description: "增加可以暂存并用于订单的渔获数量。",
    upgradeCosts: [120, 360],
    benefitLabels: ["容量 4", "容量 8", "容量 12"],
  },
  boat: {
    id: "boat",
    name: "渔船",
    description: "驶向更远的钓场，遇见更稀有的鱼。",
    upgradeCosts: [260, 720],
    benefitLabels: ["向阳湾", "解锁珊瑚礁", "解锁月光深海"],
  },
} as const satisfies Record<GearId, GearConfig>;

export const GEAR_LIST = Object.values(GEAR);

export const LOCATIONS = {
  "sunny-cove": {
    id: "sunny-cove",
    name: "向阳湾",
    description: "风平浪缓，适合练习抛竿和经营第一批订单。",
    requiredBoatLevel: 1,
    rarityBoost: 0,
  },
  "coral-reef": {
    id: "coral-reef",
    name: "珊瑚礁",
    description: "鱼群更重，也藏着闪耀的稀有品种。",
    requiredBoatLevel: 2,
    rarityBoost: 0.45,
  },
  "moonlit-deep": {
    id: "moonlit-deep",
    name: "月光深海",
    description: "高风险的远海钓场，传说中的月光鳐在这里游弋。",
    requiredBoatLevel: 3,
    rarityBoost: 0.9,
  },
} as const satisfies Record<LocationId, LocationConfig>;

export const LOCATION_LIST = Object.values(LOCATIONS);

export const WEATHERS = {
  sunny: {
    id: "sunny",
    name: "晴朗",
    description: "海面平静，鱼的体型稳定。",
    rarityBoost: 0,
    weightBoost: 0.02,
  },
  breezy: {
    id: "breezy",
    name: "微风",
    description: "活跃的水流让稀有鱼更愿意靠岸。",
    rarityBoost: 0.18,
    weightBoost: 0.04,
  },
  rainy: {
    id: "rainy",
    name: "阵雨",
    description: "雨声掩盖了渔船，大鱼会游得更近。",
    rarityBoost: 0.28,
    weightBoost: 0.1,
  },
  starry: {
    id: "starry",
    name: "星夜",
    description: "星光照亮深海，传说鱼的气息变得更强。",
    rarityBoost: 0.5,
    weightBoost: 0.08,
  },
} as const satisfies Record<WeatherId, WeatherConfig>;

export const WEATHER_LIST = Object.values(WEATHERS);

export const RARITY_RANK: Record<FishRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

export const RARITY_LABEL: Record<FishRarity, string> = {
  common: "常见",
  uncommon: "少见",
  rare: "稀有",
  legendary: "传说",
};

export const COOLER_CAPACITY_BY_LEVEL: Record<1 | 2 | 3, number> = {
  1: 4,
  2: 8,
  3: 12,
};

export const LEVEL_XP_THRESHOLDS = [
  0, 50, 130, 240, 380, 550, 760, 1_010, 1_300, 1_650,
] as const;

export const NORMAL_DAILY_CASTS = 6;
export const QA_DAILY_CASTS = 3;
