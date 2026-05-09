'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  mode?: 'expense' | 'income'
  onChange?: (mode: 'expense' | 'income') => void
  /** Pending recurring-income count — drives the mint dot on the 進帳 pill while in 支出 mode. */
  incomePendingCount?: number
  /** Pending recurring-expense count — drives the category-neutral dot on the 支出 pill while in 進帳 mode. */
  expensePendingCount?: number
}

export function ModeTogglePlaceholder({
  mode = 'expense',
  onChange,
  incomePendingCount = 0,
  expensePendingCount = 0,
}: Props) {
  const P = DEFAULT_INCOME_PALETTE  // mint
  const t = useTranslations()
  return (
    <div
      className="flex items-center rounded-full p-1 mb-5"
      style={{
        background: '#fff',
        border: '1px solid var(--hairline)',
        boxShadow: mode === 'income' ? `0 0 0 3px ${P.glow}80` : 'none',
        transition: 'box-shadow 0.3s ease',
        display: 'inline-flex',
        alignSelf: 'flex-start',
      }}
    >
      {([
        { id: 'expense' as const, label: t.modeToggle.expense },
        { id: 'income' as const,  label: t.modeToggle.income },
      ]).map((o) => {
        const sel = mode === o.id
        const isIncome = o.id === 'income'
        const showDot = !sel && (
          isIncome
            ? incomePendingCount > 0
            : expensePendingCount > 0
        )
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange?.(o.id)}
            className="flex items-center gap-[5px] font-semibold cursor-pointer border-0"
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 999,
              background: sel ? (isIncome ? P.tint : 'var(--ink)') : 'transparent',
              color: sel ? (isIncome ? P.ink : '#fff') : 'var(--ink-2)',
              fontSize: 'var(--fs-label)',
              letterSpacing: 0.3,
              transition: 'all 0.2s ease',
            }}
          >
            {isIncome && sel && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: P.ink,
                boxShadow: `0 0 6px ${P.ink}aa`,
                flexShrink: 0,
              }} />
            )}
            {o.label}
            {showDot && (
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isIncome ? P.ink : 'var(--ink)',
                boxShadow: isIncome ? `0 0 4px ${P.glow}` : '0 0 4px rgba(31,27,22,0.3)',
                flexShrink: 0,
                opacity: 0.8,
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
