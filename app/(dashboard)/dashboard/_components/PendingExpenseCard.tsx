'use client'

import { getCategory } from '@/lib/categories'
import { confirmPending, skipPending } from '@/actions/recurringExpense'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateAbsolute } from '@/lib/format-date'
import type { PendingExpenseRow } from '@/lib/db/queries/recurringExpense'
import type { SplitType } from '@/lib/balance'
import { PendingCard } from './PendingCard'

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
  const t = useTranslations()
  const locale = useLocale()
  const { viewer, partner, isSolo } = useMember()
  const cat = getCategory(pending.category)

  const payerName = pending.proposedPaidBy === viewer.id
    ? t.common.you
    : (partner?.displayName ?? t.common.partner)

  const meta = isSolo
    ? undefined
    : t.recurringExpense.pending.payerLine
        .replace('{payer}', payerName)
        .replace('{splitType}', splitLabel(pending.proposedSplitType, t))

  return (
    <PendingCard
      cat={cat}
      gradientAlpha="45"
      title={pending.proposedDescription}
      date={pending.proposedDate}
      amount={pending.proposedAmount}
      meta={meta}
      confirmLabel={t.recurringExpense.pending.primaryAction}
      editLabel={t.recurringExpense.pending.editAction}
      skipLabel={t.recurringExpense.pending.skipAction}
      primaryDisabledClass="disabled:opacity-50 disabled:cursor-not-allowed"
      secondaryDisabledClass="disabled:opacity-50 disabled:cursor-not-allowed"
      onConfirm={() => confirmPending(pending.id)}
      onSkip={() => skipPending(pending.id)}
      confirmErrorFallback={t.recurringExpense.errors.operationFailed}
      skipErrorFallback={t.recurringExpense.errors.operationFailed}
      skipModalTitle={t.recurringExpense.pending.skipConfirm
        .replace('{date}', formatDateAbsolute(pending.proposedDate, locale))
        .replace('{description}', pending.proposedDescription)}
      onEdit={onEdit ? () => onEdit(pending) : undefined}
    />
  )
}
