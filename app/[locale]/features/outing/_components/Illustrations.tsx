import { f } from './feature-outing-css'

/**
 * Small decorative line drawings (inline SVG, aria-hidden). Colours come from
 * feature-outing-css.ts, which uses existing tokens only.
 */

/** Hero motif: four points joined by one thread; one of them is the lamp. */
export function HeroMotif() {
  return (
    <svg className={f.motif} viewBox="0 0 200 48" aria-hidden="true">
      <path d="M20 30 C 50 6, 80 6, 100 24 S 150 42, 180 18" />
      <circle cx="20" cy="30" r="6" />
      <circle cx="73" cy="14" r="6" />
      <circle cx="127" cy="33" r="6" />
      <circle cx="180" cy="18" r="6" />
      <circle className={f.mHot} cx="100" cy="24" r="4" />
    </svg>
  )
}

const svgProps = { className: f.art, viewBox: '0 0 48 48', 'aria-hidden': true } as const

/** Camping: a tent and three turns at paying. */
export function CampingArt() {
  return (
    <svg {...svgProps}>
      <path d="M6 38 L22 12 L38 38 Z" />
      <path d="M22 38 L22 26" />
      <path d="M4 38 H44" />
      <circle className={f.aHot} cx="36" cy="10" r="2.5" />
      <circle cx="42" cy="10" r="2.5" />
    </svg>
  )
}

/** Birthday dinner: a cake, and a dashed seat for the one who does not pay. */
export function BirthdayArt() {
  return (
    <svg {...svgProps}>
      <rect x="8" y="24" width="24" height="14" rx="3" />
      <path d="M20 24 V17" />
      <circle className={f.aHot} cx="20" cy="13" r="2.5" />
      <circle className={f.aDash} cx="39" cy="31" r="5" />
    </svg>
  )
}

/** Two couples: four points, joined in pairs. */
export function CouplesArt() {
  return (
    <svg {...svgProps}>
      <circle cx="9" cy="24" r="4.5" />
      <circle cx="21" cy="24" r="4.5" />
      <circle cx="29" cy="24" r="4.5" />
      <circle cx="41" cy="24" r="4.5" />
      <path d="M13.5 24 H16.5" />
      <path d="M33.5 24 H36.5" />
      <path className={f.aDash} d="M12 33 C 18 42, 32 42, 38 33" />
    </svg>
  )
}

/** A friend joining halfway: a dashed seat and an arrow towards the group. */
export function LatecomerArt() {
  return (
    <svg {...svgProps}>
      <circle cx="10" cy="24" r="4.5" />
      <circle cx="22" cy="24" r="4.5" />
      <circle className={f.aDash} cx="38" cy="24" r="4.5" />
      <path d="M31 24 H28" />
      <circle className={f.aHot} cx="22" cy="24" r="2" />
    </svg>
  )
}
