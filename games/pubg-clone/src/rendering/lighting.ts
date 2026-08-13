import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { BiomeDef } from '../world/biome'
import type { CinematicQualityProfile } from './quality'

export interface SceneLights {
  /** 主方向光（投影阴影），由 Game 每帧跟随玩家移动 */
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
}

/**
 * 场景灯光：半球天光 + 主太阳 + 背光面天空补光。
 * 强度与色温由 biome 决定，阴影规格由画质 profile 决定。
 */
export function createLighting(scene: THREE.Scene, biome: BiomeDef, profile: CinematicQualityProfile): SceneLights {
  const hemi = new THREE.HemisphereLight(biome.hemiSky, biome.hemiGround, biome.hemiIntensity)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(biome.sunColor, biome.sunIntensity)
  sun.position.set(120, 190, 60)
  sun.castShadow = true
  sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
  sun.shadow.camera.left = -130
  sun.shadow.camera.right = 130
  sun.shadow.camera.top = 130
  sun.shadow.camera.bottom = -130
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 600
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 1.6
  scene.add(sun)
  scene.add(sun.target)

  // 天空漫反射补光：缓解背光面死黑（无阴影、低强度、色温偏冷模拟天光）
  const fill = new THREE.DirectionalLight(0xc2d6e8, 0.3)
  fill.position.set(-90, 55, -120)
  scene.add(fill)

  return { sun, hemi }
}

/**
 * 低强度环境反射：给 Standard 材质（金属车身 / 枪械 / 玻璃）提供反射来源。
 * Lambert 材质不受影响，整体氛围仍由 biome 灯光主导。
 */
export function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.22
  pmrem.dispose()
}
