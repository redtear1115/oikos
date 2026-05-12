'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'

const TINTS = {
  child:     { bg: '#F1DEE0', accent: '#A85B6A' },
  pet:       { bg: '#F0E2D0', accent: '#9A6B3F' },
  plant:     { bg: '#DCE7D6', accent: '#5A7A4A' },
  insurance: { bg: '#DDE5DC', accent: '#5A7A66' },
  house:     { bg: '#EFE3D0', accent: '#7A5A38' },
} as const

type TintKind = keyof typeof TINTS

interface AibutsuHeaderProps {
  kind: TintKind
  /** Page title. Plain string is the norm; ReactNode is allowed for callers
   *  that need to mix a secondary label inline (e.g. child nickname). */
  name: React.ReactNode
  subtitle?: string | null
  onEditClick?: () => void
}

export function AibutsuHeader({ kind, name, subtitle, onEditClick }: AibutsuHeaderProps) {
  const tint = TINTS[kind]
  const t = useTranslations()
  return (
    <div className="px-4 pt-12 pb-3" style={{ background: tint.bg }}>
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
    </div>
  )
}

export function useTint(kind: TintKind) {
  return TINTS[kind]
}
