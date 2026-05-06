'use client'

import { FALLBACK_CAR_COLOR } from '../../_components/carColor'

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

function BackButton() {
  return (
    <a
      href="/assets"
      className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 mr-3"
      style={{ background: 'rgba(58,36,25,0.08)' }}
      aria-label="返回"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M9 2l-5 5 5 5" stroke="#3A2419" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  )
}

function EditPencilButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[30px] h-[30px] rounded-[10px] shrink-0 inline-flex items-center justify-center align-middle ml-1.5"
      style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
      aria-label="編輯"
    >
      <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
        <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
          stroke="#3A2419" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  )
}

/** Solid stripe + dashed echo on the left edge — matches the assets-list cards. */
function LeftAccent({ swatch }: { swatch: string }) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 5,
          background: swatch,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 9, top: 12, bottom: 12,
          width: 0,
          borderLeft: `1.5px dashed ${swatch}`,
          opacity: 0.55,
        }}
      />
    </>
  )
}

export function AssetHero({
  name, plate, brand, model, year, fuelType, color,
  monthAmount, totalAmount, avgEcon, fuelLogCount, onEdit,
}: AssetHeroProps) {
  const isElectric = fuelType === 'electric'
  const swatch = color ?? FALLBACK_CAR_COLOR

  if (isElectric) {
    return (
      <div className="relative px-5 pt-[60px] pb-6 pl-[22px]">
        <LeftAccent swatch={swatch} />
        <div className="flex items-center">
          <BackButton />
          <div className="text-2xl font-medium tracking-tight min-w-0" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
            {name}
          </div>
          {onEdit && <EditPencilButton onClick={onEdit} />}
        </div>
        <div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
          {plate && <span>{plate}</span>}
          {(brand || model) && plate && <span>·</span>}
          {(brand || model) && (
            <span>{[brand, model].filter(Boolean).join(' ')}</span>
          )}
          {year && (brand || model || plate) && <span>·</span>}
          {year && <span>{year}</span>}
        </div>
        <div className="flex items-baseline gap-7 mt-6">
          <Stat label="本月" amount={monthAmount} accent={false} />
          <div style={{ width: 1, height: 36, background: 'var(--hairline)' }} />
          <Stat label="累積" amount={totalAmount} accent />
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-5 pt-[60px] pb-6 pl-[22px]">
      <LeftAccent swatch={swatch} />
      <div className="flex items-center">
        <BackButton />
        <div className="text-2xl font-medium tracking-tight min-w-0" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {name}
        </div>
        {onEdit && <EditPencilButton onClick={onEdit} />}
      </div>
      <div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
        {plate && <span>{plate}</span>}
        {(brand || model) && plate && <span>·</span>}
        {(brand || model) && (
          <span>{[brand, model].filter(Boolean).join(' ')}</span>
        )}
        {year && (brand || model || plate) && <span>·</span>}
        {year && <span>{year}</span>}
      </div>

      <div className="text-center mt-5 pb-1">
        <div className="text-[10px] font-mono uppercase tracking-[1.5px]" style={{ color: 'var(--ink-3)' }}>平均油耗</div>
        <div className="inline-flex items-baseline gap-1.5 mt-1.5">
          <span
            className="text-[56px] font-semibold tabular-nums leading-none"
            style={{ letterSpacing: '-2px', color: 'var(--ink)' }}
          >
            {avgEcon !== null ? avgEcon.toFixed(1) : '—'}
          </span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>km/L</span>
        </div>
        <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--ink-3)' }}>
          {avgEcon === null && fuelLogCount === 0
            ? '加第一筆油看油耗'
            : avgEcon === null
            ? '需要至少 2 次加油記錄'
            : '近 6 個月'}
        </div>
      </div>

      <div
        className="mt-5 flex rounded-2xl px-4 py-3 gap-2"
        style={{ background: 'rgba(58,36,25,0.04)', border: '1px solid var(--hairline)' }}
      >
        <MiniStat label="本月" value={`NT$ ${monthAmount.toLocaleString()}`} />
        <div style={{ width: 1, background: 'var(--hairline)' }} />
        <MiniStat label="累積" value={`NT$ ${totalAmount.toLocaleString()}`} />
      </div>
    </div>
  )
}

function Stat({ label, amount, accent }: { label: string; amount: number; accent: boolean }) {
  const dim = amount === 0
  return (
    <div>
      <div className="text-[11px] tracking-[0.6px] mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
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
      <div className="text-[9px] font-mono tracking-wider" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="text-[16px] font-semibold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}
