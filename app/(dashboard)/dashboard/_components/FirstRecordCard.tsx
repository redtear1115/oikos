'use client'

import { useEffect } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'

const STORAGE_KEY_PREFIX = 'oikos_first_record_card_seen_'

interface Props {
  show: boolean
  onDismiss: () => void
}

/**
 * Phase C of issue #43. Lit by Dashboard's `showFirstCard` state, which flips
 * true when the most recent createTransaction reported isFirstTransaction.
 *
 * Refresh-safety: on first render with show=true, immediately set a per-user
 * localStorage flag (oikos_first_record_card_seen_{userId}). If `show` flips
 * true again later (e.g., user deleted their first row and recreated, server
 * reports isFirstTransaction again) AND the flag is already set, we call
 * onDismiss right away so the parent state flips back and we never re-render.
 *
 * Non-blocking: sits above BottomNav at bottom: 96 so the rest of the UI
 * stays interactive.
 */
export function FirstRecordCard({ show, onDismiss }: Props) {
  const t = useTranslations()
  const { viewer } = useMember()
  const storageKey = `${STORAGE_KEY_PREFIX}${viewer.id}`

  useEffect(() => {
    if (!show) return
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(storageKey) === 'true') {
      // User has already seen the card on this device — bail out.
      onDismiss()
      return
    }
    window.localStorage.setItem(storageKey, 'true')
  }, [show, storageKey, onDismiss])

  if (!show) return null

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
          onClick={onDismiss}
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
          onClick={onDismiss}
          className="w-full h-[42px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer"
          style={{ background: 'var(--ink)' }}
        >
          {t.firstRecordCard.dismiss}
        </button>
      </div>
    </div>
  )
}
