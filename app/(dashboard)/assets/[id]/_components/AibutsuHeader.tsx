'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { useTranslations } from '@/lib/i18n/client'
import type { AssetType } from '@/lib/assets'
import type { BadgeTone } from '@/lib/insuranceBadge'

const TINTS = {
  child:     { bg: '#F1DEE0', accent: '#A85B6A' },
  pet:       { bg: '#F0E2D0', accent: '#9A6B3F' },
  plant:     { bg: '#DCE7D6', accent: '#5A7A4A' },
  insurance: { bg: '#DDE5DC', accent: '#5A7A66' },
  house:     { bg: '#EFE3D0', accent: '#7A5A38' },
  // #222 — template-based assets
  item:      { bg: '#E9E4DF', accent: '#6E5F52' },
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
      className="flex gap-2 pb-0.5 mt-3.5"
      style={{
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        marginLeft: -16,
        marginRight: -16,
        paddingLeft: 16,
        paddingRight: 16,
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
            className="flex items-center gap-1.5 shrink-0 border-0 cursor-pointer transition-opacity"
            style={{
              height: 36,
              paddingLeft: 7,
              paddingRight: 12,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 999,
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
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                background: isCurrent ? 'rgba(255,255,255,0.18)' : `var(--asset-tint-${s.type})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
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
              style={{
                fontSize: 12,
                fontWeight: isCurrent ? 600 : 500,
                color: isCurrent ? '#FBEDE0' : 'var(--ink)',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </span>

            {/* Status badge — only on non-current chips */}
            {!isCurrent && s.badge && badgeStyle && (
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
    <div
      className="sticky top-0 z-20 px-4 pt-12"
      style={{
        background: tint.bg,
        paddingBottom: hasSiblings ? 10 : 12,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/assets"
          className="flex items-center gap-1.5 min-h-11 px-2 -ml-2 bg-transparent shrink-0"
          style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M6.5 1.5L1.5 6.5L6.5 11.5" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{t.assetDetail.backAriaLabel}</span>
        </Link>
        <div
          className="flex-1 text-lg font-medium tracking-tight truncate min-w-0 text-center"
          style={{ fontFamily: 'var(--font-serif)', color: '#3A2419' }}
        >
          {name}
        </div>
        {onEditClick ? (
          <button
            onClick={onEditClick}
            className="w-[30px] h-[30px] rounded-[10px] shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
            aria-label={t.assetDetail.editAriaLabel}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
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
          className="text-xs mt-1.5 tracking-[1px] text-center"
          style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
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
