# AI 小游戏合集

这个仓库集中维护五个独立的浏览器小游戏。原来的四个单独仓库以 Git subtree 方式并入，提交历史仍可追溯；GitHub Pages 会在一次构建中发布全部游戏。

| 游戏 | 简介 | 在线游玩 | 源码目录 |
| --- | --- | --- | --- |
| 星轨织者 | 牵引与切线飞行的单键动作游戏 | [开始游戏](https://blogs.idevlab.dev/mini-game/) | 仓库根目录 |
| 霓虹风暴 | 单文件、零依赖的竞技场生存射击 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/best-game/) | [`games/best-game`](games/best-game) |
| Pokémon Web Clone | Game Boy 风格的怪物收集 JRPG 原型 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/pokemon-clone/) | [`games/pokemon-clone`](games/pokemon-clone) |
| 孤圈行动 | Three.js 浏览器大逃杀原型 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/pubg-clone/) | [`games/pubg-clone`](games/pubg-clone) |
| 时之笛 Web Clone | Three.js 开放世界动作致敬作品 | [开始游戏](https://blogs.idevlab.dev/mini-game/games/z-clone/) | [`games/z-clone`](games/z-clone) |

## 仓库结构

```text
.
├── src/                     # 星轨织者 React / Phaser 源码
├── public/                  # 星轨织者资源
├── games/
│   ├── best-game/           # 霓虹风暴
│   ├── pokemon-clone/       # 怪物收集 JRPG
│   ├── pubg-clone/          # 孤圈行动
│   └── z-clone/             # 时之笛 Web Clone
└── scripts/
    └── build-collection.mjs # 汇总各游戏的 Pages 产物
```

每个子目录保留原项目的 README、依赖和本地运行方式。`pokemon-clone` 继续使用原仓库声明的 `pret/pokeyellow` 子模块。

## 本地开发

星轨织者需要 Node.js 24+ 与 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发其它游戏时，进入对应的 `games/<name>` 目录，按目录内 README 运行。

完整验证并生成 GitHub Pages 合集：

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:pages
```

最终产物位于 `dist/client/`。星轨织者保留在根路径，其余游戏位于 `dist/client/games/<name>/`。

## 星轨织者操作

- 鼠标 / 触屏 / `Space`：按住牵引，松开发射
- `P`：暂停或继续
- `M`：开启或关闭声音
- `R`：重新开始

`?qa=1` 会启用固定随机种子，便于重复浏览器验收。最高分保存在当前浏览器中。
