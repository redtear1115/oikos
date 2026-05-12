'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'

/**
 * Inline section card surfacing the two recurring-rule destinations on the
 * /records page. Replaces the previous ⚙ 定期 popover (RecurringMenu) which
 * was too easy to miss for v0.13.0's just-shipped feature — see #154.
 *
 * Sits between the monthly-stats section and the transaction feed: high
 * enough in the page to be discoverable on first scroll, but low enough not
 * to crowd the sticky header / tab row.
 */
export function RecurringSectionCard() {
  const t = useTranslations()
  const P = DEFAULT_INCOME_PALETTE
  return (
    <div className="px-5 pt-4 pb-2">
      <div className="flex items-stretch gap-2">
        <Link
          href="/settings/recurring-expense"
          className="flex-1 h-11 inline-flex items-center justify-between rounded-[12px] px-3 text-sm no-underline"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            color: '#7A5A38',
          }}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
            <span className="font-medium">{t.records.manageRecurringExpense}</span>
          </span>
          <span aria-hidden style={{ color: 'var(--ink-3)' }}>›</span>
        </Link>
        <Link
          href="/settings/recurring-income"
          className="flex-1 h-11 inline-flex items-center justify-between rounded-[12px] px-3 text-sm no-underline"
          style={{
            background: P.tint,
            border: '1px solid var(--hairline)',
            color: P.ink,
          }}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
            <span className="font-medium">{t.records.manageRecurringIncome}</span>
          </span>
          <span aria-hidden style={{ color: P.ink, opacity: 0.5 }}>›</span>
        </Link>
      </div>
    </div>
  )
}
