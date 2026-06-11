import * as THREE from 'three'
import { World, WALL_H } from '../world'
import type { PoiDef } from '../mapConfig'
import { surface } from '../../rendering/materials'
import { doorFrame, framedWindow, cornice, drainPipe, acUnit, sandbagLine, fenceRun, brokenWallTop } from './buildingParts'
import { table, chair, cabinet, shelfRack, mattress, barrel } from '../props/props'

/**
 * poiTemplates：全部 POI 建筑模板。
 * 每个模板负责：几何 + 碰撞 + 资源点（lootPoints）+ 小地图矩形（mapRects）。
 * AI 出生点由 World.build() 按 pois 列表统一生成。
 */

// ---------------- 基础建筑 ----------------

export function house(w: World, cx: number, cz: number, rot: number, tier: number, hw = 8, hd = 6) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  const wallC = w.rng.pick(w.biome.houseWalls)
  const roofC = w.rng.pick(w.biome.houseRoofs)
  const wallT = w.pickWallTex()
  const t = 0.28
  const doorW = 1.5, doorH = 2.2
  const segW = (hw - doorW) / 2
  B(segW, WALL_H, t, -(doorW + segW) / 2, g, hd / 2 - t / 2, wallC, true, wallT)
  B(segW, WALL_H, t, (doorW + segW) / 2, g, hd / 2 - t / 2, wallC, true, wallT)
  B(doorW, WALL_H - doorH, t, 0, g + doorH, hd / 2 - t / 2, wallC, true, wallT)
  B(hw, WALL_H, t, 0, g, -hd / 2 + t / 2, wallC, true, wallT)
  B(t, WALL_H, hd - t * 2, -hw / 2 + t / 2, g, 0, wallC, true, wallT)
  B(t, WALL_H, hd - t * 2, hw / 2 - t / 2, g, 0, wallC, true, wallT)
  B(hw + 0.5, 0.2, hd + 0.5, 0, g + WALL_H, 0, new THREE.Color(roofC).multiplyScalar(0.75).getHex(), true, 'wood')
  w.gableRoof(cx, cz, rot, hw, hd, g + WALL_H + 0.2, roofC, wallC)
  B(hw - 0.1, 0.1, hd - 0.1, 0, g + 0.02, 0, 0x8d8579, false, 'concrete')
  B(hw * 0.6, 0.09, 1.5, 0, g + 0.01, hd / 2 + 0.8, 0x97907f, false, 'wood')
  // 门框 + 檐口 + 排水管
  doorFrame(B, 0, g, hd / 2 - 0.06, doorW, doorH)
  cornice(B, hw, hd, g, WALL_H, new THREE.Color(wallC).multiplyScalar(0.82).getHex())
  drainPipe(B, -hw / 2 + 0.18, g, hd / 2 + 0.1, WALL_H)
  // 窗：北墙 + 东墙
  framedWindow(B, 'z', -hw / 4, g, -hd / 2, -1)
  framedWindow(B, 'x', 0, g, hw / 2, 1)
  // 空调外机（挂西墙）
  if (w.rng.chance(0.5)) acUnit(B, 'x', -hd / 4, g + 1.7, -hw / 2, -1)
  // 烟囱：砖柱 + 顶帽 + 囱口
  if (w.rng.chance(0.65)) {
    const rise = Math.min(1.9, hd * 0.3)
    const chH = rise + 1.25
    B(0.62, chH, 0.62, hw * 0.28, g + WALL_H + 0.2, 0.45, 0x96705a, true, 'brick')
    B(0.8, 0.14, 0.8, hw * 0.28, g + WALL_H + 0.2 + chH, 0.45, 0x756a60, false)
    B(0.4, 0.16, 0.4, hw * 0.28, g + WALL_H + 0.34 + chH, 0.45, 0x26262a, false)
  }
  // 室内家具：桌椅组或柜子+床垫
  if (w.rng.chance(0.55)) {
    table(B, -hw / 4 + 0.5, g + 0.1, -hd / 4 + 0.4)
    chair(B, -hw / 4 - 0.45, g + 0.1, -hd / 4 + 0.4, 1)
  } else {
    cabinet(B, -hw / 2 + 0.85, g + 0.1, -hd / 2 + 0.6)
    mattress(B, hw / 4, g + 0.12, -hd / 4)
  }
  if (w.rng.chance(0.45)) B(0.9, 0.9, 0.9, hw / 4, g + 0.1, hd / 4, 0x8a703f, true, 'wood')
  const pts: [number, number][] = [[-hw / 4, 0], [hw / 4, -hd / 5], [0, hd / 5], [0, hd / 2 + 1.2]]
  for (const [lx, lz] of pts) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
  }
  w.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? hw : hd, d: rot % 2 === 0 ? hd : hw, color: '#4d5560' })
}

export function warehouse(w: World, cx: number, cz: number, rot: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  const ww = 20, d = 12, h = 5, t = 0.3
  const wallC = w.biome.id === 'desert' ? 0x9a7d52 : w.biome.id === 'jungle' ? 0x5d7055 : 0x4a6d96
  const roofC = 0x39444e
  const doorW = 5, doorH = 4
  for (const sx of [-1, 1]) {
    const segD = (d - doorW) / 2
    B(t, h, segD, sx * (ww / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'metal')
    B(t, h, segD, sx * (ww / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'metal')
    B(t, h - doorH, doorW, sx * (ww / 2 - t / 2), g + doorH, 0, wallC, true, 'metal')
  }
  B(ww - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'metal')
  B(ww - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'metal')
  B(ww + 0.8, 0.25, d + 0.8, 0, g + h, 0, roofC, true, 'roof')
  B(ww - 0.2, 0.08, d - 0.2, 0, g + 0.02, 0, 0x868c90, false, 'concrete')
  // 货架两排 + 散落木箱
  shelfRack(w, B, -4, g + 0.08, d / 2 - 1.2, true)
  shelfRack(w, B, 4.5, g + 0.08, -d / 2 + 1.2, true)
  const crates: [number, number, number][] = [[-6, -3, 1.3], [-2, -3.5, 1.2], [2.5, 3, 1.4], [6, -2.5, 1.3], [6.5, 2.8, 1.2]]
  for (const [lx, lz, s] of crates) {
    B(s, s, s, lx, g, lz, w.rng.pick([0x8a703f, 0x7a6a50, 0x6f7a55]), true, 'wood')
    if (w.rng.chance(0.4)) B(s * 0.9, s * 0.9, s * 0.9, lx, g + s, lz, 0x8a703f, true, 'wood')
  }
  const pts: [number, number][] = [[-7, 0], [-3.5, -3.5], [0, 3.5], [0, 0], [3.5, -3.5], [7, 0], [4, 3.5]]
  for (const [lx, lz] of pts) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
  }
  w.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? ww : d, d: rot % 2 === 0 ? d : ww, color: '#46627f' })
}

