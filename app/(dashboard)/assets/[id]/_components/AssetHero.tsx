'use client'

import { resolveCarColor } from '../../_components/carColor'
import { useTranslations } from '@/lib/i18n/client'
import type { FuelType } from '@/lib/fuel'

interface AssetHeroProps {
  /** When omitted the card renders without the name/subtitle header row (headless mode). */
  name?: React.ReactNode
  brand: string | null
  model: string | null
  year: number | null
  fuelType: FuelType | null
  color: string | null
  monthAmount: number
  totalAmount: number
  avgEcon: number | null
  fuelLogCount: number
  onEdit?: () => void
}

function EditPencilButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[30px] h-[30px] rounded-chip shrink-0 inline-flex items-center justify-center align-middle ml-1.5"
      style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
      aria-label={ariaLabel}
    >
      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
          stroke="#3A2419" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  )
}

export function AssetHero({
  name, brand, model, year, fuelType, color,
  monthAmount, totalAmount, avgEcon, fuelLogCount, onEdit,
}: AssetHeroProps) {
  const t = useTranslations()
  const isElectric = fuelType === 'electric'
  const swatch = resolveCarColor(color)

  // Shared subtitle — brand model · year. The plate is intentionally absent
  // here (#826): it's PII, masked + revealed in the dedicated 車牌 row below,
  // never rendered inline in the hero.
  const subtitle = (
    <div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
      {(brand || model) && (
        <span>{[brand, model].filter(Boolean).join(' ')}</span>
      )}
      {year && (brand || model) && <span>·</span>}
      {year && <span>{year}</span>}
    </div>
  )

  // Shared header — serif name + edit pencil. The back button lives in a
  // sticky strip rendered by AssetDetailClient above this hero so it stays
  // visible while the page scrolls (#250).
  const header = (
    <div className="flex items-center">
      <div className="text-2xl font-medium tracking-tight min-w-0" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
        {name}
      </div>
      {onEdit && <EditPencilButton onClick={onEdit} ariaLabel={t.assetDetail.editAriaLabel} />}
    </div>
  )

  /**
   * Wrapping border in the car's color — replaces the previous left stripe +
   * dashed echo. The hero card now reads like a framed photo: the car's color
   * is the frame, contents stay neutral so numbers and text don't fight.
   */
  const FRAME_STYLE: React.CSSProperties = {
    border: `2.5px solid ${swatch}`,
    borderRadius: 24,
  }

  if (isElectric) {
    return (
      <div className="px-3 pt-4 pb-3">
        <div className="px-5 pt-5 pb-5" style={FRAME_STYLE}>
          {name && header}
          {name && subtitle}
          <div className={`flex items-baseline gap-7 ${name ? 'mt-6' : ''}`}>
            <Stat label={t.assetDetail.money.thisMonth} amount={monthAmount} accent={false} />
            <div style={{ width: 1, height: 36, background: 'var(--hairline)' }} />
            <Stat label={t.assetDetail.money.cumulative} amount={totalAmount} accent />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pt-4 pb-3">
      <div className="px-5 pt-5 pb-5" style={FRAME_STYLE}>
        {name && header}
        {name && subtitle}

        <div className="text-center mt-5 pb-1">
          <div className="text-xs font-mono uppercase tracking-[1.5px]" style={{ color: 'var(--ink-3)' }}>{t.assetDetail.car.avgEcon}</div>
          <div className="inline-flex items-baseline gap-1.5 mt-1.5">
            <span
              className="text-amount-lg font-medium tabular-nums leading-none"
              style={{ letterSpacing: '-2px', color: 'var(--ink)' }}
            >
              {avgEcon !== null ? avgEcon.toFixed(1) : '—'}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>km/L</span>
          </div>
          <div className="text-xs font-mono mt-1" style={{ color: 'var(--ink-3)' }}>
            {avgEcon === null && fuelLogCount === 0
              ? t.assetDetail.car.avgEconNoLog
              : avgEcon === null
              ? t.assetDetail.car.avgEconNeedMore
              : t.assetDetail.car.avgEconRecent}
          </div>
        </div>

        {/* TODO(v0.17 currency): MiniStat values use "NT$ {amount}" with space —
             defer to design before migrating to formatAmount. */}
        <div
          className="mt-5 flex rounded-2xl px-4 py-3 gap-2"
          style={{ background: 'rgba(58,36,25,0.04)', border: '1px solid var(--hairline)' }}
        >
          <MiniStat label={t.assetDetail.money.thisMonth} value={`NT$ ${monthAmount.toLocaleString()}`} />
          <div style={{ width: 1, background: 'var(--hairline)' }} />
          <MiniStat label={t.assetDetail.money.cumulative} value={`NT$ ${totalAmount.toLocaleString()}`} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, amount, accent }: { label: string; amount: number; accent: boolean }) {
  const dim = amount === 0
  return (
    <div>
      <div className="text-xs tracking-[0.6px] mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div
        className="tnum tracking-[-1px] leading-none"
        style={{
          fontFamily: 'var(--font-numeric)',
          fontSize: accent ? 44 : 32,
          fontWeight: 500,
          color: dim ? 'var(--ink-3)' : 'var(--ink)',
        }}
      >
        {/* TODO(v0.17 currency): typographic split — small NT$ + large digits;
             needs formatAmount digits-only mode (or symbol/digits split). */}
        <span className="text-base mr-0.5" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>NT$</span>
        {amount.toLocaleString('en-US')}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <div className="text-xs font-mono tracking-wider" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="text-button font-medium tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}
