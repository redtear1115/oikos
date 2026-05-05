'use client'

type FuelType = '92' | '95' | '98' | 'diesel'

interface FuelTypeButtonGroupProps {
  value: FuelType
  onChange: (value: FuelType) => void
}

const OPTIONS: Array<{ value: FuelType; label: string }> = [
  { value: '92', label: '92' },
  { value: '95', label: '95' },
  { value: '98', label: '98' },
  { value: 'diesel', label: '柴油' },
]

export function FuelTypeButtonGroup({ value, onChange }: FuelTypeButtonGroupProps) {
  return (
    <div className="flex gap-1 rounded-xl bg-[rgba(58,36,25,0.05)] p-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 h-9 rounded-lg text-[13px] font-medium transition-colors ${
            value === opt.value
              ? 'bg-white text-[var(--ink)] font-semibold shadow-sm'
              : 'bg-transparent text-[var(--ink-2)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
