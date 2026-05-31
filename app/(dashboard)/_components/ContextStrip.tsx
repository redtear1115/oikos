'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { getOfflinePref } from '@/lib/offline/preference'
import { exitPastEpoch } from '@/actions/epoch-view'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatDateShort } from '@/lib/format-date'
import type { ActiveTripBannerTrip } from '@/app/(dashboard)/dashboard/_components/ActiveTripBanner'
import { UI_PREF_COOKIE, writeBoolCookie } from '@/lib/uiPrefsCookie'

interface Props {
  activeTrips?: ActiveTripBannerTrip[]
  baseCurrency?: string
  /** Read from cookies server-side so SSR matches the client (avoids hydration mismatch). */
  initialPartnerDismissed: boolean
  initialTripCollapsed: boolean
}

/**
 * Unified contextual strip — renders at most one banner variant in priority order:
 *   1. offline   — device is offline AND offline-pref is on
 *   2. past-epoch — viewer is pinned to a past chapter
 *   3. partner-left — solo mode and the group previously had a partner
 *   4. active-trip — there are active trips (prop-driven)
 *
 * Renders nothing when none of the conditions apply.
 */
export function ContextStrip({
  activeTrips = [],
  baseCurrency,
  initialPartnerDismissed,
  initialTripCollapsed,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const { isPast, isSolo, hadPartner, epochStartedAt, epochEndedAt } = useMember()
  const isOnline = useOnlineStatus()

  // getOfflinePref reads localStorage, which is safe here because this is a
  // client component; we wrap in useState to avoid SSR mismatch.
  const [offlinePrefOn] = useState(() => getOfflinePref())

  const [partnerDismissed, setPartnerDismissed] = useState(initialPartnerDismissed)
  const [tripCollapsed, setTripCollapsed] = useState(initialTripCollapsed)

  const [pending, startTransition] = useTransition()

  const handleExitPastEpoch = () => {
    startTransition(async () => {
      try {
        await exitPastEpoch()
        router.refresh()
      } catch {
        // action can throw on network failure; pending state clears automatically
      }
    })
  }

  const handleDismissPartner = () => {
    writeBoolCookie(UI_PREF_COOKIE.partnerLeftDismissed, true)
    setPartnerDismissed(true)
  }

  const handleTripToggle = () => {
    const next = !tripCollapsed
    writeBoolCookie(UI_PREF_COOKIE.tripCollapsed, next)
    setTripCollapsed(next)
  }

  const showPartnerLeft = isSolo && hadPartner && !partnerDismissed

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
  if (isPast) {
    const fmt = (iso: string) => formatDateShort(iso, locale, { withYear: true })
    const startLabel = epochStartedAt ? fmt(epochStartedAt) : ''
    const endLabel = epochEndedAt ? fmt(epochEndedAt) : ''

    return (
      <div
        className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ background: 'var(--ink)', color: 'var(--surface)' }}
        role="status"
      >
        <div className="text-xs leading-tight">
          {t.pastTimes.bannerHeading
            .replace('{start}', startLabel)
            .replace('{end}', endLabel)}
        </div>
        <button
          type="button"
          onClick={handleExitPastEpoch}
          disabled={pending}
          className="text-xs font-medium underline-offset-2 hover:underline cursor-pointer disabled:opacity-50 shrink-0"
          style={{ background: 'transparent', color: 'var(--surface)', border: 'none' }}
        >
          {t.pastTimes.bannerExitCta}
        </button>
      </div>
    )
  }

  // ─── Priority 3: partner-left ─────────────────────────────────────────────
  if (showPartnerLeft) {
    return (
      <div
        className="mx-5 my-2 rounded-2xl flex items-start justify-between gap-3 px-4 py-3 text-sm"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink)',
          color: 'var(--ink)',
        }}
        role="status"
      >
        <span>{t.contextStrip.partnerLeftLine}</span>
        <button
          type="button"
          onClick={handleDismissPartner}
          aria-label="dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    )
  }

  // ─── Priority 4: active-trip ──────────────────────────────────────────────
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
