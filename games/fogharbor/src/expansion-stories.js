/** Local workplace exchanges; completed lines require the visible act to settle. */
export const EXPANSION_SPEAKERS = {
  Local_scene01: {
    name: "司灯人",
    label: "Lamp keeper",
    sceneId: "scene01",
  },
  Local_scene02: {
    name: "值班护工",
    label: "Ward attendant",
    sceneId: "scene02",
  },
  Local_scene03: {
    name: "酒馆掌柜",
    label: "Publican",
    sceneId: "scene03",
  },
  Local_scene04: {
    name: "面包摊主",
    label: "Bread seller",
    sceneId: "scene04",
  },
  Local_scene05: {
    name: "马具工",
    label: "Harness keeper",
    sceneId: "scene05",
  },
  Local_scene06: {
    name: "分拣工",
    label: "Salvage sorter",
    sceneId: "scene06",
  },
  Local_scene07: {
    name: "邮务员",
    label: "Postal clerk",
    sceneId: "scene07",
  },
  Local_scene08: {
    name: "仪器学徒",
    label: "Instrument apprentice",
    sceneId: "scene08",
  },
  Local_scene09: {
    name: "货栈值守",
    label: "Warehouse clerk",
    sceneId: "scene09",
  },
  Local_scene10: {
    name: "花匠",
    label: "Gardener",
    sceneId: "scene10",
  },
};

export const EXPANSION_STORIES = {
  scene01: [
    ["Nora", "还不收灯？"],
    ["Local_scene01", "晚一班的人还要借这里练歌。灯芯刚才老抖。"],
    ["Nora", "那我小声一点。"],
  ],
  scene02: [
    ["Nora", "这里怎么老响？"],
    ["Local_scene02", "管子里存了气。我睡值班椅时，比谁都听得清。"],
    ["Nora", "难怪你先来拧这个。"],
  ],
  scene03: [
    ["Nora", "这只杯子还留着？"],
    ["Local_scene03", "夜班车夫总是最后到。给他留只干的。"],
    ["Nora", "那我坐另一桌。"],
  ],
  scene04: [
    ["Nora", "还剩这一包？"],
    ["Local_scene04", "给家里留的。上回走到门口，纸口就散了。"],
    ["Nora", "今天先包牢再回去。"],
  ],
  scene05: [
    ["Nora", "车已经有人等了。"],
    ["Local_scene05", "我知道。这扣子松得讨厌，出门前得收紧。"],
    ["Nora", "我站这儿等你。"],
  ],
  scene06: [
    ["Nora", "这一截也留？"],
    ["Local_scene06", "抽屉后头少个挡块，差的就这么一点。"],
    ["Nora", "原来你已经替它找好地方了。"],
  ],
  scene07: [
    ["Nora", "刚才那枚没盖清？"],
    ["Local_scene07", "太轻了。我可不想再收到一封信，问它到底哪天寄的。"],
    ["Nora", "这封先放着，我不碰。"],
  ],
  scene08: [
    ["Nora", "你怎么转一下就停？"],
    ["Local_scene08", "师傅回来总要对表。我宁愿现在多等一会儿。"],
    ["Nora", "怕他看出来？"],
    ["Local_scene08", "怕我自己没看出来。"],
  ],
  scene09: [
    ["Nora", "都写了签，还要再扣一下？"],
    ["Local_scene09", "昨晚这扣子松开过。接班的人找了我半天。"],
    ["Nora", "今天让他少跑一趟。"],
  ],
  scene10: [
    ["Nora", "只浇这点？"],
    ["Local_scene10", "这盆小，壶又重。我一着急，它就先遭殃。"],
    ["Nora", "我等你倒完再说。"],
  ],
};