export function container(w: World, cx: number, cz: number, rot: number, stack = false) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  const c1 = w.rng.pick([0x3f6fa8, 0x2f8a8a, 0x9a5b3c, 0x5d7283, 0x55795e])
  B(6.2, 2.5, 2.5, 0, g, 0, c1, true, 'metal')
  if (stack) {
    const c2 = w.rng.pick([0x3f6fa8, 0x2f8a8a, 0x9a5b3c, 0x5d7283])
    B(6.2, 2.5, 2.5, 0.4, g + 2.5, 0, c2, true, 'metal')
  }
  w.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? 6.2 : 2.5, d: rot % 2 === 0 ? 2.5 : 6.2, color: '#3f618c' })
}

export function watchtower(w: World, cx: number, cz: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const legC = 0x5d4a36, platC = 0x6e5d4a
  for (const [sx, sz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    w.box(0.3, 3.6, 0.3, cx + sx, g, cz + sz, legC, true, true, 'wood')
  }
  w.box(3.4, 0.25, 3.4, cx, g + 3.6, cz, platC, true, true, 'wood')
  w.box(3.4, 0.8, 0.12, cx, g + 3.85, cz - 1.65, legC, true, true, 'wood')
  w.box(3.4, 0.8, 0.12, cx, g + 3.85, cz + 1.65, legC, true, true, 'wood')
  w.box(0.12, 0.8, 3.4, cx - 1.65, g + 3.85, cz, legC, true, true, 'wood')
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const hh = (3.6 / steps) * (i + 1)
    w.box(1.3, hh, 0.62, cx + 2.4, g, cz - 1.55 + i * 0.45, 0x7a6a50, true, true, 'wood')
  }
  w.lootPoints.push({ x: cx, y: g + 3.97, z: cz, tier })
  w.mapRects.push({ x: cx, z: cz, w: 3.4, d: 3.4, color: '#5d4a36' })
}

export function barn(w: World, cx: number, cz: number, rot: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  const ww = 14, d = 10, h = 5.4, t = 0.3
  const wallC = 0x7a5a40, roofC = 0x8a4a3a
  const doorW = 4, doorH = 4.2
  for (const sx of [-1, 1]) {
    const segD = (d - doorW) / 2
    B(t, h, segD, sx * (ww / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'wood')
    B(t, h, segD, sx * (ww / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'wood')
    B(t, h - doorH, doorW, sx * (ww / 2 - t / 2), g + doorH, 0, wallC, true, 'wood')
  }
  B(ww - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'wood')
  B(ww - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'wood')
  B(ww + 0.8, 0.25, d + 0.8, 0, g + h, 0, roofC, true, 'roof')
  B(1.6, 1.2, 1.6, -3, g, -2, 0xb89a55, true, 'wood')
  B(1.6, 1.2, 1.6, -3, g, 2.2, 0xb89a55, true, 'wood')
  B(1.6, 1.2, 1.6, 3.5, g, 0, 0xb89a55, true, 'wood')
  const pts: [number, number][] = [[-4.5, 0], [-1, -2.5], [1.5, 2.5], [4.5, -1.5], [0, 0]]
  for (const [lx, lz] of pts) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
  }
  w.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? ww : d, d: rot % 2 === 0 ? d : ww, color: '#6e4a38' })
}

export function silo(w: World, cx: number, cz: number) {
  const g = w.groundHeight(cx, cz)
  const geo = new THREE.CylinderGeometry(2.4, 2.4, 8, 10)
  const siloTex = w.tex('metal').clone()
  siloTex.repeat.set(6, 3)
  siloTex.needsUpdate = true
  const siloMat = surface({ color: 0x9aa0a6, map: siloTex, roughness: 0.5, metalness: 0.4, flatShading: true })
  const mesh = new THREE.Mesh(geo, siloMat)
  mesh.position.set(cx, g + 4, cz)
  mesh.castShadow = true
  w.group.add(mesh)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.6, 10), w.mat(0x7a8086))
  cap.position.set(cx, g + 8.8, cz)
  cap.castShadow = true
  w.group.add(cap)
  w.col.addCyl(cx, cz, 2.4, g, g + 8)
  w.mapRects.push({ x: cx, z: cz, w: 4.8, d: 4.8, color: '#7d8388' })
}

export function carWreck(w: World, cx: number, cz: number, alongX: boolean) {
  const g = w.groundHeight(cx, cz)
  const bodyC = w.rng.pick([0x6d4a3a, 0x5d6066, 0x47525a, 0x705a30])
  const ww = alongX ? 4.3 : 1.8, d = alongX ? 1.8 : 4.3
  w.box(ww, 0.9, d, cx, g + 0.35, cz, bodyC)
  const cw = alongX ? 2.1 : 1.6, cd = alongX ? 1.6 : 2.1
  w.box(cw, 0.65, cd, cx, g + 1.25, cz, bodyC, false)
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wheel = new THREE.Mesh(wg, w.mat(0x1d2125))
    wheel.rotation.z = alongX ? 0 : Math.PI / 2
    wheel.rotation.x = alongX ? Math.PI / 2 : 0
    const ox = alongX ? sx * 1.4 : sx * 0.85
    const oz = alongX ? sz * 0.85 : sz * 1.4
    wheel.position.set(cx + ox, g + 0.36, cz + oz)
    w.group.add(wheel)
  }
  w.col.addBox(cx - ww / 2, g, cz - d / 2, cx + ww / 2, g + 1.6, cz + d / 2)
  if (w.rng.chance(0.55)) w.lootPoints.push({ x: cx + (alongX ? 0 : 2.2), y: g + 0.12, z: cz + (alongX ? 2.2 : 0), tier: 1 })
}

/** 加油站：顶棚 + 油泵 + 小卖部 */
export function gasStation(w: World, cx: number, cz: number, rot: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  for (const [lx, lz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) {
    B(0.45, 4.6, 0.45, lx, g, lz, 0x8d9296, true, 'concrete')
  }
  B(14, 0.4, 9, 0, g + 4.6, 0, 0xb8483a, true, 'roof')
  B(13.9, 0.06, 8.9, 0, g + 0.02, 0, 0x8c9094, false, 'concrete')
  for (const lx of [-2.5, 2.5]) {
    B(0.9, 1.5, 0.6, lx, g, 0, 0xb8483a, true, 'metal')
    B(1.1, 0.12, 0.8, lx, g + 1.5, 0, 0x8d9296, false)
  }
  const shopX = 12
  B(7, WALL_H, 5, shopX, g, 0, w.rng.pick(w.biome.houseWalls), true, w.pickWallTex())
  B(7.6, 0.22, 5.6, shopX, g + WALL_H, 0, 0x5d7283, true, 'roof')
  const pts: [number, number][] = [[-2.5, 1.8], [2.5, -1.8], [0, 0], [shopX, 3.5]]
  for (const [lx, lz] of pts) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
  }
  for (const [lx, lz] of [[-4.2, -1.2], [4.2, 1.2]] as [number, number][]) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier, fixedItem: 'fuelcan' })
  }
  w.mapRects.push({ x: cx, z: cz, w: 14, d: 9, color: '#8c5046' })
}

