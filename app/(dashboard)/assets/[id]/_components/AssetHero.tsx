'use client'

import Link from 'next/link'
import { resolveCarColor } from '../../_components/carColor'
import { useTranslations } from '@/lib/i18n/client'

interface AssetHeroProps {
  name: React.ReactNode
  plate: string | null
  brand: string | null
  model: string | null
  year: number | null
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  color: string | null
  monthAmount: number
  totalAmount: number
  avgEcon: number | null
  fuelLogCount: number
  onEdit?: () => void
}

function BackButton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <Link
      href="/assets"
      className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 mr-3"
      style={{ background: 'rgba(58,36,25,0.08)' }}
      aria-label={ariaLabel}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M9 2l-5 5 5 5" stroke="#3A2419" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  )
}

function EditPencilButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[30px] h-[30px] rounded-[10px] shrink-0 inline-flex items-center justify-center align-middle ml-1.5"
      style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
      aria-label={ariaLabel}
    >
      <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
        <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
          stroke="#3A2419" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  )
}

export function AssetHero({
  name, plate, brand, model, year, fuelType, color,
  monthAmount, totalAmount, avgEcon, fuelLogCount, onEdit,
}: AssetHeroProps) {
  const t = useTranslations()
  const isElectric = fuelType === 'electric'
  const swatch = resolveCarColor(color)

  // Shared subtitle — plate · brand model · year
  const subtitle = (
    <div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
      {plate && <span>{plate}</span>}
      {(brand || model) && plate && <span>·</span>}
      {(brand || model) && (
        <span>{[brand, model].filter(Boolean).join(' ')}</span>
      )}
      {year && (brand || model || plate) && <span>·</span>}
      {year && <span>{year}</span>}
    </div>
  )

  // Shared header — back / serif name / edit pencil
  const header = (
    <div className="flex items-center">
      <BackButton ariaLabel={t.assetDetail.backAriaLabel} />
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
      <div className="px-3 pt-[60px] pb-3">
        <div className="px-5 pt-5 pb-5" style={FRAME_STYLE}>
          {header}
          {subtitle}
          <div className="flex items-baseline gap-7 mt-6">
            <Stat label={t.assetDetail.money.thisMonth} amount={monthAmount} accent={false} />
            <div style={{ width: 1, height: 36, background: 'var(--hairline)' }} />
            <Stat label={t.assetDetail.money.cumulative} amount={totalAmount} accent />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pt-[60px] pb-3">
      <div className="px-5 pt-5 pb-5" style={FRAME_STYLE}>
        {header}
        {subtitle}

        <div className="text-center mt-5 pb-1">
          <div className="text-micro font-mono uppercase tracking-[1.5px]" style={{ color: 'var(--ink-3)' }}>{t.assetDetail.car.avgEcon}</div>
          <div className="inline-flex items-baseline gap-1.5 mt-1.5">
            <span
              className="text-amount-lg font-semibold tabular-nums leading-none"
              style={{ letterSpacing: '-2px', color: 'var(--ink)' }}
            >
              {avgEcon !== null ? avgEcon.toFixed(1) : '—'}
            </span>
            <span className="text-label font-medium" style={{ color: 'var(--ink-3)' }}>km/L</span>
          </div>
          <div className="text-micro font-mono mt-1" style={{ color: 'var(--ink-3)' }}>
            {avgEcon === null && fuelLogCount === 0
              ? t.assetDetail.car.avgEconNoLog
              : avgEcon === null
              ? t.assetDetail.car.avgEconNeedMore
              : t.assetDetail.car.avgEconRecent}
          </div>
        </div>

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
      <div className="text-micro tracking-[0.6px] mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div
        className="tnum tracking-[-1px] leading-none"
        style={{
          fontFamily: 'var(--font-numeric)',
          fontSize: accent ? 44 : 32,
          fontWeight: 600,
          color: dim ? 'var(--ink-3)' : 'var(--ink)',
        }}
      >
        <span className="text-base mr-0.5" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>NT$</span>
        {amount.toLocaleString('en-US')}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <div className="text-micro font-mono tracking-wider" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="text-button font-semibold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}
