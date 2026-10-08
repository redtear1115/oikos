'use client'

import { useTranslations } from '@/lib/i18n/client'
import type { ClientReviewSnapshot } from '@/lib/db/queries/monthlyReview'
import { useBaseCurrency } from '@/app/(dashboard)/_components/MemberContext'
import { CardShell, formatNT, formatRecapAmount } from './CardShell'

export function CardRecurring({ snapshot }: { snapshot: ClientReviewSnapshot }) {
  const t = useTranslations()
  const baseCurrency = useBaseCurrency()
  const tr = t.monthlyReview
  const events = snapshot.recurringEvents

  // Off-palette color with no token; tracked in #1179, kept as-is to avoid a visual change.
  const tint = '#E2E0F0'

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
                    className="inline-block text-xs font-medium px-1.5 py-0.5 rounded"
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
            className="mt-3 pt-3 text-sm space-y-1"
            style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--hairline)' }}
          >
            {snapshot.recurringTotalIncome > 0 && (
              <div>
                {tr.card3IncomeTotal.replace('{amount}', formatRecapAmount(snapshot.recurringTotalIncome, baseCurrency))}
              </div>
            )}
            {snapshot.recurringTotalExpense > 0 && (
              <div>
                {tr.card3ExpenseTotal.replace('{amount}', formatRecapAmount(snapshot.recurringTotalExpense, baseCurrency))}
              </div>
            )}
          </div>
        </>
      )}
    </CardShell>
  )
}