/** 废墟：断墙阵列（破损墙顶 + 碎砖堆） */
export function ruins(w: World, cx: number, cz: number, r: number, tier: number) {
  const wallC = w.biome.id === 'desert' ? 0xc2ae8a : 0x9a8d7a
  const n = 10 + w.rng.int(0, 5)
  for (let i = 0; i < n; i++) {
    const a = w.rng.range(0, Math.PI * 2)
    const d = w.rng.range(r * 0.12, r * 0.8)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    const g = w.groundHeight(x, z)
    const len = w.rng.range(3, 7.5)
    const h = w.rng.range(1.1, 2.8)
    const along = w.rng.chance(0.5)
    w.box(along ? len : 0.45, h, along ? 0.45 : len, x, g, z, wallC, true, true, 'brick')
    brokenWallTop(w, w.localBuilder(x, z, 0), 0, g, 0, len, h, along, wallC)
    if (w.rng.chance(0.4)) {
      const l2 = w.rng.range(2, 4)
      w.box(along ? 0.45 : l2, h * 0.8, along ? l2 : 0.45, x + (along ? len / 2 : l2 / 2 - 0.2), g, z + (along ? l2 / 2 : len / 2), wallC, true, true, 'brick')
    }
  }
  const g0 = w.groundHeight(cx, cz)
  w.box(4, 0.7, 4, cx, g0, cz, 0x8d8478, true, true, 'concrete')
  const lootN = 4 + tier * 2
  for (let i = 0; i < lootN; i++) {
    const a = w.rng.range(0, Math.PI * 2)
    const d = w.rng.range(0, r * 0.7)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    w.lootPoints.push({ x, y: w.groundHeight(x, z) + 0.12, z, tier })
  }
  w.lootPoints.push({ x: cx, y: g0 + 0.82, z: cz, tier: Math.min(3, tier + 1) })
  w.mapRects.push({ x: cx, z: cz, w: r * 1.2, d: r * 1.2, color: '#8a8276' })
}

/** 营地：帐篷 + 篝火 + 木箱 */
export function camp(w: World, cx: number, cz: number, r: number, tier: number) {
  const tentGeo = new THREE.ConeGeometry(2.1, 2.2, 4)
  const tentC = [0x6e7a55, 0x7a6e50, 0x5d6e5d]
  const n = 4 + w.rng.int(0, 2)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.range(-0.3, 0.3)
    const d = w.rng.range(r * 0.3, r * 0.62)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    const g = w.groundHeight(x, z)
    const tent = new THREE.Mesh(tentGeo, w.mat(w.rng.pick(tentC)))
    tent.position.set(x, g + 1.1, z)
    tent.rotation.y = w.rng.range(0, Math.PI)
    tent.castShadow = true
    w.group.add(tent)
    w.col.addCyl(x, z, 1.7, g, g + 2.0)
    w.lootPoints.push({ x: x + Math.cos(a) * 2.4, y: w.groundHeight(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4) + 0.12, z: z + Math.sin(a) * 2.4, tier })
  }
  const g0 = w.groundHeight(cx, cz)
  const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 8), w.mat(0x2d2a26))
  fire.position.set(cx, g0 + 0.12, cz)
  w.group.add(fire)
  for (let i = 0; i < 3; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(2, r * 0.5)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    w.box(1.2, 1.2, 1.2, x, w.groundHeight(x, z), z, 0x8a703f, true, true, 'wood')
  }
  if (tier >= 2) watchtower(w, cx + r * 0.7, cz, tier)
  w.lootPoints.push({ x: cx + 1.8, y: g0 + 0.12, z: cz, tier })
  w.mapRects.push({ x: cx, z: cz, w: r, d: r, color: '#5d6e4d' })
}

/** 高脚竹屋群（雨林） */
export function huts(w: World, cx: number, cz: number, r: number, tier: number) {
  const n = 4 + w.rng.int(0, 2)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.range(-0.4, 0.4)
    const d = w.rng.range(r * 0.25, r * 0.7)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    const g = w.groundHeight(x, z)
    const rot = w.rng.int(0, 3)
    const B = w.localBuilder(x, z, rot)
    const deckH = 1.6
    for (const [lx, lz] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) {
      B(0.28, deckH, 0.28, lx, g, lz, 0x6e5a40, true, 'wood')
    }
    B(5.4, 0.25, 4.2, 0, g + deckH, 0, 0x8a7350, true, 'wood')
    B(5.0, 2.1, 0.22, 0, g + deckH + 0.25, -1.85, 0x9a8258, true, 'wood')
    B(0.22, 2.1, 3.6, -2.45, g + deckH + 0.25, 0, 0x9a8258, true, 'wood')
    B(0.22, 2.1, 3.6, 2.45, g + deckH + 0.25, 0, 0x9a8258, true, 'wood')
    B(6.0, 0.3, 4.8, 0, g + deckH + 2.45, 0, 0x7d7044, true, 'wood')
    const steps = 4
    for (let s = 0; s < steps; s++) {
      const hh = (deckH / steps) * (s + 1)
      B(1.1, hh, 0.5, 0, g, 2.4 - s * 0.5, 0x7a6448, true, 'wood')
    }
    const [lx2, lz2] = w.rotPt(0, -0.5, rot)
    w.lootPoints.push({ x: x + lx2, y: g + deckH + 0.4, z: z + lz2, tier })
    w.mapRects.push({ x, z, w: 5.4, d: 4.2, color: '#7d6a48' })
  }
  const g0 = w.groundHeight(cx, cz)
  w.box(1.3, 1.0, 1.3, cx + 1.5, g0, cz, 0x8a703f, true, true, 'wood')
  w.lootPoints.push({ x: cx, y: g0 + 0.12, z: cz, tier })
}

// ---------------- 组团 POI ----------------

/** 镇子：房屋网格 + 仓库 */
export function town(w: World, cx: number, cz: number, r: number, tier: number) {
  const houseDefs: [number, number, number, number, number][] = [
    [-34, -22, 0, 8, 6], [-16, -24, 0, 9, 6], [4, -22, 2, 8, 6], [22, -20, 0, 7, 5.5],
    [-34, 2, 2, 8, 6], [-14, 4, 2, 10, 7], [6, 2, 2, 8, 6], [24, 4, 0, 7, 6],
    [-26, 24, 0, 9, 6.5], [-4, 26, 2, 8, 6], [16, 24, 1, 8, 6], [36, 12, 1, 7, 5.5],
  ]
  const k = r / 95
  for (const [ox, oz, rot, hw, hd] of houseDefs) house(w, cx + ox * k, cz + oz * k, rot, tier, hw, hd)
  warehouse(w, cx + 2 * k, cz + 44 * k, 0, tier)
  carWreck(w, cx - 8, cz - 44 * k, true)
  carWreck(w, cx + 30, cz - 36 * k, false)
}

