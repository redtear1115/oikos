'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { formatAmount } from '@/lib/currency'
import { deleteOutingSettlement } from '@/actions/outing'

export interface SettlementListItem {
  id: string
  fromParticipantId: string
  toParticipantId: string
  amount: number
}

interface Props {
  outingId: string
  currency: string
  settlements: SettlementListItem[]
  nameOf: (participantId: string) => string
  /** False on an ended outing: the list stays, the delete goes. */
  canDelete: boolean
}

/**
 * Recorded repayments, each deletable behind a confirm (#1558). Shared by the
 * dashboard detail page and the public outing page — deleteOutingSettlement
 * resolves the caller itself (member, or participant by session / cookie).
 * Renders rows only; the caller owns the surrounding card and heading.
 */
export function SettlementList({ outingId, currency, settlements, nameOf, canDelete }: Props) {
  const t = useTranslations()
  const to = t.outing
  const router = useRouter()
  const [target, setTarget] = useState<SettlementListItem | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const rowLabel = (s: SettlementListItem) =>
    to.transferRow.replace('{from}', nameOf(s.fromParticipantId)).replace('{to}', nameOf(s.toParticipantId))

  const handleDelete = () => {
    if (!target) return
    setError('')
    startTransition(async () => {
      try {
        unwrapAction(await deleteOutingSettlement({ outingId, settlementId: target.id }))
        setTarget(null)
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <>
      <ul className="flex flex-col">
        {settlements.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-hairline last:border-b-0">
            <span className="text-sm truncate text-ink">{rowLabel(s)}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm tabular-nums text-ink-2">{formatAmount(s.amount, currency)}</span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  aria-label={to.deleteSettlementAria.replace('{row}', rowLabel(s))}
                  onClick={() => { setError(''); setTarget(s) }}
                >
                  {t.common.delete}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={target !== null}
        title={to.deleteSettlementConfirmTitle}
        description={target
          ? to.deleteSettlementConfirmBody
            .replace('{row}', rowLabel(target))
            .replace('{amount}', formatAmount(target.amount, currency))
          : undefined}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setTarget(null)}
        onConfirm={handleDelete}
      >
        {error && <p role="alert" className="text-sm mb-4 text-[var(--debit-text)]">{error}</p>}
      </ConfirmModal>
    </>
  )
}
