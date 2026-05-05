'use client'

interface AssetHeroProps {
  name: string
  plate: string | null
  brand: string | null
  model: string | null
  year: number | null
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  monthAmount: number
  totalAmount: number
  avgEcon: number | null
  fuelLogCount: number
}

export function AssetHero({
  name, plate, brand, model, year, fuelType,
  monthAmount, totalAmount, avgEcon, fuelLogCount,
}: AssetHeroProps) {
  const isElectric = fuelType === 'electric'

  if (isElectric) {
    // EV — simple 本月 / 累計 layout (no fuel econ)
    return (
      <div className="px-5 pt-[60px] pb-6">
        <div className="text-2xl font-medium tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {name}
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

  // Gas variant — avg fuel econ big number + sub-stats row
  return (
    <div className="px-5 pt-[60px] pb-6">
      <div className="text-2xl font-medium tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
        {name}
      </div>
      {plate && (
        <div className="text-xs mt-1 tracking-[1px]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
          {plate}
        </div>
      )}

      {/* Hero avg fuel economy */}
      <div className="text-center mt-5 pb-1">
        <div className="text-[10px] text-[var(--ink-3)] font-mono uppercase tracking-[1.5px]">平均油耗</div>
        <div className="inline-flex items-baseline gap-1.5 mt-1.5">
          <span
            className="text-[56px] font-semibold text-[var(--ink)] tabular-nums leading-none"
            style={{ letterSpacing: '-2px' }}
          >
            {avgEcon !== null ? avgEcon.toFixed(1) : '—'}
          </span>
          <span className="text-[13px] text-[var(--ink-3)] font-medium">km/L</span>
        </div>
        <div className="text-[10px] text-[var(--ink-3)] font-mono mt-1">
          {avgEcon === null && fuelLogCount === 0
            ? '加第一筆油看油耗'
            : avgEcon === null
            ? '需要至少 2 次加油記錄'
            : '近 6 個月'}
        </div>
      </div>

      {/* 本月 / 累計 sub-stats */}
      <div
        className="mt-5 flex rounded-2xl px-4 py-3 gap-2"
        style={{ background: 'rgba(255,255,255,0.55)' }}
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
      <div className="text-[9px] text-[var(--ink-3)] font-mono tracking-wider">{label}</div>
      <div className="text-[16px] font-semibold text-[var(--ink)] tabular-nums mt-0.5">{value}</div>
    </div>
  )
}
