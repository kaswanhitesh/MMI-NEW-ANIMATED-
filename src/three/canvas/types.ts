/**
 * Scene-agnostic renderer settings consumed by `SceneCanvas`. A scene config
 * provides one of these so the same canvas wrapper serves every scene.
 */
export interface RenderingConfig {
  /** Device-pixel-ratio clamp [min, max] on pointer: fine devices (desktop). */
  dprDesktop: readonly [number, number]
  /** Device-pixel-ratio clamp on coarse-pointer devices (phones / tablets). */
  dprMobile: readonly [number, number]
  /** Enables shadow maps (PCF). */
  shadows: boolean
  antialias: boolean
  powerPreference: 'high-performance' | 'low-power' | 'default'
}
