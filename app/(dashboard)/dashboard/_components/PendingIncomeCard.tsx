'use client'

import { getIncomeCategory } from '@/lib/incomeCategories'
import { confirmPending, skipPending } from '@/actions/recurringIncome'
import { useTranslations } from '@/lib/i18n/client'
import type { PendingIncomeView } from '@/lib/recurringMemberLink'
import { PendingCard } from './PendingCard'

export interface PendingIncomeCardProps {
  pending: PendingIncomeView
  onEdit?: (pending: PendingIncomeView) => void
}

export function PendingIncomeCard({ pending, onEdit }: PendingIncomeCardProps) {
  const t = useTranslations()
  const cat = getIncomeCategory(pending.category)
  const title = pending.source ?? t.incomeCategory[cat.id] ?? cat.label
  // #1588 — the card names no recipient normally. One who left the ledger is
  // shown as 「前伴侶」 (nothing for a pinned non-member viewer), so the stayer
  // can tell why 「就這樣」 asks them to pick again.
  const meta = pending.recipientIsFormer && pending.formerLabel
    ? t.common.formerPartner
    : undefined

  return (
    <PendingCard
      cat={cat}
      gradientAlpha="30"
      title={title}
      date={pending.proposedDate}
      amount={pending.proposedAmount}
      meta={meta}
      confirmLabel={t.pendingIncomeCard.confirm}
      editLabel={t.pendingIncomeCard.edit}
      skipLabel={t.pendingIncomeCard.skip}
      primaryDisabledClass="disabled:opacity-50"
      secondaryDisabledClass="disabled:opacity-50"
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
