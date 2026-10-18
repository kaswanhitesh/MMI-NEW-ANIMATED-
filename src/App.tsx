/**
 * Page composition: skip link, fixed header, the main column (cinematic scene
 * sections followed by the static capabilities and contact sections) and the
 * footer. Scene sections come from the registry via SceneHost; everything
 * else is plain, server-friendly markup styled from src/styles.
 */
import { SKIP_LINK_LABEL } from './site/content/copy'
import { SiteFooter } from './site/layout/SiteFooter'
import { SiteHeader } from './site/layout/SiteHeader'
import { CapabilitiesSection } from './site/sections/CapabilitiesSection'
import { ContactSection } from './site/sections/ContactSection'
import { SceneHost } from './site/sections/SceneHost'

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        {SKIP_LINK_LABEL}
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <SceneHost />
        <CapabilitiesSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </>
  )
}
