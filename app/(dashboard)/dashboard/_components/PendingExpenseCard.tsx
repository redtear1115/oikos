'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getCategory } from '@/lib/categories'
import { confirmPending, skipPending } from '@/actions/recurringExpense'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'
import type { PendingExpenseRow } from '@/lib/db/queries/recurringExpense'
import type { SplitType } from '@/lib/balance'

export interface PendingExpenseCardProps {
  pending: PendingExpenseRow
  onEdit?: (pending: PendingExpenseRow) => void
}

function splitLabel(split: SplitType, t: ReturnType<typeof useTranslations>): string {
  if (split === 'all_mine') return t.splitType.allMine
  if (split === 'all_theirs') return t.splitType.allPartners
  return t.splitType.even
}

export function PendingExpenseCard({ pending, onEdit }: PendingExpenseCardProps) {
  const router = useRouter()
  const t = useTranslations()
  const { viewer, partner, isSolo } = useMember()
  const [submitting, startTransition] = useTransition()
  const [fading, setFading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingSkip, setConfirmingSkip] = useState(false)
  const cat = getCategory(pending.category)

  const payerName = pending.proposedPaidBy === viewer.id
    ? t.common.you
    : (partner?.displayName ?? t.common.partner)

  const handleConfirm = () => startTransition(async () => {
    try {
      await confirmPending(pending.id)
      setFading(true)
      setTimeout(() => router.refresh(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.recurringExpense.errors.operationFailed)
    }
  })

  const performSkip = () => {
    setConfirmingSkip(false)
    startTransition(async () => {
      try {
        await skipPending(pending.id)
        setFading(true)
        setTimeout(() => router.refresh(), 800)
      } catch (e) {
        setError(e instanceof Error ? e.message : t.recurringExpense.errors.operationFailed)
      }
    })
  }

  const handleEditClick = () => onEdit?.(pending)

  return (
    <>
      <div
        className="rounded-2xl p-4 transition-opacity duration-700"
        style={{
          background: `linear-gradient(135deg, ${cat.tint}45, transparent)`,
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
              {pending.proposedDescription}
            </div>
            <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
              {pending.proposedDate}
            </div>
            <div className="mt-1 text-[var(--fs-2xl)] font-semibold" style={{ color: 'var(--ink)' }}>
              NT$ {pending.proposedAmount.toLocaleString()}
            </div>
            {!isSolo && (
              <div className="mt-1 text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
                {t.recurringExpense.pending.payerLine
                  .replace('{payer}', payerName)
                  .replace('{splitType}', splitLabel(pending.proposedSplitType, t))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            className="mb-3 rounded-xl px-3 py-2 text-[var(--fs-sm)] text-white"
            style={{ background: 'var(--debit)' }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button" onClick={handleConfirm} disabled={submitting}
            className="flex-1 rounded-full py-2 text-[var(--fs-sm)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--ink)' }}
          >
            {t.recurringExpense.pending.primaryAction}
          </button>
          <button
            type="button"
            onClick={handleEditClick}
            disabled={submitting || !onEdit}
            className="rounded-full px-4 py-2 text-[var(--fs-sm)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ border: `1px solid ${cat.ink}40`, color: 'var(--ink-2)', background: 'transparent' }}
          >
            {t.recurringExpense.pending.editAction}
          </button>
          <button
            type="button" onClick={() => setConfirmingSkip(true)} disabled={submitting}
            className="rounded-full px-4 py-2 text-[var(--fs-sm)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
          >
            {t.recurringExpense.pending.skipAction}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmingSkip}
        title={t.recurringExpense.pending.skipConfirm
          .replace('{date}', pending.proposedDate)
          .replace('{description}', pending.proposedDescription)}
        confirmLabel={t.recurringExpense.pending.skipAction}
        pending={submitting}
        onCancel={() => setConfirmingSkip(false)}
        onConfirm={performSkip}
      />
    </>
  )
}
