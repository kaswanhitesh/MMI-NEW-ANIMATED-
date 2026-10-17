/**
 * Closing caption rendered inside a scene section's overlay, placed by CSS in
 * the BOTTOM-LEFT safe zone. It starts invisible (`opacity: 0; visibility:
 * hidden` in src/styles/scene.css); the scene timeline reveals it through the
 * `ref` with inline styles once the combination is coupled. In the
 * reduced-motion presentation the timeline shows it immediately.
 */
import type { Ref } from 'react'
import { SCENE_CAPTION } from '../content/copy'

export interface SceneCaptionProps {
  /** Root `<div>`; the scene timeline fades it via inline styles. */
  ref?: Ref<HTMLDivElement>
}

export function SceneCaption({ ref }: SceneCaptionProps) {
  return (
    <div ref={ref} className="scene-overlay__caption">
      <h2>{SCENE_CAPTION.title}</h2>
      <p>{SCENE_CAPTION.body}</p>
    </div>
  )
}
