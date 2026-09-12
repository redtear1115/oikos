'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'
import type { OutingListRow } from '@/lib/db/queries/outing'
import { OutingSheet } from './OutingSheet'

export function OutingList({ outings }: { outings: OutingListRow[] }) {
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
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{tl.subtitle}</p>
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
        className="inline-block rounded-full shrink-0"
        style={{ width: 8, height: 8, background: dotColor }}
      />
      <div
        className="text-base font-medium"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {label}
      </div>
    </div>
  )
}

function OutingGroup({ outings, variant }: { outings: OutingListRow[]; variant: 'active' | 'past' }) {
  return (
    <div
      className="rounded-card overflow-hidden"
      style={{
        background: variant === 'past' ? 'transparent' : 'var(--surface)',
        border: '1px solid var(--hairline)',
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
      className="flex items-center justify-between gap-3 px-3.5 py-3.5 no-underline"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--hairline)', color: 'var(--ink)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: isPast ? 'var(--ink-2)' : 'var(--ink)' }}>
          {outing.name}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
          <span>{countLabel}</span>
          {isPast && (
            <>
              <span aria-hidden="true">·</span>
              <span>{tl.endedTag}</span>
            </>
          )}
        </div>
      </div>
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
        <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

function OutingsEmptyState() {
  const t = useTranslations()
  const tl = t.outingList
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
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
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>{tl.empty.heading}</div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)', maxWidth: 260 }}>{tl.empty.body}</div>
    </div>
  )
}
