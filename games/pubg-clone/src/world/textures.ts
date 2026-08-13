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

// ---------------- 像素级 value-noise（写实纹理基底） ----------------

function vhash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
/** 周期化 value noise：lattice 坐标对 period 取模，保证四方连续平铺 */
function vnoiseTile(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const w = (v: number) => ((v % period) + period) % period
  const a = vhash(w(ix) + seed * 13.7, w(iy) + seed * 7.9)
  const b = vhash(w(ix + 1) + seed * 13.7, w(iy) + seed * 7.9)
  const c = vhash(w(ix) + seed * 13.7, w(iy + 1) + seed * 7.9)
  const d = vhash(w(ix + 1) + seed * 13.7, w(iy + 1) + seed * 7.9)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
/** 平铺 FBM 场（0..1） */
function fbmField(n: number, freq: number, oct: number, seed = 0): Float32Array {
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0, amp = 0.5, f = freq
      for (let o = 0; o < oct; o++) {
        v += vnoiseTile((x / n) * f, (y / n) * f, f, seed + o * 7) * amp
        amp *= 0.5
        f *= 2
      }
      out[y * n + x] = v
    }
  }
  return out
}

/** 地面草地细节：FBM 色斑基底 + 方向性草丝 + 土壤露头（平铺在整张地形上） */
export function grassDetail(): THREE.CanvasTexture {
  const n = 512
  const [c, g] = canvas(n)
  // FBM 双尺度基底：大块明暗 + 细碎颗粒
  const f1 = fbmField(n, 6, 4, 3)
  const f2 = fbmField(n, 28, 3, 11)
  const img = g.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const a = f1[i], b = f2[i]
    let v = 196 + (a - 0.5) * 96 + (b - 0.5) * 52
    // 低洼处发暗偏土色
    const soil = a < 0.40 ? (0.40 - a) * 2.0 : 0
    const r = v * (1 - soil * 0.12)
    const gg = v * (1 - soil * 0.28)
    const bb = v * (0.86 - soil * 0.30)
    img.data[i * 4] = Math.max(0, Math.min(255, r))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, gg))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, bb))
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // 方向性草丝（顺坡倒伏感）
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * n, y = Math.random() * n
    const len = 3 + Math.random() * 8
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2
    const v = 165 + Math.floor(Math.random() * 90)
    g.strokeStyle = `rgba(${Math.floor(v * 0.94)},${v},${Math.floor(v * 0.62)},${0.16 + Math.random() * 0.18})`
    g.lineWidth = 0.8 + Math.random() * 0.8
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 2, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
    g.stroke()
  }
  // 亮草尖高光
  for (let i = 0; i < 900; i++) {
    const v = 215 + Math.floor(Math.random() * 40)
    g.fillStyle = `rgba(${Math.floor(v * 0.96)},${v},${Math.floor(v * 0.66)},0.25)`
    g.fillRect(Math.random() * n, Math.random() * n, 1.4, 1.4)
  }
  // 深色草簇与土斑
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 6 + Math.random() * 26
    const soil = Math.random() < 0.3
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, soil ? 'rgba(150,128,96,0.20)' : 'rgba(96,112,76,0.22)')
    grad.addColorStop(1, 'rgba(100,110,80,0)')
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

