# 六城之心 · The Six Hearts

明亮白昼中的蒸汽朋克探索小游戏。穿过黄铜港、翡翠温室、潮汐水厂、余烬铸造厂、星环天文台与云海总站，找回区域动力组件，按铭牌提示唤醒六座城市的核心。

[在线游玩](https://blogs.idevlab.dev/mini-game/games/brasshaven/) · [返回小游戏合集](https://blogs.idevlab.dev/mini-game/)

## 开发与验证

```bash
npm ci
npm run dev
```

```bash
npm run build
npm test
```

构建生成 `dist/` 与可离线打开的 `Brasshaven.html`。从仓库根目录运行 `pnpm build:pages` 会将游戏加入 GitHub Pages 合集，并运行本游戏的测试。

## 操作

- 点击地面移动；点击道具或小型标记会自动走近互动。
- 拖拽环视，滚轮缩放；走近或悬停显示道具名称。
- 方向键移动，E 互动，A / D 旋转，+ / − 缩放，R 恢复视角。
- M 切换背景音乐，Tab 打开航线图。点击开始后启用音乐。

进度自动保存在当前浏览器。全部六关修复后可以自由往返。

Three.js 实时渲染，程序化建筑、道具、材质与 Web Audio 音乐，无需外部美术或音频素材。角色源模型位于 `public/mechanic.glb`，可用 Blender 脚本 `scripts/build-character.py` 重建。
