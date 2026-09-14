export const REGIONS = [
  {
    id: "brasshaven",
    component: "传动齿轮",
    name: "黄铜港",
    english: "BRASSHAVEN",
    subtitle: "晨光中的第七码头",
    symbol: "⚙",
    color: "#bd904f",
    fog: 0x98c3df,
    floor: 0xc9c7ba,
    water: 0x247980,
    sun: 0xffdf9f,
    story:
      "六城的动力网络沉寂了。你在港口找到一封旧信：让六座城的核心再次共鸣，最后一艘飞艇就能启航。",
    labels: ["进气", "传动", "点火"],
    order: [0, 1, 2],
    clue: "先让蒸汽进入，再接上传动，最后点火。",
    restored: "港口钟声再度响起。温室的航灯已点亮。",
  },
  {
    id: "verdant",
    component: "生命种芯",
    name: "翡翠温室",
    english: "VERDANT GLASSHOUSE",
    subtitle: "会呼吸的玻璃花园",
    symbol: "❧",
    color: "#478369",
    fog: 0xb5d9c5,
    floor: 0xbac7ab,
    water: 0x2f8e76,
    sun: 0xffefd0,
    story:
      "黄铜骨架托起一片永不凋谢的花园。灌溉系统停摆了，玻璃穹顶下的植物正在等待水与风。",
    labels: ["日光", "清水", "微风"],
    order: [1, 0, 2],
    clue: "根先饮水，叶再迎光，最后让微风穿过穹顶。",
    restored: "花园苏醒了，水汽中传来潮汐水厂的讯号。",
  },
  {
    id: "tideworks",
    component: "水轮叶芯",
    name: "潮汐水厂",
    english: "TIDAL WATERWORKS",
    subtitle: "水轮与蓝色回声",
    symbol: "≈",
    color: "#347eab",
    fog: 0xafd9e7,
    floor: 0xb7c6d1,
    water: 0x146aa0,
    sun: 0xffeccc,
    story:
      "巨大的水轮曾为整座城市供能。沿着高架水渠，找回叶芯，让清水重新流向铸造厂。",
    labels: ["蓄压", "排流", "引水"],
    order: [2, 0, 1],
    clue: "先引水入渠，再让压力蓄满，最后打开排流。",
    restored: "水轮恢复运转。铸造厂的冷却管线重新畅通。",
  },
  {
    id: "foundry",
    component: "耐热炉芯",
    name: "余烬铸造厂",
    english: "EMBER FOUNDRY",
    subtitle: "黄铜诞生的地方",
    symbol: "♨",
    color: "#b96843",
    fog: 0xe1c3af,
    floor: 0xc2a688,
    water: 0x8c5033,
    sun: 0xffd1a1,
    story:
      "炉火还在低声燃烧，但巨锤停止了摆动。修复这座工厂，铸出通往高空的最后一枚轴承。",
    labels: ["燃火", "通风", "淬炼"],
    order: [1, 0, 2],
    clue: "炉门先通风，炉心再燃火，成形之后才能淬炼。",
    restored: "巨锤的节奏回来了。新轴承被送往山巅天文台。",
  },
  {
    id: "observatory",
    component: "星象透镜",
    name: "星环天文台",
    english: "ASTRAL OBSERVATORY",
    subtitle: "在白昼里寻找星辰",
    symbol: "✧",
    color: "#8371ad",
    fog: 0xc7c7e1,
    floor: 0xc8c7d7,
    water: 0x657cb0,
    sun: 0xffecd8,
    story:
      "星环记录着六城的航路。为仪器校准天体顺序，它将给出通往云海总站的坐标。",
    labels: ["日轮", "星轨", "月相"],
    order: [2, 1, 0],
    clue: "从月相开始，沿星轨寻找方向，最终归于日轮。",
    restored: "星环完成校准。最后一条航线，在云层之上。",
  },
  {
    id: "skyport",
    component: "点火线圈",
    name: "云海总站",
    english: "CLOUDLINE TERMINAL",
    subtitle: "最后一班飞艇",
    symbol: "➶",
    color: "#997841",
    fog: 0xd2e4ed,
    floor: 0xd8d0b9,
    water: 0xa2c9da,
    sun: 0xffe7bb,
    story:
      "五座城的能量已经汇集到这里。点亮航灯、松开锚链，让停泊已久的飞艇再次飞向远方。",
    labels: ["引擎", "航灯", "锚链"],
    order: [1, 2, 0],
    clue: "先亮航灯，再松锚链，最后启动引擎。",
    restored: "六座城的心重新开始跳动。你的航程，才刚刚开始。",
  },
];

export const GEAR_POSITIONS = [
  [-8, 8.2],
  [9, 1.6],
  [-3.8, 1.8],
];
export const REGULATOR_POSITIONS = [
  [-6.2, 4.3],
  [0, 2.7],
  [6.2, 4.3],
];
export const EXIT_POSITION = [9.4, 9.2];
export const SAVE_KEY = "brasshaven-six-hearts-v1";

export function newJourney() {
  return {
    version: 1,
    current: 0,
    unlocked: 0,
    mistakes: 0,
    finished: false,
    districts: REGIONS.map(() => ({
      collected: [],
      sequence: [],
      restored: false,
    })),
  };
}

export function restoreJourney(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.districts))
    return newJourney();
  const result = newJourney();
  for (let i = 0; i < REGIONS.length; i++) {
    if (i > result.unlocked) break;
    const saved = value.districts[i] || {},
      target = result.districts[i];
    target.collected = [
      ...new Set(
        Array.isArray(saved.collected)
          ? saved.collected.filter(
              (n) => Number.isInteger(n) && n >= 0 && n < 3,
            )
          : [],
      ),
    ];
    if (target.collected.length === 3 && Array.isArray(saved.sequence)) {
      for (let j = 0; j < 3 && saved.sequence[j] === REGIONS[i].order[j]; j++)
        target.sequence.push(saved.sequence[j]);
    }
    target.restored =
      target.collected.length === 3 && target.sequence.length === 3;
    if (target.restored) result.unlocked = Math.min(i + 1, 5);
  }
  result.current = Number.isInteger(value.current)
    ? Math.max(0, Math.min(result.unlocked, value.current))
    : 0;
  result.mistakes = Number.isInteger(value.mistakes)
    ? Math.max(0, value.mistakes)
    : 0;
  result.finished = result.districts.every((d) => d.restored);
  return result;
}

export function collectGear(state, id) {
  const district = state.districts[state.current];
  if (
    !Number.isInteger(id) ||
    id < 0 ||
    id > 2 ||
    district.collected.includes(id)
  )
    return false;
  district.collected.push(id);
  return true;
}

export function activateRegulator(state, id) {
  const district = state.districts[state.current];
  if (district.restored) return "already-restored";
  if (district.collected.length < 3) return "needs-gears";
  if (!Number.isInteger(id) || id < 0 || id > 2) return "invalid";
  if (REGIONS[state.current].order[district.sequence.length] !== id) {
    district.sequence = [];
    state.mistakes++;
    return "wrong";
  }
  district.sequence.push(id);
  if (district.sequence.length < 3) return "correct";
  district.restored = true;
  state.unlocked = Math.min(5, Math.max(state.unlocked, state.current + 1));
  state.finished = state.districts.every((d) => d.restored);
  return state.finished ? "win" : "restore";
}

export function travelTo(state, index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > state.unlocked ||
    index >= REGIONS.length
  )
    return false;
  state.current = index;
  return true;
}
