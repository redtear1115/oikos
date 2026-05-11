'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { exitPastEpoch } from '@/actions/epoch-view'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  /** ISO timestamp string for the pinned epoch's start. */
  startedAt: string
  /** ISO timestamp string for the pinned epoch's end (always set when pinned). */
  endedAt: string
  locale: string
}

/**
 * Top-of-page banner that surfaces only when the past-epoch cookie is set.
 * One-tap exit returns the viewer to the current chapter (and refreshes the
 * page so the freshly-current data takes over).
 */
export function PastEpochBanner({ startedAt, endedAt, locale }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [pending, startTransition] = useTransition()

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  const handleExit = () => {
    startTransition(async () => {
      await exitPastEpoch()
      router.refresh()
    })
  }

  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2.5"
      style={{
        background: 'var(--ink)',
        color: 'var(--surface)',
      }}
      role="status"
    >
      <div className="text-xs leading-tight">
        {t.pastTimes.bannerHeading
          .replace('{start}', fmt(startedAt))
          .replace('{end}', fmt(endedAt))}
      </div>
      <button
        type="button"
        onClick={handleExit}
        disabled={pending}
        className="text-xs font-medium underline-offset-2 hover:underline cursor-pointer disabled:opacity-50"
        style={{ background: 'transparent', color: 'var(--surface)', border: 'none' }}
      >
        {t.pastTimes.bannerExitCta}
      </button>
    </div>
  )
}
