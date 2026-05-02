'use client'

import { monthLabel } from '@/lib/groupByMonth'

interface Props {
  monthKey: string
  count: number
  totalAmount: number
}

export function MonthSection({ monthKey, count, totalAmount }: Props) {
  return (
    <div className="px-6 pt-4 pb-2 flex items-baseline justify-between">
      <span
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
      >
        {monthLabel(monthKey)}
      </span>
      <span className="tnum text-[11px]" style={{ color: 'var(--ink-3)' }}>
        {count} 筆 · NT${totalAmount.toLocaleString('en-US')}
      </span>
    </div>
  )
}
