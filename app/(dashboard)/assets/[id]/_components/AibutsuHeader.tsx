'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { useTranslations } from '@/lib/i18n/client'
import type { AssetType } from '@/lib/assets'
import type { BadgeTone } from '@/lib/insuranceBadge'

const TINTS = {
  car:       { bg: 'var(--asset-tint-car)',       accent: 'var(--asset-color-car)' },
  child:     { bg: 'var(--asset-tint-child)',     accent: 'var(--asset-color-child)' },
  pet:       { bg: 'var(--asset-tint-pet)',       accent: 'var(--asset-color-pet)' },
  plant:     { bg: 'var(--asset-tint-plant)',     accent: 'var(--asset-color-plant)' },
  insurance: { bg: 'var(--asset-tint-insurance)', accent: 'var(--asset-color-insurance)' },
  house:     { bg: 'var(--asset-tint-house)',     accent: 'var(--asset-color-house)' },
  item:      { bg: 'var(--asset-tint-item)',      accent: 'var(--asset-color-item)' },
} as const

type TintKind = keyof typeof TINTS

const BADGE_STYLES: Record<BadgeTone, { bg: string; fg: string }> = {
  destructive: { bg: 'var(--destructive-soft)', fg: 'var(--destructive)' },
  warning:     { bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
  saving:      { bg: 'var(--saving-soft)',       fg: 'var(--saving)' },
  accent:      { bg: 'var(--accent-soft)',       fg: 'var(--accent)' },
  active:      { bg: 'var(--accent-soft)',       fg: 'var(--accent)' },
}

export interface SiblingChip {
  id: string
  /** Exclude insurance — those go in the dropdown switcher. */
  type: Exclude<AssetType, 'insurance'>
  name: string
  badge?: { tone: BadgeTone; label: string } | null
}

function SiblingRail({ siblings, currentId }: { siblings: SiblingChip[]; currentId?: string }) {
  const router = useRouter()
  const t = useTranslations()

  if (siblings.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label={t.assetDetail.siblingRailAriaLabel}
      className="flex gap-2 pb-0.5 mt-3.5 -mx-4 px-4 overflow-x-auto"
      style={{
        scrollSnapType: 'x proximity',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}
    >
      {siblings.map((s) => {
        const isCurrent = s.id === currentId
        const badgeStyle = s.badge ? BADGE_STYLES[s.badge.tone] : null
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => router.push(`/assets/${s.id}`)}
            className="flex items-center gap-1.5 shrink-0 border-0 cursor-pointer transition-opacity pl-2 pr-3 py-1.5 rounded-full h-9"
            style={{
              background: isCurrent ? 'var(--ink)' : 'rgba(255,255,255,0.55)',
              border: isCurrent ? 'none' : '1px solid rgba(58,36,25,0.08)',
              scrollSnapAlign: 'start',
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                const next = siblings.findIndex(x => x.id === s.id) + 1
                if (next < siblings.length) router.push(`/assets/${siblings[next].id}`)
              } else if (e.key === 'ArrowLeft') {
                const prev = siblings.findIndex(x => x.id === s.id) - 1
                if (prev >= 0) router.push(`/assets/${siblings[prev].id}`)
              }
            }}
          >
            {/* Type icon square */}
            <div
              className="rounded-md w-6 h-6 flex items-center justify-center shrink-0"
              style={{
                background: isCurrent ? 'rgba(255,255,255,0.18)' : `var(--asset-tint-${s.type})`,
              }}
            >
              <AssetIcon
                type={s.type}
                size={14}
                color={isCurrent ? '#FBEDE0' : 'var(--ink-2)'}
              />
            </div>

            {/* Name */}
            <span
              className="text-xs max-w-30 overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                fontWeight: isCurrent ? 500 : 400,
                color: isCurrent ? '#FBEDE0' : 'var(--ink)',
              }}
            >
              {s.name}
            </span>

            {/* Status badge — only on non-current chips */}
            {!isCurrent && s.badge && badgeStyle && (
              <span
                className="text-mini px-1.5 py-px rounded-sm font-numeric shrink-0"
                style={{
                  background: badgeStyle.bg,
                  color: badgeStyle.fg,
                }}
              >
                {s.badge.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface AibutsuHeaderProps {
  kind: TintKind
  /** Page title. Plain string is the norm; ReactNode is allowed for callers
   *  that need to mix a secondary label inline (e.g. child nickname). */
  name: React.ReactNode
  subtitle?: string | null
  onEditClick?: () => void
  /**
   * Sibling chips for the horizontal quick-switch rail.
   * Pass all same-group non-insurance assets EXCEPT the current one.
   * Rail is suppressed when empty.
   */
  siblings?: SiblingChip[]
  /** Id of the current asset — used to mark the active chip if you include
   *  the current item in `siblings` (not expected; just a safety fallback). */
  currentAssetId?: string
}

export function AibutsuHeader({ kind, name, subtitle, onEditClick, siblings, currentAssetId }: AibutsuHeaderProps) {
  const tint = TINTS[kind]
  const t = useTranslations()
  const hasSiblings = siblings && siblings.length > 0
  return (
    /* Pins below the shell top stack, not at the viewport top (#1037). 48px is
       this header's own top spacing — #1035 pulled it out of a bare `pt-12` that
       happened to be 1px more than an iPhone notch, and that separation stays;
       what changes is where the inset comes from. `env()` was only needed while
       this row could become the topmost element mid-scroll. It can't any more,
       so `--safe-top` answers it: the real inset when the stack is empty, zero
       when it isn't. */
    <div
      className={`sticky top-[var(--top-stack-h)] z-20 px-4 pt-[max(var(--safe-top),48px)] ${hasSiblings ? 'pb-2.5' : 'pb-3'}`}
      style={{ background: tint.bg }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/assets"
          className="flex items-center gap-1.5 min-h-11 px-2 -ml-2 bg-transparent shrink-0 text-sm text-ink-2"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M6.5 1.5L1.5 6.5L6.5 11.5" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{t.assetDetail.backAriaLabel}</span>
        </Link>
        {/* #1174 — every /assets/[id] variant renders this header, so the
            asset name is the page's one h1. */}
        {/* #1249 — `truncate` used to sit on the h1 itself. That is fine for a
            plain string, but insurance passes an <AssetSwitcher> button as the
            name, and `overflow: hidden` clipped the button's ::before hit-area
            back down to its 30px box. The clipping is invisible: the pill looks
            identical, it just stops responding 7px outside itself. Truncation
            now lives on an inner span for the string case only. */}
        <h1
          className="flex-1 text-lg font-medium tracking-tight min-w-0 text-center font-serif text-ink"
        >
          {typeof name === 'string' ? <span className="block truncate">{name}</span> : name}
        </h1>
        {onEditClick ? (
          <button
            onClick={onEditClick}
            className="relative w-[30px] h-[30px] rounded-chip shrink-0 flex items-center justify-center before:absolute before:-inset-[7px] before:content-[''] border-none"
            style={{ background: 'rgba(58,36,25,0.08)' }}
            aria-label={t.assetDetail.editAriaLabel}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
                stroke="#3A2419" strokeWidth="1.2"
                strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        ) : (
          <div className="w-[30px] shrink-0" aria-hidden="true" />
        )}
      </div>
      {subtitle && (
        <div
          className="text-xs mt-1.5 tracking-[1px] text-center text-ink-3 font-numeric"
        >{subtitle}</div>
      )}
      {siblings && siblings.length > 0 && (
        <SiblingRail siblings={siblings} currentId={currentAssetId} />
      )}
    </div>
  )
}

export function useTint(kind: TintKind) {
  return TINTS[kind]
}
