import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { CinematicQualityProfile } from './quality'

/** 暗角 + 轻度色彩分级（提饱和、压灰），写实手游观感 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.08 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(lum), c.rgb, uSaturation);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.38, 0.86, d);
      gl_FragColor = c;
    }`,
}

/**
 * 组装后处理管线：MSAA 渲染目标 + 泛光 + 暗角/色彩分级 + 输出。
 * 注：GTAOPass 在本场景（数千独立网格 + MSAA RT）实测有 50 倍帧时间开销，
 * 改为 world 侧烘焙式接触阴影贴花（见 World.buildContactAO）实现环境光遮蔽观感。
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  profile: CinematicQualityProfile,
): EffectComposer {
  const rtSamples = renderer.capabilities.isWebGL2 ? 4 : 0
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      samples: rtSamples, type: THREE.HalfFloatType,
    }),
  )
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    profile.bloomStrength, profile.bloomRadius, profile.bloomThreshold,
  ))
  const grade = new ShaderPass(GradeShader)
  grade.uniforms.uVignette.value = profile.vignette
  grade.uniforms.uSaturation.value = profile.saturation
  grade.uniforms.uContrast.value = profile.contrast
  composer.addPass(grade)
  composer.addPass(new OutputPass())
  return composer
}
