'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import type { IncomeCategory } from '@/lib/incomeCategories'

interface IncomeChipProps {
  cat: IncomeCategory
  selected: boolean
  onClick: () => void
}

/**
 * Income category chip. Shares the unified `oik-chip` toggle pattern with
 * FilterSheet's category chips so all filter pills read as the same control
 * (issue #263). The income variant overrides `--toggle-active-bg` with the
 * mint-palette `ink` so the income-mode visual identity stays intact while
 * the rest (height / border / transition / focus ring) comes from the shared
 * toggle tokens.
 */
export function IncomeChip({ cat, selected, onClick }: IncomeChipProps) {
  const P = DEFAULT_INCOME_PALETTE
  return (
    <button
      type="button"
      onClick={onClick}
      className="oik-chip h-8 pl-1.5 pr-3 rounded-full text-label font-medium cursor-pointer inline-flex items-center gap-2 shrink-0"
      style={{
        background: selected ? P.ink : 'var(--toggle-inactive-bg)',
        color: selected ? 'var(--toggle-active-text)' : 'var(--ink)',
        border: `1px solid ${selected ? P.ink : 'var(--toggle-border)'}`,
        transition: `background var(--toggle-transition), color var(--toggle-transition), border-color var(--toggle-transition)`,
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
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
