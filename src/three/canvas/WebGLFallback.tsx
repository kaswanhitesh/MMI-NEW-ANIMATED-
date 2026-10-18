/**
 * DOM panel shown in place of the 3D canvas when WebGL is unavailable or the
 * renderer fails to start. It keeps the scene section's size (styled by
 * `.scene-fallback` in src/styles/scene.css) so the page layout does not shift,
 * and describes in plain text what the animation would have shown. No images.
 */

export interface WebGLFallbackProps {
  /** Why the canvas could not be shown; rendered verbatim beneath the heading when present. */
  reason?: string
}

const FALLBACK_DESCRIPTION =
  'This section shows a heavy-haul combination being assembled in a transport yard: a puller truck reverses towards a ' +
  'hydraulic axle trailer until the trailer’s gooseneck sits over the truck’s coupling, forming the unit used to move ' +
  'over-dimensional and over-weight cargo. The rest of the page is fully usable without it.'

export function WebGLFallback({ reason }: WebGLFallbackProps) {
  return (
    <div className="scene-fallback" role="status">
      <h2 className="scene-fallback__title">Interactive 3D is unavailable in this browser</h2>
      {reason ? <p className="scene-fallback__reason">{reason}</p> : null}
      <p className="scene-fallback__description">{FALLBACK_DESCRIPTION}</p>
    </div>
  )
}
