import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
} from '@/lib/db/queries/transactions'
import { listIncomeMonthSummary } from '@/lib/db/queries/incomes'
import { MonthlyStatsView } from './MonthlyStatsView'
import type { BreakdownView } from './StatsBreakdownToggle'

interface Props {
  userId: string
  groupId: string
  monthKey: string
  /** Inclusive lower bound — usually the group's creation month. Caller clamps. */
  minMonthKey: string
  /** Inclusive upper bound — usually the current Taipei month. Caller clamps. */
  maxMonthKey: string
  view: BreakdownView
}

/**
 * Server data fetcher for the /records monthly stats section. All UI lives in
 * MonthlyStatsView (client) so the collapse state can drive layout without
 * round-tripping through the URL — it's per-device preference, not URL state.
 */
export async function MonthlyStatsSection({
  userId,
  groupId,
  monthKey,
  minMonthKey,
  maxMonthKey,
  view,
}: Props) {
  const [rows, incomeSummary] = await Promise.all([
    view === 'asset'
      ? monthlyStatsByAsset(groupId, monthKey)
      : monthlyStatsByCategory(groupId, monthKey),
    listIncomeMonthSummary(groupId, monthKey),
  ])
  const expenseTotal = rows.reduce((acc, r) => acc + r.total, 0)

  return (
    <MonthlyStatsView
      userId={userId}
      monthKey={monthKey}
      minMonthKey={minMonthKey}
      maxMonthKey={maxMonthKey}
      view={view}
      rows={rows}
      expenseTotal={expenseTotal}
      incomeTotal={incomeSummary.total}
    />
  )
}
