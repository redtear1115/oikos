'use client'

import { monthLabel } from '@/lib/groupByMonth'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatAmount } from '@/lib/currency'

interface Props {
  monthKey: string
  count: number
  /**
   * Legacy rendering: a single unlabeled sum. Caller decides which kind to
   * sum (income on income tab, transaction-only on expense / all tabs) so
   * this component stays a dumb "label · count · amount" row. Used only when
   * `summary` is absent — the caller has no server-aggregated totals for
   * this month (dashboard / asset-detail / insurance SavingsView, or a
   * records-feed month a realtime row just landed in ahead of the
   * debounced server refetch).
   */
  totalAmount?: number
  /**
   * Server-aggregated summary for this Asia/Taipei month (#1208), mirroring
   * the tab's pager query exactly — unlike `totalAmount`, this doesn't
   * change as more pages load. `mode` picks which segment(s) to render;
   * `count` above is expected to be the server's row count (incl.
   * settlements) rather than however many rows have loaded so far.
   */
  summary?: {
    mode: 'all' | 'expense' | 'income'
    expenseTotal: number
    incomeTotal: number
  }
}

/**
 * Per-month list header inside the records feed. Two renderings:
 *
 * - Legacy (`totalAmount`): a single unlabeled sum, unified across all three
 *   tabs — the verbose breakdown lives in the stats card above; this row
 *   only restates "how many entries / how much" for the group below it.
 * - Server-aggregated (`summary`, #1208): a labeled 支出/收入 breakdown so
 *   the number reads correctly on its own (no longer just "whatever loaded
 *   so far"). 支出 tab shows only 支出, 收入 tab shows only 收入, 全部 shows
 *   both — omitting a zero segment, except when both are zero, in which
 *   case the 支出 segment stays as the anchor.
 */
export function MonthSection({ monthKey, count, totalAmount, summary }: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const amountLabel = summary
    ? summaryLabel(summary, t)
    : formatAmount(totalAmount ?? 0, 'twd')

  return (
    <div className="px-6 pt-4 pb-2 flex items-baseline justify-between gap-2">
      <span
        className="text-base font-medium tracking-tight shrink-0"
        style={{ color: 'var(--ink)' }}
      >
        {monthLabel(monthKey, locale)}
      </span>
      <span className="tnum text-xs text-right min-w-0" style={{ color: 'var(--ink-3)' }}>
        {count}{t.balanceHero.countSuffix && ` ${t.balanceHero.countSuffix}`} · {amountLabel}
      </span>
    </div>
  )
}

function summaryLabel(
  summary: { mode: 'all' | 'expense' | 'income'; expenseTotal: number; incomeTotal: number },
  t: ReturnType<typeof useTranslations>,
): string {
  const { mode, expenseTotal, incomeTotal } = summary
  const expenseStr = t.records.stats.summaryExpense.replace('{amount}', formatAmount(expenseTotal, 'twd'))
  const incomeStr = t.records.stats.summaryIncome.replace('{amount}', formatAmount(incomeTotal, 'twd'))
  if (mode === 'expense') return expenseStr
  if (mode === 'income') return incomeStr
  // mode === 'all' — omit whichever segment is zero; if both are zero, 支出
  // stays as the anchor rather than rendering an empty string.
  if (incomeTotal === 0) return expenseStr
  if (expenseTotal === 0) return incomeStr
  return `${expenseStr} · ${incomeStr}`
}