export function village(w: World, cx: number, cz: number, r: number, tier: number) {
  const n = 6 + w.rng.int(0, 2)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.range(-0.25, 0.25)
    const d = w.rng.range(r * 0.25, r * 0.7)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    house(w, x, z, w.rng.int(0, 3), tier, w.rng.range(7, 9.5), w.rng.range(5.5, 7))
  }
  if (w.rng.chance(0.6)) carWreck(w, cx, cz, w.rng.chance(0.5))
}

export function depot(w: World, cx: number, cz: number, tier: number) {
  warehouse(w, cx - 20, cz - 5, 0, tier)
  warehouse(w, cx + 15, cz + 15, 1, tier)
  warehouse(w, cx + 18, cz - 22, 0, tier)
  container(w, cx - 2, cz + 5, 1, false)
  container(w, cx + 2, cz - 7, 0, true)
  container(w, cx - 14, cz + 18, 0, false)
  carWreck(w, cx + 30, cz + 5, true)
}

export function military(w: World, cx: number, cz: number, r: number, tier: number) {
  warehouse(w, cx - 25, cz - 20, 0, tier)
  warehouse(w, cx + 25, cz + 18, 1, tier)
  const contDefs: [number, number, number, boolean][] = [
    [-20, 8, 0, false], [-12, 8, 0, true], [-4, 8, 0, false], [8, 14, 1, true],
    [16, 14, 1, false], [-18, -10, 0, false], [-8, -14, 0, true], [4, -16, 0, false],
  ]
  for (const [ox, oz, rot, st] of contDefs) container(w, cx + ox, cz + oz, rot, st)
  watchtower(w, cx + 30, cz - 25, tier)
  watchtower(w, cx - 32, cz + 26, tier)
  const wallC = 0x7d8084
  for (const s of [-1, 1]) {
    w.box(r * 1.1, 2.2, 0.4, cx, w.groundHeight(cx, cz + s * r * 0.62), cz + s * r * 0.62, wallC, true, true, 'concrete')
    w.box(0.4, 2.2, r * 0.7, cx + s * r * 0.66, w.groundHeight(cx + s * r * 0.66, cz), cz, wallC, true, true, 'concrete')
  }
  // 大门口沙袋哨位
  sandbagLine(w.localBuilder(cx, cz + r * 0.62, 0), -r * 0.58, w.groundHeight(cx - r * 0.58, cz + r * 0.7), 5, 4.2, true)
  for (let i = 0; i < 8; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(4, r * 0.5)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    w.lootPoints.push({ x, y: w.groundHeight(x, z) + 0.12, z, tier })
  }
  carWreck(w, cx - 42, cz + 2, true)
}

export function farm(w: World, cx: number, cz: number, tier: number) {
  barn(w, cx, cz - 5, 1, tier)
  house(w, cx - 20, cz + 18, 0, tier)
  house(w, cx + 22, cz + 14, 1, tier, 7, 5.5)
  silo(w, cx + 14, cz - 16)
  w.box(1.7, 1.1, 1.7, cx - 12, w.groundHeight(cx - 12, cz - 10), cz - 10, 0xb89a55, true, true, 'wood')
  w.box(1.7, 1.1, 1.7, cx - 8, w.groundHeight(cx - 8, cz + 2), cz + 2, 0xb89a55, true, true, 'wood')
}

export function bridge(w: World, bx: number) {
  const r = w.cfg.river
  if (!r) return
  const bz = w.riverZ(bx)
  const len = r.width * 2 + 14
  const deckC = 0x8d9296, railC = 0x5d6a74
  w.box(7.2, 0.35, len, bx, 3.0, bz, deckC, true, true, 'concrete')
  w.box(0.25, 0.95, len, bx - 3.45, 3.35, bz, railC, true, true, 'concrete')
  w.box(0.25, 0.95, len, bx + 3.45, 3.35, bz, railC, true, true, 'concrete')
  for (const sz of [-len * 0.25, len * 0.25]) {
    w.box(1.2, 4.8, 1.2, bx - 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
    w.box(1.2, 4.8, 1.2, bx + 2.5, -1.6, bz + sz, 0x6e7479, true, true, 'concrete')
  }
  w.mapRects.push({ x: bx, z: bz, w: 7.2, d: len, color: '#888d92' })
}

// ---------------- 新 POI ----------------

/** 港口：混凝土码头 + 栈桥 + 吊机 + 集装箱堆场 */
export function port(w: World, cx: number, cz: number, tier: number) {
  const rz = w.riverZ(cx)
  const dir = Math.sign(rz - cz) || 1
  const g = w.groundHeight(cx, cz)
  const quayY = Math.max(g, w.waterY + 0.9)
  // 码头平台
  w.box(46, 1.1, 18, cx, quayY - 0.6, cz, 0x8d9296, true, true, 'concrete')
  // 系缆桩
  for (const ox of [-18, -9, 0, 9, 18]) {
    w.box(0.45, 0.55, 0.45, cx + ox, quayY + 0.5, cz + dir * 8.2, 0x3a3f44, true, false, 'metal')
  }
  // 两条栈桥伸向水面
  for (const ox of [-12, 10]) {
    const pierLen = 22
    const pz = cz + dir * (9 + pierLen / 2)
    w.box(4, 0.4, pierLen, cx + ox, w.waterY + 0.85, pz, 0x8a7350, true, true, 'wood')
    for (let i = 0; i < 4; i++) {
      const ppz = cz + dir * (11 + i * 6)
      w.box(0.35, 2.6, 0.35, cx + ox - 1.6, w.waterY - 1.4, ppz, 0x5d4a36, false, true, 'wood')
      w.box(0.35, 2.6, 0.35, cx + ox + 1.6, w.waterY - 1.4, ppz, 0x5d4a36, false, true, 'wood')
    }
    w.lootPoints.push({ x: cx + ox, y: w.waterY + 1.35, z: pz + dir * 6, tier })
  }
  // 龙门吊：双腿 + 横梁 + 小车 + 吊索 + 吊钩
  const craneC = 0xb8862e
  const craneZ = cz - dir * 2
  for (const ox of [-7, 7]) {
    w.box(1.0, 11, 1.0, cx + ox, quayY + 0.5, craneZ, craneC, true, true, 'metal')
    w.box(1.3, 0.5, 1.6, cx + ox, quayY + 0.2, craneZ, 0x6d7378, true, false, 'metal')
  }
  w.box(17, 1.1, 1.4, cx, quayY + 11.5, craneZ, craneC, false, true, 'metal')
  w.box(1.5, 0.8, 1.2, cx + 2.5, quayY + 10.7, craneZ, 0x6d7378, false, false, 'metal')
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.4, 5), w.mat(0x2c3036))
  cable.position.set(cx + 2.5, quayY + 8, craneZ)
  w.group.add(cable)
  w.box(0.9, 0.5, 0.9, cx + 2.5, quayY + 5.0, craneZ, 0x8a4a3a, false, false, 'metal')
  // 集装箱堆场 + 仓库 + 办公房
  container(w, cx - 16, cz - dir * 5.5, 0, true)
  container(w, cx - 9, cz - dir * 5.5, 0, false)
  container(w, cx + 13, cz - dir * 5, 0, true)
  container(w, cx + 20, cz - dir * 12, 1, false)
  warehouse(w, cx - 4, cz - dir * 16, 0, tier)
  house(w, cx + 19, cz - dir * 22, 0, tier, 7, 5.5)
  // 油桶组
  barrel(w, cx + 6, cz + dir * 6)
  barrel(w, cx + 7.1, cz + dir * 6.6)
  barrel(w, cx + 6.4, cz + dir * 7.4)
  const pts: [number, number][] = [[-13, 0], [0, dir * 4], [16, dir * 2], [-4, -dir * 8]]
  for (const [ox, oz] of pts) {
    w.lootPoints.push({ x: cx + ox, y: quayY + 0.12, z: cz + oz, tier })
  }
  w.mapRects.push({ x: cx, z: cz, w: 46, d: 18, color: '#7d8a94' })
}

