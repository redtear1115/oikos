'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { useState, useTransition } from 'react'
import { dismissMonthlyReviewBanner } from '@/actions/monthlyReview'
import { formatYearMonth, type YearMonth } from '@/lib/monthlyReview'

export interface MonthlyReviewBannerProps {
  /** The reviewed month (past). Used for navigation + dismiss key. */
  reviewedMonth: YearMonth
  /** The current month (label only — banner copy says "you wrote in {month}"). */
  currentMonth: number
  /** Quote of an existing message addressed to the current month, if any. */
  quote: string | null
  isSolo: boolean
}

export function MonthlyReviewBanner({
  reviewedMonth,
  currentMonth,
  quote,
  isSolo,
}: MonthlyReviewBannerProps) {
  const router = useRouter()
  const t = useTranslations()
  const tr = t.monthlyReview
  const [hidden, setHidden] = useState(false)
  const [, startTransition] = useTransition()

  if (hidden) return null

  function dismiss() {
    setHidden(true)
    startTransition(() => {
      void dismissMonthlyReviewBanner({
        year: reviewedMonth.year,
        month: reviewedMonth.month,
      }).catch(() => {
        // Worst case: banner reappears on next refresh. No need to surface.
      })
    })
  }

  function open() {
    dismiss()
    router.push(`/review/${formatYearMonth(reviewedMonth)}`)
  }

  const headingTpl = quote
    ? (isSolo ? tr.bannerHeadingSolo : tr.bannerHeading)
    : (isSolo ? tr.bannerHeadingSoloNoMessage : tr.bannerHeadingNoMessage)
  const heading = headingTpl.replace('{month}', String(currentMonth))

  const ctaTpl = isSolo ? tr.bannerCtaSolo : tr.bannerCta
  const cta = ctaTpl.replace('{month}', String(reviewedMonth.month))

  return (
    <div className="px-4 pt-2">
      <div
        className="relative rounded-card px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(247, 216, 221, 0.4) 100%)',
          border: '1px solid var(--hairline)',
        }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label={tr.closeAriaLabel}
          className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center bg-transparent border-0 cursor-pointer rounded-full"
          style={{ color: 'var(--ink-3)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={open}
          className="block w-full text-left bg-transparent border-0 cursor-pointer p-0"
        >
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {heading}
          </div>
          {quote && (
            <div
              className="mt-1.5 text-sm leading-relaxed line-clamp-2"
              style={{
                color: 'var(--ink)',
                fontFamily: 'var(--font-fraunces)',
              }}
            >
              「{quote}」
            </div>
          )}
          <div
            className="mt-3 text-sm font-medium"
            style={{ color: 'var(--ink-2)' }}
          >
            {cta}
          </div>
        </button>
      </div>
    </div>
  )
}
