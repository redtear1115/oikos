'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { endTrip } from '@/actions/trip'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  open: boolean
  tripId: string
  startDate: string
  suggestedEndDate: string
  onClose: () => void
}

/**
 * Mini-sheet for ending a trip — destructive action since it's irreversible
 * (a summary CashTransaction is written and the trip transitions to `ended`).
 *
 * Previously embedded at the bottom of TripDetailClient.tsx; lifted out as a
 * sibling so the parent file focuses on per-currency aggregation and the
 * mini-form lives next to the action it wraps.
 */
export function EndTripSheet({ open, tripId, startDate, suggestedEndDate, onClose }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [endDate, setEndDate] = useState(suggestedEndDate)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setEndDate(suggestedEndDate)
    setErr(null)
  }, [open, suggestedEndDate])

  const dateInvalid = endDate < startDate
  const canSave = !dateInvalid && !pending

  function submit() {
    if (!canSave) return
    setErr(null)
    start(async () => {
      try {
        await endTrip({ tripId, endDate })
        onClose()
        router.refresh()
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : t.tripDetail.endFailure)
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={t.tripDetail.endTitle}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={t.tripDetail.endConfirm}
      error={err ?? ''}
      onClose={onClose}
      onSave={submit}
      destructive
    >
      <div className="flex flex-col gap-3">
        <div
          className="rounded-xl px-3 py-2.5 text-sm leading-relaxed"
          style={{
            background: 'var(--debit-soft)',
            color: 'var(--destructive)',
          }}
          role="alert"
        >
          {t.tripDetail.endIrreversibleNote}
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t.tripDetail.endBody}
        </p>

        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.tripDetail.endDateLabel}</span>
          <input
            type="date"
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: dateInvalid ? '1px solid var(--debit, #c0392b)' : '1px solid var(--hairline)',
              color: 'var(--ink)',
            }}
            min={startDate}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </label>

        {dateInvalid && (
          <p className="text-xs" style={{ color: 'var(--debit, #c0392b)' }}>
            {t.tripDetail.endDateBeforeStart.replace('{date}', startDate)}
          </p>
        )}
      </div>
    </SheetShell>
  )
}
