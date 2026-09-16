'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { exitPastEpoch } from '@/actions/epoch-view'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatDateShort } from '@/lib/format-date'
import { unwrapAction } from '@/lib/action-errors'

/**
 * "You are reading a past chapter" band, with the way back out of it.
 *
 * Used to be the second branch of ContextStrip, rendered below BrandHeader on
 * /dashboard and nowhere else. It moved into the shell top stack (#1037) for
 * two reasons:
 *
 * - Being pinned to a past epoch is a viewer-wide state, not a dashboard one.
 *   /records, /stats and the rest were already showing frozen history with no
 *   band saying so and no way back.
 * - Underneath BrandHeader it could never get the status-bar inset right. The
 *   header above it paid the inset while scrolled to the top, this bar paid it
 *   again once pinned, and CSS has no cross-browser "am I stuck right now"
 *   test — so it either double-paid (~37px of extra dark bar, #1035) or slid
 *   under the notch. In the stack it is a shell band like any other: pays the
 *   inset when it is first, pays nothing when a strip is above it.
 *
 * Deliberately not `.shell-top-strip`: this is the app talking about the
 * viewer's own navigation state, not an operational notice, and it keeps the
 * tighter 10px band it has always had.
 */
export function PastChapterBar() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const { isPast, epochStartedAt, epochEndedAt } = useMember()
  const [pending, startTransition] = useTransition()

  if (!isPast) return null

  const fmt = (iso: string) => formatDateShort(iso, locale, { withYear: true })
  const startLabel = epochStartedAt ? fmt(epochStartedAt) : ''
  const endLabel = epochEndedAt ? fmt(epochEndedAt) : ''

  const handleExitPastEpoch = () => {
    startTransition(async () => {
      try {
        unwrapAction(await exitPastEpoch())
        router.refresh()
      } catch {
        // action can throw on network failure; pending state clears automatically
      }
    })
  }

  return (
    // 10px = the py-2.5 baseline this bar has always had; it only grows past
    // that when it is the first thing in the stack on a notched device.
    <div
      className="flex items-center justify-between gap-3 px-4 pt-[max(var(--safe-top),10px)] pb-2.5"
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
