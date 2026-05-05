'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

interface AssetSwitcherProps {
  currentAssetId: string
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

const TYPE_LABELS: Record<AssetType, string> = {
  car: '車',
  house: '房',
  child: '孩子',
  pet: '寵物',
  plant: '植物',
  insurance: '保險',
}

export function AssetSwitcher({ currentAssetId, allAssets }: AssetSwitcherProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const others = allAssets.filter(a => a.id !== currentAssetId)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (others.length === 0) return null

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-6 h-6 rounded-[7px] shrink-0 inline-flex items-center justify-center align-middle ml-1.5"
        style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
        aria-label="切換愛物"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5l3 3 3-3" stroke="#3A2419" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[28px] z-50 min-w-[180px] max-h-[320px] overflow-auto rounded-[12px] py-1"
          style={{
            background: '#fff',
            border: '1px solid var(--hairline)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          }}
        >
          {others.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setOpen(false)
                router.push(`/assets/${a.id}`)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-0 cursor-pointer hover:bg-[rgba(58,36,25,0.04)]"
            >
              <span
                className="text-[10px] tracking-[0.5px] shrink-0 px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(58,36,25,0.06)', color: 'var(--ink-3)' }}
              >
                {TYPE_LABELS[a.type]}
              </span>
              <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
