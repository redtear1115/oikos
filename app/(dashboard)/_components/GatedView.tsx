'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'

/**
 * #227 — In-place gate shown when the viewer's group has Guardian (Beta) off
 * but landed on a guardian surface via a stale URL/bookmark (`/assets?tab=guardian`
 * or an insurance asset detail page). Soft welcome + pointer to the Settings
 * toggle rather than a 404 or silent redirect.
 *
 * Pure visual block — caller wraps in page chrome (title, BottomNav).
 */
export function GatedView() {
  const t = useTranslations()
  const copy = t.assets.guardianGated

  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        aria-hidden="true"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* shield silhouette — Guardian motif, muted to read as "not yet active" */}
          <path
            d="M12 3.2 L4.5 6 V12.5 C4.5 16.6 7.7 19.8 12 21 C16.3 19.8 19.5 16.6 19.5 12.5 V6 Z"
            stroke="var(--ink-3)"
            strokeWidth="1.6"
            strokeLinejoin="round"
            opacity="0.7"
          />
          {/* three dots inside — under-construction / beta hint, replaces the
              usual checkmark on the insurance icon */}
          <circle cx="9" cy="13" r="1.1" fill="var(--ink-3)" />
          <circle cx="12" cy="13" r="1.1" fill="var(--ink-3)" />
          <circle cx="15" cy="13" r="1.1" fill="var(--ink-3)" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>
        {copy.title}
      </div>
      <div
        className="text-sm leading-relaxed mb-6"
        style={{ color: 'var(--ink-3)', maxWidth: 280 }}
      >
        {copy.body}
      </div>
      <Link
        href="/settings"
        className="inline-flex items-center justify-center px-6 py-3 rounded-xl"
        style={{
          background: 'var(--btn-primary-bg)',
          color: 'var(--btn-primary-text)',
          fontFamily: 'inherit',
          fontSize: 'var(--fs-button)',
          fontWeight: 500,
          letterSpacing: '0.2px',
          textDecoration: 'none',
        }}
      >
        {copy.cta}
      </Link>
    </div>
  )
}
