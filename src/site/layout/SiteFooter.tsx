/**
 * Minimal site footer: wordmark, one descriptive line, the same in-page links
 * as the header plus "Back to top", and a copyright line whose year is read
 * from the clock when the footer first renders, so it never goes stale across
 * deployments.
 */
import { useState } from 'react'
import { COMPANY, FOOTER_COPY, NAV_LINKS } from '../content/copy'

export function SiteFooter() {
  // Lazy initialiser: the clock is read once per mount rather than on every render.
  const [year] = useState(() => new Date().getFullYear())

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-footer__wordmark">{COMPANY.shortName}</span>
          <p className="site-footer__line">{FOOTER_COPY.line}</p>
        </div>

        <nav className="site-footer__nav" aria-label={FOOTER_COPY.navLabel}>
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <a href="#top">{FOOTER_COPY.backToTop}</a>
            </li>
          </ul>
        </nav>

        <p className="site-footer__legal">
          © {year} {COMPANY.legalName}. {FOOTER_COPY.rights}
        </p>
      </div>
    </footer>
  )
}
