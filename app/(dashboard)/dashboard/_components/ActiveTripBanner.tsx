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
 *   - 1+ trips expanded → full card with kicker + name + meta, ✈ add-trip
 *     and − collapse buttons in the top-right; chevron on the right edge
 *     anchored to the bottom.
 *   - 1+ trips collapsed → single row with dot + name (or "{N} trips"), ✈ and
 *     + expand on the right.
 *
 * Buttons sit at a stable Y position across expand/collapse: expanded card's
 * top padding (12px) + absolute `top: 12` for the cluster matches collapsed
 * card's `items-center` row at the same 12px top padding, so toggling doesn't
 * visibly move the controls.
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

  // === Empty state — no longer rendered (CTA moved to BrandHeader plane button) ===
  if (trips.length === 0) return null

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
    // === Collapsed: single row, buttons inline on the right ===
    const collapsedText = single
      ? single.name
      : tr.multipleHeading.replace('{count}', String(trips.length))
    return (
      <>
        <div className="px-4 pt-2">
          <div
            className="flex items-center gap-2.5 rounded-card"
            style={{ ...cardStyle, padding: '12px 14px 12px 16px' }}
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
              <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 16, lineHeight: 1, fontWeight: 400 }}>›</span>
            </Link>
            <SmallCircleButton onClick={() => setSheetOpen(true)} ariaLabel={tr.addAriaLabel}>
              <PlaneIcon />
            </SmallCircleButton>
            <SmallCircleButton onClick={toggleCollapsed} ariaLabel={tr.expandAriaLabel}>+</SmallCircleButton>
          </div>
        </div>
        {sheet}
      </>
    )
  }

  // === Expanded: two columns inside the Link (main + chevron), buttons
  // absolute-positioned in the top-right corner so they don't nest inside the
  // <Link> (invalid HTML). Chevron lives in its own right-edge column,
  // vertically anchored to the bottom so it doesn't clash with the buttons
  // above. ===
  return (
    <>
      <div className="px-4 pt-2">
        <div className="relative rounded-card" style={cardStyle}>
          <Link
            href={href}
            className="flex items-stretch no-underline"
            style={{ color: 'var(--ink)' }}
            aria-label={single ? tr.singleAriaLabel.replace('{name}', single.name) : tr.multipleAriaLabel.replace('{count}', String(trips.length))}
          >
            <div className="flex-1 min-w-0" style={{ padding: '12px 4px 14px 20px' }}>
              {/* Right padding inside the main column leaves room under the
                  absolute buttons so the title doesn't run beneath them. */}
              <div className="flex items-center gap-2" style={{ paddingRight: 70 }}>
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
              <div className="mt-1.5 text-xs truncate" style={{ color: 'var(--ink-3)' }}>
                {single ? formatSingleMeta(single, tr) : tr.multipleCta}
              </div>
            </div>
            <div className="flex items-end" style={{ paddingRight: 16, paddingBottom: 12 }}>
              <span
                aria-hidden
                style={{
                  fontSize: 22,
                  lineHeight: 1,
                  color: 'var(--ink-2)',
                  fontWeight: 300,
                  display: 'inline-block',
                  transform: 'translateY(2px)',
                }}
              >
                ›
              </span>
            </div>
          </Link>
          <div className="absolute flex items-center gap-1.5" style={{ top: 12, right: 14 }}>
            <SmallCircleButton onClick={() => setSheetOpen(true)} ariaLabel={tr.addAriaLabel}>
              <PlaneIcon />
            </SmallCircleButton>
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
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
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
        background: 'transparent',
        color: 'var(--ink-2)',
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

/** Lucide `Plane` icon — angled airliner outline. Crisp at small sizes vs
 *  the Unicode ✈ which renders thin and unrecognisable in 28px circles
 *  across iOS / Android browsers. */
function PlaneIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
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
