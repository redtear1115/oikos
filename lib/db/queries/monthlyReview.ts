import { db } from '@/lib/db/client'
import { monthlyReviewMessages, monthlyReviewSnapshots } from '@/lib/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import { isMonthInChapter } from '@/lib/monthlyReview'

export interface RecurringEvent {
  name: string
  amount: number
  direction: 'income' | 'expense'
  occurredAt: string
}

export interface AssetBreakdownRow {
  assetName: string
  total: number
}

export interface MonthlyReviewSnapshotRow {
  id: string
  groupId: string
  year: number
  month: number
  computedAt: Date
  topCategory: string | null
  topCategoryTotal: number | null
  largestExpenseAmount: number | null
  largestExpenseDescription: string | null
  largestExpenseCategory: string | null
  largestExpensePaidByName: string | null
  recurringEvents: RecurringEvent[]
  recurringTotalIncome: number
  recurringTotalExpense: number
  assetBreakdown: AssetBreakdownRow[]
  bannerDismissedByMemberAAt: Date | null
  bannerDismissedByMemberBAt: Date | null
}

export interface MonthlyReviewMessageRow {
  id: string
  memberId: string
  year: number
  month: number
  body: string
  createdAt: Date
  updatedAt: Date
  lockedAt: Date | null
}

function rehydrate(row: typeof monthlyReviewSnapshots.$inferSelect): MonthlyReviewSnapshotRow {
  // jsonb columns come back already-parsed; defaults guard against NULL on
  // very-early snapshots where the cron fired before any data existed.
  const events = (row.recurringEvents as RecurringEvent[] | null) ?? []
  const assets = (row.assetBreakdown as AssetBreakdownRow[] | null) ?? []
  return {
    id: row.id,
    groupId: row.groupId,
    year: row.year,
    month: row.month,
    computedAt: row.computedAt,
    topCategory: row.topCategory,
    topCategoryTotal: row.topCategoryTotal,
    largestExpenseAmount: row.largestExpenseAmount,
    largestExpenseDescription: row.largestExpenseDescription,
    largestExpenseCategory: row.largestExpenseCategory,
    largestExpensePaidByName: row.largestExpensePaidByName,
    recurringEvents: events,
    recurringTotalIncome: row.recurringTotalIncome ?? 0,
    recurringTotalExpense: row.recurringTotalExpense ?? 0,
    assetBreakdown: assets,
    bannerDismissedByMemberAAt: row.bannerDismissedByMemberAAt,
    bannerDismissedByMemberBAt: row.bannerDismissedByMemberBAt,
  }
}

export async function loadMonthlyReviewSnapshot(
  groupId: string,
  year: number,
  month: number,
): Promise<MonthlyReviewSnapshotRow | null> {
  const [row] = await db
    .select()
    .from(monthlyReviewSnapshots)
    .where(and(
      eq(monthlyReviewSnapshots.groupId, groupId),
      eq(monthlyReviewSnapshots.year, year),
      eq(monthlyReviewSnapshots.month, month),
    ))
    .limit(1)
  return row ? rehydrate(row) : null
}

export async function loadMonthlyReviewMessages(
  groupId: string,
  year: number,
  month: number,
): Promise<MonthlyReviewMessageRow[]> {
  return db
    .select({
      id: monthlyReviewMessages.id,
      memberId: monthlyReviewMessages.memberId,
      year: monthlyReviewMessages.year,
      month: monthlyReviewMessages.month,
      body: monthlyReviewMessages.body,
      createdAt: monthlyReviewMessages.createdAt,
      updatedAt: monthlyReviewMessages.updatedAt,
      lockedAt: monthlyReviewMessages.lockedAt,
    })
    .from(monthlyReviewMessages)
    .where(and(
      eq(monthlyReviewMessages.groupId, groupId),
      eq(monthlyReviewMessages.year, year),
      eq(monthlyReviewMessages.month, month),
    ))
    .orderBy(asc(monthlyReviewMessages.createdAt))
}

/**
 * Months with a review that belong to `chapter`, newest first (#1364, #1380).
 * Feeds the /review index and the dashboard 月回顧 cell. Reviews follow the
 * chapter, not the group — see isMonthInChapter for the rule, including why a
 * month straddling a chapter boundary belongs to neither side.
 */
export async function listMonthlyReviewMonths(
  groupId: string,
  chapter: { startedAt: Date; endedAt: Date | null },
): Promise<{ year: number; month: number }[]> {
  const rows = await db
    .select({ year: monthlyReviewSnapshots.year, month: monthlyReviewSnapshots.month })
    .from(monthlyReviewSnapshots)
    .where(eq(monthlyReviewSnapshots.groupId, groupId))
    .orderBy(desc(monthlyReviewSnapshots.year), desc(monthlyReviewSnapshots.month))
  return rows.filter((ym) => isMonthInChapter(ym, chapter))
}