/** 沙地细节：碎石 + 风纹 */
export function sandDetail(): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.fillStyle = '#f4efe2'
  g.fillRect(0, 0, n, n)
  speckle(g, n, 3200, 0.06, 1, 2)
  // 风积沙纹（缓弧线）
  for (let i = 0; i < 40; i++) {
    const y0 = Math.random() * n
    g.strokeStyle = `rgba(${170 + Math.random() * 50},${160 + Math.random() * 40},${130 + Math.random() * 30},0.12)`
    g.lineWidth = 1 + Math.random() * 1.6
    g.beginPath()
    g.moveTo(0, y0)
    g.bezierCurveTo(n * 0.3, y0 + (Math.random() - 0.5) * 22, n * 0.7, y0 + (Math.random() - 0.5) * 22, n, y0 + (Math.random() - 0.5) * 10)
    g.stroke()
  }
  // 碎石
  for (let i = 0; i < 160; i++) {
    const v = 120 + Math.floor(Math.random() * 90)
    g.fillStyle = `rgba(${v},${Math.floor(v * 0.93)},${Math.floor(v * 0.8)},0.5)`
    const s = 1 + Math.random() * 2.6
    g.beginPath()
    g.ellipse(Math.random() * n, Math.random() * n, s, s * 0.7, Math.random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  return makeTex(c)
}

/** 雨林地面：湿泥 + 落叶 + 苔斑 */
export function jungleDetail(): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.fillStyle = '#e8e6da'
  g.fillRect(0, 0, n, n)
  speckle(g, n, 2400, 0.08, 1, 3)
  // 湿渍暗斑
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 5 + Math.random() * 20
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(70,80,55,0.2)')
    grad.addColorStop(1, 'rgba(70,80,55,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 落叶
  for (let i = 0; i < 220; i++) {
    const v = 150 + Math.floor(Math.random() * 80)
    g.fillStyle = `rgba(${v},${Math.floor(v * 0.86)},${Math.floor(v * 0.5)},0.55)`
    g.save()
    g.translate(Math.random() * n, Math.random() * n)
    g.rotate(Math.random() * Math.PI)
    g.beginPath()
    g.ellipse(0, 0, 1.6 + Math.random() * 2.4, 0.9 + Math.random() * 1.2, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  // 草丝
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * n, y = Math.random() * n
    const v = 160 + Math.floor(Math.random() * 70)
    g.strokeStyle = `rgba(${Math.floor(v * 0.8)},${v},${Math.floor(v * 0.55)},0.3)`
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 4)
    g.stroke()
  }
  return makeTex(c)
}

/** 树皮：竖向沟壑裂纹（亮度纹理，由 trunkColor 上色） */
export function bark(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  const f = fbmField(n, 4, 4, 21)
  const img = g.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // 拉伸噪声形成竖向纹理
      const ridge = vnoiseTile((x / n) * 14, (y / n) * 3, 14, 33)
      const fine = f[y * n + x]
      let v = 150 + (ridge - 0.5) * 150 + (fine - 0.5) * 60
      // 深裂缝
      if (ridge < 0.32) v *= 0.55
      const i4 = (y * n + x) * 4
      img.data[i4] = Math.max(0, Math.min(255, v * 1.04))
      img.data[i4 + 1] = Math.max(0, Math.min(255, v * 0.97))
      img.data[i4 + 2] = Math.max(0, Math.min(255, v * 0.88))
      img.data[i4 + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  // 横向皮孔
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * n
    g.fillStyle = `rgba(40,32,25,${0.12 + Math.random() * 0.18})`
    g.fillRect(Math.random() * n, y, 4 + Math.random() * 10, 1 + Math.random())
  }
  return makeTex(c, 1)
}

/** 叶团（透明背景圆形蓬团）：成簇小叶片，上亮下暗，用于树冠/灌木面片 */
export function leaves(): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const cx = n / 2, cy = n / 2
  const R = n * 0.46
  // 先撒叶簇中心，再围绕簇心铺叶（产生团块感而非均匀噪点）
  const clumps: [number, number][] = []
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * R * 0.8
    clumps.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92])
  }
  for (let i = 0; i < 620; i++) {
    const [kx, ky] = clumps[Math.floor(Math.random() * clumps.length)]
    const a = Math.random() * Math.PI * 2
    const cr = Math.random() ** 1.6 * R * 0.36
    const x = kx + Math.cos(a) * cr
    const y = ky + Math.sin(a) * cr
    const dc = Math.hypot(x - cx, (y - cy) / 0.92)
    if (dc > R) continue
    if (Math.random() < (dc / R) ** 2.6) continue // 边缘稀疏
    // 上部受光偏亮，下部自遮蔽压暗；亮度纹理由 canopy 颜色上色
    const litT = 0.55 - (y - cy) / n * 1.25 + Math.random() * 0.3
    let v = 112 + litT * 150 + Math.random() * 42 - (dc / R) * 14
    v = Math.max(58, Math.min(255, v))
    g.fillStyle = `rgb(${Math.floor(v)},${Math.floor(v)},${Math.floor(v * 0.9)})`
    g.save()
    g.translate(x, y)
    g.rotate(Math.random() * Math.PI * 2)
    const s = 2.6 + Math.random() * 4.6
    g.beginPath()
    g.ellipse(0, 0, s, s * (0.42 + Math.random() * 0.3), 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 蓬松积云（透明 billboard） */
export function cloudPuff(): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const f = fbmField(n, 5, 4, 47)
  const img = g.createImageData(n, n)
  const cx = n / 2, cy = n * 0.58
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - cx) / (n * 0.46), dy = (y - cy) / (n * 0.30)
      const d = Math.sqrt(dx * dx + dy * dy)
      const noise = f[y * n + x]
      let alpha = (1 - d) * 1.25 + (noise - 0.5) * 0.9
      alpha = Math.max(0, Math.min(1, alpha))
      alpha = alpha * alpha * (3 - 2 * alpha)
      // 底部略带灰底
      const shade = 235 + (noise - 0.5) * 30 - Math.max(0, (y - cy) / n) * 70
      const i4 = (y * n + x) * 4
      img.data[i4] = Math.min(255, shade + 8)
      img.data[i4 + 1] = Math.min(255, shade + 10)
      img.data[i4 + 2] = Math.min(255, shade + 14)
      img.data[i4 + 3] = Math.floor(alpha * 235)
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function hexCss(hex: number, mul = 1): string {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * mul))
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * mul))
  const b = Math.min(255, Math.round((hex & 255) * mul))
  return `rgb(${r},${g},${b})`
}

