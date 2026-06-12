import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildCharacterModel } from './entities/characterModel'
import { buildGunMesh } from './entities/weaponModel'
import { buildHelmetModel, buildVestModel, buildBagModel } from './entities/gearModel'
import { WEAPONS } from './items/defs'
import { Vehicle } from './world/vehicle'
import { PlaneRide } from './world/plane'
import { getSkin } from './content/skins'

/**
 * 临时模型查看器（/viewer.html?scene=xxx）：
 * scene=chars | guns | vehicles | plane | gear
 * 仅用于开发期截图验证，不进入游戏构建路径。
 */

const root = document.getElementById('v')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
root.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a3340)
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 500)

const sun = new THREE.DirectionalLight(0xfff2dd, 2.6)
sun.position.set(6, 10, 5)
sun.castShadow = true
scene.add(sun, new THREE.AmbientLight(0x8fa3bb, 1.1))
const fill = new THREE.DirectionalLight(0x9db8d8, 0.7)
fill.position.set(-5, 4, -6)
scene.add(fill)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.95 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const what = new URLSearchParams(location.search).get('scene') ?? 'chars'

function label(_text: string, _x: number, _z: number) { /* 截图用，无需文字 */ }

if (what === 'chars') {
  const skins = ['woodland', 'desert', 'urban', 'arctic'] as const
  skins.forEach((id, i) => {
    const rig = buildCharacterModel({ bodyColor: 0x5f6f52, skin: getSkin(id) })
    rig.model.position.set((i - (skins.length - 1) / 2) * 1.1, 0, 0)
    scene.add(rig.model)
  })
  cam.position.set(0, 1.35, 4.4)
  cam.lookAt(0, 0.85, 0)
} else if (what === 'guns') {
  // ?ids=ak,m4 可只看指定枪
  const idsParam = new URLSearchParams(location.search).get('ids')
  const ids = idsParam ? idsParam.split(',') : Object.keys(WEAPONS)
  const few = ids.length <= 3
  const cols = few ? 1 : 3
  ids.forEach((id, i) => {
    if (!WEAPONS[id]) return
    const { group: mesh } = buildGunMesh(WEAPONS[id], { scope: i % 3 === 0 ? 'scope4' : undefined, muzzle: i % 2 === 0 ? 'comp' : undefined })
    const cx = (i % cols - (cols - 1) / 2) * 2.6
    const cz = (Math.floor(i / cols) - Math.ceil(ids.length / cols - 1) / 2) * (few ? 1.6 : 1.05)
    mesh.position.set(cx, 0.8, cz)
    mesh.rotation.y = Math.PI / 2 + 0.25
    mesh.rotation.x = 0.12
    mesh.scale.setScalar(few ? 3.2 : 2.0)
    scene.add(mesh)
    label(id, cx, cz)
  })
  cam.position.set(0, few ? 5.6 : 4.6, few ? 4.4 : 5.2)
  cam.lookAt(0, 0.6, 0)
} else if (what === 'vehicles') {
  const kinds = ['buggy', 'pickup', 'van'] as const
  kinds.forEach((k, i) => {
    const v = new Vehicle(scene, (i - 1) * 5.2, 0, Math.PI * 0.82, 0, k)
    void v
  })
  cam.position.set(3.5, 4.6, 12.5)
  cam.lookAt(0, 0.6, 0)
} else if (what === 'plane') {
  const p = new PlaneRide(scene, 0, 0, 0, 10, 3.2, 0)
  p.mesh.position.set(0, 3.2, 0)
  p.mesh.rotation.y = Math.PI * 0.35
  cam.position.set(16, 9, 14)
  cam.lookAt(0, 3, 0)
} else if (what === 'gear') {
  for (let lv = 1; lv <= 3; lv++) {
    const h = buildHelmetModel(lv)
    h.position.set((lv - 2) * 1.1, 1.65, 0)
    h.scale.setScalar(1.6)
    const v = buildVestModel(lv)
    v.position.set((lv - 2) * 1.1, 0.95, 0)
    v.scale.setScalar(1.4)
    const b = buildBagModel(lv)
    b.position.set((lv - 2) * 1.1, 0.3, 0)
    b.scale.setScalar(1.4)
    scene.add(h, v, b)
  }
  cam.position.set(0.6, 1.6, 4.6)
  cam.lookAt(0, 1.0, 0)
}

scene.traverse((o) => {
  if ((o as THREE.Mesh).isMesh && o !== ground) {
    o.castShadow = true
    o.receiveShadow = true
  }
})

const ctl = new OrbitControls(cam, renderer.domElement)
ctl.target.copy((cam as any).userData?.target ?? new THREE.Vector3(0, what === 'plane' ? 3 : 0.8, 0))
ctl.update()

renderer.setAnimationLoop(() => {
  ctl.update()
  renderer.render(scene, cam)
})

// 调试句柄：截图验证时用 CDP 检查场景结构
;(window as any).__scene = scene

addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight
  cam.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
