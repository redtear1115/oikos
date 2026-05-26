'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { SegmentedToggle, type SegmentedOption } from '@/components/ui/SegmentedToggle'

interface Props {
  mode?: 'expense' | 'income'
  onChange?: (mode: 'expense' | 'income') => void
  /** Pending recurring-income count — drives the mint dot on the 收入 pill while in 支出 mode. */
  incomePendingCount?: number
  /** Pending recurring-expense count — drives the category-neutral dot on the 支出 pill while in 收入 mode. */
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

  const options: SegmentedOption[] = ([
    { id: 'expense' as const, label: t.modeToggle.expense },
    { id: 'income' as const,  label: t.modeToggle.income },
  ]).map((o) => {
    const sel = mode === o.id
    const isIncome = o.id === 'income'
    const showDot = !sel && (isIncome ? incomePendingCount > 0 : expensePendingCount > 0)
    return {
      id: o.id,
      active: sel,
      onClick: () => onChange?.(o.id),
      // Income owns the mint family; expense uses the standard ink fill.
      fillColor: isIncome ? P.tint : undefined,
      activeTextColor: isIncome ? P.ink : undefined,
      label: (
        <>
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
        </>
      ),
    }
  })

  // Income mode is signalled by the selected segment's mint fill + dot; no
  // glow ring (Flat-By-Default — the polish pass dropped the decorative shadow).
  return <SegmentedToggle options={options} size="md" />
}
