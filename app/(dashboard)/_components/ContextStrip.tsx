'use client'

import { useEffect, useRef, useState } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useDelayedOnlineStatus } from '@/lib/hooks/useOnlineStatus'
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

/** How long the band stays on screen while it collapses away. Must match the
 *  0.5s of `.strip-fading` in globals.css — JS owns the unmount, CSS owns the
 *  motion, and if they drift the band either snaps out mid-collapse or leaves
 *  a collapsed 0px box behind. */
const OFFLINE_EXIT_MS = 500

/**
 * Unified contextual strip — renders at most one banner variant in priority order:
 *   1. offline   — device is offline, for everyone (#1206). The offline-pref
 *      only picks the copy: with it on the page may be the cached snapshot;
 *      with it off nothing is cached, so the cache wording would be false.
 *      Both edges are smoothed (#1244): the band waits out a short drop before
 *      appearing, and collapses rather than vanishing when the network returns.
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
  const isOnline = useDelayedOnlineStatus()

  // getOfflinePref reads localStorage, which is safe here because this is a
  // client component; we wrap in useState to avoid SSR mismatch.
  const [offlinePrefOn] = useState(() => getOfflinePref())

  const [tripCollapsed, setTripCollapsed] = useState(initialTripCollapsed)

  // Keep the offline band mounted for one collapse after the network returns,
  // so it folds away instead of popping the content below it upwards (#1244).
  // The lower-priority variants wait out that half second rather than sliding
  // in underneath a band that is still on screen — this strip renders one thing
  // at a time, and a reconnect is not the moment to break that.
  const [offlineExiting, setOfflineExiting] = useState(false)
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
      setOfflineExiting(false)
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    setOfflineExiting(true)
    const exitTimer = setTimeout(() => setOfflineExiting(false), OFFLINE_EXIT_MS)
    return () => clearTimeout(exitTimer)
  }, [isOnline])

  const handleTripToggle = () => {
    const next = !tripCollapsed
    writeBoolCookie(UI_PREF_COOKIE.tripCollapsed, next)
    setTripCollapsed(next)
  }

  // ─── Priority 1: offline ─────────────────────────────────────────────────
  // Used to be gated on offlinePrefOn, because the only copy described the
  // cache. That left everyone who never opened Settings with no signal at all
  // until a write failed (#1206).
  if (!isOnline || offlineExiting) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`px-5 py-2 text-sm${offlineExiting ? ' strip-fading' : ''}`}
        style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
      >
        {offlinePrefOn ? t.offlineBanner.text : t.offlineBanner.textNoCache}
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
            // Bare glyph, ~16px. The ::before pads the hit area to ~44px tall;
            // sideways it reaches only as far as the gap-3 / px-4 around it (#1197).
            className="relative text-base leading-none shrink-0 cursor-pointer bg-transparent border-none before:absolute before:-inset-y-3.5 before:-inset-x-3 before:content-['']"
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
            // Bare glyph, ~18px; ::before pads the hit area to ≥44px (#1197).
            className="relative text-lg leading-none shrink-0 cursor-pointer bg-transparent border-none before:absolute before:-inset-y-3.5 before:-inset-x-3 before:content-['']"
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
