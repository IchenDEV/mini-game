import { CITY_BOUNDS } from "./movement.js";

export const SAVE_KEY = "fogharbor-saltlane-v2";
export const OBSERVATIONS = ["lid", "spout", "note"];
export const freshState = () => ({
  version: 2,
  started: false,
  walked: false,
  inspected: [],
  diagnosed: false,
  repairStep: 0,
  orders: null,
  delivered: false,
  signals: [],
  inferred: false,
  letterRead: false,
  chapterComplete: false,
  position: [-6, 3.4],
  wharfMet: false,
  doorstepSeen: false,
  beckMet: false,
  pumpEvidence: [],
  pumpDiagnosed: false,
  pumpStep: 0,
  pumpRestored: false,
  beckDebrief: false,
  homecoming: false,
});
export function validOrders(o) {
  return (
    o &&
    ["today", "contact", "materials"].includes(o.winch) &&
    ["today", "contact", "materials"].includes(o.clock) &&
    !(o.winch === "today" && o.clock === "today")
  );
}
export function readState(value) {
  const s = freshState();
  if (value?.version !== 2) return s;
  s.started = value.started === true;
  s.walked = s.started && value.walked === true;
  s.inspected =
    s.walked && Array.isArray(value.inspected)
      ? [...new Set(value.inspected.filter((x) => OBSERVATIONS.includes(x)))]
      : [];
  s.diagnosed = s.inspected.length === 3 && value.diagnosed === true;
  s.repairStep =
    s.diagnosed && Number.isInteger(value.repairStep)
      ? Math.max(0, Math.min(3, value.repairStep))
      : 0;
  s.orders =
    s.repairStep === 3 && validOrders(value.orders)
      ? { winch: value.orders.winch, clock: value.orders.clock }
      : null;
  s.delivered = !!s.orders && value.delivered === true;
  s.signals =
    s.delivered && Array.isArray(value.signals)
      ? [
          ...new Set(
            value.signals.filter((x) => ["laundry", "pump"].includes(x)),
          ),
        ]
      : [];
  s.inferred = s.signals.length === 2 && value.inferred === true;
  s.letterRead = s.inferred && value.letterRead === true;
  s.chapterComplete = s.letterRead && value.chapterComplete === true;
  if (
    Array.isArray(value.position) &&
    value.position.length === 2 &&
    value.position.every(Number.isFinite) &&
    value.position[0] >= CITY_BOUNDS.minX &&
    value.position[0] <= CITY_BOUNDS.maxX &&
    value.position[1] >= CITY_BOUNDS.minZ &&
    value.position[1] <= CITY_BOUNDS.maxZ
  )
    s.position = [...value.position];
  s.wharfMet = s.chapterComplete && value.wharfMet === true;
  s.doorstepSeen = s.wharfMet && value.doorstepSeen === true;
  s.beckMet = s.doorstepSeen && value.beckMet === true;
  s.pumpEvidence =
    s.beckMet && Array.isArray(value.pumpEvidence)
      ? [
          ...new Set(
            value.pumpEvidence.filter((x) =>
              ["gauge", "seam", "ledger"].includes(x),
            ),
          ),
        ]
      : [];
  s.pumpDiagnosed = s.pumpEvidence.length === 3 && value.pumpDiagnosed === true;
  s.pumpStep =
    s.pumpDiagnosed && Number.isInteger(value.pumpStep)
      ? Math.max(0, Math.min(3, value.pumpStep))
      : 0;
  s.pumpRestored = s.pumpStep === 3;
  s.beckDebrief = s.pumpRestored && value.beckDebrief === true;
  s.homecoming = s.beckDebrief && value.homecoming === true;
  return s;
}
export function applyEvent(state, event, payload) {
  const s = readState(state);
  if (event === "start") s.started = true;
  if (event === "walk" && s.started) s.walked = true;
  if (
    event === "inspect" &&
    s.walked &&
    OBSERVATIONS.includes(payload) &&
    !s.inspected.includes(payload)
  )
    s.inspected.push(payload);
  if (event === "diagnose" && s.inspected.length === 3) s.diagnosed = true;
  if (
    event === "repair" &&
    s.diagnosed &&
    payload === s.repairStep &&
    s.repairStep < 3
  )
    s.repairStep++;
  if (event === "orders" && s.repairStep === 3 && validOrders(payload))
    s.orders = { ...payload };
  if (event === "deliver" && s.orders) s.delivered = true;
  if (
    event === "signal" &&
    s.delivered &&
    ["laundry", "pump"].includes(payload) &&
    !s.signals.includes(payload)
  )
    s.signals.push(payload);
  if (event === "infer" && s.signals.length === 2) s.inferred = true;
  if (event === "letter" && s.inferred) s.letterRead = true;
  if (event === "complete" && s.letterRead) s.chapterComplete = true;
  if (event === "wharf" && s.chapterComplete) s.wharfMet = true;
  if (event === "doorstep" && s.wharfMet) s.doorstepSeen = true;
  if (event === "beck" && s.doorstepSeen) s.beckMet = true;
  if (
    event === "pumpObserve" &&
    s.beckMet &&
    ["gauge", "seam", "ledger"].includes(payload) &&
    !s.pumpEvidence.includes(payload)
  )
    s.pumpEvidence.push(payload);
  if (event === "pumpDiagnose" && s.pumpEvidence.length === 3)
    s.pumpDiagnosed = true;
  if (
    event === "pumpRepair" &&
    s.pumpDiagnosed &&
    payload === s.pumpStep &&
    s.pumpStep < 3
  ) {
    s.pumpStep++;
    s.pumpRestored = s.pumpStep === 3;
  }
  if (event === "debrief" && s.pumpRestored) s.beckDebrief = true;
  if (event === "homecoming" && s.beckDebrief) s.homecoming = true;
  return s;
}
export function phase(s) {
  if (!s.started) return "opening";
  if (!s.walked) return "walk";
  if (!s.diagnosed) return "inspect";
  if (s.repairStep < 3) return "repair";
  if (!s.orders) return "orders";
  if (!s.delivered) return "delivery";
  if (s.signals.length < 2) return "signals";
  if (!s.inferred) return "infer";
  if (!s.letterRead) return "letter";
  if (!s.chapterComplete) return "closing";
  if (!s.wharfMet) return "wharf";
  if (!s.doorstepSeen) return "doorstep";
  if (!s.beckMet) return "beck";
  if (!s.pumpDiagnosed) return "pumpInspect";
  if (!s.pumpRestored) return "pumpRepair";
  if (!s.beckDebrief) return "debrief";
  if (!s.homecoming) return "homecoming";
  return "explore";
}
export function objective(s) {
  return {
    opening: ["开门这天", "米洛带来的茶炉，还在工作台上。", "milo", 0],
    walk: ["修好莫莉的茶炉", "点击地面或使用 WASD，走到工作台前。", "bench", 1],
    inspect: [
      "茶炉为什么漏水？",
      `查看盖口、壶嘴和莫莉的留言 · ${s.inspected.length}/3`,
      "bench",
      2,
    ],
    repair: [
      "换下磨损的密封圈",
      [
        "停用茶炉，确认可以维修。",
        "替换壶嘴接缝处的密封圈。",
        "试倒热水，确认不再漏水。",
      ][s.repairStep],
      "bench",
      3,
    ],
    orders: [
      "给街坊一个准话",
      "到订单板前安排交付。两张旧单，只剩一份铜套。",
      "orders",
      4,
    ],
    delivery: ["把茶炉送到汤铺", "把修好的茶炉送给莫莉。", "molly", 5],
    signals: [
      "街坊的共同异响",
      `比较洗衣院与水闸的节拍 · ${s.signals.length}/2`,
      s.signals.includes("laundry") ? "pump" : "laundry",
      6,
    ],
    infer: ["同一个空拍", "把两处的观察结果告诉莫莉。", "molly", 7],
    letter: ["一封旧地址的信", "米洛带来一封寄给许默修理坊的信。", "milo", 8],
    closing: ["桥还在", "读完维修单，再问问米洛。", "milo", 8],
    wharf: ["沿河往西", "米洛认得路。从运河边走到第七码头。", "wharf", 9],
    doorstep: ["第二级台阶", "看看住户门前的积水留下了什么。", "doorstep", 10],
    beck: [
      "泵站里的看管人",
      "继续沿河向西，找贝克问清设备的情况。",
      "beck",
      11,
    ],
    pumpInspect: [
      "先听两圈",
      "进检查廊，对照压力表、阀盖和检修记录。",
      "engine",
      12,
    ],
    pumpRepair: [
      "只修外侧这一段",
      [
        "关闭外侧小阀，等待指针回零。",
        "更换阀盖垫片。",
        "缓慢复汽，观察两个运转周期。",
      ][s.pumpStep],
      "engine",
      13,
    ],
    debrief: ["让它多转一会儿", "和贝克一起确认排水恢复后的情况。", "beck", 14],
    homecoming: [
      "沿河回去",
      "回汤铺告诉莫莉结果。可以经过南岸，也可以原路返回。",
      "molly",
      15,
    ],
    explore: ["河岸又忙起来了", "工坊、码头和泵站都可以继续走访。", null, 16],
  }[phase(s)];
}
export const SCRIPT = {
  opening: [
    ["Milo", "我敲过门了。", "米洛站在檐下。工作台边缘，一滴水落到石地上。"],
    ["Nora", "听见了。别踩门口那块石头，刚擦过。"],
    ["Milo", "……我已经踩了。"],
    ["Nora", "算了。"],
    ["Milo", "莫莉那台？我记得它，壶嘴歪着的。"],
    ["Nora", "她送来时包了三层。外面这块布倒是新的。"],
    ["Milo", "那块是给你擦手的。她让我带句话，说别学你师父，拿围裙到处蹭。"],
    [
      "Nora",
      "……我以为怕磕坏。",
      "诺拉把干净的布翻过来，叠了一下。",
      "nora_down",
    ],
    ["Milo", "我坐这儿？", "他的手搭上窗边那张旧椅子的靠背。"],
    ["Nora", "那张不稳。"],
    ["Milo", "行。", "米洛松开手，没有试着晃那把椅子。"],
    ["Nora", "边上那张。把上面的书给我就行。"],
    ["Milo", "你修吧。我在这儿分信。"],
  ],
  repaired: [
    [
      "Nora",
      "给我拿张新单子。这个能送回去了。",
      "她又倒了半杯水，抬起茶炉，摸了摸下面的布。",
    ],
    ["Milo", "新的在柜子里。桌上这些，能给我个信儿吗？"],
    ["Nora", "我记得。桥边那只钟，还有洗衣院的绞盘。"],
    ["Milo", "钟的主人又问了一回。她说不急，只是夜里太静，不大习惯。"],
    ["Nora", "我知道怎么修。"],
    ["Milo", "我知道。可上回你也是这么说的，我不好再照着送一次。"],
    ["Nora", "两台要同一号铜套。", "诺拉把抽屉里的零件拨到掌心，数了一遍。"],
    ["Milo", "架上还有吗？"],
    ["Nora", "一个。师父原来把这种放下面，我找了好一会儿。"],
    ["Milo", "那我下午先送哪家的回话？"],
    ["Nora", "等一下。我把日期写上。"],
  ],
  delivery: [
    [
      "Molly",
      "放在靠墙那边，别压着账本。",
      "莫莉擦出一小块地方，把几只碗摞到一边。",
    ],
    ["Nora", "换了壶嘴里的密封圈。炉子没有坏。"],
    ["Molly", "我就说呢，烧水还是很快。"],
    ["Nora", "不过再用一阵，那个把手也……"],
    ["Molly", "知道。会夹手，不能攥得太里边。"],
    ["Nora", "你一直这么用？"],
    ["Molly", "你师父也被夹过。他不肯说，喝汤的时候还把手藏在桌底下。"],
    ["Nora", "他会装作在找东西。", "她想了一下，嘴角才松开。"],
    ["Molly", "对，找钱。翻了半天口袋，最后还是记账。"],
    ["Molly", "真不滴了。你要多少？", "莫莉试着倒了水，伸手拿起汤勺。"],
    ["Nora", "半碗吧。"],
    ["Molly", "给你盛稠一点。"],
    ["Nora", "……停了？", "洗衣院忽然安静了一拍。诺拉的手停在碗沿。"],
    ["Molly", "一会儿就好。这两天都这样。"],
    ["Nora", "那边也停了一下。"],
    ["Molly", "水闸？他们还没来吃饭，大概又在折腾。"],
    ["Nora", "我去看一眼。碗先放这儿。"],
    ["Molly", "去吧。我给你盖着。"],
    ["Nora", "别记到师父账上。", "她已经走开一步，又折回来。"],
    ["Molly", "记谁的？"],
    ["Nora", "我的。"],
    ["Molly", "好。", "莫莉翻过旧账页，在下一行写了两个字。"],
  ],
  inferred: [
    ["Molly", "擦手的布用上没有？你手又湿了。"],
    ["Nora", "用了。洗衣院和水闸一样，供给一断，两边就一起等着。"],
    ["Molly", "所以不是他们越修越坏？"],
    ["Nora", "不是。他们修的是各自那一段。管道接在哪儿，还得顺着找。"],
    ["Molly", "今天还要送别家的东西？"],
    ["Nora", "先回工坊翻旧图。"],
    ["Molly", "喝两口再走。刚才那么烫，现在正好。", "她掀开盖在碗上的小盘子。"],
    ["Nora", "你先忙。我坐那边。"],
  ],
  letter: [
    ["Milo", "还没吃完？"],
    ["Nora", "刚坐下。"],
    ["Milo", "我还以为你回去了。这封夹在旧件里，上面还是你师父的名字。"],
    ["Nora", "谁寄的？"],
    ["Milo", "贝克。"],
    ["Nora", "你认识？"],
    ["Milo", "认识。", "他说完，把信封转到地址那一面。"],
    ["Nora", "第七码头……寄错地方了吧？"],
    ["Milo", "工坊的地址没错。"],
    ["Nora", "我是说，码头的。那边不是拆了吗？"],
    ["Milo", "他们把地图改了。", "米洛看向桥下，没有接着说。"],
    ["Nora", "那房子呢？"],
    ["Milo", "信里写了怎么走。"],
  ],
  closing: [
    ["Nora", "信里让我问你。"],
    ["Milo", "嗯。"],
    ["Nora", "你刚才怎么不说？"],
    ["Milo", "我想着，等你读完再说。"],
    ["Nora", "那地方现在还有人？"],
    ["Milo", "有。"],
    ["Nora", "你带我去吗？"],
    ["Milo", "我正好往那边送信。你穿的是那双薄底鞋吗？"],
    ["Nora", "这双行吧。", "她低头看了看沾着泥的靴子。", "nora_down"],
    ["Milo", "这双行。"],
    ["Nora", "我拿上手册就走。"],
    ["Milo", "门口的牌子，翻过来吗？"],
    [
      "Nora",
      "……翻吧。",
      "窗边那张旧椅子仍空着。诺拉把信夹进手册，扣上自己的工具包。",
    ],
  ],
  noraIdle: [
    ["Nora", "这块布得洗干净了，再还给莫莉。", "茶炉留下的那片湿痕已经浅了。"],
  ],
  miloIdle: [["Milo", "你先忙。我把这几封分好，省得走到桥对面才发现拿错。"]],
  miloAfter: [
    ["Milo", "你准备带几本手册？"],
    ["Nora", "能找到几本带几本。"],
    ["Milo", "桥不宽，推车过不去。"],
    ["Nora", "那你帮我拿两本。"],
    ["Milo", "行。"],
  ],
  mollyIdle: [
    ["Molly", "碗还在那儿。"],
    ["Nora", "我看见了。"],
    ["Molly", "那就别站着。有人要从你后面过。"],
  ],
  mollyAfter: [
    ["Molly", "账记好了。"],
    ["Nora", "我明天来结。"],
    ["Molly", "等你忙完再说。你那只碗还在，别给我忘了。"],
    ["Nora", "他跟你说了？"],
    ["Molly", "米洛哪天不从这儿过。你的碗在那边，帮我端过来。"],
  ],
};

