'use client'

import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatYearMonth } from '@/lib/monthlyReview'
import type { ReviewCellState } from '@/lib/reviewCell'
import { ContinuityCell } from './ContinuityCell'
import { TripEntryCell } from './TripEntryCell'

export type { ReviewCellState }

/**
 * Always-there ways into 月回顧 and 旅行, under the hero (#1364).
 *
 * Moments (MonthlyReviewBanner, ActiveTripBanner) come and go; this row does
 * not. Dismissing the review banner therefore never loses the way back in.
 * With an active trip the 旅行 cell is left out (option α): ActiveTripBanner
 * already carries the trip, and 月回顧 takes the full width.
 */
export function ContinuityRow({ review, hasActiveTrip }: { review: ReviewCellState; hasActiveTrip: boolean }) {
  const t = useTranslations()
  const locale = useLocale()
  const c = t.dashboard.continuity

  let href = '/review'
  let subtitle = review.kind === 'empty' ? c.reviewEmpty : c.reviewReturn
  let ariaLabel = c.reviewAriaIndex
  if (review.kind === 'latest') {
    // Intl names the month so each locale gets its own form ('8月' / 'August').
    const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
      .format(new Date(review.month.year, review.month.month - 1, 1))
    href = `/review/${formatYearMonth(review.month)}`
    subtitle = c.reviewLatest.replace('{month}', monthName)
    ariaLabel = c.reviewAriaLatest.replace('{month}', monthName)
  }

  return (
    <div className="px-4 pt-2 flex gap-2">
      <ContinuityCell href={href} title={c.reviewTitle} subtitle={subtitle} ariaLabel={ariaLabel} />
      {!hasActiveTrip && <TripEntryCell />}
    </div>
  )
}
