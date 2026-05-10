'use client'

import { useTranslations } from '@/lib/i18n/client'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'
import { CardShell, formatNT } from './CardShell'

export function CardRecurring({ snapshot }: { snapshot: MonthlyReviewSnapshotRow }) {
  const t = useTranslations()
  const tr = t.monthlyReview
  const events = snapshot.recurringEvents

  const tint = 'var(--surface-2, #E2E0F0)'

  return (
    <CardShell title={tr.card3Title} tint={tint}>
      {events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {tr.emptyRecurring}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-1 divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {events.map((ev, i) => (
              <li
                key={`${ev.name}-${ev.occurredAt}-${i}`}
                className="py-2 flex items-center justify-between gap-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      background: ev.direction === 'income' ? '#D7E5DC' : '#F7D8DD',
                      color: ev.direction === 'income' ? '#3F6A56' : '#8A3F50',
                    }}
                  >
                    {ev.direction === 'income' ? tr.incomeLabel : tr.expenseLabel}
                  </span>
                  <span
                    className="text-sm truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {ev.name || '—'}
                  </span>
                </div>
                <div
                  className="text-sm tabular-nums shrink-0"
                  style={{ color: ev.direction === 'income' ? 'var(--ink)' : 'var(--ink-2)' }}
                >
                  {ev.direction === 'income' ? '+' : '−'}
                  {formatNT(ev.amount)}
                </div>
              </li>
            ))}
          </ul>
          <div
            className="mt-3 pt-3 text-xs space-y-1"
            style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--hairline)' }}
          >
            {snapshot.recurringTotalIncome > 0 && (
              <div>
                {tr.card3IncomeTotal.replace('{amount}', formatNT(snapshot.recurringTotalIncome))}
              </div>
            )}
            {snapshot.recurringTotalExpense > 0 && (
              <div>
                {tr.card3ExpenseTotal.replace('{amount}', formatNT(snapshot.recurringTotalExpense))}
              </div>
            )}
          </div>
        </>
      )}
    </CardShell>
  )
}
