import * as THREE from 'three'
import { World } from '../world/world'
import { Effects } from '../fx/effects'
import { RNG } from '../utils/rng'
import { WeaponInst } from '../combat/weapon'
import {
  WEAPONS, ITEMS, AMMO_META, RARITY_HEX, RARITY_NAMES,
  AmmoType, Rarity,
} from './defs'
import type { Character } from '../entities/character'

export type GroundKind = 'weapon' | 'item' | 'ammo'

export interface GroundItem {
  id: number
  kind: GroundKind
  itemId?: string
  ammoType?: AmmoType
  count: number
  weapon?: WeaponInst
  rarity: Rarity
  x: number; y: number; z: number
  mesh: THREE.Group
  claimedBy: number
  name: string
}

interface Airdrop {
  x: number; z: number; y: number
  groundY: number
  landed: boolean
  opened: boolean
  openT: number
  mesh: THREE.Group
  chute: THREE.Mesh | null
}

// ---------- 掉落表 ----------
const CATS = ['weapon', 'ammo', 'med', 'armor', 'helmet', 'bag', 'attach', 'boost', 'nade'] as const
const CAT_W: Record<number, number[]> = {
  1: [30, 21, 15, 7, 7, 6, 4, 5, 5],
  2: [30, 19, 13, 9, 9, 6, 6, 4, 4],
  3: [30, 17, 12, 10, 10, 6, 8, 3, 4],
}
const WEAPON_T: Record<number, [string, number][]> = {
  1: [['p9', 30], ['wasp', 22], ['backdraft', 20], ['raptor', 18], ['vista', 7], ['longfang', 3]],
  2: [['p9', 10], ['wasp', 22], ['backdraft', 18], ['raptor', 28], ['vista', 14], ['longfang', 6], ['pan', 2]],
  3: [['raptor', 30], ['wasp', 12], ['backdraft', 9], ['vista', 22], ['longfang', 15], ['p9', 3], ['pan', 9]],
}
const RARITY_T: Record<number, number[]> = {
  1: [62, 27, 10, 1],
  2: [40, 35, 20, 5],
  3: [22, 38, 28, 12],
}
const LEVEL_T: Record<number, number[]> = {
  1: [60, 36, 4],
  2: [40, 45, 15],
  3: [18, 48, 34],
}
const MED_T: Record<number, [string, number][]> = {
  1: [['bandage', 60], ['firstaid', 34], ['medkit', 6]],
  2: [['bandage', 45], ['firstaid', 45], ['medkit', 10]],
  3: [['bandage', 30], ['firstaid', 52], ['medkit', 18]],
}
const ATTACH_T: [string, number][] = [
  ['scope_red', 22], ['scope_4x', 12], ['scope_8x', 4],
  ['muzzle_comp', 18], ['muzzle_sup', 12], ['grip', 16], ['extmag', 16],
]
const NADE_T: [string, number][] = [['frag', 45], ['smoke', 30], ['flash', 25]]
const AMMO_T: Record<number, [AmmoType, number][]> = {
  1: [['light', 40], ['rifle', 36], ['sniper', 10], ['shell', 14]],
  2: [['light', 34], ['rifle', 40], ['sniper', 13], ['shell', 13]],
  3: [['light', 24], ['rifle', 44], ['sniper', 20], ['shell', 12]],
}

function pickWeighted<T>(rng: RNG, table: [T, number][]): T {
  return table[rng.weighted(table.map((e) => e[1]))][0]
}

