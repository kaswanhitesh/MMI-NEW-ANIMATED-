/**
 * Static "Contact" section: a short call to action, a mailto button and a
 * list of what helps in a first enquiry. The e-mail address is a clearly
 * marked PLACEHOLDER (example.com) and must be replaced before launch — see
 * CONTACT_COPY in src/site/content/copy.ts. No phone numbers or addresses are
 * invented here.
 */
import { CONTACT_COPY } from '../content/copy'

export function ContactSection() {
  return (
    <section id="contact" className="section section--contact" aria-labelledby="contact-title">
      <div className="section__inner contact">
        <div className="contact__lead">
          <p className="eyebrow">{CONTACT_COPY.eyebrow}</p>
          <h2 id="contact-title">{CONTACT_COPY.heading}</h2>
          <p className="section__intro">{CONTACT_COPY.body}</p>
          <p className="contact__actions">
            <a className="button" href={`mailto:${CONTACT_COPY.email}`}>
              {CONTACT_COPY.cta}
            </a>
          </p>
          {/* PLACEHOLDER notice — remove together with the example.com address once the real mailbox is wired up. */}
          <p className="contact__note">{CONTACT_COPY.emailNote}</p>
        </div>

        <aside className="contact__aside" aria-labelledby="contact-checklist-title">
          <h3 id="contact-checklist-title">{CONTACT_COPY.checklistHeading}</h3>
          <ol className="contact__checklist">
            {CONTACT_COPY.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  )
}
