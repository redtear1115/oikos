'use client'

import { useTranslations } from '@/lib/i18n/client'

type FuelType = '92' | '95' | '98' | 'diesel'

interface FuelTypeButtonGroupProps {
  value: FuelType
  onChange: (value: FuelType) => void
}

export function FuelTypeButtonGroup({ value, onChange }: FuelTypeButtonGroupProps) {
  const t = useTranslations()
  const OPTIONS: Array<{ value: FuelType; label: string }> = [
    { value: '92', label: '92' },
    { value: '95', label: '95' },
    { value: '98', label: '98' },
    { value: 'diesel', label: t.assetSheet.car.fuelTypeDiesel },
  ]
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: 'var(--toggle-segment-track)' }}
    >
      {OPTIONS.map(opt => {
        const sel = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`oik-segment flex-1 h-9 rounded-lg text-label font-medium ${
              sel ? 'font-semibold' : ''
            }`}
            style={{
              background: sel ? 'var(--toggle-segment-thumb)' : 'transparent',
              color: sel ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: sel ? 'var(--toggle-segment-thumb-shadow)' : 'none',
              transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
