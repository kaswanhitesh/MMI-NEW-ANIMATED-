/**
 * Opening hero copy rendered inside a scene section's overlay. CSS places it
 * in the TOP-LEFT safe zone (src/styles/scene.css) so it never sits over the
 * vehicles, which travel through the vertical middle band of the stage.
 *
 * The scene timeline drives this element's inline `opacity` / `visibility`
 * through the `ref` (a plain prop in React 19 — no forwardRef needed), so the
 * root element must stay the element the ref points at.
 */
import type { Ref } from 'react'
import { HERO_COPY } from '../content/copy'

export interface HeroCopyProps {
  /** Root `<div>`; the scene timeline fades it via inline styles. */
  ref?: Ref<HTMLDivElement>
}

export function HeroCopy({ ref }: HeroCopyProps) {
  return (
    <div ref={ref} className="scene-overlay__hero">
      <p className="eyebrow">{HERO_COPY.eyebrow}</p>
      <h1>{HERO_COPY.headline}</h1>
      <p className="lede">{HERO_COPY.subline}</p>
    </div>
  )
}
