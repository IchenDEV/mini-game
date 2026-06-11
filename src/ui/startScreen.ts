import { MAPS, MapConfig } from '../world/mapConfig'

/**
 * startScreen：启动选图页的动态背景（余烬粒子 + 等高线漂移 + 扫描光带）
 * 与每张地图卡片的程序化战场缩略图。纯 2D canvas，选图后停止循环。
 */

let raf = 0
let stopped = false

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz), b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function css(hex: number, mul = 1, alpha = 1): string {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * mul))
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * mul))
  const b = Math.min(255, Math.round((hex & 255) * mul))
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

/** 程序化战场缩略图：地形噪声 + 河流 + 森林 + 道路 + POI 点位 */
function drawThumb(canvas: HTMLCanvasElement, cfg: MapConfig) {
  const g = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const b = cfg.biome
  const half = cfg.half
  // 世界坐标 → 画布
  const tx = (x: number) => ((x + half) / (half * 2)) * W
  const tz = (z: number) => ((z + half) / (half * 2)) * H
  // 地形底色：双尺度噪声混合
  const img = g.createImageData(W, H)
  const cBase = b.gBase, cAlt = b.gAlt, cDry = b.gDry
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = (px / W) * 2 - 1, wz = (py / H) * 2 - 1
      const n = vnoise(wx * 5 + cfg.seed % 89, wz * 5 + cfg.seed % 53)
      const n2 = vnoise(wx * 14, wz * 14)
      let hex = cBase
      if (n > 0.62) hex = cDry
      else if (n > 0.45) hex = cAlt
      const mul = 0.82 + n2 * 0.3
      const i4 = (py * W + px) * 4
      img.data[i4] = Math.min(255, ((hex >> 16) & 255) * mul)
      img.data[i4 + 1] = Math.min(255, ((hex >> 8) & 255) * mul)
      img.data[i4 + 2] = Math.min(255, (hex & 255) * mul)
      img.data[i4 + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  // 森林斑块
  g.fillStyle = css(b.canopyColors[0], 0.85, 0.5)
  for (const f of cfg.forests) {
    g.beginPath()
    g.ellipse(tx(f.x), tz(f.z), (f.r / (half * 2)) * W, (f.r / (half * 2)) * H, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 河流（waterY < 0 为干河谷，画暗沙色）
  if (cfg.river) {
    const rv = cfg.river
    g.strokeStyle = b.waterY < 0 ? css(b.gLow, 0.8, 0.9) : css(b.waterColor, 1.15, 0.95)
    g.lineWidth = Math.max(2, (rv.width / (half * 2)) * W)
    g.beginPath()
    for (let x = -half; x <= half; x += half / 30) {
      const z = rv.z0 + Math.sin(x * rv.f1) * rv.a1 + Math.sin(x * rv.f2 + rv.p2) * rv.a2
      if (x === -half) g.moveTo(tx(x), tz(z))
      else g.lineTo(tx(x), tz(z))
    }
    g.stroke()
  }
  // 道路
  g.strokeStyle = css(b.gRoad, 1.05, 0.8)
  g.lineWidth = 1.1
  for (const road of cfg.roads) {
    g.beginPath()
    road.forEach(([x, z], i) => i === 0 ? g.moveTo(tx(x), tz(z)) : g.lineTo(tx(x), tz(z)))
    g.stroke()
  }
  // POI 点
  for (const p of cfg.pois) {
    const r = p.tier >= 3 ? 2.6 : p.tier === 2 ? 2 : 1.4
    g.fillStyle = p.tier >= 3 ? 'rgba(240,179,92,0.95)' : 'rgba(235,235,225,0.8)'
    g.beginPath()
    g.arc(tx(p.x), tz(p.z), r, 0, Math.PI * 2)
    g.fill()
  }
  // 暗角 + 边线
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.42)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
}

interface Ember {
  x: number; y: number; vx: number; vy: number; r: number; a: number; tw: number
}

/** 启动背景：等高线场 + 上升余烬 + 斜向扫描光 */
function startBackground(canvas: HTMLCanvasElement) {
  const g = canvas.getContext('2d')!
  const fit = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  fit()
  window.addEventListener('resize', fit)
  const embers: Ember[] = []
  const spawn = (anyY: boolean): Ember => ({
    x: Math.random() * canvas.width,
    y: anyY ? Math.random() * canvas.height : canvas.height + 8,
    vx: (Math.random() - 0.5) * 9,
    vy: -10 - Math.random() * 22,
    r: 0.7 + Math.random() * 1.7,
    a: 0.25 + Math.random() * 0.5,
    tw: Math.random() * Math.PI * 2,
  })
  for (let i = 0; i < 70; i++) embers.push(spawn(true))
  let last = performance.now()

  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const W = canvas.width, H = canvas.height
    g.clearRect(0, 0, W, H)
    const t = now / 1000

    // 等高线场：几条缓慢漂移的噪声曲线
    g.lineWidth = 1
    for (let li = 0; li < 7; li++) {
      const base = (li / 7) * H
      g.strokeStyle = `rgba(140,165,150,${0.05 + (li % 3) * 0.014})`
      g.beginPath()
      for (let x = 0; x <= W; x += 14) {
        const y = base
          + Math.sin(x * 0.004 + t * 0.12 + li * 1.7) * 26
          + Math.sin(x * 0.013 - t * 0.07 + li * 0.9) * 12
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }

    // 斜向扫描光带（缓慢往返）
    const sweep = (Math.sin(t * 0.16) * 0.5 + 0.5) * (W + 600) - 300
    const grad = g.createLinearGradient(sweep - 230, 0, sweep + 230, 0)
    grad.addColorStop(0, 'rgba(240,179,92,0)')
    grad.addColorStop(0.5, 'rgba(240,179,92,0.05)')
    grad.addColorStop(1, 'rgba(240,179,92,0)')
    g.fillStyle = grad
    g.save()
    g.transform(1, 0, -0.28, 1, 0, 0)
    g.fillRect(sweep - 240, -H, 480, H * 3)
    g.restore()

    // 余烬
    for (const e of embers) {
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.tw += dt * 3
      if (e.y < -10 || e.x < -10 || e.x > W + 10) Object.assign(e, spawn(false))
      const tw = 0.6 + 0.4 * Math.sin(e.tw)
      g.fillStyle = `rgba(240,196,120,${(e.a * tw).toFixed(3)})`
      g.beginPath()
      g.arc(e.x, e.y, e.r, 0, Math.PI * 2)
      g.fill()
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
}

/** 初始化启动页：背景动画 + 各地图缩略图（main.ts 调用） */
export function initStartScreen() {
  stopped = false
  const bg = document.getElementById('ms-bg') as HTMLCanvasElement | null
  if (bg) startBackground(bg)
  document.querySelectorAll<HTMLCanvasElement>('canvas.ms-thumb').forEach((cv) => {
    const id = cv.dataset.thumb
    if (id && MAPS[id]) drawThumb(cv, MAPS[id])
    else {
      // 随机卡：问号底纹
      const g = cv.getContext('2d')!
      g.fillStyle = '#1c2026'
      g.fillRect(0, 0, cv.width, cv.height)
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.05})`
        g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2 + Math.random() * 8, 1.5)
      }
      g.font = '700 34px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = 'rgba(240,179,92,0.85)'
      g.fillText('?', cv.width / 2, cv.height / 2)
    }
  })
}

/** 停止背景循环（进入加载后调用，省 CPU） */
export function stopStartScreen() {
  stopped = true
  cancelAnimationFrame(raf)
}
