import { s } from './brand-inner'

/**
 * Migrate pages' lamp structure (#1524): a thin trail of light, echoing the
 * light trails in the hero illustration. Static, decorative.
 */
export function LightRibbon() {
  return (
    <svg
      className={s.ribbon}
      viewBox="0 0 1000 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ribbon-trail" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className={s.ribbonA} />
          <stop offset="0.55" className={s.ribbonB} />
          <stop offset="1" className={s.ribbonA} />
        </linearGradient>
        <linearGradient id="ribbon-trail-2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className={s.ribbonA} />
          <stop offset="0.4" className={s.ribbonSage} />
          <stop offset="1" className={s.ribbonA} />
        </linearGradient>
      </defs>
      <path
        d="M0 18 C 180 8, 380 36, 600 24 S 880 6, 1000 26"
        fill="none"
        stroke="url(#ribbon-trail-2)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0 30 C 220 34, 360 6, 560 14 S 860 30, 1000 8"
        fill="none"
        stroke="url(#ribbon-trail)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
