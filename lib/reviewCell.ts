import type { YearMonth } from '@/lib/monthlyReview'

/**
 * The dashboard 月回顧 cell's state (#1364 wireframe A / B / C).
 *   latest — last month's review exists and this member hasn't dismissed its
 *            banner (A) → straight to that month
 *   return — reviews exist and the newest has been seen or dismissed (B) → /review
 *   empty  — no review yet (C) → /review, which says when one will appear
 */
export type ReviewCellState =
  | { kind: 'latest'; month: YearMonth }
  | { kind: 'return' }
  | { kind: 'empty' }

/**
 * Same dismiss flag MonthlyReviewBanner uses, so banner and cell always agree
 * on whether last month's review is still "new" for this member.
 */
export function deriveReviewCell(input: {
  previousMonth: YearMonth
  previousSnapshot: { bannerDismissedByMemberAAt: Date | null; bannerDismissedByMemberBAt: Date | null } | null
  viewerIsA: boolean
  hasAnyReview: boolean
}): ReviewCellState {
  const s = input.previousSnapshot
  if (s) {
    const dismissedAt = input.viewerIsA ? s.bannerDismissedByMemberAAt : s.bannerDismissedByMemberBAt
    if (!dismissedAt) return { kind: 'latest', month: input.previousMonth }
    return { kind: 'return' }
  }
  return input.hasAnyReview ? { kind: 'return' } : { kind: 'empty' }
}
