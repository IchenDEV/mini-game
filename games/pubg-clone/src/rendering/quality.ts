/**
 * cinematicQuality：电影画质配置。
 * 渲染管线（postProcessing）与灯光（lighting）共用同一份 profile，
 * 想出「性能档 / 电影档」只需新增一份配置，不用改管线代码。
 */

export interface CinematicQualityProfile {
  /** ACES 色调映射曝光（旧版 0.88 偏暗，电影档提到 1.12） */
  exposure: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  /** 暗角强度（0-1，旧版 0.24 压黑四角，电影档收敛到 0.08） */
  vignette: number
  saturation: number
  contrast: number
  shadowMapSize: number
  pixelRatioCap: number
}

export const CINEMATIC_HIGH: CinematicQualityProfile = {
  exposure: 1.12,
  bloomStrength: 0.16,
  bloomRadius: 0.58,
  bloomThreshold: 0.9,
  vignette: 0.08,
  saturation: 1.1,
  contrast: 1.04,
  shadowMapSize: 4096,
  pixelRatioCap: 2,
}
