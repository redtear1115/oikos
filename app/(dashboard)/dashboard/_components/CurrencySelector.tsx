'use client'

import { CURRENCIES, type CurrencyCode } from '@/lib/currency'

interface Props {
  value: CurrencyCode
  onChange: (next: CurrencyCode) => void
  disabled?: boolean
}

export function CurrencySelector({ value, onChange, disabled }: Props) {
  return (
    <select
      className="rounded-lg border px-2 py-1.5 text-sm disabled:opacity-50 cursor-pointer"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        color: 'var(--ink)',
      }}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c.toUpperCase()}
        </option>
      ))}
    </select>
  )
}
