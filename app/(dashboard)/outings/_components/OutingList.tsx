'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { track } from '@/lib/analytics/track'
import type { OutingListRow } from '@/lib/db/queries/outing'
import { OutingSheet } from './OutingSheet'

/** 我參與的出遊 row (#1558): another ledger's outing; opens the public page. */
export interface ParticipatingOuting {
  id: string
  name: string
  ended: boolean
  /** `/<locale>/outing/r/<outingId>` */
  href: string
}

export function OutingList({ outings, participating = [] }: { outings: OutingListRow[]; participating?: ParticipatingOuting[] }) {
  const router = useRouter()
  const t = useTranslations()
  const tl = t.outingList
  const { isPast } = useMember()
  const [open, setOpen] = useState(false)
  const active = outings.filter((o) => o.status === 'active')
  const past = outings.filter((o) => o.status !== 'active')

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <SubpageHeader title={tl.title} backLabel={t.common.back} />

      <div className="px-5 pt-6 pb-4">
        <p className="text-sm text-ink-3">{tl.subtitle}</p>
      </div>

      {outings.length === 0 ? (
        <OutingsEmptyState />
      ) : (
        <div className="px-4 flex flex-col gap-6">
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label={tl.sectionActive} dotColor="var(--accent)" />
              <OutingGroup outings={active} variant="active" />
            </section>
          )}
          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label={tl.sectionPast} dotColor="var(--ink-3)" />
              <OutingGroup outings={past} variant="past" />
            </section>
          )}
        </div>
      )}

      {participating.length > 0 && (
        <section className="px-4 pt-6 flex flex-col gap-3" aria-labelledby="outings-participating">
          <div id="outings-participating">
            <SectionLabel label={tl.participating.title} dotColor="var(--ink-3)" />
          </div>
          <p className="text-xs px-1 text-ink-3">{tl.participating.hint}</p>
          <div className="rounded-card overflow-hidden border border-hairline bg-surface">
            {participating.map((o, i) => (
              <ParticipatingRow key={o.id} outing={o} isLast={i === participating.length - 1} />
            ))}
          </div>
        </section>
      )}

      <BottomNav
        onAddClick={() => setOpen(true)}
        hideFab={open || isPast}
        fabVariant="accent"
      />

      <OutingSheet open={open} onClose={() => setOpen(false)} onSaved={() => router.refresh()} />
    </div>
  )
}

function SectionLabel({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        aria-hidden="true"
        className="inline-block rounded-full shrink-0 w-2 h-2"
        style={{ background: dotColor }}
      />
      <div
        className="text-base font-medium font-serif text-ink"
        style={{ letterSpacing: '-0.2px' }}
      >
        {label}
      </div>
    </div>
  )
}

function OutingGroup({ outings, variant }: { outings: OutingListRow[]; variant: 'active' | 'past' }) {
  return (
    <div
      className="rounded-card overflow-hidden border border-hairline"
      style={{
        background: variant === 'past' ? 'transparent' : 'var(--surface)',
      }}
    >
      {outings.map((o, i) => (
        <OutingRow key={o.id} outing={o} variant={variant} isLast={i === outings.length - 1} />
      ))}
    </div>
  )
}

function OutingRow({ outing, variant, isLast }: { outing: OutingListRow; variant: 'active' | 'past'; isLast: boolean }) {
  const t = useTranslations()
  const tl = t.outingList
  const isPast = variant === 'past'
  const countLabel = tl.countTag.replace('{count}', String(outing.participantCount))

  return (
    <Link
      href={`/outings/${outing.id}`}
      className="flex items-center justify-between gap-3 px-3.5 py-3.5 no-underline text-ink"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: isPast ? 'var(--ink-2)' : 'var(--ink)' }}>
          {outing.name}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1.5 text-ink-3">
          <span>{countLabel}</span>
          {isPast && (
            <>
              <span aria-hidden="true">·</span>
              <span>{tl.endedTag}</span>
            </>
          )}
        </div>
      </div>
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="text-ink-3">
        <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

function ParticipatingRow({ outing, isLast }: { outing: ParticipatingOuting; isLast: boolean }) {
  const t = useTranslations()
  const tl = t.outingList
  return (
    // A plain <a>: the target is a public locale route outside the dashboard
    // shell, so a client-side transition would buy nothing.
    <a
      href={outing.href}
      className={`flex items-center justify-between gap-3 px-3.5 py-3.5 no-underline text-ink ${isLast ? '' : 'border-b border-hairline'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{outing.name}</div>
        {outing.ended && <div className="text-xs mt-0.5 text-ink-3">{tl.endedTag}</div>}
      </div>
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="text-ink-3">
        <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

function OutingsEmptyState() {
  const t = useTranslations()
  const tl = t.outingList
  const locale = useLocale()
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-surface border border-hairline"
        aria-hidden="true"
      >
        {/* Three small points of light gathered — "a group". */}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="8" cy="9" r="2.4" stroke="var(--ink-3)" strokeWidth="1.4" opacity="0.7" />
          <circle cx="16" cy="9" r="2.4" stroke="var(--ink-3)" strokeWidth="1.4" opacity="0.7" />
          <path d="M5 17c0-2.2 2.2-3.6 4.2-3.6M19 17c0-2.2-2.2-3.6-4.2-3.6" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
          <circle cx="12" cy="13" r="1.3" fill="var(--accent)" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2 text-ink">{tl.empty.heading}</div>
      <div className="text-sm leading-relaxed text-ink-3 max-w-65">{tl.empty.body}</div>
      <Link
        href={`/${locale}/features/outing`}
        className="mt-3 inline-flex items-center min-h-11 text-sm underline text-ink-3"
        onClick={() => track('feature_outing_link_clicked', { source: 'outings_empty' })}
      >
        {t.featureOuting.entries.emptyLink}
      </Link>
    </div>
  )
}