/** 不规则迷彩斑块（多椭圆聚合 + 四方平铺偏移） */
function camoBlob(g: CanvasRenderingContext2D, n: number, cx: number, cy: number, r: number, fill: string) {
  g.fillStyle = fill
  const parts = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < parts; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * r * 0.7
    const ex = cx + Math.cos(a) * d
    const ey = cy + Math.sin(a) * d
    const rw = r * (0.35 + Math.random() * 0.5)
    const rh = rw * (0.5 + Math.random() * 0.7)
    const rot = Math.random() * Math.PI
    // 平铺：越界斑块在对侧补绘
    for (const ox of [-n, 0, n]) {
      for (const oy of [-n, 0, n]) {
        if ((ox !== 0 && ex + ox > -r * 2 && ex + ox < n + r * 2) || (oy !== 0 && ey + oy > -r * 2 && ey + oy < n + r * 2) || (ox === 0 && oy === 0)) {
          g.save()
          g.translate(ex + ox, ey + oy)
          g.rotate(rot)
          g.beginPath()
          g.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
        }
      }
    }
  }
}

/** 角色作训服迷彩：以服装基色派生 4 色斑块（贴图自带颜色，材质 color 留白） */
export function camo(base: number): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = hexCss(base)
  g.fillRect(0, 0, n, n)
  // 三层派生色块：暗沉绿 / 亮卡其 / 深炭斑
  const layers: [string, number, number][] = [
    [hexCss(base, 0.74), 15, 19],
    [hexCss(base, 1.16), 11, 15],
    [hexCss(base, 0.5), 8, 12],
  ]
  for (const [fill, rMin, count] of layers) {
    for (let i = 0; i < count; i++) {
      camoBlob(g, n, Math.random() * n, Math.random() * n, rMin + Math.random() * 9, fill)
    }
  }
  // 织物纹理叠加
  const img = g.getImageData(0, 0, n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const weave = ((x % 3) < 1.5 ? 5 : -5) + ((y % 3) < 1.5 ? 4 : -4) + (Math.random() - 0.5) * 10
      const i4 = (y * n + x) * 4
      img.data[i4] = Math.max(0, Math.min(255, img.data[i4] + weave))
      img.data[i4 + 1] = Math.max(0, Math.min(255, img.data[i4 + 1] + weave))
      img.data[i4 + 2] = Math.max(0, Math.min(255, img.data[i4 + 2] + weave))
    }
  }
  g.putImageData(img, 0, 0)
  const t = makeTex(c, 1.6)
  return t
}

