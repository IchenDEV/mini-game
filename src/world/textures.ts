import * as THREE from 'three'

/**
 * 程序化贴图库：全部画成接近白色的"亮度纹理"，
 * 由材质 color 相乘上色，因此一张图可服务多种色调。
 */

function canvas(n: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = n
  return [c, c.getContext('2d')!]
}

function makeTex(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 噪点叠加：在现有画布上铺随机亮度斑点 */
function speckle(g: CanvasRenderingContext2D, n: number, count: number, alpha: number, sizeMin: number, sizeMax: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * 255)
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`
    const s = sizeMin + Math.random() * (sizeMax - sizeMin)
    g.fillRect(Math.random() * n, Math.random() * n, s, s)
  }
}

/** 地面草地细节：杂色噪点 + 草丝（平铺在整张地形上） */
export function grassDetail(): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.fillStyle = '#f2f2ee'
  g.fillRect(0, 0, n, n)
  speckle(g, n, 2600, 0.07, 1, 3)
  // 草丝短线
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * n, y = Math.random() * n
    const len = 2 + Math.random() * 5
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9
    const v = 190 + Math.floor(Math.random() * 65)
    g.strokeStyle = `rgba(${v},${v},${Math.floor(v * 0.92)},0.25)`
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    g.stroke()
  }
  // 深色草簇斑块
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 6 + Math.random() * 18
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(120,128,100,0.16)')
    grad.addColorStop(1, 'rgba(120,128,100,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return makeTex(c)
}

/** 灰泥墙面：水平抹痕 + 污渍 + 底部泛脏 */
export function plaster(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#efece6'
  g.fillRect(0, 0, n, n)
  speckle(g, n, 800, 0.05, 1, 3)
  // 横向抹灰痕
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * n
    const v = 200 + Math.floor(Math.random() * 50)
    g.fillStyle = `rgba(${v},${v},${v},0.12)`
    g.fillRect(0, y, n, 1 + Math.random() * 2)
  }
  // 污渍块
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 5 + Math.random() * 16
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(140,135,122,0.13)')
    grad.addColorStop(1, 'rgba(140,135,122,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return makeTex(c)
}

/** 砖墙：错缝砖 + 灰浆缝 */
export function brick(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  const rows = 8
  const bh = n / rows
  const bw = n / 4
  g.fillStyle = '#d8d2c8' // 灰浆
  g.fillRect(0, 0, n, n)
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : bw / 2
    for (let col = -1; col < 5; col++) {
      const v = 225 + Math.floor(Math.random() * 30) - 15
      g.fillStyle = `rgb(${v},${Math.floor(v * 0.97)},${Math.floor(v * 0.93)})`
      g.fillRect(col * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3)
    }
  }
  speckle(g, n, 500, 0.05, 1, 2)
  return makeTex(c)
}

/** 波纹钢板：垂直棱线 + 锈渍（仓库/集装箱） */
export function metalSiding(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#e8eaec'
  g.fillRect(0, 0, n, n)
  const ridges = 10
  const rw = n / ridges
  for (let i = 0; i < ridges; i++) {
    const x = i * rw
    const grad = g.createLinearGradient(x, 0, x + rw, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0.5)')
    grad.addColorStop(0.35, 'rgba(150,153,158,0.35)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.18)')
    grad.addColorStop(1, 'rgba(120,124,130,0.4)')
    g.fillStyle = grad
    g.fillRect(x, 0, rw, n)
  }
  // 锈/污垂痕
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * n
    const y0 = Math.random() * n * 0.5
    const len = 12 + Math.random() * 40
    const grad = g.createLinearGradient(0, y0, 0, y0 + len)
    grad.addColorStop(0, 'rgba(150,120,95,0.22)')
    grad.addColorStop(1, 'rgba(150,120,95,0)')
    g.fillStyle = grad
    g.fillRect(x, y0, 1.6 + Math.random() * 2, len)
  }
  speckle(g, n, 260, 0.05, 1, 2)
  return makeTex(c)
}

/** 屋顶金属瓦楞：横向板条 + 接缝 */
export function roofMetal(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#e6e8e9'
  g.fillRect(0, 0, n, n)
  const rows = 6
  const rh = n / rows
  for (let i = 0; i < rows; i++) {
    const y = i * rh
    const grad = g.createLinearGradient(0, y, 0, y + rh)
    grad.addColorStop(0, 'rgba(255,255,255,0.45)')
    grad.addColorStop(0.85, 'rgba(140,145,150,0.25)')
    grad.addColorStop(1, 'rgba(90,95,100,0.5)')
    g.fillStyle = grad
    g.fillRect(0, y, n, rh)
  }
  speckle(g, n, 320, 0.06, 1, 3)
  return makeTex(c)
}

/** 木板：竖向板条 + 木纹 */
export function woodPlanks(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#eadfce'
  g.fillRect(0, 0, n, n)
  const planks = 6
  const pw = n / planks
  for (let i = 0; i < planks; i++) {
    const x = i * pw
    const v = 215 + Math.floor(Math.random() * 36) - 18
    g.fillStyle = `rgba(${v},${Math.floor(v * 0.94)},${Math.floor(v * 0.85)},0.6)`
    g.fillRect(x + 1, 0, pw - 2, n)
    g.fillStyle = 'rgba(80,65,48,0.5)'
    g.fillRect(x, 0, 1.4, n)
    // 木纹竖线
    for (let k = 0; k < 7; k++) {
      const lx = x + 2 + Math.random() * (pw - 4)
      g.strokeStyle = `rgba(120,100,75,${0.1 + Math.random() * 0.14})`
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(lx, 0)
      const wob = (Math.random() - 0.5) * 6
      g.bezierCurveTo(lx + wob, n * 0.33, lx - wob, n * 0.66, lx + wob, n)
      g.stroke()
    }
    // 节疤
    if (Math.random() < 0.6) {
      const kx = x + pw / 2, ky = Math.random() * n
      g.fillStyle = 'rgba(95,75,55,0.5)'
      g.beginPath()
      g.ellipse(kx, ky, 2.4, 3.6, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  return makeTex(c)
}

/** 混凝土：均匀噪点 + 细裂缝 */
export function concrete(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#eceded'
  g.fillRect(0, 0, n, n)
  speckle(g, n, 1500, 0.06, 1, 2)
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * n, y = Math.random() * n
    g.strokeStyle = 'rgba(90,90,90,0.28)'
    g.lineWidth = 0.8
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.5) * 26
      y += Math.random() * 16
      g.lineTo(x, y)
    }
    g.stroke()
  }
  return makeTex(c)
}

/** 草叶簇（透明背景，用于交叉面片草丛） */
export function grassBlades(): THREE.CanvasTexture {
  const n = 64
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  for (let i = 0; i < 11; i++) {
    const x0 = 4 + Math.random() * (n - 8)
    const h = 22 + Math.random() * 36
    const sway = (Math.random() - 0.5) * 14
    const w = 1.6 + Math.random() * 2
    const v = 195 + Math.floor(Math.random() * 60)
    g.fillStyle = `rgb(${Math.floor(v * 0.92)},${v},${Math.floor(v * 0.6)})`
    g.beginPath()
    g.moveTo(x0 - w, n)
    g.quadraticCurveTo(x0 - w * 0.4 + sway * 0.4, n - h * 0.6, x0 + sway, n - h)
    g.quadraticCurveTo(x0 + w * 0.4 + sway * 0.4, n - h * 0.6, x0 + w, n)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 天空渐变（贴在背景大球内侧） */
export function skyGradient(): THREE.CanvasTexture {
  const [c, g] = canvas(256)
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#7fa6c8')
  grad.addColorStop(0.42, '#aec8da')
  grad.addColorStop(0.62, '#cdd9e0')
  grad.addColorStop(1, '#d8dcd8')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
