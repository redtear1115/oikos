'use client'

interface Props {
  name: string
  plate: string | null
  monthAmount: number
  totalAmount: number
  onEditClick: () => void
}

export function AssetHero({ name, plate, monthAmount, totalAmount, onEditClick }: Props) {
  return (
    <div className="px-5 pt-[60px] pb-6">
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <div
            className="text-2xl font-medium tracking-tight truncate"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
          >
            {name}
          </div>
          {plate && (
            <div className="text-xs mt-1 tracking-[1px]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              {plate}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEditClick}
          aria-label="編輯此愛物"
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          ⋯
        </button>
      </div>

      <div className="flex items-baseline gap-7 mt-6">
        <Stat label="本月" amount={monthAmount} accent={false} />
        <div style={{ width: 1, height: 36, background: 'var(--hairline)' }} />
        <Stat label="累積" amount={totalAmount} accent />
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
