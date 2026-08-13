import { Game } from './core/game'
import { MAPS, randomMapId } from './world/mapConfig'
import { initStartScreen, stopStartScreen } from './ui/startScreen'

const app = document.getElementById('app')!
const mapSelect = document.getElementById('map-select')!
const loading = document.getElementById('loading')!

initStartScreen()

const TIPS = [
  '提示：树林与草丛可以隐蔽身形 · 信号塔与空投藏有高级装备',
  '提示：雨天脚步声会被雨声掩盖 · 但远处枪声也更难分辨',
  '提示：轰炸区开始前有红色警告 · 立即离开标记区域',
  '提示：肾上腺素可以同时恢复能量并加速 · 决赛圈前使用',
  '提示：护甲修理包能恢复破损护甲 · 比换新护甲更省背包空间',
  '提示：载具撞击可以直接淘汰敌人 · 但引擎声会暴露你的位置',
  '提示：燃烧瓶能封锁狭窄入口 · 诱饵弹可以骗出守桥的敌人',
  '提示：第三人称越肩视角按 V 切换 · 倍镜瞄准时自动第一人称',
]

function launch(mapId: string) {
  const cfg = MAPS[mapId]
  stopStartScreen()
  mapSelect.classList.add('hidden')
  loading.classList.remove('hidden')
  document.getElementById('loading-map')!.textContent = `正在生成 ${cfg.name} · ${cfg.subtitle}…`
  const tipEl = document.querySelector('.load-tip')
  if (tipEl) tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]
  // 两帧后再构建，确保加载文案先渲染出来（世界生成会阻塞主线程数秒）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const game = new Game(app, mapId)
      game.start()
      // 调试句柄（不影响正常游玩）
      ;(window as any).__game = game
    })
  })
}

mapSelect.querySelectorAll<HTMLButtonElement>('button[data-map]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.map!
    launch(id === 'random' ? randomMapId() : id)
  })
})
