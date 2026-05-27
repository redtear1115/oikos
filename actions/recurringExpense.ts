'use server'

/**
 * Recurring expense rules — paired with `actions/recurringIncome.ts`. The two
 * files are structurally parallel (createRule / editRule / deleteRule / list /
 * confirm), differing only in table / validator / field names (expense vs
 * income, paidBy vs recipientId, splitType, etc.).
 *
 * Keep them in sync: any signature, validation, or DB-write change here should
 * be mirrored on the income side (and vice versa). A future factoring may
 * collapse the shared shell — see #512 item 8.
 */

import { db } from '@/lib/db/client'
import {
  cashTransactions,
  recurringExpenseRules,
  pendingExpenseOccurrences,
} from '@/lib/db/schema'
import {
  validateRecurringExpenseRuleInput,
  validateConfirmPendingExpenseInput,
  type RecurringExpenseRuleInput,
  type ConfirmPendingExpenseOverrides,
} from '@/lib/validators'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { firstAnchorFromStart, snapToFuture } from '@/lib/recurring'
import {
  assertMemberInGroup,
  assertAssetInGroup,
} from '@/lib/recurringActionHelpers'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  revalidateAfterRecurringExpenseRuleMutation,
  revalidateAfterTransactionMutation,
} from '@/lib/revalidate'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { captureServer } from '@/lib/analytics/server'

function assertPaidByInGroup(
  paidById: string,
  group: { memberA: string; memberB: string | null },
) {
  assertMemberInGroup(paidById, group, '付款人不在家計簿內')
}

export async function createRule(input: RecurringExpenseRuleInput): Promise<{ id: string }> {
  const v = validateRecurringExpenseRuleInput(input)
  const { user, group } = await requireViewerGroup()
  assertPaidByInGroup(v.paidBy, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  const nextOccurrenceAt = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)

  const [created] = await db
    .insert(recurringExpenseRules)
    .values({
      groupId: group.id,
      paidBy: v.paidBy,
      amount: v.amount,
      splitType: v.splitType,
      splitRatioA: v.splitRatioA,
      description: v.description,
      category: v.category,
      assetId: v.assetId,
      intervalMonths: v.intervalMonths,
      dayOfMonth: v.dayOfMonth,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      nextOccurrenceAt,
    })
    .returning({ id: recurringExpenseRules.id })

  revalidateAfterRecurringExpenseRuleMutation()

  // Feature-adoption signal (#816).
  await captureServer(user.id, 'recurring_rule_created', {
    kind: 'expense',
    frequency: v.intervalMonths,
  })

  return { id: created.id }
}

export interface UpdateRuleInput extends RecurringExpenseRuleInput {
  id: string
}

export async function updateRule(input: UpdateRuleInput): Promise<{ id: string }> {
  const v = validateRecurringExpenseRuleInput(input)
  const { group } = await requireViewerGroup()
  assertPaidByInGroup(v.paidBy, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  const [existing] = await db
    .select({
      id: recurringExpenseRules.id,
      groupId: recurringExpenseRules.groupId,
    })
    .from(recurringExpenseRules)
    .where(and(
      eq(recurringExpenseRules.id, input.id),
      eq(recurringExpenseRules.groupId, group.id),
      isNull(recurringExpenseRules.deletedAt),
    ))
    .limit(1)
  if (!existing) throw new Error('找不到該定期規則')

  const today = new Date().toISOString().slice(0, 10)
  const firstAnchor = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)
  const nextOccurrenceAt = firstAnchor > today
    ? firstAnchor
    : snapToFuture(firstAnchor, v.intervalMonths, v.dayOfMonth, today)

  const [updated] = await db
    .update(recurringExpenseRules)
    .set({
      amount: v.amount,
      category: v.category,
      paidBy: v.paidBy,
      splitType: v.splitType,
      splitRatioA: v.splitRatioA,
      description: v.description,
      assetId: v.assetId,
      intervalMonths: v.intervalMonths,
      dayOfMonth: v.dayOfMonth,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      nextOccurrenceAt,
    })
    .where(eq(recurringExpenseRules.id, input.id))
    .returning({ id: recurringExpenseRules.id })

  revalidateAfterRecurringExpenseRuleMutation()
  return { id: updated.id }
}

export async function pauseRule(id: string): Promise<void> {
  const { group } = await requireViewerGroup()
  const [updated] = await db
    .update(recurringExpenseRules)
    .set({ pausedAt: new Date() })
    .where(and(
      eq(recurringExpenseRules.id, id),
      eq(recurringExpenseRules.groupId, group.id),
      isNull(recurringExpenseRules.deletedAt),
    ))
    .returning({ id: recurringExpenseRules.id })
  if (!updated) throw new Error('找不到該定期規則')
  revalidateAfterRecurringExpenseRuleMutation()
}

