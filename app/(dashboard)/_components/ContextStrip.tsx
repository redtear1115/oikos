'use client'

import { useState } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { getOfflinePref } from '@/lib/offline/preference'
import { useTranslations } from '@/lib/i18n/client'
import type { ActiveTripBannerTrip } from '@/app/(dashboard)/dashboard/_components/ActiveTripBanner'
import { UI_PREF_COOKIE, writeBoolCookie } from '@/lib/uiPrefsCookie'

interface Props {
  activeTrips?: ActiveTripBannerTrip[]
  baseCurrency?: string
  /** Read from cookies server-side so SSR matches the client (avoids hydration mismatch). */
  initialTripCollapsed: boolean
}

/**
 * Unified contextual strip — renders at most one banner variant in priority order:
 *   1. offline   — device is offline AND offline-pref is on
 *   2. past-epoch — viewer is pinned to a past chapter; the band itself moved to
 *      the shell top stack (`PastChapterBar`, #1037), only the suppression of
 *      everything below it is still decided here
 *   3. active-trip — there are active trips (prop-driven)
 *
 * There used to be a partner-left variant between past-epoch and active-trip.
 * It was removed with #1119: `hadPartner` was derived from the *current*
 * `member_b` column, which is null in exactly the state the banner was built
 * to detect, so the branch was unreachable. It is not coming back as a fixed
 * derivation either — a solo ledger is one steady state however it was
 * reached (see `pastTimes.currentChapterSolo`「現在 · 一個人」), and the
 * difference between "partner left" and "always solo" belongs to the one-shot
 * arrival cards (`PartnerLeftCard` / `WelcomeSoloCard`), not to the shell.
 *
 * Nothing in here pins to the top any more. Anything that wants the top of the
 * viewport belongs in the shell top stack, which is the only element that can
 * guarantee it does not land on top of another one.
 *
 * Renders nothing when none of the conditions apply.
 */
export function ContextStrip({
  activeTrips = [],
  baseCurrency,
  initialTripCollapsed,
}: Props) {
  const t = useTranslations()
  const { isPast } = useMember()
  const isOnline = useOnlineStatus()

  // getOfflinePref reads localStorage, which is safe here because this is a
  // client component; we wrap in useState to avoid SSR mismatch.
  const [offlinePrefOn] = useState(() => getOfflinePref())

  const [tripCollapsed, setTripCollapsed] = useState(initialTripCollapsed)

  const handleTripToggle = () => {
    const next = !tripCollapsed
    writeBoolCookie(UI_PREF_COOKIE.tripCollapsed, next)
    setTripCollapsed(next)
  }

  // ─── Priority 1: offline ─────────────────────────────────────────────────
  if (offlinePrefOn && !isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="px-5 py-2 text-sm"
        style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
      >
        {t.offlineBanner.text}
      </div>
    )
  }

  // ─── Priority 2: past-epoch ───────────────────────────────────────────────
  // The band itself now lives in the shell top stack (`PastChapterBar`, #1037)
  // so it is pinned on every dashboard page instead of only this one. What stays
  // here is the suppression it always implied: in a frozen chapter there is
  // nothing to invite a partner into and no trip to be in the middle of, so the
  // lower-priority variants still do not render.
  //
  // #1035 had just taught this bar to call the status-bar inset itself, because
  // while pinned it was the topmost element and CSS has no "am I stuck" test.
  // Moving it into the permanently-pinned stack removes that question rather
  // than answering it, so the bar now reads --safe-top instead: same 10px
  // baseline, inset paid only when nothing is above it. The markup is otherwise
  // carried over unchanged.
  if (isPast) return null

  // ─── Priority 3: active-trip ──────────────────────────────────────────────
  if (activeTrips.length > 0) {
    const trip = activeTrips[0]
    const tripCurrency = trip.defaultCurrency ?? baseCurrency ?? null

    if (tripCollapsed) {
      return (
        <div
          className="mx-5 my-2 flex items-center justify-between rounded-full px-4 py-2 text-sm gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="inline-block rounded-full shrink-0"
              style={{ width: 8, height: 8, background: 'var(--accent)' }}
            />
            <span className="truncate" style={{ color: 'var(--ink)' }}>
              {trip.name}
            </span>
            {tripCurrency && (
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>· {tripCurrency}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleTripToggle}
            aria-label={t.dashboard.activeTripBanner.expandAriaLabel}
            className="text-base leading-none shrink-0 cursor-pointer bg-transparent border-none"
            style={{ color: 'var(--ink-2)' }}
          >
            ›
          </button>
        </div>
      )
    }

    return (
      <div
        className="mx-5 my-2 rounded-2xl px-4 py-3 flex flex-col gap-1 text-sm"
        style={{
          background:
            'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--accent) 14%, var(--surface)) 100%)',
          border: '1px solid var(--hairline)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block rounded-full shrink-0"
              style={{ width: 8, height: 8, background: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {t.dashboard.activeTripBanner.kicker}
            </span>
          </div>
          <button
            type="button"
            onClick={handleTripToggle}
            aria-label={t.dashboard.activeTripBanner.collapseAriaLabel}
            className="text-[18px] leading-none shrink-0 cursor-pointer bg-transparent border-none"
            style={{ color: 'var(--ink-3)' }}
          >
            −
          </button>
        </div>
        <div
          className="mt-1 text-sm leading-relaxed truncate"
          style={{ color: 'var(--ink)', fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}
        >
          {trip.name}
        </div>
        {trip.startDate && (
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {trip.startDate}
            {tripCurrency ? ` · ${tripCurrency}` : ''}
          </div>
        )}
      </div>
    )
  }

  return null
}