/** 雷达站：设备楼 + 雷达塔 + 围栏 + 天线场 */
export function radar(w: World, cx: number, cz: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  // 设备楼（混凝土平顶）
  const B = w.localBuilder(cx - 8, cz + 4, 0)
  const bw = 10, bd = 7, t = 0.3, h = 3.2
  const wallC = 0x9aa0a4
  const doorW = 1.6, doorH = 2.3
  const segW = (bw - doorW) / 2
  B(segW, h, t, -(doorW + segW) / 2, g, bd / 2 - t / 2, wallC, true, 'concrete')
  B(segW, h, t, (doorW + segW) / 2, g, bd / 2 - t / 2, wallC, true, 'concrete')
  B(doorW, h - doorH, t, 0, g + doorH, bd / 2 - t / 2, wallC, true, 'concrete')
  B(bw, h, t, 0, g, -bd / 2 + t / 2, wallC, true, 'concrete')
  B(t, h, bd - t * 2, -bw / 2 + t / 2, g, 0, wallC, true, 'concrete')
  B(t, h, bd - t * 2, bw / 2 - t / 2, g, 0, wallC, true, 'concrete')
  B(bw + 0.5, 0.25, bd + 0.5, 0, g + h, 0, 0x70787e, true, 'concrete')
  doorFrame(B, 0, g, bd / 2 - 0.06, doorW, doorH, 0x5d6a74)
  framedWindow(B, 'x', 0, g, bw / 2, 1, 0xb9bdbf)
  // 屋顶设备
  B(1.4, 0.9, 1.0, -2.5, g + h + 0.25, 0.5, 0x84898d, false, 'metal')
  B(0.08, 2.6, 0.08, 3, g + h + 0.25, -1, 0x4a5158, false, 'metal')
  // 室内
  table(B, -2, g + 0.1, -1.5)
  cabinet(B, 3.5, g + 0.1, -2.4)
  // 雷达塔：四腿桁架 + 平台 + 碟形天线
  const tx = cx + 7, tz = cz - 5
  const tg = w.groundHeight(tx, tz)
  const towerH = 12
  for (const [sx, sz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, towerH, 6), w.mat(0x70787e, 'metal'))
    leg.position.set(tx + sx * 0.55, tg + towerH / 2, tz + sz * 0.55)
    leg.rotation.x = sz * 0.045
    leg.rotation.z = -sx * 0.045
    leg.castShadow = true
    w.group.add(leg)
  }
  for (const hh of [3, 6.5, 10]) {
    const k = 1 - hh / towerH * 0.45
    w.box(2.9 * k, 0.18, 2.9 * k, tx, tg + hh, tz, 0x84898d, false, false, 'metal')
  }
  w.box(3.6, 0.3, 3.6, tx, tg + towerH, tz, 0x70787e, true, true, 'metal')
  w.col.addCyl(tx, tz, 1.6, tg, tg + towerH)
  // 碟形天线（开口圆锥 + 馈源杆）
  const dishGrp = new THREE.Group()
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 0.5, 1.3, 12, 1, true),
    surface({ color: 0xd5d9dc, roughness: 0.4, metalness: 0.45, side: THREE.DoubleSide, flatShading: true }),
  )
  dish.castShadow = true
  dishGrp.add(dish)
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), w.mat(0x4a5158))
  feed.position.y = 1.4
  dishGrp.add(feed)
  dishGrp.position.set(tx, tg + towerH + 1.5, tz)
  dishGrp.rotation.z = -0.7
  dishGrp.rotation.y = w.rng.range(0, Math.PI * 2)
  w.group.add(dishGrp)
  // 围栏（四边留南口）
  const fb = w.localBuilder(cx, cz, 0)
  fenceRun(fb, 0, w.groundHeight(cx, cz - 14), -14, 30, true)
  fenceRun(fb, -15, w.groundHeight(cx - 15, cz), 0, 28, false)
  fenceRun(fb, 15, w.groundHeight(cx + 15, cz), 0, 28, false)
  fenceRun(fb, -9, w.groundHeight(cx - 9, cz + 14), 14, 12, true)
  fenceRun(fb, 9, w.groundHeight(cx + 9, cz + 14), 14, 12, true)
  // 发电机 + 油桶
  w.box(1.8, 1.2, 1.0, cx - 1, g + 0.05, cz - 9, 0x6d6a28, true, true, 'metal')
  barrel(w, cx + 1.4, cz - 9.2)
  const pts: [number, number][] = [[-8, 4], [7, -5], [-1, -9], [4, 8]]
  for (const [ox, oz] of pts) {
    w.lootPoints.push({ x: cx + ox, y: w.groundHeight(cx + ox, cz + oz) + 0.12, z: cz + oz, tier })
  }
  w.lootPoints.push({ x: tx, y: tg + towerH + 0.42, z: tz, tier: Math.min(3, tier + 1) })
  w.mapRects.push({ x: cx, z: cz, w: 30, d: 28, color: '#8a9aa4' })
}

