/**
 * Fixed, translucent site header: wordmark, company name, primary in-page
 * navigation and a mobile menu toggle. Its height is the CSS custom property
 * `--header-h` (declared in src/styles/tokens.css, never set from JavaScript)
 * so the scene overlay and anchor offsets can clear it without measuring.
 *
 * The breakpoint below must stay in step with the `max-width: 720px` rule in
 * src/styles/layout.css that swaps the inline navigation for the toggle menu.
 */
import { useEffect, useState } from 'react'
import { COMPANY, NAV_LINKS, SITE_HEADER_COPY } from '../content/copy'

/** Viewports at least this wide show the inline navigation; an open mobile menu closes itself when crossing into them. */
const INLINE_NAV_QUERY = '(min-width: 721px)'

/** Static id: the header is a singleton and the id is referenced by `aria-controls`. */
const NAV_ID = 'site-nav'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Growing past the breakpoint (rotation, window resize) must not leave the menu state stuck open.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(INLINE_NAV_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const close = () => setOpen(false)

  return (
    <header className={open ? 'site-header is-open' : 'site-header'}>
      <div className="site-header__inner">
        <a className="site-header__brand" href="#top" onClick={close}>
          <span className="site-header__wordmark">{COMPANY.shortName}</span>
          <span className="site-header__name">{COMPANY.legalName}</span>
        </a>

        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={open}
          aria-controls={NAV_ID}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="site-header__toggle-icon" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="visually-hidden">{open ? SITE_HEADER_COPY.closeMenu : SITE_HEADER_COPY.openMenu}</span>
        </button>

        <nav id={NAV_ID} className="site-nav" aria-label={SITE_HEADER_COPY.navLabel}>
          <ul className="site-nav__list">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a className="site-nav__link" href={link.href} onClick={close}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
