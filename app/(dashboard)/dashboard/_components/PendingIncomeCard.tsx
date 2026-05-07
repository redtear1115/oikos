'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { confirmPending, skipPending } from '@/actions/recurringIncome'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'

export interface PendingIncomeCardProps {
  pending: PendingRow
  onEdit?: (pending: PendingRow) => void
}

export function PendingIncomeCard({ pending, onEdit }: PendingIncomeCardProps) {
  const router = useRouter()
  const [submitting, startTransition] = useTransition()
  const [fading, setFading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingSkip, setConfirmingSkip] = useState(false)
  const cat = getIncomeCategory(pending.category)

  const handleConfirm = () => startTransition(async () => {
    try {
      await confirmPending(pending.id)
      setFading(true)
      setTimeout(() => router.refresh(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認失敗')
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
        setError(e instanceof Error ? e.message : '跳過失敗')
      }
    })
  }

  return (
    <>
      <div
        className="rounded-2xl p-4 transition-opacity duration-700"
        style={{
          background: `linear-gradient(135deg, ${cat.tint}30, transparent)`,
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
          <div className="flex-1">
            <div className="text-[var(--fs-base)] font-medium" style={{ color: 'var(--ink)' }}>
              {pending.source ?? cat.label}
            </div>
            <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
              {pending.proposedDate}
            </div>
            <div className="mt-1 text-[var(--fs-2xl)] font-semibold" style={{ color: 'var(--ink)' }}>
              NT$ {pending.proposedAmount.toLocaleString()}
            </div>
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
            className="flex-1 rounded-full py-2 text-[var(--fs-sm)] text-white disabled:opacity-50"
            style={{ background: 'var(--ink)' }}
          >
            就這樣
          </button>
          <button
            type="button"
            onClick={() => onEdit?.(pending)}
            disabled={submitting || !onEdit}
            className="rounded-full px-4 py-2 text-[var(--fs-sm)] disabled:opacity-30"
            style={{ border: `1px solid ${cat.ink}40`, color: 'var(--ink-2)', background: 'transparent' }}
          >
            改一下
          </button>
          <button
            type="button" onClick={() => setConfirmingSkip(true)} disabled={submitting}
            className="rounded-full px-4 py-2 text-[var(--fs-sm)] disabled:opacity-30"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
          >
            跳過
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmingSkip}
        title={`跳過 ${pending.proposedDate} ${pending.source ?? cat.label}？`}
        description="這一期就不會出現在帳上，下一期照常提醒。"
        confirmLabel="跳過"
        pending={submitting}
        onCancel={() => setConfirmingSkip(false)}
        onConfirm={performSkip}
      />
    </>
  )
}
