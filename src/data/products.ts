import type {
  ProductConfig,
  ProductId,
  SpeciesConfig,
  SpeciesId,
  UpgradeId,
} from "../game/types";

export const PRODUCTS: Record<ProductId, ProductConfig> = {
  apple: {
    id: "apple",
    name: "苹果",
    unitCost: 6,
    sellPrice: 12,
    atlasFrame: 0,
    shelfLabel: "鲜果台",
    shelfPoint: { x: 328, y: 270 },
  },
  milk: {
    id: "milk",
    name: "牛奶",
    unitCost: 9,
    sellPrice: 18,
    atlasFrame: 1,
    shelfLabel: "乳品柜",
    shelfPoint: { x: 265, y: 118 },
  },
  bread: {
    id: "bread",
    name: "面包",
    unitCost: 7,
    sellPrice: 15,
    atlasFrame: 2,
    shelfLabel: "零食架",
    shelfPoint: { x: 610, y: 276 },
  },
  juice: {
    id: "juice",
    name: "果汁",
    unitCost: 8,
    sellPrice: 17,
    atlasFrame: 3,
    shelfLabel: "饮料柜",
    shelfPoint: { x: 445, y: 118 },
  },
  cookie: {
    id: "cookie",
    name: "饼干",
    unitCost: 5,
    sellPrice: 11,
    atlasFrame: 4,
    shelfLabel: "零食架",
    shelfPoint: { x: 650, y: 280 },
  },
  greens: {
    id: "greens",
    name: "蔬菜",
    unitCost: 4,
    sellPrice: 10,
    atlasFrame: 5,
    shelfLabel: "鲜蔬台",
    shelfPoint: { x: 390, y: 325 },
  },
};

export const SPECIES: Record<SpeciesId, SpeciesConfig> = {
  redPanda: { id: "redPanda", name: "小浣熊", atlasFrame: 0 },
  shiba: { id: "shiba", name: "柴柴", atlasFrame: 1 },
  cat: { id: "cat", name: "灰灰猫", atlasFrame: 2 },
  rabbit: { id: "rabbit", name: "小白兔", atlasFrame: 3 },
  capybara: { id: "capybara", name: "卡皮巴拉", atlasFrame: 4 },
  duck: { id: "duck", name: "小白鸭", atlasFrame: 5 },
};

export const PRODUCT_LIST = Object.values(PRODUCTS);
export const SPECIES_LIST = Object.values(SPECIES);

export const DAILY_TARGETS = [0, 260, 430, 620] as const;

export const UPGRADE_CONFIG: Record<
  UpgradeId,
  {
    name: string;
    description: string;
    icon: string;
    costs: readonly [number, number, number];
    maxLevel: number;
  }
> = {
  shelf: {
    name: "加宽货架",
    description: "每级让每类商品的货架容量 +3",
    icon: "shelf",
    costs: [120, 220, 360],
    maxLevel: 3,
  },
  checkout: {
    name: "扫码收银",
    description: "每级减少收银冷却 1 秒",
    icon: "scanner",
    costs: [150, 260, 400],
    maxLevel: 3,
  },
  patience: {
    name: "舒适队列",
    description: "每级让顾客排队时更有耐心",
    icon: "heart",
    costs: [110, 210, 340],
    maxLevel: 3,
  },
};
