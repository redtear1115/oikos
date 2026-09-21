'use client'

import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatAmountParts, type CurrencyCode } from '@/lib/currency'

interface Props {
  /** 'YYYY-MM' — the same month key the total and count were summed over, so
   *  the label can never disagree with the figure below it. */
  monthKey: string
  /** Sum of this month's CashTransactions, base-currency integer. */
  total: number
  /** How many rows that sum came from. */
  count: number
  /** Group's base currency (default 'twd'). */
  baseCurrency?: CurrencyCode
}

/**
 * The solo dashboard's expense hero: this month's total, and how many records
 * it came from. Replaces the invite banner that used to occupy this slot
 * (#1118) — solo mode is a steady state, so the hero slot answers the same
 * question it answers for a couple ("what happened this month"), just without
 * a balance to split.
 *
 * Deliberately one big number. The count is a quiet second line, not a stat
 * tile: DESIGN.md §6 — if there is more than one big number on the screen,
 * none of them is the moment.
 *
 * Duo mode keeps `BalanceHero`; income mode uses `BalanceHero`'s income branch
 * in both, since that branch never depended on there being a partner.
 */
export function SoloMonthHero({ monthKey, total, count, baseCurrency = 'twd' }: Props) {
  const t = useTranslations()
  const locale = useLocale()

  // Let Intl name the month so each locale gets its own form and word order
  // ('9月' / 'September') — never assembled from a number plus a literal.
  const [year, month] = monthKey.split('-').map(Number)
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
    .format(new Date(year, month - 1, 1))
  const totalParts = formatAmountParts(total, baseCurrency)

  return (
    <div className="px-5 pt-6 pb-5">
      <div className="text-xs tracking-label text-ink-3 text-center">
        {t.dashboard.soloHero.monthLabel.replace('{month}', monthName)}
      </div>

      <div
        // Shares BalanceHero's expense-hero type rather than re-deriving it:
        // both are the same Amount tier. Since #1132 that sharing is a token
        // (text-amount-fluid / tracking-amount) instead of two copies of the
        // same literal that could drift apart unnoticed.
        className={`tnum text-center leading-[1.05] text-amount-fluid tracking-amount font-medium mt-1.5 ${
          total > 0 ? 'text-ink' : 'text-ink-3'
        }`}
        style={{
          fontFamily: 'var(--font-numeric)',
        }}
      >
        <span className="text-title font-medium mr-1 text-ink-2">{totalParts.symbol}</span>
        {totalParts.digits}
      </div>

      <div className="text-xs text-ink-3 text-center mt-2">
        {t.dashboard.soloHero.countLabel.replace('{count}', String(count))}
      </div>
    </div>
  )
}
