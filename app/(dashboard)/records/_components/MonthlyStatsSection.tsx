import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  dailyTrendByMonth,
  type CategoryStatRow,
  type AssetStatRow,
  type ResolvedTxnFilter,
} from '@/lib/db/queries/transactions'
import { monthlyIncomeStatsByCategory, type ResolvedIncomeFilter } from '@/lib/db/queries/incomes'
import type { EpochWindow } from '@/lib/db/queries/epoch'
import type { DateRange } from '@/lib/filter'
import { cookies } from 'next/headers'
import { MonthlyStatsView } from './MonthlyStatsView'
import type { BreakdownView } from './StatsBreakdownToggle'
import { statsCollapsedCookieName, parseBoolCookie } from '@/lib/uiPrefsCookie'

interface Props {
  userId: string
  groupId: string
  /** Pre-resolved by the page so stats scope to the same epoch (possibly
   *  cross-group, see #141) as the records feed alongside us. */
  epochWindow: EpochWindow
  monthKey: string
  view: BreakdownView
  /** True when the selected month is before the group was created — the card
   *  is forced into compact mode (no expand affordance, no breakdown toggle). */
  forceCompact?: boolean
  /**
   * Active date scope. When `kind === 'month'`, `monthKey` drives the query
   * (back-compat with the legacy single-month mode). When `kind === 'range'`
   * or `'all'`, the queries scope by the explicit window instead — the stats
   * card stays in lock step with the records feed (issue #50: "篩選後即時更新統計").
   */
  dateRange: DateRange
  /** Resolved structured filter for cash transactions (expense view). */
  filter?: ResolvedTxnFilter
  /** Resolved structured filter for income transactions (income view). */
  incomeFilter?: ResolvedIncomeFilter
  /**
   * Resolved 誰付 payer id from the URL (`?fPayer=mine|theirs` → viewer /
   * partner id; `null` = 全部). The daily trend honours only this dimension
   * so the 收支 overview tracks the same「我付的／他付的」lens as the feed (#747
   * follow-up); the donut keeps applying the full structured filter.
   */
  paidBy?: string | null
}

/**
 * Server data fetcher for the /records monthly stats section. Date scope and
 * filter come from the URL via the page; tab-aware rendering happens
 * client-side via TabContext, so we pre-fetch BOTH expense and income
 * breakdowns and let the view pick which to render.
 *
 * Effective view: when the user has selected one or more 愛物 in the filter,
 * the by-asset breakdown collapses to a single bar (or the same N bars they
 * picked) and stops being informative. We auto-switch to the by-category
 * breakdown so the breakdown still earns its space. The toggle UI mirrors
 * this — see StatsBreakdownToggle.
 */
export async function MonthlyStatsSection({
  userId,
  groupId,
  epochWindow,
  monthKey,
  view,
  forceCompact = false,
  dateRange,
  filter,
  incomeFilter,
  paidBy,
}: Props) {
  const dateRangeForQuery = dateRange.kind === 'month' ? null : dateRange
  const monthKeyForQuery = dateRange.kind === 'month' ? monthKey : undefined

  const assetFilterActive = (filter?.assetIds.length ?? 0) > 0
  const effectiveView: BreakdownView = assetFilterActive ? 'category' : view

  // Pre-typed promises preserve parallel fetch while letting each branch keep
  // its own row type (no union → no `as` at the boundary). The inactive view
  // gets an empty array of the right shape.
  const expensePromise: Promise<
    | { kind: 'category'; rows: CategoryStatRow[] }
    | { kind: 'asset'; rows: AssetStatRow[] }
  > = effectiveView === 'asset'
    ? monthlyStatsByAsset(groupId, monthKeyForQuery, dateRangeForQuery, filter, epochWindow)
        .then((rows) => ({ kind: 'asset' as const, rows }))
    : monthlyStatsByCategory(groupId, monthKeyForQuery, dateRangeForQuery, filter, epochWindow)
        .then((rows) => ({ kind: 'category' as const, rows }))

  // Daily trend always scopes to the navigated calendar month (the day axis is
  // inherently a single month). Only the 誰付 dimension narrows it — it stays
  // the 收支 month-overview, not the filtered breakdown the donut shows.
  // Fetched unconditionally; the view only renders it on the 收支 tab.
  const [expense, incomeRows, dailyTrend] = await Promise.all([
    expensePromise,
    monthlyIncomeStatsByCategory(groupId, monthKeyForQuery, dateRangeForQuery, incomeFilter, epochWindow),
    dailyTrendByMonth(groupId, monthKey, epochWindow, paidBy),
  ])
  const categoryRows: ReadonlyArray<CategoryStatRow> = expense.kind === 'category' ? expense.rows : []
  const assetRows: ReadonlyArray<AssetStatRow> = expense.kind === 'asset' ? expense.rows : []
  const expenseTotal = expense.rows.reduce((acc, r) => acc + r.total, 0)
  const incomeTotal = incomeRows.reduce((acc, r) => acc + r.total, 0)

  const cookieStore = await cookies()
  const initialCollapsed = parseBoolCookie(
    cookieStore.get(statsCollapsedCookieName(userId))?.value,
    false,
  )

  return (
    <MonthlyStatsView
      userId={userId}
      initialCollapsed={initialCollapsed}
      view={effectiveView}
      categoryRows={categoryRows}
      assetRows={assetRows}
      incomeRows={incomeRows}
      expenseTotal={expenseTotal}
      incomeTotal={incomeTotal}
      dailyTrend={dailyTrend}
      forceCompact={forceCompact}
      assetToggleHidden={assetFilterActive}
    />
  )
}
