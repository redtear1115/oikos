'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeEvents } from './RealtimeProvider'
import { useMember } from './MemberContext'
import { useTranslations } from '@/lib/i18n/client'
import type { RealtimeEvent } from '@/lib/realtime/event'

const TOAST_DURATION_MS = 3000

/**
 * Brief, non-blocking awareness toast when the *partner* adds a record in
 * realtime. The two-person live signal is the core differentiator, but the feed
 * only flashes a row that may be off-screen — so surface a top toast too.
 *
 * Self-contained mini-toast (no shared toast system): the dashboard's success
 * toast is reducer-scoped to that page, while this needs to fire on every
 * dashboard route. Filters on `paidBy` / `recipientId` (the only "who" signal
 * the realtime payload carries — there is no created_by column) so the viewer's
 * own writes never toast. Soft-delete inserts (deletedAt set) are ignored.
 */
export function PartnerActivityToast() {
  const { viewer, partner, isSolo } = useMember()
  const t = useTranslations()
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    setMessage(msg)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  useRealtimeEvents(
    useCallback((event: RealtimeEvent) => {
      if (isSolo || !partner) return
      if (event.kind === 'txn-insert') {
        if (event.row.deletedAt || event.row.paidBy === viewer.id) return
        show(t.partnerToast.recordedExpense.replace('{name}', partner.displayName))
      } else if (event.kind === 'income-insert') {
        if (event.row.deletedAt || event.row.recipientId === viewer.id) return
        show(t.partnerToast.recordedIncome.replace('{name}', partner.displayName))
      }
    }, [isSolo, partner, viewer.id, t, show])
  )

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="partner-toast fixed left-1/2 top-4 z-top-toast w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white text-center shadow-lg"
      style={{ background: 'var(--ink)' }}
    >
      {message}
    </div>
  )
}
