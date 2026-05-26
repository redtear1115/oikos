'use client'

import { singleEcon } from '@/lib/fuelEcon'
import { formatDateRelative } from '@/lib/format-date'
import { useLocale } from '@/lib/i18n/client'
import { formatAmount } from '@/lib/currency'

interface FuelRowProps {
  fuelLog: {
    id: string
    liters: string
    odometer: number
    station: string | null
    loggedAt: string  // ISO string (serialized from page)
    prevOdometer: number | null
  }
  amount: number
  onClick?: () => void
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export function FuelRow({ fuelLog, amount, onClick }: FuelRowProps) {
  const locale = useLocale()
  // singleEcon(curr, prev): only prev.odometer matters; liters/loggedAt in prev are unused
  const econ = singleEcon(
    { liters: fuelLog.liters, odometer: fuelLog.odometer, loggedAt: new Date(fuelLog.loggedAt) },
    fuelLog.prevOdometer !== null
      ? { liters: 0, odometer: fuelLog.prevOdometer, loggedAt: new Date(0) }
      : null,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--hairline)] last:border-b-0 text-left hover:bg-black/[0.02] transition-colors"
      style={{ background: 'linear-gradient(90deg, rgba(138,123,90,0.07), transparent 50%)' }}
    >
      {/* fuel pump icon */}
      <div className="w-9 h-9 rounded-chip bg-[#E8E4D8] text-[#8A7B5A] flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="9" height="13" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 9h2a2 2 0 012 2v3a1 1 0 002 0V8l-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M5 7h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-[var(--ink)] font-medium">加油</span>
          {econ !== null ? (
            <span className="text-micro text-[#8A7B5A] font-mono bg-[#E8E4D8] px-1.5 py-px rounded">
              {econ.toFixed(1)} km/L
            </span>
          ) : (
            <span className="text-micro text-[var(--ink-3)] font-mono bg-[var(--surface-alt,#F5F2EC)] px-1.5 py-px rounded">
              — km/L
            </span>
          )}
        </div>
        <div className="text-micro text-[var(--ink-3)] font-mono mt-1">
          {formatDateRelative(fuelLog.loggedAt, locale)} · {parseFloat(fuelLog.liters).toFixed(1)}L · {fmt(fuelLog.odometer)} km · {fuelLog.station ?? '—'}
        </div>
      </div>

      <div className="text-body font-medium text-[var(--ink)] tabular-nums shrink-0">
        {formatAmount(amount, 'twd')}
      </div>
    </button>
  )
}
