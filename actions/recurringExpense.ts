'use server'

import { db } from '@/lib/db/client'
import {
  assets,
  cashTransactions,
  oikosGroups,
  recurringExpenseRules,
  pendingExpenseOccurrences,
} from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import {
  validateRecurringExpenseRuleInput,
  validateConfirmPendingExpenseInput,
  type RecurringExpenseRuleInput,
  type ConfirmPendingExpenseOverrides,
} from '@/lib/validators'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { firstAnchorFromStart, snapToFuture } from '@/lib/recurring'
import { and, eq, isNull, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

async function getViewerGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')
  return { user, group }
}

function assertPaidByInGroup(
  paidById: string,
  group: { memberA: string; memberB: string | null },
) {
  if (paidById !== group.memberA && paidById !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }
}

async function assertAssetInGroup(assetId: string, groupId: string) {
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!asset) throw new Error('關聯愛物不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯愛物已刪除')
}

export async function createRule(input: RecurringExpenseRuleInput): Promise<{ id: string }> {
  const v = validateRecurringExpenseRuleInput(input)
  const { group } = await getViewerGroup()
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

  revalidatePath('/settings/recurring-expense')
  revalidatePath('/dashboard')
  return { id: created.id }
}

export interface UpdateRuleInput extends RecurringExpenseRuleInput {
  id: string
}

export async function updateRule(input: UpdateRuleInput): Promise<{ id: string }> {
  const v = validateRecurringExpenseRuleInput(input)
  const { group } = await getViewerGroup()
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

  revalidatePath('/settings/recurring-expense')
  revalidatePath('/dashboard')
  return { id: updated.id }
}

export async function pauseRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()
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
  revalidatePath('/settings/recurring-expense')
  revalidatePath('/dashboard')
}

export async function resumeRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()
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

  revalidatePath('/settings/recurring-expense')
  revalidatePath('/dashboard')
}

export async function softDeleteRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()

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

  revalidatePath('/settings/recurring-expense')
  revalidatePath('/dashboard')
}

export async function confirmPending(pendingId: string): Promise<{ txId: string }> {
  const { group } = await getViewerGroup()

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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (row.assetId) revalidatePath(`/assets/${row.assetId}`)
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
  const { group } = await getViewerGroup()

  const [row] = await db
    .select({
      id: pendingExpenseOccurrences.id,
      groupId: pendingExpenseOccurrences.groupId,
      proposedAmount: pendingExpenseOccurrences.proposedAmount,
      proposedDate: pendingExpenseOccurrences.proposedDate,
      proposedDescription: pendingExpenseOccurrences.proposedDescription,
      proposedPaidBy: pendingExpenseOccurrences.proposedPaidBy,
      proposedSplitType: pendingExpenseOccurrences.proposedSplitType,
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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (finalAssetId) revalidatePath(`/assets/${finalAssetId}`)
  return result
}

export async function skipPending(pendingId: string): Promise<void> {
  const { group } = await getViewerGroup()
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
