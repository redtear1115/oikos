'use client'

import { useTranslations } from '@/lib/i18n/client'
import { formatLedgerAmountSpaced, type CurrencyCode } from '@/lib/currency'

interface Props {
  premiumTotal: number
  returnTotal: number
  baseCurrency: CurrencyCode
  policyCurrency: CurrencyCode
}

/**
 * #1600 — SavingsHero stand-in for a policy whose currency differs from the
 * ledger's. The ledger's paid / returned totals are in the base currency, the
 * policy's figures in their own; no FX is applied, so there are no progress
 * bars and no ratios here, only the two ledger totals and a note saying why.
 */
export function SavingsLedgerTotals({ premiumTotal, returnTotal, baseCurrency, policyCurrency }: Props) {
  const ts = useTranslations().assetDetail.savings
  return (
    <div className="px-5 pt-5 pb-6" style={{ background: '#F7F4EE' }}>
      <div className="flex flex-col gap-1.5 text-xs tabular-nums text-ink-3 font-numeric">
        <div>
          <span className="text-ink">{formatLedgerAmountSpaced(premiumTotal, baseCurrency)}</span>
          <span> {ts.heroPaymentLabel}</span>
        </div>
        <div>
          <span className="text-ink">{formatLedgerAmountSpaced(returnTotal, baseCurrency)}</span>
          <span> {ts.heroReturnLabel}</span>
        </div>
      </div>
      <div className="mt-4 text-sm text-ink-3 italic">
        {ts.crossCurrencyNote
          .replace('{policy}', policyCurrency.toUpperCase())
          .replace('{base}', baseCurrency.toUpperCase())}
      </div>
    </div>
  )
}