/** 降落伞伞衣：放射状交替幅条 + 缝线 + 加强带（沿 u 方向环绕） */
export function chuteGores(c1: number, c2: number): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  const gores = 12
  const gw = n / gores
  for (let i = 0; i < gores; i++) {
    const col = i % 2 === 0 ? c1 : c2
    const grad = g.createLinearGradient(i * gw, 0, (i + 1) * gw, 0)
    grad.addColorStop(0, hexCss(col, 0.72))
    grad.addColorStop(0.5, hexCss(col, 1.04))
    grad.addColorStop(1, hexCss(col, 0.68))
    g.fillStyle = grad
    g.fillRect(i * gw, 0, gw + 1, n)
    g.fillStyle = 'rgba(40,34,26,0.5)'
    g.fillRect(i * gw - 0.7, 0, 1.4, n)
  }
  // 水平加强带与织物起伏
  for (const y of [n * 0.22, n * 0.52, n * 0.8]) {
    g.fillStyle = 'rgba(35,30,24,0.16)'
    g.fillRect(0, y, n, 2.2)
  }
  speckle(g, n, 420, 0.04, 1, 2)
  return makeTex(c)
}

/** 地面贴花：落叶簇（透明背景） */
export function leafLitter(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const cx = n / 2, cy = n / 2
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * n * 0.46
    if (Math.random() < (r / (n * 0.46)) ** 2.2) continue
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const warm = Math.random()
    const rr = 120 + warm * 90
    const gg = 78 + warm * 52 + Math.random() * 18
    const bb = 34 + Math.random() * 22
    g.fillStyle = `rgba(${Math.floor(rr)},${Math.floor(gg)},${Math.floor(bb)},${0.8 + Math.random() * 0.2})`
    g.save()
    g.translate(x, y)
    g.rotate(Math.random() * Math.PI * 2)
    const s = 3.5 + Math.random() * 5
    g.beginPath()
    g.ellipse(0, 0, s, s * 0.52, 0, 0, Math.PI * 2)
    g.fill()
    // 叶柄
    g.strokeStyle = `rgba(${Math.floor(rr * 0.6)},${Math.floor(gg * 0.55)},${Math.floor(bb * 0.5)},0.8)`
    g.lineWidth = 0.8
    g.beginPath()
    g.moveTo(s * 0.7, 0)
    g.lineTo(s * 1.35, 0)
    g.stroke()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 地面贴花：碎石簇（透明背景） */
export function gravelPatch(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const cx = n / 2, cy = n / 2
  for (let i = 0; i < 56; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * n * 0.45
    if (Math.random() < (r / (n * 0.45)) ** 2.4) continue
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const v = 105 + Math.random() * 95
    const s = 1.6 + Math.random() * 3.8
    g.save()
    g.translate(x, y)
    g.rotate(Math.random() * Math.PI)
    // 阴影
    g.fillStyle = 'rgba(30,28,24,0.4)'
    g.beginPath()
    g.ellipse(0.9, 1.1, s, s * 0.7, 0, 0, Math.PI * 2)
    g.fill()
    // 石面
    g.fillStyle = `rgba(${Math.floor(v)},${Math.floor(v * 0.95)},${Math.floor(v * 0.86)},0.95)`
    g.beginPath()
    g.ellipse(0, 0, s, s * 0.7, 0, 0, Math.PI * 2)
    g.fill()
    // 受光面
    g.fillStyle = `rgba(${Math.floor(v * 1.25)},${Math.floor(v * 1.2)},${Math.floor(v * 1.1)},0.5)`
    g.beginPath()
    g.ellipse(-s * 0.25, -s * 0.25, s * 0.45, s * 0.3, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 接触阴影圆斑：中心暗、边缘全透明（树根/物件根部 AO 暗化） */
export function contactBlob(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const grad = g.createRadialGradient(n / 2, n / 2, n * 0.06, n / 2, n / 2, n * 0.48)
  grad.addColorStop(0, 'rgba(8,10,8,0.5)')
  grad.addColorStop(0.55, 'rgba(8,10,8,0.28)')
  grad.addColorStop(1, 'rgba(8,10,8,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, n, n)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 接触阴影方斑：四边渐变（建筑墙基 AO 暗化） */
export function contactRect(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const img = g.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // 到边缘的归一化距离（0 边缘 → 1 中心），平滑衰减
      const dx = Math.min(x, n - 1 - x) / (n * 0.30)
      const dy = Math.min(y, n - 1 - y) / (n * 0.30)
      const d = Math.min(1, Math.min(dx, dy))
      const a = (d * d * (3 - 2 * d)) * 0.34
      const i4 = (y * n + x) * 4
      img.data[i4] = 8; img.data[i4 + 1] = 10; img.data[i4 + 2] = 8
      img.data[i4 + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 织物：细密编织 + 起伏明暗（亮度纹理，角色衣物用） */
export function fabric(): THREE.CanvasTexture {
  const n = 64
  const [c, g] = canvas(n)
  const f = fbmField(n, 8, 3, 71)
  const img = g.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const weave = ((x % 3) < 1.5 ? 8 : -8) + ((y % 3) < 1.5 ? 6 : -6)
      const v = 218 + (f[y * n + x] - 0.5) * 50 + weave
      const i4 = (y * n + x) * 4
      img.data[i4] = img.data[i4 + 1] = img.data[i4 + 2] = Math.max(0, Math.min(255, v))
      img.data[i4 + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return makeTex(c, 2)
}

/** 红陶瓦屋顶：弧形瓦行 + 层叠阴影（亮度纹理，由屋顶色上色） */
export function roofTiles(): THREE.CanvasTexture {
  const n = 128
  const [c, g] = canvas(n)
  g.fillStyle = '#e9e2da'
  g.fillRect(0, 0, n, n)
  const rows = 7
  const rh = n / rows
  const cols = 8
  const cw = n / cols
  for (let r = 0; r < rows; r++) {
    const y = r * rh
    const off = (r % 2) * cw * 0.5
    for (let cI = -1; cI <= cols; cI++) {
      const x = cI * cw + off
      const v = 225 + Math.floor(Math.random() * 26) - 13
      const grad = g.createLinearGradient(x, y, x, y + rh)
      grad.addColorStop(0, `rgba(${v},${Math.floor(v * 0.97)},${Math.floor(v * 0.94)},1)`)
      grad.addColorStop(0.78, `rgba(${Math.floor(v * 0.82)},${Math.floor(v * 0.79)},${Math.floor(v * 0.76)},1)`)
      grad.addColorStop(1, `rgba(${Math.floor(v * 0.52)},${Math.floor(v * 0.5)},${Math.floor(v * 0.48)},1)`)
      g.fillStyle = grad
      g.beginPath()
      g.moveTo(x, y + rh)
      g.quadraticCurveTo(x, y, x + cw * 0.5, y)
      g.quadraticCurveTo(x + cw, y, x + cw, y + rh)
      g.closePath()
      g.fill()
      // 竖向瓦缝
      g.fillStyle = 'rgba(70,60,52,0.30)'
      g.fillRect(x - 0.6, y, 1.2, rh)
    }
  }
  speckle(g, n, 240, 0.05, 1, 2)
  return makeTex(c)
}

/** 天空渐变（贴在背景大球内侧），可按生物群系定制 */
export function skyGradient(top = '#7fa6c8', mid = '#aec8da', low = '#cdd9e0', horizon = '#d8dcd8'): THREE.CanvasTexture {
  const [c, g] = canvas(256)
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, top)
  grad.addColorStop(0.42, mid)
  grad.addColorStop(0.62, low)
  grad.addColorStop(1, horizon)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * 远景树 billboard（侧视整树剪影）：树干 + 多团椭圆冠层，
 * 上部受光、下部压暗、边缘破碎。每个 biome 调一次。
 */
export function treeImpostor(form: 'broad' | 'dead' | 'tall', trunkHex: number, canopyHexes: number[]): THREE.CanvasTexture {
  const n = 256
  const [c, g] = canvas(n)
  g.clearRect(0, 0, n, n)
  const cx = n / 2
  const trunkW = form === 'tall' ? 9 : form === 'dead' ? 7 : 11
  const trunkTop = form === 'tall' ? n * 0.32 : form === 'dead' ? n * 0.18 : n * 0.42
  // 树干（底宽顶窄微弯）
  const tGrad = g.createLinearGradient(0, n, 0, trunkTop)
  tGrad.addColorStop(0, hexCss(trunkHex, 0.75))
  tGrad.addColorStop(1, hexCss(trunkHex, 1.05))
  g.fillStyle = tGrad
  g.beginPath()
  g.moveTo(cx - trunkW, n)
  g.quadraticCurveTo(cx - trunkW * 0.5 + 4, n * 0.6, cx - trunkW * 0.32 + 5, trunkTop)
  g.lineTo(cx + trunkW * 0.32 + 5, trunkTop)
  g.quadraticCurveTo(cx + trunkW * 0.5, n * 0.6, cx + trunkW, n)
  g.closePath()
  g.fill()
  // 几根斜枝
  for (let i = 0; i < (form === 'dead' ? 5 : 3); i++) {
    const y0 = trunkTop + (n * 0.55 - trunkTop) * Math.random()
    const dir = i % 2 === 0 ? 1 : -1
    const len = n * (0.1 + Math.random() * 0.14)
    g.strokeStyle = hexCss(trunkHex, 0.9)
    g.lineWidth = 3 + Math.random() * 2
    g.beginPath()
    g.moveTo(cx, y0)
    g.quadraticCurveTo(cx + dir * len * 0.6, y0 - len * 0.5, cx + dir * len, y0 - len * 0.9)
    g.stroke()
  }
  if (form !== 'dead') {
    // 冠层团块：中心一大团 + 周围错落小团，上亮下暗
    const cyC = form === 'tall' ? n * 0.26 : n * 0.34
    const R = form === 'tall' ? n * 0.30 : n * 0.32
    const base = canopyHexes[0]
    const blobs = 16
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * R * 0.85
      const bx = cx + Math.cos(a) * r * 1.12
      const by = cyC + Math.sin(a) * r * 0.78
      const br = R * (0.22 + Math.random() * 0.3)
      const litT = clamp01(0.78 - (by - (cyC - R)) / (R * 2) * 0.85 + Math.random() * 0.2)
      const hex = canopyHexes[Math.floor(Math.random() * canopyHexes.length)]
      g.fillStyle = hexCss(hex, 0.62 + litT * 0.95)
      g.beginPath()
      g.ellipse(bx, by, br, br * (0.74 + Math.random() * 0.2), Math.random() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
    // 边缘碎叶（打破圆轮廓）
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2
      const r = R * (0.85 + Math.random() * 0.32)
      const bx = cx + Math.cos(a) * r * 1.12
      const by = cyC + Math.sin(a) * r * 0.78
      if (by > n * 0.78) continue
      const hex = canopyHexes[Math.floor(Math.random() * canopyHexes.length)]
      g.fillStyle = hexCss(hex, 0.7 + Math.random() * 0.7)
      g.beginPath()
      g.ellipse(bx, by, 2.5 + Math.random() * 4.5, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
