'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { unwrapAction, type ActionResult } from '@/lib/action-errors'

export interface PendingCardProps {
  /** Resolved category — supplies the icon monogram and the tint/ink colors. */
  cat: { tint: string; ink: string; mono: string }
  /** Alpha suffix on the card's gradient tint (e.g. '45' expense, '30' income). */
  gradientAlpha: string
  /** Primary heading line (description / source). */
  title: string
  /** Proposed occurrence date. */
  date: string
  /** Proposed amount in base-currency integer units. */
  amount: number
  /** Optional payer/split line — only the expense card renders this. */
  meta?: string
  confirmLabel: string
  editLabel: string
  skipLabel: string
  /** disabled-state utility classes for the primary / secondary buttons —
   *  parametrized because the two cards historically diverged here. */
  primaryDisabledClass: string
  secondaryDisabledClass: string
  /**
   * Mutating server action behind the primary (confirm) button. Typed as the
   * raw `ActionResult` rather than `Promise<unknown>` so that a caller which
   * forgets to surface an expected failure cannot type-check (#1223) — with
   * `unknown` the failure object was simply dropped and the card faded out as
   * if the write had succeeded.
   */
  onConfirm: () => Promise<ActionResult<unknown>>
  /** Mutating server action behind skip. Same contract as `onConfirm`. */
  onSkip: () => Promise<ActionResult<unknown>>
  confirmErrorFallback: string
  skipErrorFallback: string
  skipModalTitle: string
  skipModalDescription?: string
  onEdit?: () => void
}

/**
 * Shared chrome + lifecycle for a pending recurring-occurrence card: the
 * confirm/skip server-action flow (optimistic fade + delayed refresh), error
 * surface, and the icon / title / amount / 3-button layout. The expense and
 * income variants are thin wrappers that resolve their category and copy and
 * delegate here (#897).
 */
export function PendingCard({
  cat,
  gradientAlpha,
  title,
  date,
  amount,
  meta,
  confirmLabel,
  editLabel,
  skipLabel,
  primaryDisabledClass,
  secondaryDisabledClass,
  onConfirm,
  onSkip,
  confirmErrorFallback,
  skipErrorFallback,
  skipModalTitle,
  skipModalDescription,
  onEdit,
}: PendingCardProps) {
  const router = useRouter()
  const t = useTranslations()
  const [submitting, startTransition] = useTransition()
  const [fading, setFading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingSkip, setConfirmingSkip] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  const handleConfirm = () => startTransition(async () => {
    try {
      unwrapAction(await onConfirm())
      setFading(true)
      refreshTimerRef.current = setTimeout(() => router.refresh(), 800)
    } catch (e) {
      setError(describeError(e, confirmErrorFallback, t.common.offlineError, t.errors.actions))
    }
  })

  const performSkip = () => {
    setConfirmingSkip(false)
    startTransition(async () => {
      try {
        unwrapAction(await onSkip())
        setFading(true)
        refreshTimerRef.current = setTimeout(() => router.refresh(), 800)
      } catch (e) {
        setError(describeError(e, skipErrorFallback, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <>
      <div
        className="rounded-2xl p-4 transition-opacity duration-700"
        style={{
          background: `linear-gradient(135deg, ${cat.tint}${gradientAlpha}, transparent)`,
          border: `1px solid ${cat.ink}20`,
          opacity: fading ? 0 : 1,
        }}
      >
        <div className="mb-3 flex items-start gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-full text-[var(--fs-base)]"
            style={{ background: cat.tint, color: cat.ink }}
          >
            {cat.mono}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[var(--fs-base)] font-medium" style={{ color: 'var(--ink)' }}>
              {title}
            </div>
            <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
              {date}
            </div>
            {/* TODO(v0.17 currency): "NT$ {amount}" with space — design-driven,
                 defer to design before migrating to formatAmount (which has no space). */}
            <div className="mt-1 text-title font-medium" style={{ color: 'var(--ink)' }}>
              NT$ {amount.toLocaleString()}
            </div>
            {meta && (
              <div className="mt-1 text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
                {meta}
              </div>
            )}
          </div>
        </div>

        {error && (
          // Error surface per DESIGN.md: --debit-text on --debit-soft. The
          // translucent tint sits on an opaque --surface so the ratio (~5.2:1)
          // doesn't depend on the category gradient behind the card. Was
          // white on --debit, 3.27:1 (#1197 / #1168).
          <div role="alert" className="mb-3 rounded-xl bg-[var(--surface)]">
            <div className="rounded-xl px-3 py-2 text-[var(--fs-sm)] bg-[var(--debit-soft)] text-[var(--debit-text)]">
              {error}
            </div>
          </div>
        )}

        {/* Buttons render ~36px tall; the ::before adds 4px above and below
            so each hit area reaches 44px without changing the layout (#147). */}
        <div className="flex gap-2">
          <button
            type="button" onClick={handleConfirm} disabled={submitting}
            className={`relative flex-1 rounded-full py-2 text-[var(--fs-sm)] before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] ${primaryDisabledClass}`}
            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={submitting || !onEdit}
            className={`relative rounded-full px-4 py-2 text-[var(--fs-sm)] before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] ${secondaryDisabledClass}`}
            style={{ border: `1px solid ${cat.ink}40`, color: 'var(--ink-2)', background: 'transparent' }}
          >
            {editLabel}
          </button>
          <button
            type="button" onClick={() => setConfirmingSkip(true)} disabled={submitting}
            className={`relative rounded-full px-4 py-2 text-[var(--fs-sm)] before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] ${secondaryDisabledClass}`}
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
          >
            {skipLabel}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmingSkip}
        title={skipModalTitle}
        description={skipModalDescription}
        confirmLabel={skipLabel}
        pending={submitting}
        onCancel={() => setConfirmingSkip(false)}
        onConfirm={performSkip}
      />
    </>
  )
}