/** 地堡：半埋混凝土碉堡 + 入口走廊 + 沙袋阵地 */
export function bunker(w: World, cx: number, cz: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, 0)
  const bw = 14, bd = 10, h = 2.7, t = 0.45
  const wallC = 0x83878a
  // 主体四墙：南墙开门，东西墙留射击孔（上下两段夹缝）
  const doorW = 1.8, doorH = 2.1
  const segW = (bw - doorW) / 2
  B(segW, h, t, -(doorW + segW) / 2, g, bd / 2 - t / 2, wallC, true, 'concrete')
  B(segW, h, t, (doorW + segW) / 2, g, bd / 2 - t / 2, wallC, true, 'concrete')
  B(doorW, h - doorH, t, 0, g + doorH, bd / 2 - t / 2, wallC, true, 'concrete')
  B(bw, h, t, 0, g, -bd / 2 + t / 2, wallC, true, 'concrete')
  for (const sx of [-1, 1]) {
    // 射击孔：下墙 1.1 高 + 上墙（1.45 起），中缝 0.35 作射界
    B(t, 1.1, bd - t * 2, sx * (bw / 2 - t / 2), g, 0, wallC, true, 'concrete')
    B(t, h - 1.45, bd - t * 2, sx * (bw / 2 - t / 2), g + 1.45, 0, wallC, true, 'concrete')
  }
  // 重型顶板 + 覆土 + 通风管 + 天线
  B(bw + 1.2, 0.55, bd + 1.2, 0, g + h, 0, 0x6e7479, true, 'concrete')
  B(bw + 0.4, 0.5, bd + 0.4, 0, g + h + 0.55, 0, w.biome.gBase, false)
  for (const [vx, vz] of [[-3, -2], [3, 1.5]]) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 7), w.mat(0x5d6a74, 'metal'))
    vent.position.set(cx + vx, g + h + 1.4, cz + vz)
    vent.castShadow = true
    w.group.add(vent)
    w.box(0.55, 0.14, 0.55, cx + vx, g + h + 1.9, cz + vz, 0x4a5158, false, false, 'metal')
  }
  B(0.08, 3.2, 0.08, bw / 2 - 1, g + h + 0.55, -bd / 2 + 1, 0x4a5158, false, 'metal')
  // 入口走廊（护墙）+ 门框
  B(0.4, 1.6, 4.5, -doorW / 2 - 0.4, g, bd / 2 + 2.2, wallC, true, 'concrete')
  B(0.4, 1.6, 4.5, doorW / 2 + 0.4, g, bd / 2 + 2.2, wallC, true, 'concrete')
  doorFrame(B, 0, g, bd / 2 - 0.1, doorW, doorH, 0x5d6a74)
  // 室内：货架 + 弹药箱 + 床垫
  shelfRack(w, B, -4.5, g + 0.06, -2.8, false)
  B(1.1, 0.6, 0.7, 2.5, g + 0.06, -3.2, 0x5d6e3a, true, 'wood')
  B(1.1, 0.6, 0.7, 3.8, g + 0.06, -3.2, 0x5d6e3a, true, 'wood')
  mattress(B, 4.8, g + 0.1, 1.5)
  table(B, 0, g + 0.06, -3)
  // 外围沙袋阵地
  sandbagLine(B, -bw / 2 - 3, g, 2, 4.5, false)
  sandbagLine(B, bw / 2 + 3, g, -2, 4.5, false)
  sandbagLine(B, 2, g, -bd / 2 - 3.5, 5, true)
  // 战利品：内部高一档
  const pts: [number, number][] = [[-3, 0], [3, -1], [0, 2], [0, bd / 2 + 4]]
  for (const [ox, oz] of pts) {
    w.lootPoints.push({ x: cx + ox, y: g + 0.12, z: cz + oz, tier })
  }
  w.lootPoints.push({ x: cx, y: g + 0.75, z: cz - 3, tier: Math.min(3, tier + 1) })
  w.mapRects.push({ x: cx, z: cz, w: bw + 1.2, d: bd + 1.2, color: '#6d7276' })
}

/** 坠机点：烧毁机身 + 残翼 + 散落货箱（高级物资） */
export function crashsite(w: World, cx: number, cz: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const burntC = 0x2c2e30, hullC = 0x586066
  // 焦土圈
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(16, 24), surface({ color: 0x232422, roughness: 1 }))
  scorch.rotation.x = -Math.PI / 2
  scorch.position.set(cx, g + 0.05, cz)
  scorch.receiveShadow = true
  w.group.add(scorch)
  // 犁地痕（机身滑行方向）
  const dirA = w.rng.range(0, Math.PI * 2)
  const dx = Math.cos(dirA), dz = Math.sin(dirA)
  for (let i = 0; i < 3; i++) {
    const t = -14 - i * 7
    const px = cx + dx * t, pz = cz + dz * t
    const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(w.rng.range(0.8, 1.4), 0), w.mat(0x4a4438))
    mound.position.set(px, w.groundHeight(px, pz) + 0.3, pz)
    mound.rotation.set(w.rng.range(0, 3), w.rng.range(0, 3), 0)
    w.group.add(mound)
  }
  // 主机身：横倒圆柱 + 断口环 + 尾段分离
  const hullGrp = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 10, 12, 1, true), surface({ color: hullC, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide, flatShading: true }))
  hull.rotation.z = Math.PI / 2
  hull.castShadow = true
  hullGrp.add(hull)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), surface({ color: hullC, roughness: 0.55, metalness: 0.5, flatShading: true }))
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 5
  nose.castShadow = true
  hullGrp.add(nose)
  const burnt = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 3.4, 12, 1, true), surface({ color: burntC, roughness: 0.95, side: THREE.DoubleSide }))
  burnt.rotation.z = Math.PI / 2
  burnt.position.x = -3.6
  hullGrp.add(burnt)
  hullGrp.position.set(cx, g + 1.5, cz)
  hullGrp.rotation.y = -dirA
  hullGrp.rotation.z = 0.06
  w.group.add(hullGrp)
  w.col.addBox(cx - 5.5, g, cz - 2, cx + 5.5, g + 3.2, cz + 2)
  // 尾段（错位甩出）
  const tailGrp = new THREE.Group()
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.55, 5, 10, 1, true), surface({ color: hullC, roughness: 0.6, metalness: 0.45, side: THREE.DoubleSide, flatShading: true }))
  tail.rotation.z = Math.PI / 2
  tail.castShadow = true
  tailGrp.add(tail)
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.22), w.mat(0x8a4a3a, 'metal'))
  fin.position.set(-1.8, 1.6, 0)
  fin.rotation.z = 0.5
  fin.castShadow = true
  tailGrp.add(fin)
  const tx = cx - dx * 13 + dz * 5, tz = cz - dz * 13 - dx * 5
  tailGrp.position.set(tx, w.groundHeight(tx, tz) + 1.2, tz)
  tailGrp.rotation.y = -dirA + 0.8
  tailGrp.rotation.x = -0.1
  w.group.add(tailGrp)
  w.col.addBox(tx - 3, w.groundHeight(tx, tz), tz - 1.6, tx + 3, w.groundHeight(tx, tz) + 2.6, tz + 1.6)
  // 断翼 + 引擎
  const wingX = cx + dz * 9, wingZ = cz - dx * 9
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 2.4), w.mat(hullC, 'metal'))
  wing.position.set(wingX, w.groundHeight(wingX, wingZ) + 0.5, wingZ)
  wing.rotation.y = dirA + 0.4
  wing.rotation.z = 0.12
  wing.castShadow = true
  w.group.add(wing)
  w.col.addBox(wingX - 4, w.groundHeight(wingX, wingZ), wingZ - 1.2, wingX + 4, w.groundHeight(wingX, wingZ) + 0.9, wingZ + 1.2)
  const engX = cx - dz * 7, engZ = cz + dx * 7
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 2.6, 10), w.mat(0x3a3f44, 'metal'))
  eng.rotation.z = Math.PI / 2
  eng.rotation.y = w.rng.range(0, 3)
  eng.position.set(engX, w.groundHeight(engX, engZ) + 0.8, engZ)
  eng.castShadow = true
  w.group.add(eng)
  w.col.addCyl(engX, engZ, 1.1, w.groundHeight(engX, engZ), w.groundHeight(engX, engZ) + 1.6)
  // 散落货箱（军绿补给箱，必有高级物资）
  for (let i = 0; i < 4; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(4, 12)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    w.box(1.15, 0.75, 0.8, x, w.groundHeight(x, z), z, 0x5d6e3a, true, true, 'metal')
    w.lootPoints.push({ x: x + 0.9, y: w.groundHeight(x, z) + 0.12, z, tier: 3 })
  }
  // 碎片
  for (let i = 0; i < 6; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(3, 14)
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
    const s = w.rng.range(0.3, 0.8)
    w.box(s, s * 0.4, s * 0.7, x, w.groundHeight(x, z), z, w.rng.chance(0.5) ? burntC : hullC, false, true, 'metal')
  }
  w.lootPoints.push({ x: cx + 2, y: g + 0.12, z: cz + 2.6, tier: 3 })
  w.lootPoints.push({ x: cx - dx * 13, y: w.groundHeight(cx - dx * 13, cz - dz * 13) + 0.12, z: cz - dz * 13, tier })
  w.mapRects.push({ x: cx, z: cz, w: 26, d: 26, color: '#5a4a42' })
}

