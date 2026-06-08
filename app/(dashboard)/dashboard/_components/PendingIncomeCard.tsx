'use client'

import { getIncomeCategory } from '@/lib/incomeCategories'
import { confirmPending, skipPending } from '@/actions/recurringIncome'
import { useTranslations } from '@/lib/i18n/client'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'
import { PendingCard } from './PendingCard'

export interface PendingIncomeCardProps {
  pending: PendingRow
  onEdit?: (pending: PendingRow) => void
}

export function PendingIncomeCard({ pending, onEdit }: PendingIncomeCardProps) {
  const t = useTranslations()
  const cat = getIncomeCategory(pending.category)
  const title = pending.source ?? cat.label

  return (
    <PendingCard
      cat={cat}
      gradientAlpha="30"
      title={title}
      date={pending.proposedDate}
      amount={pending.proposedAmount}
      confirmLabel={t.pendingIncomeCard.confirm}
      editLabel={t.pendingIncomeCard.edit}
      skipLabel={t.pendingIncomeCard.skip}
      primaryDisabledClass="disabled:opacity-50"
      secondaryDisabledClass="disabled:opacity-30"
      onConfirm={() => confirmPending(pending.id)}
      onSkip={() => skipPending(pending.id)}
      confirmErrorFallback={t.pendingIncomeCard.confirmError}
      skipErrorFallback={t.pendingIncomeCard.skipError}
      skipModalTitle={t.pendingIncomeCard.skipTitle
        .replace('{date}', pending.proposedDate)
        .replace('{name}', title)}
      skipModalDescription={t.pendingIncomeCard.skipDescription}
      onEdit={onEdit ? () => onEdit(pending) : undefined}
    />
  )
}
