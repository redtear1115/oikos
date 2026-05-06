'use client'

import { monthLabel } from '@/lib/groupByMonth'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'

interface Props {
  monthKey: string
  count: number
  totalAmount: number      // expense total (existing)
  incomeTotal?: number     // NEW — only set when mixing income rows
}

export function MonthSection({ monthKey, count, totalAmount, incomeTotal }: Props) {
  const P = DEFAULT_INCOME_PALETTE
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
          <span className="text-[11px]">
            支出 NT${totalAmount.toLocaleString('en-US')}
            {' · '}
            <span style={{ color: P.ink }}>+{incomeTotal!.toLocaleString('en-US')}</span>
          </span>
          {net !== null && (
            <span
              className="text-[11px] ml-2 font-medium"
              style={{ color: net >= 0 ? P.ink : 'var(--ink-2)' }}
            >
              淨 {net >= 0 ? '+' : ''}NT${net.toLocaleString('en-US')}
            </span>
          )}
        </div>
      ) : (
        <span className="tnum text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {count} 筆 · NT${totalAmount.toLocaleString('en-US')}
        </span>
      )}
    </div>
  )
}