export function promiseScript(orders) {
  const answers =
    orders.winch === "today"
      ? [
          "绞盘今天。那只钟，我先给她回个信，重新约一天。",
          "我下午经过洗衣院，告诉他们别再拆了。",
        ]
      : orders.clock === "today"
        ? [
            "钟今天。洗衣院那边，把缺料的事照实说。",
            "行。我先往桥边去，那位太太上午通常在家。",
          ]
        : [
            "今天先交茶炉。这两家，都得重新约个时间。",
            "好。你把缺的型号给我，我路过材料铺问一声。",
          ];
  return [
    ["Nora", answers[0], "她划掉了旧日期，把单子递给米洛。"],
    ["Milo", answers[1]],
    ["Nora", "谢谢。"],
    ["Milo", "茶炉带上。莫莉给你留的位置，别又让人坐了。"],
  ];
}
export const NAMES = {
  Nora: "诺拉",
  Milo: "米洛",
  Molly: "莫莉",
  Beck: "贝克",
};

export const PUMP_EVIDENCE = {
  gauge: "轮子停下之前，供汽指针先往下掉。停顿从供给这一侧传来。",
  seam: "新接头是干的。旁边旧阀盖的下缘有一线水珠，随后冒出细汽。",
  ledger:
    "记录最后一行写着：“外侧阀盖待换。内支路仍供住户，不可并停。”下面是许默的签名。",
};
export const CITY_SCRIPT = {
  wharf: [
    ["Milo", "看见那根弯栏杆没有？以前信箱就挂在那儿。"],
    ["Nora", "地图上的路，到刚才那座桥就没了。"],
    ["Milo", "画的是新堤线。我们脚下这一截没画进去。"],
    ["Nora", "他们还在晒衣服。", "窗外一条床单被拉了起来，露出下面半开的门。"],
    ["Milo", "昨晚下了一夜，今天好不容易晴了。"],
    ["Nora", "信箱拆了，你怎么送？"],
    ["Milo", "敲门。有时候顺便替他们捎一点东西。"],
    ["Nora", "那边的台阶也是昨晚淹的？"],
    ["Milo", "过去看看。小心靠水的那一级。"],
  ],
  doorstep: [
    ["Nora", "水印到第二级了。", "她蹲下，擦掉石沿上还没干的泥。"],
    ["Milo", "昨天只到第一级。我送信的时候还踩得过去。"],
    ["Nora", "桌腿下面垫的是砖？"],
    ["Milo", "艾达的裁布台。钉在墙上的，搬不了。她今天借隔壁的桌子。"],
    ["Nora", "楼上住人，下面做活。"],
    ["Milo", "嗯。她让我来时帮忙把卷尺拿过去，我差点忘了。"],
    ["Nora", "先拿吧。我去看泵，回来跟她说。"],
    ["Milo", "贝克就在西头。门没关严，推一下就开了。"],
  ],
  beck: [
    ["Beck", "包放台阶上。下面有水。", "贝克把手里的旧垫片搁下，抬头看她。"],
    ["Nora", "贝克先生？信是我收的。我叫诺拉。"],
    ["Beck", "许默工坊的。"],
    ["Nora", "现在是我开门。"],
    ["Beck", "好。那我把工钱给你。", "他说得很平常，腾出了身旁的过道。"],
    ["Nora", "先看看吧。盐锈巷也在停，洗衣院和水闸都一样。"],
    ["Beck", "同一根旧管子。你听，它响的时候，轮子还没停。"],
    ["Nora", "先漏了气，后面才跟不上。"],
    ["Beck", "别急着定。表在门里左手边，记录压在旁边。"],
    ["Nora", "里面的支路不能动？"],
    [
      "Beck",
      "还供着那一排住户。修外面这一段就行，能不能多撑些日子，修完再说。",
    ],
  ],
  restored: [
    ["Nora", "这一圈没停。"],
    [
      "Beck",
      "再等一圈。",
      "两人站着，听轮轴缓缓转过。远处的排水声渐渐连在一起。",
    ],
    ["Nora", "还是稳的。台阶那边要多久退？"],
    ["Beck", "一会儿。等水印露出来，她们就知道了。"],
    ["Nora", "我在记录上看见师父的字了。那张单，搁了多久？"],
    ["Beck", "入春的时候。说好换整段，后来新管线要来了。"],
    ["Nora", "所以先补着。"],
    ["Beck", "先补着。", "贝克看着旧垫片，没有把它扔掉。"],
    ["Nora", "这次也是。阀盖修好了，旧管子还在。"],
    ["Beck", "你肯这么跟我说就好。别替它担保。"],
    ["Nora", "我把今天换过的地方记下来。剩下的，得跟住的人一起商量。"],
    ["Beck", "笔在表后面。写你的名字。"],
  ],
  homecoming: [
    ["Molly", "回来了？看你鞋底，比出去时干净。"],
    ["Nora", "码头那边的水在退了。你这里还停吗？"],
    ["Molly", "刚才一直转。米洛说是你们那边修的。"],
    ["Nora", "修了一只旧阀盖。大管子还没换。"],
    ["Molly", "那你先坐。管子等你喝口水再说。"],
    ["Nora", "碗我自己洗。", "她伸手去拿柜台下那只留着的碗。"],
    ["Molly", "在右边。左边那摞是客人的。"],
    ["Nora", "知道了。"],
  ],
  beckIdle: [["Beck", "里头有干地方。要对着图看，就把纸铺那儿。"]],
  early: [
    ["Beck", "找人？修理工坊在东边，顺着这排管子走。"],
    ["Nora", "我就是从那边来的。先看看路。"],
    ["Beck", "那从门边过，离轮子远一点。"],
  ],
};
