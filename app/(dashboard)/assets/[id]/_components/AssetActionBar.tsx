'use client'

interface AssetActionBarProps {
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  onAddFuel: () => void
  onAddOther: () => void
  onEdit: () => void
}

function PlusIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

export function AssetActionBar({ fuelType, onAddFuel, onAddOther, onEdit }: AssetActionBarProps) {
  const isElectric = fuelType === 'electric'

  return (
    <div className="flex gap-2 px-4 pt-3.5 pb-1.5">
      {!isElectric && (
        <button
          type="button"
          onClick={onAddFuel}
          className="flex-1 h-[38px] rounded-xl bg-[var(--ink)] text-white font-semibold text-[13px] flex items-center justify-center gap-1.5"
        >
          <PlusIcon /> 加油
        </button>
      )}
      <button
        type="button"
        onClick={onAddOther}
        className={`flex-1 h-[38px] rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 ${
          isElectric
            ? 'bg-[var(--ink)] text-white'
            : 'bg-white text-[var(--ink)] border border-[var(--hairline)]'
        }`}
      >
        <PlusIcon color={isElectric ? '#fff' : 'var(--ink)'} /> 其他花費
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="flex-1 h-[38px] rounded-xl bg-white text-[var(--ink)] border border-[var(--hairline)] font-semibold text-[13px]"
      >
        編輯
      </button>
    </div>
  )
}