/** 检查站：水泥墩 + 道闸 + 岗亭 + 沙袋 */
export function checkpoint(w: World, cx: number, cz: number, rot: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  const B = w.localBuilder(cx, cz, rot)
  const blockC = 0x9aa0a4
  // 交错水泥墩（强制载具减速绕行）
  B(2.4, 1.05, 0.8, -3.4, g, -2.2, blockC, true, 'concrete')
  B(2.4, 1.05, 0.8, 3.4, g, 2.2, blockC, true, 'concrete')
  B(0.8, 1.05, 2.4, -5.6, g, 1.6, blockC, true, 'concrete')
  B(0.8, 1.05, 2.4, 5.6, g, -1.6, blockC, true, 'concrete')
  // 道闸：立柱 + 红白横杆（半开）
  B(0.32, 1.15, 0.32, -3.2, g, 0, 0x8a4a3a, true, 'metal')
  for (let i = 0; i < 6; i++) {
    B(1.05, 0.13, 0.13, -2.6 + 1.05 * i + 0.52, g + 1.02, 0, i % 2 === 0 ? 0xc24034 : 0xe8e4da, false)
  }
  // 岗亭：小方屋 + 大窗 + 平顶
  const hx = 5.2, hz = 4.4
  B(2.6, 0.12, 2.6, hx, g + 0.02, hz, 0x8c9094, false, 'concrete')
  B(2.4, 1.0, 0.18, hx, g, hz - 1.2, 0x7d8084, true, 'metal')
  B(2.4, 1.0, 0.18, hx, g, hz + 1.2, 0x7d8084, true, 'metal')
  B(0.18, 1.0, 2.3, hx - 1.2, g, hz, 0x7d8084, true, 'metal')
  B(0.18, 2.5, 0.5, hx + 1.15, g, hz - 1.05, 0x7d8084, true, 'metal')
  B(0.18, 2.5, 0.5, hx + 1.15, g, hz + 1.05, 0x7d8084, true, 'metal')
  for (const [px, pz, pw, pd] of [[hx, hz - 1.2, 2.4, 0.18], [hx, hz + 1.2, 2.4, 0.18], [hx - 1.2, hz, 0.18, 2.3]] as [number, number, number, number][]) {
    B(pw, 1.3, pd, px, g + 1.0, pz, 0x9fb6c4, false)
  }
  B(2.4, 0.5, 2.4, hx, g + 2.3, hz, 0x7d8084, false, 'metal')
  B(2.8, 0.14, 2.8, hx, g + 2.8, hz, 0x5d6a74, true, 'metal')
  // 沙袋哨位 + 油桶
  sandbagLine(B, -5.5, g, -4.2, 4.2, true)
  sandbagLine(B, 0, g, 4.6, 3.6, true)
  const [bx1, bz1] = w.rotPt(-6.8, 3.4, rot)
  barrel(w, cx + bx1, cz + bz1, 0x6d6a28)
  // 探照灯杆
  B(0.14, 4.6, 0.14, -5.2, g, 4.2, 0x4a5158, true, 'metal')
  B(0.5, 0.3, 0.4, -5.2, g + 4.4, 4.0, 0xd5d9dc, false, 'metal')
  const pts: [number, number][] = [[5.2, 4.4], [-5.5, -3.4], [0, 0]]
  for (const [lx, lz] of pts) {
    const [x, z] = w.rotPt(lx, lz, rot)
    w.lootPoints.push({ x: cx + x, y: g + 0.12, z: cz + z, tier })
  }
  w.mapRects.push({ x: cx, z: cz, w: rot % 2 === 0 ? 13 : 10, d: rot % 2 === 0 ? 10 : 13, color: '#8a6a52' })
}

