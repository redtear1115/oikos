'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import type { IncomeCategory } from '@/lib/incomeCategories'

interface IncomeChipProps {
  cat: IncomeCategory
  selected: boolean
  onClick: () => void
}

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
        border: selected ? `1.5px solid ${P.ink}` : '1px solid var(--hairline)',
        background: selected ? '#fff' : 'rgba(255,255,255,0.5)',
        color: 'var(--ink)',
        fontSize: 'var(--fs-body)',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        flexShrink: 0,
        boxShadow: selected ? `0 0 0 4px ${P.glow}80` : 'none',
        transition: 'all 0.18s ease',
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
