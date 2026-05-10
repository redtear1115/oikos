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
  view: BreakdownView
  /** True when the selected month is before the group was created — the card
   *  is forced into compact mode (no expand affordance, no breakdown toggle). */
  forceCompact?: boolean
}

/**
 * Server data fetcher for the /records monthly stats section. Month scope is
 * page-level — the switcher / scope decision happens above us.
 */
export async function MonthlyStatsSection({
  userId,
  groupId,
  monthKey,
  view,
  forceCompact = false,
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
      view={view}
      rows={rows}
      expenseTotal={expenseTotal}
      incomeTotal={incomeSummary.total}
      forceCompact={forceCompact}
    />
  )
}
