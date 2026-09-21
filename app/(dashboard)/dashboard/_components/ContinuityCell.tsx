import Link from 'next/link'

/**
 * One cell of the dashboard ContinuityRow (#1364): the whole cell is a single
 * link, ≥44px tall. Sans title (no serif — this is a list-weight entry, not a
 * moment), one truncated line of status, a chevron. Visually quieter than the
 * hero on purpose: no Ember, no amount.
 */
export function ContinuityCell({ href, title, subtitle, ariaLabel }: {
  href: string
  title: string
  subtitle: string
  ariaLabel: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="flex-1 min-w-0 min-h-11 flex items-center gap-2 px-3.5 py-3 rounded-card bg-surface border border-hairline no-underline text-ink"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs mt-0.5 truncate text-ink-3">{subtitle}</div>
      </div>
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
        <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}
