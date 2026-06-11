import { Game } from './core/game'
import { MAPS, randomMapId } from './world/mapConfig'

const app = document.getElementById('app')!
const mapSelect = document.getElementById('map-select')!
const loading = document.getElementById('loading')!

function launch(mapId: string) {
  const cfg = MAPS[mapId]
  mapSelect.classList.add('hidden')
  loading.classList.remove('hidden')
  document.getElementById('loading-map')!.textContent = `正在生成 ${cfg.name} · ${cfg.subtitle}…`
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
