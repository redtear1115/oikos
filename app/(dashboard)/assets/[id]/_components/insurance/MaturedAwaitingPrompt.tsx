'use client'

import { useLocale, useTranslations } from '@/lib/i18n/client'
import { useBaseCurrency } from '@/app/(dashboard)/_components/MemberContext'
import { currencySymbol } from '@/lib/currency'
import { formatDateAbsolute } from '@/lib/format-date'

interface Props {
  maturityDate: string
  expectedMaturity: number
  premiumTotal: number
  premiumCount: number
  onConfirm: () => void
}

export function MaturedAwaitingPrompt({
  maturityDate,
  expectedMaturity,
  premiumTotal,
  premiumCount,
  onConfirm,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const ts = t.assetDetail.savings
  const baseCurrency = useBaseCurrency()
  return (
    <div
      className="px-5 pt-6 pb-7 text-center"
      style={{ background: '#F7F4EE' }}
    >
      <div className="text-xs tracking-[1px] text-ink-3 font-numeric">
        {ts.maturedAwaitingTitle.replace('{date}', formatDateAbsolute(maturityDate, locale))}
      </div>

      {/* Typographic split (small symbol + large digits), so the symbol is set
           apart from the digits; it follows the ledger base currency. */}
      <div className="mt-3 inline-flex items-baseline gap-1.5">
        <span className="text-base font-medium text-ink-2">{currencySymbol(baseCurrency)}</span>
        <span
          className="tabular-nums leading-none text-amount-lg font-numeric font-medium text-ink"
          style={{
            letterSpacing: -1.5,
          }}
        >
          {expectedMaturity.toLocaleString()}
        </span>
      </div>
      <div className="text-xs mt-1.5 text-ink-3">
        {ts.heroExpectedTag} · {ts.maturedAwaitingStatus}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="mt-5 inline-flex items-center justify-center px-5 h-11 rounded-full text-sm font-medium bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
      >
        {ts.maturedAwaitingCta}
      </button>

      {premiumCount > 0 && (
        <div className="mt-4 text-xs text-ink-3">
          {ts.maturedAwaitingPremiumNote
            .replace('{total}', `${currencySymbol(baseCurrency)} ${premiumTotal.toLocaleString()}`)
            .replace('{count}', String(premiumCount))}
        </div>
      )}
    </div>
  )
}
