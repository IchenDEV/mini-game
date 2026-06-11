import * as THREE from 'three'
import { clamp, angleDelta } from '../utils/math'

type WClass = 'AR' | 'DMR' | 'SR' | 'SG' | 'SMG' | 'PISTOL' | 'MELEE'

/** 全程序化 WebAudio 音效合成 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  listenerPos = new THREE.Vector3()
  listenerYaw = 0

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.82
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 8
    this.master.connect(comp)
    comp.connect(this.ctx.destination)
    const len = this.ctx.sampleRate * 1.2
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  setListener(pos: THREE.Vector3, yaw: number) {
    this.listenerPos.copy(pos)
    this.listenerYaw = yaw
  }

  /** 根据世界坐标计算音量与声像 */
  private spatial(pos: THREE.Vector3 | null, maxDist: number): { vol: number; pan: number } | null {
    if (!pos) return { vol: 1, pan: 0 }
    const dx = pos.x - this.listenerPos.x
    const dz = pos.z - this.listenerPos.z
    const dist = Math.hypot(dx, dz, pos.y - this.listenerPos.y)
    if (dist > maxDist) return null
    const vol = Math.pow(clamp(1 - dist / maxDist, 0, 1), 1.5)
    const ang = angleDelta(this.listenerYaw, Math.atan2(dx, dz))
    return { vol, pan: clamp(Math.sin(ang) * 0.75, -1, 1) }
  }

  private out(vol: number, pan: number): AudioNode | null {
    if (!this.ctx || !this.master) return null
    const g = this.ctx.createGain()
    g.gain.value = vol
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p)
    p.connect(this.master)
    return g
  }

  private noise(dur: number, freq: number, q: number, vol: number, pan: number, type: BiquadFilterType = 'lowpass', attack = 0.002) {
    if (!this.ctx || !this.noiseBuf) return
    const dst = this.out(1, pan)
    if (!dst) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.6 + Math.random() * 0.8
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f); f.connect(g); g.connect(dst)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  private tone(freq: number, dur: number, vol: number, pan: number, type: OscillatorType = 'sine', slideTo = 0, delay = 0) {
    if (!this.ctx) return
    const dst = this.out(1, pan)
    if (!dst) return
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(dst)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // ---------------- 具体音效 ----------------

  shot(pos: THREE.Vector3 | null, cls: WClass, silenced = false) {
    const max = silenced ? 70 : cls === 'SR' ? 480 : cls === 'SG' ? 320 : 300
    const s = this.spatial(pos, max)
    if (!s) return
    const v = s.vol * (silenced ? 0.35 : 1)
    const cfg: Record<WClass, [number, number, number]> = {
      AR: [0.16, 1500, 0.9], DMR: [0.2, 1100, 1.0], SR: [0.38, 750, 1.2],
      SG: [0.3, 950, 1.1], SMG: [0.1, 2100, 0.75], PISTOL: [0.11, 1900, 0.7], MELEE: [0.1, 800, 0.3],
    }
    const [dur, freq, amp] = cfg[cls]
    // 距离越远低频越闷
    const f = silenced ? 600 : freq * clamp(0.25 + s.vol, 0.3, 1)
    this.noise(dur, f, 1.2, v * amp * 0.9, s.pan)
    if (!silenced && (cls === 'SR' || cls === 'SG' || cls === 'DMR')) {
      this.tone(90, 0.18, v * 0.5, s.pan, 'triangle', 40)
    }
    if (!silenced && cls === 'AR') this.tone(140, 0.07, v * 0.3, s.pan, 'square', 60)
  }

  explosion(pos: THREE.Vector3 | null) {
    const s = this.spatial(pos, 520)
    if (!s) return
    this.noise(0.8, 500 * clamp(0.3 + s.vol, 0.35, 1), 0.8, s.vol * 1.2, s.pan)
    this.tone(70, 0.6, s.vol * 0.9, s.pan, 'triangle', 30)
  }

  hit(head: boolean) {
    this.noise(0.05, head ? 3200 : 2400, 3, 0.4, 0, 'bandpass')
    if (head) this.tone(1500, 0.07, 0.25, 0, 'square', 900)
  }
  kill() {
    this.tone(660, 0.1, 0.3, 0, 'square')
    this.tone(990, 0.16, 0.3, 0, 'square', 0, 0.09)
  }
  hurt() {
    this.noise(0.16, 350, 0.8, 0.5, 0)
    this.tone(110, 0.14, 0.4, 0, 'triangle', 60)
  }
  armorBreak() { this.noise(0.2, 2800, 2, 0.5, 0, 'highpass') }
  pickup() { this.tone(520, 0.07, 0.25, 0, 'sine', 780) }
  equip() { this.noise(0.07, 1200, 2, 0.3, 0, 'bandpass') }
  reload() {
    this.noise(0.05, 1800, 4, 0.3, 0, 'bandpass')
    this.tone(300, 0.04, 0.2, 0, 'square', 0, 0.12)
  }
  reloadDone() { this.noise(0.06, 2400, 4, 0.35, 0, 'bandpass') }
  noAmmo() { this.tone(1200, 0.04, 0.2, 0, 'square') }
  heal() { this.tone(420, 0.3, 0.18, 0, 'sine', 520) }
  boost() { this.tone(620, 0.25, 0.18, 0, 'sine', 880) }
  swing(pos: THREE.Vector3 | null) {
    const s = this.spatial(pos, 40)
    if (s) this.noise(0.12, 900, 1, s.vol * 0.3, s.pan, 'bandpass', 0.04)
  }
  footstep(vol: number) { this.noise(0.05, 500, 0.7, vol * 0.16, 0) }
  land() { this.noise(0.12, 400, 0.8, 0.4, 0) }
  zoneAlert() {
    this.tone(880, 0.16, 0.3, 0, 'sawtooth')
    this.tone(880, 0.16, 0.3, 0, 'sawtooth', 0, 0.25)
  }
  zoneTick() { this.tone(220, 0.1, 0.28, 0, 'sawtooth') }
  airdropAlert() {
    this.tone(523, 0.14, 0.25, 0, 'sine')
    this.tone(659, 0.14, 0.25, 0, 'sine', 0, 0.15)
    this.tone(784, 0.2, 0.25, 0, 'sine', 0, 0.3)
  }
  ui() { this.tone(800, 0.04, 0.15, 0, 'sine') }
  win() {
    const seq = [523, 659, 784, 1047]
    seq.forEach((f, i) => this.tone(f, 0.3, 0.3, 0, 'triangle', 0, i * 0.18))
  }
  lose() {
    const seq = [392, 330, 262, 196]
    seq.forEach((f, i) => this.tone(f, 0.4, 0.3, 0, 'triangle', 0, i * 0.22))
  }
}
