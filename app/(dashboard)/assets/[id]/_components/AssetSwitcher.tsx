'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant' | 'item'

interface AssetSwitcherProps {
  currentAssetId: string
  allAssets: Array<{ id: string; name: string; type: AssetType }>
  /** Foreground color for the chevron — defaults to ink. */
  chevronInk?: string
  /** Background tint of the trigger pill — defaults to ink-soft. Pass a custom
   *  rgba for tinted hero bands. */
  triggerBg?: string
  /** Trigger content — typically the page title / name. Rendered inside the
   *  click target with a chevron after it. */
  children: React.ReactNode
}

export function AssetSwitcher({ currentAssetId, allAssets, chevronInk = '#3A2419', triggerBg = 'rgba(58,36,25,0.06)', children }: AssetSwitcherProps) {
  const router = useRouter()
  const t = useTranslations()
  const TYPE_LABELS: Record<AssetType, string> = t.assetDetail.typeLabels
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

  // No others to switch to — render the trigger inert (just the name, no chevron).
  if (others.length === 0) {
    return <div className="inline-flex items-center min-w-0">{children}</div>
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center min-w-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 min-w-0 h-[30px] border-0 cursor-pointer text-left rounded-[10px] pl-2 pr-1.5 -ml-2 transition-colors hover:brightness-95 active:brightness-90"
        style={{ background: triggerBg }}
        aria-label={t.assetDetail.switcherAriaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate min-w-0">{children}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0 opacity-70">
          <path d="M3 4.5l3 3 3-3" stroke={chevronInk} strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[200px] max-h-[320px] overflow-auto rounded-[12px] py-1"
          role="listbox"
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
              role="option"
              aria-selected={false}
              onClick={() => {
                setOpen(false)
                router.push(`/assets/${a.id}`)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-0 cursor-pointer hover:bg-[rgba(58,36,25,0.04)]"
            >
              <span
                className="text-micro tracking-[0.5px] shrink-0 px-1.5 py-0.5 rounded"
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
