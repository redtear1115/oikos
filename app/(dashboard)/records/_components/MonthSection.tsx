'use client'

import { monthLabel } from '@/lib/groupByMonth'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  monthKey: string
  count: number
  totalAmount: number      // expense total (existing)
  incomeTotal?: number     // NEW — only set when mixing income rows
}

export function MonthSection({ monthKey, count, totalAmount, incomeTotal }: Props) {
  const P = DEFAULT_INCOME_PALETTE
  const t = useTranslations()
  const hasIncome = incomeTotal !== undefined && incomeTotal > 0
  const net = hasIncome ? incomeTotal - totalAmount : null

  return (
    <div className="px-6 pt-4 pb-2 flex items-baseline justify-between">
      <span
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
      >
        {monthLabel(monthKey)}
      </span>
      {hasIncome ? (
        <div className="text-right tnum" style={{ color: 'var(--ink-3)' }}>
          <span className="text-micro">
            {t.monthSection.expense} NT${totalAmount.toLocaleString('en-US')}
            {' · '}
            <span style={{ color: P.ink }}>+{incomeTotal!.toLocaleString('en-US')}</span>
          </span>
          {net !== null && (
            <span
              className="text-micro ml-2 font-medium"
              style={{ color: net >= 0 ? P.ink : 'var(--ink-2)' }}
            >
              {t.monthSection.net} {net >= 0 ? '+' : ''}NT${net.toLocaleString('en-US')}
            </span>
          )}
        </div>
      ) : (
        <span className="tnum text-micro" style={{ color: 'var(--ink-3)' }}>
          {count}{t.balanceHero.countSuffix && ` ${t.balanceHero.countSuffix}`} · NT${totalAmount.toLocaleString('en-US')}
        </span>
      )}
    </div>
  )
}