// ---------- 物品图标 ----------
const matCache = new Map<number, THREE.MeshLambertMaterial>()
function lam(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color)
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true }); matCache.set(color, m) }
  return m
}
const ringGeo = new THREE.RingGeometry(0.42, 0.55, 20)
const ringMats: THREE.MeshBasicMaterial[] = [0, 1, 2, 3].map(
  (r) => new THREE.MeshBasicMaterial({ color: RARITY_HEX[r], transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
)
const pillarGeo = new THREE.CylinderGeometry(0.18, 0.18, 6, 6, 1, true)
const pillarMats: THREE.MeshBasicMaterial[] = [0, 1, 2, 3].map(
  (r) => new THREE.MeshBasicMaterial({ color: RARITY_HEX[r], transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
)

export class LootSystem {
  items = new Map<number, GroundItem>()
  airdrops: Airdrop[] = []
  group = new THREE.Group()
  private nextId = 1
  private rng = new RNG((Date.now() % 100000) + 7)
  private time = 0

  constructor(private scene: THREE.Scene, private world: World, private fx: Effects) {
    scene.add(this.group)
  }

  // ---------- 生成 ----------

  spawnInitial() {
    for (const pt of this.world.lootPoints) {
      if (!this.rng.chance(0.85)) continue
      this.rollAt(pt.x, pt.y, pt.z, Math.min(3, Math.max(1, pt.tier)))
    }
  }

  private rollAt(x: number, y: number, z: number, tier: number) {
    const cat = CATS[this.rng.weighted(CAT_W[tier])]
    switch (cat) {
      case 'weapon': {
        const id = pickWeighted(this.rng, WEAPON_T[tier])
        if (id === 'pan') { this.spawnItem(x, y, z, 'pan_item', 1); break }
        const rarity = this.rng.weighted(RARITY_T[tier]) as Rarity
        this.spawnWeapon(x, y, z, id, rarity, true)
        break
      }
      case 'ammo': {
        const t = pickWeighted(this.rng, AMMO_T[tier])
        this.spawnAmmo(x, y, z, t, AMMO_META[t].stack * this.rng.int(1, 2))
        break
      }
      case 'med': this.spawnItem(x, y, z, pickWeighted(this.rng, MED_T[tier]), 1); break
      case 'armor': this.spawnItem(x, y, z, `armor${this.rng.weighted(LEVEL_T[tier]) + 1}`, 1); break
      case 'helmet': this.spawnItem(x, y, z, `helm${this.rng.weighted(LEVEL_T[tier]) + 1}`, 1); break
      case 'bag': this.spawnItem(x, y, z, `bag${this.rng.weighted(LEVEL_T[tier]) + 1}`, 1); break
      case 'attach': this.spawnItem(x, y, z, pickWeighted(this.rng, ATTACH_T), 1); break
      case 'boost': this.spawnItem(x, y, z, this.rng.chance(tier === 3 ? 0.5 : 0.7) ? 'drink' : 'pills', 1); break
      case 'nade': this.spawnItem(x, y, z, pickWeighted(this.rng, NADE_T), 1); break
    }
  }

  spawnWeapon(x: number, y: number, z: number, defId: string, rarity: Rarity, withAmmo: boolean) {
    const w = new WeaponInst(WEAPONS[defId], rarity)
    w.mag = Math.min(w.magSize, Math.round(w.magSize * 0.5))
    this.spawnWeaponInst(x, y, z, w)
    if (withAmmo && w.def.ammo) {
      const meta = AMMO_META[w.def.ammo]
      this.spawnAmmo(x + this.rng.range(-0.7, 0.7), y, z + this.rng.range(0.5, 0.9), w.def.ammo, meta.stack * 2)
    }
  }

  spawnWeaponInst(x: number, y: number, z: number, w: WeaponInst) {
    const gi: GroundItem = {
      id: this.nextId++, kind: 'weapon', count: 1, weapon: w, rarity: w.rarity,
      x, y, z, mesh: new THREE.Group(), claimedBy: 0,
      name: `${w.def.name}（${RARITY_NAMES[w.rarity]}）`,
    }
    this.buildMesh(gi)
    this.items.set(gi.id, gi)
  }

  spawnAmmo(x: number, y: number, z: number, type: AmmoType, count: number) {
    const gi: GroundItem = {
      id: this.nextId++, kind: 'ammo', ammoType: type, count, rarity: 0,
      x, y, z, mesh: new THREE.Group(), claimedBy: 0,
      name: `${AMMO_META[type].name} ×${count}`,
    }
    this.buildMesh(gi)
    this.items.set(gi.id, gi)
  }

  spawnItem(x: number, y: number, z: number, itemId: string, count: number) {
    const def = ITEMS[itemId]
    if (!def) return
    const rarity: Rarity = def.kind === 'armor' || def.kind === 'helmet' || def.kind === 'bag'
      ? (Math.min(3, def.level ?? 1) as Rarity)
      : def.kind === 'attach' ? 1 : 0
    const gi: GroundItem = {
      id: this.nextId++, kind: 'item', itemId, count, rarity,
      x, y, z, mesh: new THREE.Group(), claimedBy: 0,
      name: count > 1 ? `${def.name} ×${count}` : def.name,
    }
    this.buildMesh(gi)
    this.items.set(gi.id, gi)
  }

  // ---------- 图标网格 ----------

  private buildMesh(gi: GroundItem) {
    const g = gi.mesh
    g.position.set(gi.x, gi.y, gi.z)
    const ring = new THREE.Mesh(ringGeo, ringMats[gi.rarity])
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05
    g.add(ring)
    const icon = new THREE.Group()
    icon.position.y = 0.32
    this.buildIcon(gi, icon)
    icon.userData.phase = Math.random() * Math.PI * 2
    g.add(icon)
    if (gi.rarity >= 2) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMats[gi.rarity])
      pillar.position.y = 3
      g.add(pillar)
    }
    this.group.add(g)
  }

  private buildIcon(gi: GroundItem, icon: THREE.Group) {
    const add = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, lam(color))
      m.position.set(x, y, z)
      m.rotation.x = rx
      m.rotation.z = rz
      icon.add(m)
      return m
    }
    if (gi.kind === 'weapon') {
      const cls = gi.weapon!.def.cls
      const len = cls === 'SR' ? 0.8 : cls === 'PISTOL' ? 0.35 : cls === 'SMG' ? 0.5 : 0.66
      add(new THREE.BoxGeometry(0.09, 0.11, len * 0.62), 0x33383d, 0, 0, -len * 0.12)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, len * 0.5, 6), lam(0x4a5158))
      barrel.rotation.x = Math.PI / 2
      barrel.position.set(0, 0.01, len * 0.3)
      icon.add(barrel)
      add(new THREE.BoxGeometry(0.05, 0.14, 0.06), 0x33383d, 0, -0.1, -0.05)
      return
    }
    if (gi.kind === 'ammo') {
      const colors: Record<AmmoType, number> = { light: 0xc9c27a, rifle: 0xb58a4a, sniper: 0x9a4a4a, shell: 0xc2622f }
      add(new THREE.BoxGeometry(0.26, 0.16, 0.18), colors[gi.ammoType!])
      add(new THREE.BoxGeometry(0.2, 0.05, 0.12), 0x3c4045, 0, 0.1, 0)
      return
    }
    const def = ITEMS[gi.itemId!]
    switch (def.kind) {
      case 'med':
        add(new THREE.BoxGeometry(0.3, 0.2, 0.22), 0xe8e8e2)
        add(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0xc23b3b, 0, 0.11, 0)
        add(new THREE.BoxGeometry(0.05, 0.05, 0.16), 0xc23b3b, 0, 0.11, 0)
        break
      case 'boost':
        add(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 8), def.id === 'drink' ? 0x3fa8c9 : 0xd8d2c2)
        break
      case 'armor':
        add(new THREE.BoxGeometry(0.34, 0.38, 0.16), [0, 0x7a8a99, 0x46698c, 0x2c3d52][def.level ?? 1])
        break
      case 'helmet':
        add(new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0xb0a890, 0x5d7a4a, 0x32404c][def.level ?? 1])
        break
      case 'bag':
        add(new THREE.BoxGeometry(0.3, 0.36, 0.18), 0x6e5a3c)
        add(new THREE.BoxGeometry(0.2, 0.12, 0.1), 0x5d4a30, 0, -0.06, 0.12)
        break
      case 'attach':
        if (def.attachSlot === 'scope') {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), lam(0x2e3338))
          c.rotation.x = Math.PI / 2
          icon.add(c)
        } else {
          add(new THREE.BoxGeometry(0.24, 0.1, 0.1), 0x2e3338)
        }
        break
      case 'nade':
        add(new THREE.SphereGeometry(0.12, 7, 6), def.id === 'frag' ? 0x44513c : def.id === 'smoke' ? 0x8a9298 : 0xd8d8d0)
        add(new THREE.BoxGeometry(0.05, 0.08, 0.05), 0x6a6a62, 0, 0.13, 0)
        break
      case 'meleeWeapon': {
        const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 10), lam(0x4a5158))
        pan.rotation.z = 0.5
        icon.add(pan)
        add(new THREE.BoxGeometry(0.05, 0.04, 0.22), 0x2e3338, 0, 0, 0.22)
        break
      }
      default:
        add(new THREE.BoxGeometry(0.2, 0.2, 0.2), 0x8a8a8a)
    }
  }

  // ---------- 查询 / 移除 ----------

  nearest(x: number, y: number, z: number, r: number, pred?: (gi: GroundItem) => boolean): GroundItem | null {
    let best: GroundItem | null = null
    let bestD = r * r
    for (const gi of this.items.values()) {
      const dx = gi.x - x, dz = gi.z - z
      const d2 = dx * dx + dz * dz
      if (d2 > bestD) continue
      if (Math.abs(gi.y - y) > 2.6) continue
      if (pred && !pred(gi)) continue
      best = gi
      bestD = d2
    }
    return best
  }

  remove(gi: GroundItem) {
    this.group.remove(gi.mesh)
    this.items.delete(gi.id)
  }

  // ---------- 尸体掉落 ----------

  dropCorpseLoot(ch: Character) {
    const x = ch.pos.x, z = ch.pos.z
    const y = ch.pos.y + 0.05
    const off = () => this.rng.range(-1.1, 1.1)
    if (ch.weapon && ch.weapon.def.cls !== 'MELEE') {
      this.spawnWeaponInst(x + off(), y, z + off(), ch.weapon)
      if (ch.weapon.def.ammo) {
        this.spawnAmmo(x + off(), y, z + off(), ch.weapon.def.ammo, this.rng.int(20, 55))
      }
    }
    if (ch.armor) this.spawnItem(x + off(), y, z + off(), `armor${ch.armor.level}`, 1)
    if (ch.helmet && this.rng.chance(0.7)) this.spawnItem(x + off(), y, z + off(), `helm${ch.helmet.level}`, 1)
    if (this.rng.chance(0.6)) this.spawnItem(x + off(), y, z + off(), this.rng.chance(0.6) ? 'bandage' : 'firstaid', 1)
    if (this.rng.chance(0.25)) this.spawnItem(x + off(), y, z + off(), pickWeighted(this.rng, NADE_T), 1)
  }

  // ---------- 空投 ----------

  callAirdrop(x: number, z: number) {
    const mesh = new THREE.Group()
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), lam(0xb33a30))
    crate.castShadow = true
    mesh.add(crate)
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.22, 1.54), lam(0xe8d8b0))
    mesh.add(band)
    const chute = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.8, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xd8e2e8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    )
    chute.position.y = 3.2
    mesh.add(chute)
    const groundY = this.world.col.groundAt(x, z, 1000)
    mesh.position.set(x, 135, z)
    this.scene.add(mesh)
    this.airdrops.push({ x, z, y: 135, groundY: groundY + 0.55, landed: false, opened: false, openT: 0, mesh, chute })
  }

  private openAirdrop(a: Airdrop) {
    a.opened = true
    const y = a.groundY - 0.55 + 0.1
    const off = () => this.rng.range(-1.6, 1.6)
    const wid = pickWeighted(this.rng, [['raptor', 40], ['vista', 30], ['longfang', 30]] as [string, number][])
    this.spawnWeapon(a.x + off(), y, a.z + off(), wid, 3, true)
    this.spawnItem(a.x + off(), y, a.z + off(), 'armor3', 1)
    this.spawnItem(a.x + off(), y, a.z + off(), 'helm3', 1)
    this.spawnItem(a.x + off(), y, a.z + off(), 'medkit', 1)
    this.spawnItem(a.x + off(), y, a.z + off(), this.rng.chance(0.5) ? 'scope_4x' : 'scope_8x', 1)
    this.spawnItem(a.x + off(), y, a.z + off(), 'pills', 1)
  }

  update(dt: number, time: number) {
    this.time = time
    // 物品图标动画
    for (const gi of this.items.values()) {
      const icon = gi.mesh.children[1]
      if (icon) {
        icon.rotation.y += dt * 1.4
        icon.position.y = 0.34 + Math.sin(time * 2 + (icon.userData.phase ?? 0)) * 0.05
      }
    }
    // 空投下落
    for (const a of this.airdrops) {
      if (!a.landed) {
        a.y -= 12 * dt
        if (a.y <= a.groundY) {
          a.y = a.groundY
          a.landed = true
          a.openT = time + 0.8
          if (a.chute) { a.mesh.remove(a.chute); a.chute = null }
          this.fx.flare(a.x, a.groundY + 0.6, a.z, 0.9, 0.18, 0.12, 70)
          this.world.col.addBox(a.x - 0.75, a.groundY - 0.55, a.z - 0.75, a.x + 0.75, a.groundY + 0.55, a.z + 0.75)
        }
        a.mesh.position.y = a.y
      } else if (!a.opened && time >= a.openT) {
        this.openAirdrop(a)
      }
    }
  }
}
