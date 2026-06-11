import { Game } from './core/game'

const app = document.getElementById('app')!
const game = new Game(app)
game.start()
// 调试句柄（不影响正常游玩）
;(window as any).__game = game
