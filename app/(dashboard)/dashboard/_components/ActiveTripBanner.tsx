'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import { currencySymbol, type CurrencyCode } from '@/lib/currency'

export interface ActiveTripBannerTrip {
  id: string
  name: string
  defaultCurrency: CurrencyCode | null
  startDate: string  // 'YYYY-MM-DD'
}

interface Props {
  trips: ActiveTripBannerTrip[]
}

/**
 * Dashboard contextual surface for in-flight trips. Hidden when no trip is
 * active — settings stays the channel for create / browse past. When 1 trip is
 * active the whole card links into that trip; when N > 1 it links to /trips
 * for triage.
 */
export function ActiveTripBanner({ trips }: Props) {
  const t = useTranslations()
  if (trips.length === 0) return null

  const tr = t.dashboard.activeTripBanner
  const single = trips.length === 1 ? trips[0] : null
  const href = single ? `/trips/${single.id}` : '/trips'

  const cardStyle: React.CSSProperties = {
    background:
      'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--accent) 14%, var(--surface)) 100%)',
    border: '1px solid var(--hairline)',
    color: 'var(--ink)',
  }

  return (
    <div className="px-4 pt-2">
      <Link
        href={href}
        className="relative block rounded-[20px] px-5 py-4 no-underline"
        style={cardStyle}
        aria-label={single ? tr.singleAriaLabel.replace('{name}', single.name) : tr.multipleAriaLabel.replace('{count}', String(trips.length))}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
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
            {single
              ? formatSingleMeta(single, tr)
              : tr.multipleCta}
          </span>
          <span aria-hidden="true">›</span>
        </div>
      </Link>
    </div>
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
