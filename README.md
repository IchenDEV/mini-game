# AI 小游戏合集

这个仓库集中维护多个独立的浏览器小游戏。原来的四个单独仓库以 Git subtree 方式并入，提交历史仍可追溯；GitHub Pages 会在一次构建中发布全部游戏。

其中主打项目是 **星港街机**：含 **50 款 3D 街机小游戏** 的浏览器游戏合集——动作、休闲、竞速、益智、射击、体育六大分类，全部使用 Three.js 实时渲染，键盘、鼠标、触屏皆可游玩，最高分保存在本机。

| 游戏 | 简介 | 在线游玩 | 源码目录 |
| --- | --- | --- | --- |
| 星港街机 | 50 款 Three.js 3D 街机小游戏合集（含创始作星轨织者） | [开始游戏](https://blogs.idevlab.dev/mini-game/) | 仓库根目录 |
| 六城之心 | 明亮白昼中的体素蒸汽朋克探索，修复六城核心并乘飞艇启航 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/brasshaven/) | [`games/brasshaven`](games/brasshaven) |
| 霓虹风暴 | 单文件、零依赖的竞技场生存射击 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/best-game/) | [`games/best-game`](games/best-game) |
| Pokémon Web Clone | Game Boy 风格的怪物收集 JRPG 原型 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/pokemon-clone/) | [`games/pokemon-clone`](games/pokemon-clone) |
| 孤圈行动 | Three.js 浏览器大逃杀原型 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/pubg-clone/) | [`games/pubg-clone`](games/pubg-clone) |
| 时之笛 Web Clone | Three.js 开放世界动作致敬作品 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/z-clone/) | [`games/z-clone`](games/z-clone) |

## 仓库结构

```text
.
├── src/                     # 星港街机 React / Three.js 源码（含创始作星轨织者）
├── public/                  # 星港街机资源
├── games/
│   ├── brasshaven/          # 六城之心
│   ├── best-game/           # 霓虹风暴
│   ├── pokemon-clone/       # 怪物收集 JRPG
│   ├── pubg-clone/          # 孤圈行动
│   └── z-clone/             # 时之笛 Web Clone
└── scripts/
    └── build-collection.mjs # 汇总各游戏的 Pages 产物
```

每个子目录保留原项目的 README、依赖和本地运行方式。`pokemon-clone` 继续使用原仓库声明的 `pret/pokeyellow` 子模块。

## 本地开发

星港街机需要 Node.js 24+ 与 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开终端显示的本地地址即可进入街机大厅。

开发其它游戏时，进入对应的 `games/<name>` 目录，按目录内 README 运行。

完整验证并生成 GitHub Pages 合集：

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:pages
```

最终产物位于 `dist/client/`。星港街机保留在根路径，其余游戏位于 `dist/client/games/<name>/`。

## 街机结构

- **大厅**：50 张机台卡片按分类陈列，展示玩法简介、操作说明与本机最高分。
- **游戏页**：每张机台都有独立的 3D 场景、HUD（得分 / 统计字段 / 进度条 / 飘字提示）、待机 / 暂停 / 结算覆盖层。
- **通用按键**：`空格` / 回车为主动作，`P` 暂停，`M` 声音，`R` 重开；数字键 `1-9` 用于打地鼠、节奏、记忆类等棋盘机台。

## 技术结构

- React + TypeScript：街机大厅、HUD 与结算覆盖层（hash 路由：`#/` 大厅、`#/play/<id>` 机台、`#/starweaver` 创始作）
- Three.js：50 个游戏各自的 3D 场景、灯光、粒子与镜头动画
- Vitest：每款游戏的纯逻辑层都有独立单测（305 个用例），碰撞、计分、状态机与最高分契约在无 WebGL 环境下验证
- Web Audio：程序化合成音效（拾取、命中、发射、胜负），无音频资源
- Vite：开发与生产构建，产物适配 GitHub Pages 子路径部署

## 50 款机台

- **动作（13）**：陨石回廊、三道狂奔、光墙弹球、砖块风暴、色彩闸门、藤蔓摆荡、过马路、太空清道夫、弹射登塔、磁力收集、护盾偏转、穿线走珠、弹幕花园
- **休闲（10）**：霓虹叠塔、星门穿行、螺旋跳塔、金币雨、云端跳跳、打地鼠3D、气球爆破、吊车抓宝、节奏敲击、平衡木板
- **竞速（5）**：隧道疾驰、斜坡滚球、穿圈竞速、雪山回转、火箭着陆
- **益智（12）**：贪吃蛇域、立方记忆、滑块谜阵、熄灯谜阵、回声音阶、幽灵迷宫、冰面推箱、激光校准、方块消消、合并方块、扫雷星域、三仙归洞
- **射击（5）**：陨石炮手、流星守望、靶心射击、加农打靶、飞镖之夜
- **体育（5）**：投篮节奏、弹跳保持、保龄全倒、迷你推杆、弹珠台

## 创始作：星轨织者

大厅底部的「街机创始作」入口（`#/starweaver`）保留了项目最初的 2D 游戏：围绕引力与切线飞行设计的单键动作游戏。按住鼠标、触屏或空格，星针会牵引最近的锚星；松开后沿切线发射。依次抵达目标星、擦过蚀洞并收集火花，在夜色耗尽前缝出尽可能长的星轨。

每局初始 75 秒。缝合目标星会提高连击、得分并补回少量时间；靠近蚀洞但不相撞可获得险距奖励；碰撞蚀洞会扣时并中断连击。`?qa=1` 会启用固定随机种子，便于重复浏览器验收。最高分保存在当前浏览器中。

## 部署

推送到 `main` 后，GitHub Actions 会运行测试与构建，并将 `dist/client` 发布到 GitHub Pages（子路径 `/mini-game/`）。
