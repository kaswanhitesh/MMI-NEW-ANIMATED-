/**
 * SITE COPY DECK — every user-facing string on the site lives here so wording
 * can be edited without touching components. Keep it plain and factual.
 *
 * EDITORIAL RULES
 *  - Capability language only. Do NOT add statistics, fleet sizes, tonnages,
 *    client names, years of experience, project counts or certifications
 *    unless MMIPL has verified them in writing.
 *  - Equipment is described as a capability line, never as a specification.
 *  - Placeholder contact details are marked as such and must be replaced
 *    before launch (see CONTACT_COPY.email).
 */

export const COMPANY = {
  shortName: 'MMIPL',
  legalName: 'Mega Move India Private Limited',
  descriptor: 'Project logistics and heavy-haul transportation',
} as const

export const SKIP_LINK_LABEL = 'Skip to content'

/** Primary in-page navigation. Each href must match a section id rendered by src/site/sections. */
export const NAV_LINKS = [
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Equipment', href: '#equipment' },
  { label: 'Projects', href: '#projects' },
  { label: 'Contact', href: '#contact' },
] as const

export const SITE_HEADER_COPY = {
  navLabel: 'Primary',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
} as const

/** Opening copy over Scene 01 (top-left safe zone). Fades out as the puller enters. */
export const HERO_COPY = {
  eyebrow: 'Project logistics & heavy-haul transportation',
  headline: 'Heavy-haul transport, planned down to the axle.',
  subline:
    'Puller trucks and hydraulic axle trailers for over-dimensional and over-weight cargo. ' +
    'Route surveys, permits, escorts and engineering studies are completed before a single axle moves.',
} as const

/** Closing caption over Scene 01 (bottom-left safe zone). Fades in once the combination is coupled. */
export const SCENE_CAPTION = {
  title: 'One combination, matched to the load.',
  body:
    'A puller truck couples to a hydraulic axle trailer. Axle lines, deck height and gross weight are checked ' +
    'against the cargo and the route before the load is lifted.',
} as const

export const CAPABILITIES_COPY = {
  eyebrow: 'Capabilities',
  heading: 'From factory gate to foundation bolt.',
  intro:
    'MMIPL plans and executes the movement of project cargo: the equipment, the route and the paperwork handled as one job. ' +
    'Each scene on this page shows a stage of that work; scenes marked in development will be added as the site grows.',
  gridLabel: 'Scenes',
  statusLive: 'Live',
  statusPlanned: 'In development',
  viewScene: 'View scene',
} as const

/** Equipment as capability lines — deliberately no specifications, counts or model names. */
export const EQUIPMENT_COPY = {
  heading: 'Equipment',
  intro: 'Capability lines, not a fleet list. A configuration is proposed per movement once the cargo and the route are known.',
  lines: [
    {
      name: 'Puller trucks',
      description: 'Heavy-haul pullers for over-dimensional and over-weight cargo on road.',
    },
    {
      name: 'Hydraulic axle trailers',
      description: 'Modular hydraulic axle lines, configured per load for weight distribution and deck height.',
    },
    {
      name: 'Cranes',
      description: 'Mobile and crawler cranes for lifting, loading and placement at site.',
    },
    {
      name: 'Truck-mounted manlifts',
      description: 'Truck-mounted aerial work platforms for access and work at height on site.',
    },
  ],
} as const

export const PROJECTS_COPY = {
  heading: 'Projects',
  note: 'Project case studies will be published here. Until then, please ask about past movements by email.',
} as const

export const CONTACT_COPY = {
  eyebrow: 'Contact',
  heading: 'Talk to us about a movement.',
  body:
    'Send the cargo dimensions and weight, the origin and destination, and the window you are working to. ' +
    'We will come back with a planning approach and the questions we need answered.',
  checklistHeading: 'Useful in a first enquiry',
  checklist: [
    'Cargo dimensions (length, width, height) and gross weight',
    'Origin, destination and any port or rail interface',
    'Target dates and site access constraints',
    'Drawings or photographs of the cargo, if available',
  ],
  cta: 'Email MMIPL',
  /**
   * PLACEHOLDER — deliberately an example.com address so it cannot be mistaken
   * for a real mailbox. Replace with the company address before launch.
   */
  email: 'info@example.com',
  emailNote: 'Placeholder address: replace with the company mailbox before launch.',
} as const

export const FOOTER_COPY = {
  line: 'Project logistics and heavy-haul transportation across India.',
  navLabel: 'Footer',
  rights: 'All rights reserved.',
  backToTop: 'Back to top',
} as const

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Status pill wording. `label` is the model's manifest label, e.g. "Puller truck". */
export const BADGE_COPY = {
  loading: (label: string): string => `Loading ${lowerFirst(label)}…`,
  placeholder: (label: string): string => `${label}: temporary placeholder — final model pending`,
} as const
