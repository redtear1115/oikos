'use client'

import { CURRENCIES } from '@/lib/currency'

interface Props {
  value: string
  onChange: (next: string) => void
  /**
   * Restricted set of currency codes to offer. When provided, only these
   * options render — the trip-sub-ledger path passes the trip's selected
   * currencies so the dropdown matches what the user picked in TripSheet.
   * When omitted, the 4 preset codes are shown.
   */
  codes?: string[]
  disabled?: boolean
}

export function CurrencySelector({ value, onChange, codes, disabled }: Props) {
  const options = codes && codes.length > 0
    ? codes
    : CURRENCIES.map((c) => c.toUpperCase())
  // Defensive: ensure `value` is in the options so the native select doesn't
  // silently coerce to the first item when a stale value lingers across
  // trip switches. If missing, surface it as a disabled extra option.
  const seen = new Set(options.map((c) => c.toUpperCase()))
  const valueUpper = value.toUpperCase()
  const merged = seen.has(valueUpper) ? options : [...options, value]

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
      onChange={(e) => onChange(e.target.value)}
    >
      {merged.map((c) => (
        <option key={c} value={c}>
          {c.toUpperCase()}
        </option>
      ))}
    </select>
  )
}
