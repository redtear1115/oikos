'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import type { IncomeCategory } from '@/lib/incomeCategories'

interface IncomeChipProps {
  cat: IncomeCategory
  selected: boolean
  onClick: () => void
}

/**
 * Income category chip. Mirrors the filled style of the expense CategoryPicker
 * (selected = solid background + light text on a 1px-bordered pill) so the
 * two sheets share one chip pattern. The income variant uses the mint-palette
 * `ink` colour as the selected background, which keeps the income-mode green
 * accent without falling back to a different visual language (outline + glow)
 * for what is functionally the same control. (#199)
 */
export function IncomeChip({ cat, selected, onClick }: IncomeChipProps) {
  const P = DEFAULT_INCOME_PALETTE
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: '0 14px 0 8px',
        borderRadius: 999,
        border: selected ? `1px solid ${P.ink}` : '1px solid var(--hairline)',
        background: selected ? P.ink : 'var(--surface)',
        color: selected ? '#fff' : 'var(--ink)',
        fontSize: 'var(--fs-body)',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: cat.tint,
          color: cat.ink,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--fs-label)',
          fontWeight: 500,
        }}
      >
        {cat.mono}
      </span>
      {cat.label}
    </button>
  )
}
