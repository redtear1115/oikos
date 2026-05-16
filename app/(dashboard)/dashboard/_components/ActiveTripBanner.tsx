'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { currencySymbol, type CurrencyCode } from '@/lib/currency'
import { TripSheet } from '@/app/(dashboard)/trips/_components/TripSheet'

export interface ActiveTripBannerTrip {
  id: string
  name: string
  // v0.17.4 #410: free-text since trip currencies are user-defined.
  defaultCurrency: string | null
  startDate: string  // 'YYYY-MM-DD'
}

interface Props {
  trips: ActiveTripBannerTrip[]
  baseCurrency: CurrencyCode
}

// Persists user's collapse preference for the active-trip section across
// reloads. Mirrors the pattern used by BalanceHero's HERO_COLLAPSED_KEY.
const COLLAPSED_KEY = 'trip-banner-collapsed'

/**
 * Dashboard contextual surface for trips. Three top-level shapes:
 *   - 0 active trips → single-line empty CTA (no toggle — nothing to expand to).
 *   - 1+ trips expanded → full card with kicker + name + meta, ✈ add-trip button
 *     and − collapse toggle in the top-right.
 *   - 1+ trips collapsed → single line with dot + name (or "{N} trips"), ✈ and
 *     + expand toggle on the right.
 *
 * The banner owns its own TripSheet so adding a new trip is one tap from any
 * state, no navigation to /trips required.
 */
export function ActiveTripBanner({ trips, baseCurrency }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const tr = t.dashboard.activeTripBanner

  const [collapsed, setCollapsed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_KEY) === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

  const handleSaved = () => {
    setSheetOpen(false)
    router.refresh()
  }

  const sheet = (
    <TripSheet
      open={sheetOpen}
      baseCurrency={baseCurrency}
      onClose={() => setSheetOpen(false)}
      onSaved={handleSaved}
    />
  )

  // === Empty state — single-line CTA, no collapse toggle ===
  if (trips.length === 0) {
    return (
      <>
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={tr.emptyCta}
            className="w-full flex items-center gap-2.5 rounded-[20px] cursor-pointer"
            style={{
              padding: '10px 14px 10px 16px',
              background: 'var(--surface)',
              border: '1px dashed var(--hairline)',
              textAlign: 'left',
            }}
          >
            <span aria-hidden style={{ fontSize: 14, color: 'var(--accent)', lineHeight: 1 }}>✈</span>
            <span className="flex-1 text-sm" style={{ color: 'var(--ink-2)' }}>{tr.emptyCta}</span>
            <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 13 }}>›</span>
          </button>
        </div>
        {sheet}
      </>
    )
  }

  // === Active states ===
  const single = trips.length === 1 ? trips[0] : null
  const href = single ? `/trips/${single.id}` : '/trips'

  const cardStyle: React.CSSProperties = {
    background:
      'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--accent) 14%, var(--surface)) 100%)',
    border: '1px solid var(--hairline)',
    color: 'var(--ink)',
  }

  if (collapsed) {
    // === Collapsed: single row ===
    const collapsedText = single
      ? single.name
      : tr.multipleHeading.replace('{count}', String(trips.length))
    return (
      <>
        <div className="px-4 pt-2">
          <div
            className="flex items-center gap-2.5 rounded-[20px]"
            style={{ ...cardStyle, padding: '10px 14px 10px 16px' }}
          >
            <Link
              href={href}
              className="flex items-center gap-2.5 flex-1 min-w-0 no-underline"
              style={{ color: 'var(--ink)' }}
              aria-label={single ? tr.singleAriaLabel.replace('{name}', single.name) : tr.multipleAriaLabel.replace('{count}', String(trips.length))}
            >
              <span
                aria-hidden
                className="inline-block rounded-full shrink-0"
                style={{ width: 8, height: 8, background: 'var(--accent)' }}
              />
              <span className="flex-1 min-w-0 text-sm truncate">
                {collapsedText}
                {single?.defaultCurrency && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' · '}{currencySymbol(single.defaultCurrency)}
                  </span>
                )}
              </span>
              <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 13 }}>›</span>
            </Link>
            <SmallCircleButton onClick={() => setSheetOpen(true)} ariaLabel={tr.addAriaLabel} filled>✈</SmallCircleButton>
            <SmallCircleButton onClick={toggleCollapsed} ariaLabel={tr.expandAriaLabel}>+</SmallCircleButton>
          </div>
        </div>
        {sheet}
      </>
    )
  }

  // === Expanded: full card. Action buttons sit absolutely positioned in the
  // top-right corner so they don't nest inside the <Link> (invalid HTML). The
  // Link gets right padding so the title/meta don't run under the buttons. ===
  return (
    <>
      <div className="px-4 pt-2">
        <div className="relative rounded-[20px]" style={cardStyle}>
          <Link
            href={href}
            className="block no-underline"
            style={{ color: 'var(--ink)', padding: '16px 80px 16px 20px' }}
            aria-label={single ? tr.singleAriaLabel.replace('{name}', single.name) : tr.multipleAriaLabel.replace('{count}', String(trips.length))}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block rounded-full shrink-0"
                style={{ width: 8, height: 8, background: 'var(--accent)' }}
              />
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {tr.kicker}
              </div>
            </div>

            <div
              className="mt-1.5 text-sm leading-relaxed truncate"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}
            >
              {single ? single.name : tr.multipleHeading.replace('{count}', String(trips.length))}
            </div>

            <div
              className="mt-2 flex items-center justify-between gap-2 text-xs"
              style={{ color: 'var(--ink-3)' }}
            >
              <span className="truncate">
                {single ? formatSingleMeta(single, tr) : tr.multipleCta}
              </span>
              <span aria-hidden>›</span>
            </div>
          </Link>
          <div className="absolute flex items-center gap-1.5" style={{ top: 12, right: 14 }}>
            <SmallCircleButton onClick={() => setSheetOpen(true)} ariaLabel={tr.addAriaLabel} filled>✈</SmallCircleButton>
            <SmallCircleButton onClick={toggleCollapsed} ariaLabel={tr.collapseAriaLabel}>−</SmallCircleButton>
          </div>
        </div>
      </div>
      {sheet}
    </>
  )
}

function SmallCircleButton({
  children,
  onClick,
  ariaLabel,
  filled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
  filled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="shrink-0 inline-flex items-center justify-center rounded-full cursor-pointer"
      style={{
        width: 28,
        height: 28,
        border: '1px solid var(--hairline)',
        background: filled ? 'var(--surface)' : 'transparent',
        color: 'var(--ink-2)',
        fontSize: 13,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function formatSingleMeta(
  trip: ActiveTripBannerTrip,
  tr: { singleStartedAt: string; singleStartedAtWithCurrency: string },
): string {
  if (trip.defaultCurrency) {
    return tr.singleStartedAtWithCurrency
      .replace('{date}', trip.startDate)
      .replace('{currency}', currencySymbol(trip.defaultCurrency))
  }
  return tr.singleStartedAt.replace('{date}', trip.startDate)
}
