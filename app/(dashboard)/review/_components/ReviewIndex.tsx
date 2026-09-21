'use client'

import Link from 'next/link'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { monthLabel } from '@/lib/groupByMonth'

/**
 * /review list (#1364). One row per month that has a review ('YYYY-MM',
 * newest first). Before the first review it says when one will appear — a
 * plain statement of how the feature works, not a nudge: there is nothing the
 * user is missing or behind on.
 */
export function ReviewIndex({ monthKeys }: { monthKeys: string[] }) {
  const t = useTranslations()
  const locale = useLocale()
  const ti = t.monthlyReview.index

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <SubpageHeader title={ti.title} backLabel={t.common.back} titleAs="h1" />

      {monthKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
          <div className="text-base font-medium mb-2 text-ink">{ti.emptyHeading}</div>
          <div className="text-sm leading-relaxed max-w-65 text-ink-3">{ti.emptyBody}</div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <ul className="rounded-card overflow-hidden bg-surface border border-hairline list-none m-0 p-0">
            {monthKeys.map((key, i) => (
              <li key={key} className={i === monthKeys.length - 1 ? '' : 'border-b border-b-hairline'}>
                <Link
                  href={`/review/${key}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-3.5 min-h-11 no-underline text-ink"
                >
                  <span className="text-sm font-medium truncate">{monthLabel(key, locale)}</span>
                  <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
                    <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
