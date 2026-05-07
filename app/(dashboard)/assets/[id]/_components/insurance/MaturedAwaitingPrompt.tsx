'use client'

import { SAVINGS_MATURED_AWAITING } from './insurance-copy'

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
  const copy = SAVINGS_MATURED_AWAITING
  return (
    <div
      className="px-5 pt-6 pb-7 text-center"
      style={{ background: '#F7F4EE' }}
    >
      <div className="text-xs tracking-[1px]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
        {copy.title(maturityDate)}
      </div>

      <div className="mt-3 inline-flex items-baseline gap-1.5">
        <span className="text-base font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-numeric)',
            fontSize: 'var(--fs-amount-lg)',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: -1.5,
          }}
        >
          {expectedMaturity.toLocaleString()}
        </span>
      </div>
      <div className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
        估 · {copy.status}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="mt-5 inline-flex items-center justify-center px-5 h-11 rounded-full text-sm font-medium"
        style={{ background: 'var(--ink)', color: '#fff' }}
      >
        {copy.cta}
      </button>

      {premiumCount > 0 && (
        <div className="mt-4 text-xs" style={{ color: 'var(--ink-3)' }}>
          {copy.premiumNote(premiumTotal, premiumCount)}
        </div>
      )}
    </div>
  )
}
