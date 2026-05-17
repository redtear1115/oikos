'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { useTranslations } from '@/lib/i18n/client'
import type { AssetType } from '@/lib/assets'
import type { BadgeTone } from '@/lib/insuranceBadge'

const BADGE_STYLES: Record<BadgeTone, { bg: string; fg: string }> = {
  destructive: { bg: 'var(--destructive-soft)', fg: 'var(--destructive)' },
  warning:     { bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
  saving:      { bg: 'var(--saving-soft)',       fg: 'var(--saving)' },
  accent:      { bg: 'var(--accent-soft)',       fg: 'var(--accent)' },
  active:      { bg: 'var(--accent-soft)',       fg: 'var(--accent)' },
}

export interface SwitcherItem {
  id: string
  type: AssetType
  name: string
  /** ≤ 16 chars — insurer + term info etc. */
  subtitle?: string | null
  badge?: { tone: BadgeTone; label: string } | null
}

export interface SwitcherGroup {
  /** Uppercase mono section label, e.g. "保護型 · 一年期". */
  label: string
  items: SwitcherItem[]
}

interface AssetSwitcherProps {
  currentAssetId: string
  /** Legacy flat list — used when `groups` is not provided. */
  allAssets?: Array<{ id: string; name: string; type: AssetType }>
  /** New grouped mode. When provided, `allAssets` is ignored. */
  groups?: SwitcherGroup[]
  /** Foreground color for the chevron — defaults to ink. */
  chevronInk?: string
  /** Background tint of the trigger pill — defaults to ink-soft. Pass a custom
   *  rgba for tinted hero bands. */
  triggerBg?: string
  /** Trigger content — typically the page title / name. Rendered inside the
   *  click target with a chevron after it. */
  children: React.ReactNode
}

export function AssetSwitcher({
  currentAssetId,
  allAssets,
  groups,
  chevronInk = '#3A2419',
  triggerBg = 'rgba(58,36,25,0.06)',
  children,
}: AssetSwitcherProps) {
  const router = useRouter()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Compute portal position whenever the popover opens.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPopoverPos({ top: rect.bottom + 6, left: rect.left })
  }, [open])

  // Close on outside click (check both trigger and portal popover).
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (popoverRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const navigate = (id: string) => {
    setOpen(false)
    router.push(`/assets/${id}`)
  }

  const popover = open ? (
    <div
      ref={popoverRef}
      className="overflow-auto rounded-[12px] py-2"
      role="listbox"
      style={{
        position: 'fixed',
        top: popoverPos.top,
        left: popoverPos.left,
        zIndex: 9999,
        width: 320,
        maxHeight: 'min(60vh, 400px)',
        background: '#fff',
        border: '1px solid var(--hairline)',
        boxShadow: '0 16px 40px rgba(58,36,25,0.18)',
      }}
    >
      {groups
        ? groups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  padding: '8px 14px 4px',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 9,
                  letterSpacing: '1.2px',
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <SwitcherRow
                  key={item.id}
                  item={item}
                  isCurrent={item.id === currentAssetId}
                  onSelect={navigate}
                />
              ))}
            </div>
          ))
        : (allAssets ?? [])
            .filter(a => a.id !== currentAssetId)
            .map(a => (
              <SwitcherRow
                key={a.id}
                item={{ id: a.id, type: a.type, name: a.name }}
                isCurrent={false}
                onSelect={navigate}
              />
            ))
      }
    </div>
  ) : null

  return (
    <div className="relative inline-flex items-center min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 min-w-0 h-[30px] border-0 cursor-pointer text-left rounded-[10px] pl-2 pr-1.5 -ml-2 transition-colors hover:brightness-95 active:brightness-90"
        style={{ background: open ? 'rgba(255,255,255,0.75)' : triggerBg }}
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

      {typeof document !== 'undefined' && createPortal(popover, document.body)}
    </div>
  )
}

function SwitcherRow({
  item,
  isCurrent,
  onSelect,
}: {
  item: SwitcherItem
  isCurrent: boolean
  onSelect: (id: string) => void
}) {
  const t = useTranslations()
  const badgeStyle = item.badge ? BADGE_STYLES[item.badge.tone] : null

  return (
    <button
      type="button"
      role="option"
      aria-selected={isCurrent}
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center gap-2.5 border-0 cursor-pointer text-left"
      style={{
        padding: '10px 14px',
        background: isCurrent ? 'rgba(58,36,25,0.05)' : 'transparent',
        borderLeft: isCurrent ? `3px solid var(--asset-color-${item.type})` : '3px solid transparent',
      }}
      onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'rgba(58,36,25,0.04)' }}
      onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* Type icon square */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: `var(--asset-tint-${item.type})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AssetIcon type={item.type} size={14} color="var(--ink-2)" />
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 flex flex-col min-w-0">
        <span
          className="truncate"
          style={{
            fontSize: 13,
            fontWeight: isCurrent ? 600 : 500,
            color: 'var(--ink)',
            lineHeight: 1.3,
          }}
        >
          {item.name}
        </span>
        {item.subtitle && (
          <span
            className="truncate"
            style={{
              fontFamily: 'var(--font-numeric)',
              fontSize: 9,
              color: 'var(--ink-3)',
              lineHeight: 1.4,
            }}
          >
            {item.subtitle}
          </span>
        )}
      </div>

      {/* Status badge */}
      {item.badge && badgeStyle && (
        <span
          style={{
            fontFamily: 'var(--font-numeric)',
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 4,
            background: badgeStyle.bg,
            color: badgeStyle.fg,
            flexShrink: 0,
          }}
        >
          {item.badge.label}
        </span>
      )}

      {/* Current check */}
      {isCurrent && (
        <span className="sr-only">{t.assetDetail.switcher.currentLabel}</span>
      )}
      {isCurrent && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--ink)' }}>
          <path d="M2.5 6.5l3 3 4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}
