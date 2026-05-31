'use client'

import { monthLabel } from '@/lib/groupByMonth'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatAmount } from '@/lib/currency'

interface Props {
  monthKey: string
  count: number
  /** Sum to show next to the count. Caller decides which kind to sum
   *  (income on income tab, transaction-only on expense / all tabs) so this
   *  component stays a dumb "label · count · amount" row. */
  totalAmount: number
}

/**
 * Per-month list header inside the records feed. Format is unified across all
 * three tabs (全部 / 支出 / 收入) — the verbose breakdown lives in the stats
 * card above; this row only restates "how many entries / how much" for the
 * group below it.
 */
export function MonthSection({ monthKey, count, totalAmount }: Props) {
  const t = useTranslations()
  const locale = useLocale()
  return (
    <div className="px-6 pt-4 pb-2 flex items-baseline justify-between">
      <span
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
      >
        {monthLabel(monthKey, locale)}
      </span>
      <span className="tnum text-xs" style={{ color: 'var(--ink-3)' }}>
        {count}{t.balanceHero.countSuffix && ` ${t.balanceHero.countSuffix}`} · {formatAmount(totalAmount, 'twd')}
      </span>
    </div>
  )
}
