import { isFormerMember, type MemberLinkScope } from '@/lib/insuranceMemberLink'
import type { RecurringRuleRow, PendingRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow, PendingExpenseRow } from '@/lib/db/queries/recurringExpense'

/**
 * #1588 — a recurring rule names its person by profile id: the income rule's
 * 收入歸屬 (`recipient_id`), the expense rule's 付款人 (`paid_by`), and the
 * expense pending card's snapshot payer (`proposed_paid_by`). removePartner
 * and account deletion leave those ids in place, so after the ex leaves, the
 * rule (and the cards cron keeps generating from it) still points at them.
 *
 * Failure looks like nothing: no error. The savings page, /settings/recurring
 * and the dashboard pending stacks carry the ex-partner's profile id to the
 * stayer, and to a new partner who joins later. The UI treats any id that is
 * not the viewer as the current partner, so the ex's salary rule is labelled
 * with the new partner's name and avatar, and an unchanged edit silently
 * reassigns it (solo → viewer, duo → partner).
 *
 * Resolved at read time (no data change), on the server, with the same
 * allowed set as insurance (#1579, {@link MemberLinkScope}): a stored id
 * outside the set is "former" — the id is dropped (null) and the matching
 * `*IsFormer` flag is set. `formerLabel` says whether 「前伴侶」 may be shown
 * (false for a viewer pinned to a chapter of a group they left, where the
 * dropped person may be a stranger who joined later).
 *
 * The required flags make the raw query rows unassignable to these views, so
 * passing an unsanitised row to a client component fails `tsc`. Pages read
 * through `lib/db/queries/recurringView.ts` only
 * (tests/recurring-former-member-payload-1588 greps for the raw readers).
 */
export type RecurringIncomeRuleView = Omit<RecurringRuleRow, 'recipientId'> & {
  /** A current member, or null when the stored recipient left the ledger. */
  recipientId: string | null
  recipientIsFormer: boolean
  formerLabel: boolean
}

export type RecurringExpenseRuleView = Omit<RecurringExpenseRuleRow, 'paidBy'> & {
  /** A current member, or null when the stored payer left the ledger. */
  paidBy: string | null
  paidByIsFormer: boolean
  formerLabel: boolean
}

export type PendingIncomeView = Omit<PendingRow, 'recipientId'> & {
  recipientId: string | null
  recipientIsFormer: boolean
  formerLabel: boolean
}

export type PendingExpenseView = Omit<PendingExpenseRow, 'proposedPaidBy'> & {
  proposedPaidBy: string | null
  proposedPaidByIsFormer: boolean
  formerLabel: boolean
}

export function toRecurringIncomeRuleView(
  row: RecurringRuleRow,
  scope: MemberLinkScope,
): RecurringIncomeRuleView {
  const former = isFormerMember(row.recipientId, scope)
  return {
    ...row,
    recipientId: former ? null : row.recipientId,
    recipientIsFormer: former,
    formerLabel: scope.labelFormer,
  }
}

export function toRecurringExpenseRuleView(
  row: RecurringExpenseRuleRow,
  scope: MemberLinkScope,
): RecurringExpenseRuleView {
  const former = isFormerMember(row.paidBy, scope)
  return {
    ...row,
    paidBy: former ? null : row.paidBy,
    paidByIsFormer: former,
    formerLabel: scope.labelFormer,
  }
}

export function toPendingIncomeView(row: PendingRow, scope: MemberLinkScope): PendingIncomeView {
  const former = isFormerMember(row.recipientId, scope)
  return {
    ...row,
    recipientId: former ? null : row.recipientId,
    recipientIsFormer: former,
    formerLabel: scope.labelFormer,
  }
}

export function toPendingExpenseView(row: PendingExpenseRow, scope: MemberLinkScope): PendingExpenseView {
  const former = isFormerMember(row.proposedPaidBy, scope)
  return {
    ...row,
    proposedPaidBy: former ? null : row.proposedPaidBy,
    proposedPaidByIsFormer: former,
    formerLabel: scope.labelFormer,
  }
}

