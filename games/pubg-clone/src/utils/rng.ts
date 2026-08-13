/** mulberry32 可种子随机数 */
export class RNG {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 0.9999))
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))]
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  /** 近似高斯（3 次平均） */
  gauss(sigma = 1): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2 * sigma * 0.8165
  }
  /** 按权重选择索引 */
  weighted(weights: readonly number[]): number {
    let sum = 0
    for (const w of weights) sum += w
    let r = this.next() * sum
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return i
    }
    return weights.length - 1
  }
}
