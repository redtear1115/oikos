'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'
import { TripSheet } from './TripSheet'
import type { CurrencyCode } from '@/lib/currency'

type Trip = {
  id: string
  name: string
  startDate: string
  endDate: string | null
  // v0.17.4 #410: free-text since trip currencies are user-defined per trip.
  defaultCurrency: string | null
  status: 'active' | 'ended' | 'archived'
}

export function TripList(props: { trips: Trip[]; baseCurrency: CurrencyCode }) {
  const router = useRouter()
  const t = useTranslations()
  const { isPast } = useMember()
  const [open, setOpen] = useState(false)
  const active = props.trips.filter(t => t.status === 'active')
  const past = props.trips.filter(t => t.status !== 'active')

  const handleSaved = () => router.refresh()

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <SubpageHeader title={t.settings.trips} backLabel={t.common.back} />

      <div className="px-5 pt-6 pb-4">
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          一趟一趟收下來，這段路就有自己的章節。
        </p>
      </div>

      {props.trips.length === 0 ? (
        <TripsEmptyState />
      ) : (
        <div className="px-4 flex flex-col gap-6">
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label="進行中" dotColor="var(--accent)" />
              <TripGroup trips={active} variant="active" />
            </section>
          )}

          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label="過去的旅行" dotColor="var(--ink-3)" />
              <TripGroup trips={past} variant="past" />
            </section>
          )}
        </div>
      )}

      <BottomNav
        onAddClick={() => setOpen(true)}
        hideFab={open || isPast}
        fabVariant="accent"
      />

      <TripSheet
        open={open}
        baseCurrency={props.baseCurrency}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

function SectionLabel({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        aria-hidden="true"
        className="inline-block rounded-full shrink-0"
        style={{ width: 8, height: 8, background: dotColor }}
      />
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--fs-button)',
          fontWeight: 500,
          color: 'var(--ink)',
          letterSpacing: '-0.2px',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function TripGroup({ trips, variant }: { trips: Trip[]; variant: 'active' | 'past' }) {
  return (
    <div
      className="rounded-[20px] overflow-hidden"
      style={{
        background: variant === 'past' ? 'transparent' : 'var(--surface)',
        border: '1px solid var(--hairline)',
      }}
    >
      {trips.map((t, i) => (
        <TripRow
          key={t.id}
          trip={t}
          variant={variant}
          isLast={i === trips.length - 1}
        />
      ))}
    </div>
  )
}

function TripRow({ trip, variant, isLast }: { trip: Trip; variant: 'active' | 'past'; isLast: boolean }) {
  const isPast = variant === 'past'
  const dateLabel = trip.endDate
    ? `${trip.startDate} – ${trip.endDate}`
    : `${trip.startDate} 起，進行中`

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="flex items-center justify-between gap-3 px-[14px] py-3.5 no-underline"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
        color: 'var(--ink)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: isPast ? 'var(--ink-2)' : 'var(--ink)' }}
        >
          {trip.name}
        </div>
        <div
          className="text-micro mt-0.5 flex items-center gap-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          <span>{dateLabel}</span>
          {isPast && (
            <>
              <span aria-hidden="true">·</span>
              <span>已結束</span>
            </>
          )}
        </div>
      </div>
      <svg
        width="8"
        height="13"
        viewBox="0 0 8 13"
        fill="none"
        aria-hidden="true"
        style={{ color: 'var(--ink-3)' }}
      >
        <path
          d="M1.5 1.5L6.5 6.5L1.5 11.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  )
}

function TripsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        aria-hidden="true"
      >
        {/* Simple "compass / path" illustration — a circle with a dotted route. */}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="var(--ink-3)" strokeWidth="1.4" opacity="0.6" />
          <path
            d="M8 14 L11 9 L14 13 L16 8"
            stroke="var(--ink-3)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
          <circle cx="8" cy="14" r="1.2" fill="var(--accent)" />
          <circle cx="16" cy="8" r="1.2" fill="var(--accent)" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>
        還沒有旅行紀錄
      </div>
      <div
        className="text-sm leading-relaxed"
        style={{ color: 'var(--ink-3)', maxWidth: 260 }}
      >
        建一趟旅行，這段日子裡的每筆支出，就會自動收進來，回來再一起翻。
      </div>
    </div>
  )
}