export async function resumeRule(id: string): Promise<void> {
  const { group } = await requireViewerGroup()
  const [rule] = await db
    .select({
      id: recurringExpenseRules.id,
      nextOccurrenceAt: recurringExpenseRules.nextOccurrenceAt,
      intervalMonths: recurringExpenseRules.intervalMonths,
      dayOfMonth: recurringExpenseRules.dayOfMonth,
    })
    .from(recurringExpenseRules)
    .where(and(
      eq(recurringExpenseRules.id, id),
      eq(recurringExpenseRules.groupId, group.id),
      isNull(recurringExpenseRules.deletedAt),
    ))
    .limit(1)
  if (!rule) throw new Error('找不到該定期規則')

  const today = new Date().toISOString().slice(0, 10)
  const snapped = rule.nextOccurrenceAt > today
    ? rule.nextOccurrenceAt
    : snapToFuture(rule.nextOccurrenceAt, rule.intervalMonths, rule.dayOfMonth, today)

  await db
    .update(recurringExpenseRules)
    .set({ pausedAt: null, nextOccurrenceAt: snapped })
    .where(eq(recurringExpenseRules.id, id))
    .returning({ id: recurringExpenseRules.id })

  revalidateAfterRecurringExpenseRuleMutation()
}

export async function softDeleteRule(id: string): Promise<void> {
  const { group } = await requireViewerGroup()

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recurringExpenseRules)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(recurringExpenseRules.id, id),
        eq(recurringExpenseRules.groupId, group.id),
        isNull(recurringExpenseRules.deletedAt),
      ))
      .returning({ id: recurringExpenseRules.id })
    if (!updated) throw new Error('找不到該定期規則')

    await tx
      .delete(pendingExpenseOccurrences)
      .where(and(
        eq(pendingExpenseOccurrences.ruleId, id),
        isNull(pendingExpenseOccurrences.skippedAt),
        isNull(pendingExpenseOccurrences.resolvedTxId),
      ))
  })

  revalidateAfterRecurringExpenseRuleMutation()
}

export async function confirmPending(pendingId: string): Promise<{ txId: string }> {
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      id: pendingExpenseOccurrences.id,
      groupId: pendingExpenseOccurrences.groupId,
      proposedAmount: pendingExpenseOccurrences.proposedAmount,
      proposedDate: pendingExpenseOccurrences.proposedDate,
      proposedDescription: pendingExpenseOccurrences.proposedDescription,
      proposedPaidBy: pendingExpenseOccurrences.proposedPaidBy,
      proposedSplitType: pendingExpenseOccurrences.proposedSplitType,
      category: recurringExpenseRules.category,
      assetId: recurringExpenseRules.assetId,
    })
    .from(pendingExpenseOccurrences)
    .innerJoin(recurringExpenseRules, eq(recurringExpenseRules.id, pendingExpenseOccurrences.ruleId))
    .where(and(
      eq(pendingExpenseOccurrences.id, pendingId),
      eq(pendingExpenseOccurrences.groupId, group.id),
      isNull(pendingExpenseOccurrences.skippedAt),
      isNull(pendingExpenseOccurrences.resolvedTxId),
    ))
    .limit(1)
  if (!row) throw new Error('待確認支出已被處理或找不到')

  // Race guard: snapshot's paidBy may have left the group between cron generation
  // and confirmation. Surfacing this as a race message lets the UI prompt the user
  // to re-pick a payer via 「改一下」 instead of inserting an orphan.
  if (row.proposedPaidBy !== group.memberA && row.proposedPaidBy !== group.memberB) {
    throw new Error('這筆 partner 剛剛已處理')
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cashTransactions)
      .values({
        groupId: row.groupId,
        paidBy: row.proposedPaidBy,
        amount: row.proposedAmount,
        splitType: row.proposedSplitType,
        description: row.proposedDescription,
        category: row.category,
        assetId: row.assetId,
        transactedAt: new Date(row.proposedDate),
      })
      .returning({ id: cashTransactions.id })

    const [resolved] = await tx
      .update(pendingExpenseOccurrences)
      .set({ resolvedTxId: created.id })
      .where(and(
        eq(pendingExpenseOccurrences.id, pendingId),
        isNull(pendingExpenseOccurrences.resolvedTxId),
      ))
      .returning({ id: pendingExpenseOccurrences.id })
    if (!resolved) throw new Error('待確認支出已被其他裝置處理')

    await recalcGroupBalance(group.id, tx)
    return { txId: created.id }
  })

  revalidateAfterTransactionMutation({ assetId: row.assetId })
  return result
}

