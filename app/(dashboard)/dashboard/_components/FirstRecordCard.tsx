'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  show: boolean
}

/**
 * Phase C of issue #43. Visible iff the group has exactly one active
 * CashTransaction. Naturally idempotent — disappears when the group adds a
 * second record. No persistence: dismissal is session-local; reload while
 * still at count==1 will re-show (acceptable; the user is still "at their
 * first record").
 *
 * Non-blocking: sits above BottomNav at bottom: 96 so the rest of the UI
 * stays interactive.
 */
export function FirstRecordCard({ show }: Props) {
  const t = useTranslations()
  const [dismissed, setDismissed] = useState(false)

  if (!show || dismissed) return null

  return (
    <div
      className="fixed left-1/2 z-[95] w-full max-w-md -translate-x-1/2 px-4"
      style={{ bottom: 96 }}
      role="status"
      aria-live="polite"
    >
      <div
        className="relative rounded-[20px] px-5 pt-5 pb-4"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
        }}
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t.firstRecordCard.closeAriaLabel}
          className="absolute right-3 top-2 bg-transparent border-0 cursor-pointer p-1 text-title leading-none"
          style={{ color: 'var(--ink-3)' }}
        >
          ×
        </button>
        <p
          className="text-base leading-relaxed pr-6 mb-4"
          style={{ color: 'var(--ink)' }}
        >
          {t.firstRecordCard.headline}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="w-full h-[42px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer"
          style={{ background: 'var(--ink)' }}
        >
          {t.firstRecordCard.dismiss}
        </button>
      </div>
    </div>
  )
}
