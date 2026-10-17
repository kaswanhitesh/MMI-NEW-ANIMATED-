/**
 * Unobtrusive status pill shown in a scene's overlay while any listed model is
 * still loading or is being stood in for by TEMPORARY placeholder geometry.
 * It reads the asset layer's status store and renders nothing once every
 * listed model is the real GLB, so a finished site never shows it. The
 * substitution reason is exposed only as a `title` tooltip.
 */
import { getModelEntry, useModelStatuses, type ModelId, type ModelStatus } from '../../three/assets'
import { BADGE_COPY } from '../content/copy'

export interface PlaceholderBadgeProps {
  /** Models to report on — usually the scene module's `models` list. */
  models: readonly ModelId[]
}

interface BadgeItem {
  id: ModelId
  source: 'loading' | 'placeholder'
  text: string
  reason?: string
}

/** Maps a model's status to a badge line, or null when nothing needs reporting (real GLB on screen, or not reported yet). */
function toBadgeItem(id: ModelId, status: ModelStatus | undefined): BadgeItem | null {
  if (!status || status.source === 'gltf') return null
  const label = getModelEntry(id).label
  if (status.source === 'loading') {
    return { id, source: 'loading', text: BADGE_COPY.loading(label) }
  }
  return { id, source: 'placeholder', text: BADGE_COPY.placeholder(label), reason: status.reason }
}

export function PlaceholderBadge({ models }: PlaceholderBadgeProps) {
  const statuses = useModelStatuses()

  const items: BadgeItem[] = []
  for (const id of models) {
    const item = toBadgeItem(
      id,
      statuses.find((status) => status.id === id),
    )
    if (item) items.push(item)
  }

  if (items.length === 0) return null

  return (
    <div className="scene-badge" role="status">
      <ul className="scene-badge__list">
        {items.map((item) => (
          <li key={item.id} className={`scene-badge__item scene-badge__item--${item.source}`} title={item.reason}>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
