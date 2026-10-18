/**
 * Static "Capabilities" section: heading and intro, a card per registry scene
 * (live or in development, read straight from SCENE_REGISTRY so the roadmap
 * never drifts from the code), an "Equipment" block of capability lines, and
 * a one-line "Projects" anchor noting that case studies will follow.
 * No statistics, client names or certifications appear here by design.
 */
import { getImplementedScenes, SCENE_REGISTRY } from '../../scenes/registry'
import type { SceneDefinition, SceneId } from '../../scenes/types'
import { CAPABILITIES_COPY, EQUIPMENT_COPY, PROJECTS_COPY } from '../content/copy'

const SCENES_BY_ORDER: readonly SceneDefinition[] = [...SCENE_REGISTRY].sort((a, b) => a.order - b.order)

/** Page anchor of each implemented scene's section — the same `scene-N` ids the scene sections render (N = 1-based position). */
const SCENE_ANCHORS: ReadonlyMap<SceneId, string> = new Map(
  getImplementedScenes().map((def, index) => [def.id, `#scene-${index + 1}`]),
)

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="section section--capabilities" aria-labelledby="capabilities-title">
      <div className="section__inner">
        <div className="section__header">
          <p className="eyebrow">{CAPABILITIES_COPY.eyebrow}</p>
          <h2 id="capabilities-title">{CAPABILITIES_COPY.heading}</h2>
          <p className="section__intro">{CAPABILITIES_COPY.intro}</p>
        </div>

        <ul className="card-grid" aria-label={CAPABILITIES_COPY.gridLabel}>
          {SCENES_BY_ORDER.map((def) => {
            const live = def.status === 'implemented'
            const anchor = SCENE_ANCHORS.get(def.id)
            return (
              <li key={def.id} className="card">
                <div className="card__meta">
                  <span className="card__index">{twoDigits(def.order)}</span>
                  <span className={`pill pill--${def.status}`}>
                    {live ? CAPABILITIES_COPY.statusLive : CAPABILITIES_COPY.statusPlanned}
                  </span>
                </div>
                <h3 className="card__title">{def.title}</h3>
                <p className="card__summary">{def.summary}</p>
                {live && anchor ? (
                  <a className="card__link" href={anchor} aria-label={`${CAPABILITIES_COPY.viewScene}: ${def.title}`}>
                    {CAPABILITIES_COPY.viewScene}
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div id="equipment" className="section__block">
          <div className="section__block-head">
            <h3>{EQUIPMENT_COPY.heading}</h3>
            <p>{EQUIPMENT_COPY.intro}</p>
          </div>
          <ul className="capability-list">
            {EQUIPMENT_COPY.lines.map((line) => (
              <li key={line.name}>
                <span className="capability-list__name">{line.name}</span>
                <span className="capability-list__desc">{line.description}</span>
              </li>
            ))}
          </ul>
        </div>

        <div id="projects" className="section__note">
          <h3>{PROJECTS_COPY.heading}</h3>
          <p>{PROJECTS_COPY.note}</p>
        </div>
      </div>
    </section>
  )
}
