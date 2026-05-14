'use client'

import type { CurrencyCode } from '@/lib/currency'

export interface TripOption {
  id: string
  name: string
  defaultCurrency: CurrencyCode | null
}

interface Props {
  value: string | null
  options: TripOption[]
  onChange: (next: string | null) => void
  noTripLabel: string
}

export function TripSelector({ value, options, onChange, noTripLabel }: Props) {
  if (options.length === 0) return null
  return (
    <select
      className="rounded-lg border px-2 py-1.5 text-sm cursor-pointer"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        color: 'var(--ink)',
      }}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{noTripLabel}</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