/** 发电厂：主厂房 + 双烟囱 + 变电场 + 油罐 + 煤堆 */
export function power(w: World, cx: number, cz: number, r: number, tier: number) {
  const g = w.groundHeight(cx, cz)
  // 主厂房（高大金属厂房 + 天窗脊）
  const B = w.localBuilder(cx - 6, cz, 0)
  const ww = 26, d = 15, h = 8, t = 0.35
  const wallC = 0x7a7468, roofC = 0x4a5158
  const doorW = 6, doorH = 5.5
  for (const sx of [-1, 1]) {
    const segD = (d - doorW) / 2
    B(t, h, segD, sx * (ww / 2 - t / 2), g, -(doorW + segD) / 2, wallC, true, 'metal')
    B(t, h, segD, sx * (ww / 2 - t / 2), g, (doorW + segD) / 2, wallC, true, 'metal')
    B(t, h - doorH, doorW, sx * (ww / 2 - t / 2), g + doorH, 0, wallC, true, 'metal')
  }
  B(ww - t * 2, h, t, 0, g, d / 2 - t / 2, wallC, true, 'metal')
  B(ww - t * 2, h, t, 0, g, -d / 2 + t / 2, wallC, true, 'metal')
  B(ww + 1, 0.3, d + 1, 0, g + h, 0, roofC, true, 'roof')
  B(ww * 0.7, 1.1, 3, 0, g + h + 0.3, 0, 0x84898d, false, 'metal')
  B(ww - 0.3, 0.08, d - 0.3, 0, g + 0.02, 0, 0x868c90, false, 'concrete')
  // 厂房内：发电机组（大机座 × 2）+ 货架
  B(6, 2.6, 3.4, -5, g + 0.1, -2, 0x3f6a55, true, 'metal')
  B(6, 2.6, 3.4, 4, g + 0.1, -2, 0x3f6a55, true, 'metal')
  B(1.2, 1.4, 1.2, -5, g + 2.7, -2, 0x84898d, false, 'metal')
  B(1.2, 1.4, 1.2, 4, g + 2.7, -2, 0x84898d, false, 'metal')
  shelfRack(w, B, 6, g + 0.08, d / 2 - 1.6, true)
  // 双烟囱（红白警示环）
  for (const ox of [10, 16]) {
    const sx = cx + ox, sz = cz - d / 2 - 4
    const sg = w.groundHeight(sx, sz)
    const stackH = 21
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.7, stackH, 12), surface({ color: 0xb4aca0, map: w.tex('concrete'), roughness: 0.92, flatShading: true }))
    stack.position.set(sx, sg + stackH / 2, sz)
    stack.castShadow = true
    w.group.add(stack)
    for (const bandY of [stackH - 1.5, stackH - 4]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.26, 1.1, 12), w.mat(0xa84a32))
      band.position.set(sx, sg + bandY, sz)
      w.group.add(band)
    }
    w.col.addCyl(sx, sz, 1.7, sg, sg + stackH)
    w.mapRects.push({ x: sx, z: sz, w: 3.4, d: 3.4, color: '#9a9088' })
  }
  // 变电场：变压器阵列 + 围栏
  const yx = cx + 13, yz = cz + 8
  const yg = w.groundHeight(yx, yz)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const px = yx - 4 + i * 4, pz = yz - 2 + j * 4.5
      w.box(1.6, 1.8, 1.2, px, yg, pz, 0x5d6a74, true, true, 'metal')
      for (const io of [-0.45, 0, 0.45]) {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), w.mat(0x8a7350))
        ins.position.set(px + io, yg + 2.1, pz)
        w.group.add(ins)
      }
    }
  }
  const fb = w.localBuilder(yx, yz, 0)
  fenceRun(fb, 0, yg, -5.2, 14, true, 1.8)
  fenceRun(fb, 0, yg, 5.2, 14, true, 1.8)
  fenceRun(fb, -7, yg, 0, 10.4, false, 1.8)
  // 油罐 + 管线
  const ox2 = cx - 18, oz2 = cz + 9
  const og = w.groundHeight(ox2, oz2)
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4.6, 14), surface({ color: 0xc2c6c8, map: w.tex('metal'), roughness: 0.42, metalness: 0.5, flatShading: true }))
  tank.position.set(ox2, og + 2.3, oz2)
  tank.castShadow = true
  w.group.add(tank)
  w.col.addCyl(ox2, oz2, 3.4, og, og + 4.6)
  w.box(0.28, 0.28, 9, ox2 + 3.5, og + 0.6, oz2 - 6, 0x8a8d90, false, false, 'metal')
  w.mapRects.push({ x: ox2, z: oz2, w: 6.8, d: 6.8, color: '#a8acae' })
  // 煤堆
  const coal = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.6, 10), w.mat(0x26282a))
  const clg = w.groundHeight(cx - 16, cz - 10)
  coal.position.set(cx - 16, clg + 1.3, cz - 10)
  coal.castShadow = true
  w.group.add(coal)
  w.col.addCyl(cx - 16, cz - 10, 3.2, clg, clg + 2.2)
  // 油桶组 + 电缆卷轴
  barrel(w, cx + 2, cz + 9)
  barrel(w, cx + 3.2, cz + 9.5)
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 10), w.mat(0x8a7350, 'wood'))
  spool.rotation.z = Math.PI / 2
  const spg = w.groundHeight(cx - 2, cz + 10)
  spool.position.set(cx - 2, spg + 0.9, cz + 10)
  spool.castShadow = true
  w.group.add(spool)
  w.col.addCyl(cx - 2, cz + 10, 0.9, spg, spg + 1.8)
  const pts: [number, number][] = [[-11, 0], [-1, -2], [9, 0], [13, 8], [-18, 9], [3, 6]]
  for (const [ox3, oz3] of pts) {
    w.lootPoints.push({ x: cx + ox3, y: w.groundHeight(cx + ox3, cz + oz3) + 0.12, z: cz + oz3, tier })
  }
  w.lootPoints.push({ x: cx - 5, y: g + 2.82, z: cz - 2, tier: Math.min(3, tier + 1) })
  w.mapRects.push({ x: cx - 6, z: cz, w: ww, d: d, color: '#7d7468' })
}

// ---------------- 调度 ----------------

export function buildPoi(w: World, p: PoiDef) {
  switch (p.kind) {
    case 'town': town(w, p.x, p.z, p.r, p.tier); break
    case 'village': village(w, p.x, p.z, p.r, p.tier); break
    case 'depot': depot(w, p.x, p.z, p.tier); break
    case 'military': military(w, p.x, p.z, p.r, p.tier); break
    case 'farm': farm(w, p.x, p.z, p.tier); break
    case 'gas': gasStation(w, p.x, p.z, w.rng.int(0, 3), p.tier); break
    case 'ruins': ruins(w, p.x, p.z, p.r, p.tier); break
    case 'camp': camp(w, p.x, p.z, p.r, p.tier); break
    case 'huts': huts(w, p.x, p.z, p.r, p.tier); break
    case 'port': port(w, p.x, p.z, p.tier); break
    case 'radar': radar(w, p.x, p.z, p.tier); break
    case 'bunker': bunker(w, p.x, p.z, p.tier); break
    case 'crashsite': crashsite(w, p.x, p.z, p.tier); break
    case 'checkpoint': checkpoint(w, p.x, p.z, w.rng.int(0, 3), p.tier); break
    case 'power': power(w, p.x, p.z, p.r, p.tier); break
  }
}
