import {
  listActiveRules as listIncomeRulesRaw,
  listRulesForAsset as listRulesForAssetRaw,
  listActivePendings as listIncomePendingsRaw,
} from '@/lib/db/queries/recurringIncome'
import {
  listActiveRules as listExpenseRulesRaw,
  listActivePendings as listExpensePendingsRaw,
} from '@/lib/db/queries/recurringExpense'
import type { MemberLinkScope } from '@/lib/insuranceMemberLink'
import {
  toPendingExpenseView,
  toPendingIncomeView,
  toRecurringExpenseRuleView,
  toRecurringIncomeRuleView,
  type PendingExpenseView,
  type PendingIncomeView,
  type RecurringExpenseRuleView,
  type RecurringIncomeRuleView,
} from '@/lib/recurringMemberLink'

/**
 * #1588 — the only reads of recurring rules and pending cards for a page.
 * Each returns the sanitised view (see `lib/recurringMemberLink.ts`): a
 * recipient / payer outside `scope` has no id in it. Pages must use these,
 * not the raw `listActiveRules` / `listRulesForAsset` / `listActivePendings`
 * (tests/recurring-former-member-payload-1588 greps for that).
 */
export async function listIncomeRulesForViewer(
  groupId: string,
  scope: MemberLinkScope,
): Promise<RecurringIncomeRuleView[]> {
  const rows = await listIncomeRulesRaw(groupId)
  return rows.map((r) => toRecurringIncomeRuleView(r, scope))
}

export async function listExpenseRulesForViewer(
  groupId: string,
  scope: MemberLinkScope,
): Promise<RecurringExpenseRuleView[]> {
  const rows = await listExpenseRulesRaw(groupId)
  return rows.map((r) => toRecurringExpenseRuleView(r, scope))
}

export async function listIncomeRulesForAssetForViewer(
  groupId: string,
  assetId: string,
  createdBefore: Date | null,
  scope: MemberLinkScope,
): Promise<RecurringIncomeRuleView[]> {
  const rows = await listRulesForAssetRaw(groupId, assetId, createdBefore)
  return rows.map((r) => toRecurringIncomeRuleView(r, scope))
}

export async function listIncomePendingsForViewer(
  groupId: string,
  scope: MemberLinkScope,
): Promise<PendingIncomeView[]> {
  const rows = await listIncomePendingsRaw(groupId)
  return rows.map((r) => toPendingIncomeView(r, scope))
}

export async function listExpensePendingsForViewer(
  groupId: string,
  scope: MemberLinkScope,
): Promise<PendingExpenseView[]> {
  const rows = await listExpensePendingsRaw(groupId)
  return rows.map((r) => toPendingExpenseView(r, scope))
}
