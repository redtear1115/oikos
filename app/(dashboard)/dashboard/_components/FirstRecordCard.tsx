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
 * localStorage flag `oikos_first_record_card_seen_{userId}` is set while the
 * card is visible and cleared on dismiss — a session-local "I've seen this
 * one" mark. The DB-side `isFirstTransaction` count is the actual gate; the
 * flag is just defensive bookkeeping for the brief window the card is up.
 *
 * Cross-device + cross-user is handled entirely by the per-user paid_by count
 * in createTransaction — once a user has > 1 row, the action stops returning
 * isFirstTransaction=true and the card simply never lights again.
 *
 * Non-blocking: sits above BottomNav at bottom: 96 so the rest of the UI
 * stays interactive.
 */
export function FirstRecordCard({ show, onDismiss }: Props) {
  const t = useTranslations()
  const { viewer } = useMember()
  const storageKey = `${STORAGE_KEY_PREFIX}${viewer.id}`

  useEffect(() => {
    if (!show || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, 'true')
  }, [show, storageKey])

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey)
    }
    onDismiss()
  }

  if (!show) return null

  return (
    <div
      className="fixed left-1/2 z-floating w-full max-w-md -translate-x-1/2 px-4"
      style={{ bottom: 96 }}
      role="status"
      aria-live="polite"
    >
      <div
        className="relative rounded-card px-5 pt-5 pb-4"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
        }}
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t.firstRecordCard.closeAriaLabel}
          className="absolute right-3 top-2 bg-transparent border-0 cursor-pointer p-1 text-title leading-none rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--ink-3)', outlineColor: 'var(--accent)' }}
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
          onClick={handleDismiss}
          className="w-full h-[42px] rounded-xl border-0 font-medium text-sm tracking-[0.3px] cursor-pointer"
          style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          {t.firstRecordCard.dismiss}
        </button>
      </div>
    </div>
  )
}
