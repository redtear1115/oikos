import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
} from '@/lib/db/queries/transactions'
import { monthlyIncomeStatsByCategory } from '@/lib/db/queries/incomes'
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
}

/**
 * Server data fetcher for the /records monthly stats section. Month scope is
 * page-level — the switcher / scope decision happens above us. Tab-aware
 * rendering happens client-side via TabContext, so we pre-fetch BOTH expense
 * and income breakdowns and let the view pick which to render.
 */
export async function MonthlyStatsSection({
  userId,
  groupId,
  monthKey,
  view,
  forceCompact = false,
}: Props) {
  const [rows, incomeRows] = await Promise.all([
    view === 'asset'
      ? monthlyStatsByAsset(groupId, monthKey)
      : monthlyStatsByCategory(groupId, monthKey),
    monthlyIncomeStatsByCategory(groupId, monthKey),
  ])
  const expenseTotal = rows.reduce((acc, r) => acc + r.total, 0)
  const incomeTotal = incomeRows.reduce((acc, r) => acc + r.total, 0)

  return (
    <MonthlyStatsView
      userId={userId}
      view={view}
      rows={rows}
      incomeRows={incomeRows}
      expenseTotal={expenseTotal}
      incomeTotal={incomeTotal}
      forceCompact={forceCompact}
    />
  )
}
