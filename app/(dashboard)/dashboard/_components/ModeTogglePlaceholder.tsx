'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'

interface Props {
  mode?: 'expense' | 'income'
  onChange?: (mode: 'expense' | 'income') => void
}

export function ModeTogglePlaceholder({ mode = 'expense', onChange }: Props) {
  const P = DEFAULT_INCOME_PALETTE  // mint
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
        { id: 'expense', label: '支出模式' },
        { id: 'income',  label: '進帳模式' },
      ] as const).map((o) => {
        const sel = mode === o.id
        const isIncome = o.id === 'income'
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
              fontSize: 12,
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
          </button>
        )
      })}
    </div>
  )
}
