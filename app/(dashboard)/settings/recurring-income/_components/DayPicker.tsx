'use client'

import { useTranslations } from '@/lib/i18n/client'

interface Props {
  value: number   // 1–31
  onChange: (day: number) => void
}

export function DayPicker({ value, onChange }: Props) {
  const t = useTranslations()
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4,
      }}
    >
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
        const selected = day === value
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(day)}
            style={{
              height: 36,
              borderRadius: 8,
              border: selected ? 'none' : '1px solid var(--hairline)',
              background: selected ? 'var(--ink)' : 'transparent',
              color: selected ? '#fff' : 'var(--ink)',
              fontSize: 'var(--fs-sm)',
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'inherit',
              opacity: day > 28 ? 0.7 : 1,
            }}
            aria-pressed={selected}
            aria-label={t.recurringIncome.sheet.dayAriaLabel.replace('{day}', String(day))}
            title={day > 28 ? t.recurringIncome.sheet.dayFallbackTitle : undefined}
          >
            {day}
          </button>
        )
      })}
    </div>
  )
}
