import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  type ResolvedTxnFilter,
} from '@/lib/db/queries/transactions'
import { monthlyIncomeStatsByCategory, type ResolvedIncomeFilter } from '@/lib/db/queries/incomes'
import { resolveViewerEpochWindow } from '@/lib/db/queries/epoch'
import type { DateRange } from '@/lib/filter'
import { MonthlyStatsView } from './MonthlyStatsView'
import type { BreakdownView } from './StatsBreakdownToggle'

interface Props {
  userId: string
  groupId: string
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
  monthKey,
  view,
  forceCompact = false,
  dateRange,
  filter,
  incomeFilter,
}: Props) {
  const dateRangeForQuery = dateRange.kind === 'month' ? null : dateRange
  const monthKeyForQuery = dateRange.kind === 'month' ? monthKey : undefined

  const assetFilterActive = (filter?.assetIds.length ?? 0) > 0
  const effectiveView: BreakdownView = assetFilterActive ? 'category' : view

  const epochWindow = await resolveViewerEpochWindow(groupId)
  const [rows, incomeRows] = await Promise.all([
    effectiveView === 'asset'
      ? monthlyStatsByAsset(groupId, monthKeyForQuery, dateRangeForQuery, filter, epochWindow)
      : monthlyStatsByCategory(groupId, monthKeyForQuery, dateRangeForQuery, filter, epochWindow),
    monthlyIncomeStatsByCategory(groupId, monthKeyForQuery, dateRangeForQuery, incomeFilter, epochWindow),
  ])
  const expenseTotal = rows.reduce((acc, r) => acc + r.total, 0)
  const incomeTotal = incomeRows.reduce((acc, r) => acc + r.total, 0)

  return (
    <MonthlyStatsView
      userId={userId}
      view={effectiveView}
      rows={rows}
      incomeRows={incomeRows}
      expenseTotal={expenseTotal}
      incomeTotal={incomeTotal}
      forceCompact={forceCompact}
      assetToggleHidden={assetFilterActive}
    />
  )
}
