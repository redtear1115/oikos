'use client'

interface Props {
  value: number   // 1–31
  onChange: (day: number) => void
}

export function DayPicker({ value, onChange }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 6,
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
            title={day > 28 ? '若當月無此日，自動 fallback 到月底' : undefined}
          >
            {day}
          </button>
        )
      })}
    </div>
  )
}