export const EXPANSION_SETTLED_STORIES = {
  scene01: [
    ["Local_scene01", "这回不晃了。谱上的小字也看得清。"],
    ["Nora", "你先歇歇手。"],
    ["Local_scene01", "等他们来，我就收另一盏。"],
  ],
  scene02: [
    ["Local_scene02", "好了，阀门关回去了。今晚这把椅子能安静点。"],
    ["Nora", "但愿也能少坐一会儿。"],
    ["Local_scene02", "借你这句话。"],
  ],
  scene03: [
    ["Local_scene03", "擦好了。你坐吧，他还没来。"],
    ["Nora", "我把这只留给他。"],
    ["Local_scene03", "成，别让他拿走我的擦布就行。"],
  ],
  scene04: [
    ["Local_scene04", "这回折住了，封条也压好了。"],
    ["Nora", "今晚不会一路捡面包了。"],
    ["Local_scene04", "那次你也看见了啊。"],
  ],
  scene05: [
    ["Local_scene05", "好了。它不晃，我才敢放手。"],
    ["Nora", "这回我也看清了。"],
    ["Local_scene05", "成，这副可以挂回去了。"],
  ],
  scene06: [
    ["Local_scene06", "留进木料格了。下班再来取。"],
    ["Nora", "我记着，这块不是柴。"],
    ["Local_scene06", "别替我收得太好，回头又找不着。"],
  ],
  scene07: [
    ["Local_scene07", "成，这枚清楚。等它干一干。"],
    ["Nora", "我先不碰那摞。"],
    ["Local_scene07", "谢谢，我刚数到这儿。"],
  ],
  scene08: [
    ["Local_scene08", "针稳了。今天先记这儿。"],
    ["Nora", "这回不用假装没看见了。"],
    ["Local_scene08", "你也别替我说出去。"],
  ],
  scene09: [
    ["Local_scene09", "扣住了，货签也压平了。"],
    ["Nora", "你终于能放手了。"],
    ["Local_scene09", "先让我再看一眼。"],
  ],
  scene10: [
    ["Local_scene10", "够了。壶放回去了。"],
    ["Nora", "你袖口这回是干的。"],
    ["Local_scene10", "总算记住了，手慢一点。"],
  ],
};

export const ROOM_NOTES = {
  B01: [["Nora", "钟绳的握手处磨亮了。有人每次都抓在同一个地方。"]],
  B02: [["Nora", "壁炉前给饭桌留了一个位置。书看到一半，也得先吃饭。"]],
  B03: [["Nora", "歌谱一人一页，风琴只一架。总要等别人那一句唱完。"]],
  B04: [["Nora", "毯子叠在脚边，枕头还空着。下一位来之前，先把暖气照顾好。"]],
  B05: [["Nora", "研钵没收起来。最后一份药，大概还得磨细一点。"]],
  B06: [["Nora", "干净的布包放到架上了。手碰过旧盖子，得再洗一次。"]],
  B07: [["Nora", "杯子收到最后，才知道今天有多少人坐过这里。"]],
  B08: [["Nora", "装好的瓶子先排在桌上。急着装箱，碰碎一只就要重新擦地。"]],
  B09: [["Nora", "后台那只箱子够装一场戏。台子小，换一件衣服都得轻手轻脚。"]],
  B10: [["Nora", "最后几个纸包留着慢慢折。收摊不能把前面的仔细都省掉。"]],
  B11: [["Nora", "长柄铲还靠在炉边。面包拿完，炉里的那点热还能留一会儿。"]],
  B12: [["Nora", "鱼收得差不多了，清洗台却还没闲下来。卖完不算收完。"]],
  B13: [["Nora", "挽带扣好一副，出发前就少一件让人惦记的事。"]],
  B14: [["Nora", "草架和水槽都备好了。马回来时，先不用等人找桶。"]],
  B15: [["Nora", "轮圈靠着架子，台钳还开着。拆下来容易，装回去得慢。"]],
  B16: [
    ["Nora", "木头、瓶子、煤灰各有去处。这里的人每天都得替旧东西再看一眼。"],
  ],
  B17: [["Nora", "那张旧长椅还留着。有人会愿意把它带回去修好。"]],
  B18: [["Nora", "白布叠了四层。到最后一层，手也不能比刚开始时脏。"]],
  B19: [["Nora", "信封一封一封过手。寄出去的人在等，收到的人也在等。"]],
  B20: [["Nora", "校样还单独留着。版上多一个错字，就会跟着印很多遍。"]],
  B21: [["Nora", "书还压在螺杆下面。胶没干的时候，再喜欢也得忍住别翻。"]],
  B22: [["Nora", "校表的人先把手停下来。指针不稳时，看得再急也没用。"]],
  B23: [["Nora", "长钟的摆锤露在窄窗里。修好以后，屋里会多一个熟悉的声音。"]],
  B24: [
    [
      "Nora",
      "上下铺各有一条毯子，柜子也一人一格。东西少，自己的那点地方仍然要留。",
    ],
  ],
  B25: [["Nora", "货签压平，封扣扣好。下一班来的人就少费一次口舌。"]],
  B26: [["Nora", "两张桌上的纸都没收。查完货，还得把记录补齐。"]],
  B27: [["Nora", "绳圈要一圈一圈理顺。留一个死结，上船以后才会着急。"]],
  B28: [["Nora", "小苗喝够水就停。照顾它，有时候是忍住不再加一点。"]],
  B29: [["Nora", "纸还留在记录桌上。天气变得快，不能等想起来才补写。"]],
  B30: [["Nora", "院子里照顾了那么多植物，屋里还给自己留了一盆。"]],
};
