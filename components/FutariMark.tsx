/**
 * Futari brand mark — the lantern (提燈).
 *
 * Canonical source. Before 2026-09-16 this shape lived as a hand-copied SVG
 * path in five places (`public/favicon.svg`, two `FutariMark.tsx`, and the two
 * `scripts/og/*.html` templates); the two components had already drifted apart.
 * Everything now renders from here, and the two `.svg` / `.html` copies are
 * generated rather than typed — see the brand-mark section of DESIGN.md.
 *
 * **Why a lantern and not the old two-tone heart.** The store / app icons have
 * been the lantern since 2026-06-08 (`b9b3da0`), but the web mark stayed on the
 * flat heart, so the same product showed two unrelated logos depending on where
 * you met it. Unified to the lantern 2026-09-16.
 *
 * **Why an outline and not a solid.** This one component renders from 16px
 * (favicon) to 420px (the migrate / use-case page mark) — a 26× range. A solid
 * silhouette survives 16px better but reads heavy at 420px, nothing like the
 * soft illustrated master. The outline keeps the large sizes light; the cost is
 * that 16px is softer than a solid would be. `app/favicon.ico` compensates by
 * rendering its 16px entry at a heavier stroke — same drawing, optical weight
 * correction, which is what per-size ICO entries are for.
 *
 * Failure mode to watch: nothing errors if someone re-introduces a local copy
 * of the path. It just quietly drifts again, exactly as the two components did.
 */
interface Props {
  size?: number
  className?: string
  /** Optional override; defaults to var(--ink). */
  inkColor?: string
  /** Optional override; defaults to var(--accent). */
  accentColor?: string
}

export function FutariMark({ size = 32, className, inkColor, accentColor }: Props) {
  const ink = inkColor ?? 'var(--ink)'
  const accent = accentColor ?? 'var(--accent)'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(16 16.4)">
        <path d="M -3.5 -8.4 A 3.5 3.5 0 0 1 3.5 -8.4" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        <rect x="-5.676" y="-8.5" width="11.352" height="2.75" rx="1.21" fill={ink} />
        <path d="M -6.6 -6.4 L 6.6 -6.4 L 5.7 6.4 L -5.7 6.4 Z" fill="none" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
        <rect x="-7.128" y="6.07" width="14.256" height="2.97" rx="1.21" fill={ink} />
        <path d="M 0 -4.62 C 1.995 -2.415, 2.625 -0.63, 2.625 0.945 C 2.625 2.94, 1.418 4.2, 0 4.2 C -1.418 4.2, -2.625 2.94, -2.625 0.945 C -2.625 -0.63, -1.995 -2.415, 0 -4.62 Z" fill={accent} />
      </g>
    </svg>
  )
}