export interface EditAndConfirmInput {
  pendingId: string
  overrides: ConfirmPendingExpenseOverrides
}

// Phase 2 surface: shipped + tested in PR #2 so the PR #5 wiring of the AddSheet
// 「改一下」 path (AddSheet prefilled with pending values, submit routes here) is
// mechanical. Currently no UI caller; do not remove. Each override field is
// independent — undefined keeps the snapshot value, defined replaces it.
export async function editAndConfirmPending(
  input: EditAndConfirmInput,
): Promise<{ txId: string }> {
  const overrides = validateConfirmPendingExpenseInput(input.overrides)
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      id: pendingExpenseOccurrences.id,
      groupId: pendingExpenseOccurrences.groupId,
      proposedAmount: pendingExpenseOccurrences.proposedAmount,
      proposedDate: pendingExpenseOccurrences.proposedDate,
      proposedDescription: pendingExpenseOccurrences.proposedDescription,
      proposedPaidBy: pendingExpenseOccurrences.proposedPaidBy,
      proposedSplitType: pendingExpenseOccurrences.proposedSplitType,
      proposedSplitRatioA: pendingExpenseOccurrences.proposedSplitRatioA,
      ruleCategory: recurringExpenseRules.category,
      ruleAssetId: recurringExpenseRules.assetId,
    })
    .from(pendingExpenseOccurrences)
    .innerJoin(recurringExpenseRules, eq(recurringExpenseRules.id, pendingExpenseOccurrences.ruleId))
    .where(and(
      eq(pendingExpenseOccurrences.id, input.pendingId),
      eq(pendingExpenseOccurrences.groupId, group.id),
      isNull(pendingExpenseOccurrences.skippedAt),
      isNull(pendingExpenseOccurrences.resolvedTxId),
    ))
    .limit(1)
  if (!row) throw new Error('待確認支出已被處理或找不到')

  const finalPaidBy = overrides.paidBy ?? row.proposedPaidBy
  assertPaidByInGroup(finalPaidBy, group)

  const finalAssetId = overrides.assetId !== undefined ? overrides.assetId : row.ruleAssetId
  if (finalAssetId) await assertAssetInGroup(finalAssetId, group.id)

  const finalAmount = overrides.amount ?? row.proposedAmount
  const finalCategory = overrides.category ?? row.ruleCategory
  const finalSplitType = overrides.splitType ?? row.proposedSplitType
  const finalSplitRatioA = overrides.splitRatioA !== undefined ? overrides.splitRatioA : (row.proposedSplitRatioA ?? null)
  const finalDescription = overrides.description ?? row.proposedDescription
  const finalTransactedAt = overrides.transactedAt
    ? new Date(overrides.transactedAt)
    : new Date(row.proposedDate)

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: finalPaidBy,
        amount: finalAmount,
        splitType: finalSplitType,
        splitRatioA: finalSplitRatioA,
        description: finalDescription,
        category: finalCategory,
        assetId: finalAssetId,
        transactedAt: finalTransactedAt,
      })
      .returning({ id: cashTransactions.id })

    const [resolved] = await tx
      .update(pendingExpenseOccurrences)
      .set({ resolvedTxId: created.id })
      .where(and(
        eq(pendingExpenseOccurrences.id, input.pendingId),
        isNull(pendingExpenseOccurrences.resolvedTxId),
      ))
      .returning({ id: pendingExpenseOccurrences.id })
    if (!resolved) throw new Error('待確認支出已被其他裝置處理')

    await recalcGroupBalance(group.id, tx)
    return { txId: created.id }
  })

  revalidateAfterTransactionMutation({ assetId: finalAssetId })
  return result
}

export async function skipPending(pendingId: string): Promise<void> {
  const { group } = await requireViewerGroup()
  const [updated] = await db
    .update(pendingExpenseOccurrences)
    .set({ skippedAt: new Date() })
    .where(and(
      eq(pendingExpenseOccurrences.id, pendingId),
      eq(pendingExpenseOccurrences.groupId, group.id),
      isNull(pendingExpenseOccurrences.skippedAt),
      isNull(pendingExpenseOccurrences.resolvedTxId),
    ))
    .returning({ id: pendingExpenseOccurrences.id })
  if (!updated) throw new Error('待確認支出已被處理或找不到')
  revalidatePath('/dashboard')
}
