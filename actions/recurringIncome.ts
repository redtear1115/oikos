'use server'

import { db } from '@/lib/db/client'
import {
  assets,
  incomeTransactions,
  oikosGroups,
  recurringIncomeRules,
  pendingIncomeOccurrences,
} from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import {
  validateRecurringIncomeRuleInput,
  validateIncomeInput,
  type RecurringIncomeRuleInput,
} from '@/lib/validators'
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

function assertRecipientInGroup(
  recipientId: string,
  group: { memberA: string; memberB: string | null },
) {
  if (recipientId !== group.memberA && recipientId !== group.memberB) {
    throw new Error('收入歸屬不在家計簿內')
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

export async function createRule(input: RecurringIncomeRuleInput): Promise<{ id: string }> {
  const v = validateRecurringIncomeRuleInput(input)
  const { group } = await getViewerGroup()
  assertRecipientInGroup(v.recipientId, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  const nextOccurrenceAt = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)

  const [created] = await db
    .insert(recurringIncomeRules)
    .values({
      groupId: group.id,
      recipientId: v.recipientId,
      amount: v.amount,
      category: v.category,
      source: v.source,
      assetId: v.assetId,
      intervalMonths: v.intervalMonths,
      dayOfMonth: v.dayOfMonth,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      nextOccurrenceAt,
    })
    .returning({ id: recurringIncomeRules.id })

  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
  return { id: created.id }
}

export interface UpdateRuleInput extends RecurringIncomeRuleInput {
  id: string
}

export async function updateRule(input: UpdateRuleInput): Promise<{ id: string }> {
  const v = validateRecurringIncomeRuleInput(input)
  const { group } = await getViewerGroup()
  assertRecipientInGroup(v.recipientId, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  const [existing] = await db
    .select({
      id: recurringIncomeRules.id,
      groupId: recurringIncomeRules.groupId,
    })
    .from(recurringIncomeRules)
    .where(and(
      eq(recurringIncomeRules.id, input.id),
      eq(recurringIncomeRules.groupId, group.id),
      isNull(recurringIncomeRules.deletedAt),
    ))
    .limit(1)
  if (!existing) throw new Error('找不到該定期規則')

  const today = new Date().toISOString().slice(0, 10)
  const firstAnchor = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)
  const nextOccurrenceAt = firstAnchor > today
    ? firstAnchor
    : snapToFuture(firstAnchor, v.intervalMonths, v.dayOfMonth, today)

  const [updated] = await db
    .update(recurringIncomeRules)
    .set({
      amount: v.amount,
      category: v.category,
      recipientId: v.recipientId,
      source: v.source,
      assetId: v.assetId,
      intervalMonths: v.intervalMonths,
      dayOfMonth: v.dayOfMonth,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      nextOccurrenceAt,
    })
    .where(eq(recurringIncomeRules.id, input.id))
    .returning({ id: recurringIncomeRules.id })

  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
  return { id: updated.id }
}

export async function pauseRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()
  const [updated] = await db
    .update(recurringIncomeRules)
    .set({ pausedAt: new Date() })
    .where(and(
      eq(recurringIncomeRules.id, id),
      eq(recurringIncomeRules.groupId, group.id),
      isNull(recurringIncomeRules.deletedAt),
    ))
    .returning({ id: recurringIncomeRules.id })
  if (!updated) throw new Error('找不到該定期規則')
  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
}

export async function resumeRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()
  const [rule] = await db
    .select({
      id: recurringIncomeRules.id,
      nextOccurrenceAt: recurringIncomeRules.nextOccurrenceAt,
      intervalMonths: recurringIncomeRules.intervalMonths,
      dayOfMonth: recurringIncomeRules.dayOfMonth,
    })
    .from(recurringIncomeRules)
    .where(and(
      eq(recurringIncomeRules.id, id),
      eq(recurringIncomeRules.groupId, group.id),
      isNull(recurringIncomeRules.deletedAt),
    ))
    .limit(1)
  if (!rule) throw new Error('找不到該定期規則')

  const today = new Date().toISOString().slice(0, 10)
  const snapped = rule.nextOccurrenceAt > today
    ? rule.nextOccurrenceAt
    : snapToFuture(rule.nextOccurrenceAt, rule.intervalMonths, rule.dayOfMonth, today)

  await db
    .update(recurringIncomeRules)
    .set({ pausedAt: null, nextOccurrenceAt: snapped })
    .where(eq(recurringIncomeRules.id, id))
    .returning({ id: recurringIncomeRules.id })

  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
}

export async function confirmPending(pendingId: string): Promise<{ txId: string }> {
  const { group } = await getViewerGroup()

  const [row] = await db
    .select({
      id: pendingIncomeOccurrences.id,
      groupId: pendingIncomeOccurrences.groupId,
      proposedAmount: pendingIncomeOccurrences.proposedAmount,
      proposedDate: pendingIncomeOccurrences.proposedDate,
      recipientId: recurringIncomeRules.recipientId,
      category: recurringIncomeRules.category,
      source: recurringIncomeRules.source,
      assetId: recurringIncomeRules.assetId,
    })
    .from(pendingIncomeOccurrences)
    .innerJoin(recurringIncomeRules, eq(recurringIncomeRules.id, pendingIncomeOccurrences.ruleId))
    .where(and(
      eq(pendingIncomeOccurrences.id, pendingId),
      eq(pendingIncomeOccurrences.groupId, group.id),
      isNull(pendingIncomeOccurrences.skippedAt),
      isNull(pendingIncomeOccurrences.resolvedTxId),
    ))
    .limit(1)
  if (!row) throw new Error('待確認進帳已被處理或找不到')

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(incomeTransactions)
      .values({
        groupId: row.groupId,
        recipientId: row.recipientId,
        amount: row.proposedAmount,
        category: row.category,
        source: row.source,
        assetId: row.assetId,
        occurredAt: row.proposedDate,
      })
      .returning({ id: incomeTransactions.id })

    const [resolved] = await tx
      .update(pendingIncomeOccurrences)
      .set({ resolvedTxId: created.id })
      .where(and(
        eq(pendingIncomeOccurrences.id, pendingId),
        isNull(pendingIncomeOccurrences.resolvedTxId),
      ))
      .returning({ id: pendingIncomeOccurrences.id })
    if (!resolved) throw new Error('待確認進帳已被其他裝置處理')

    return { txId: created.id }
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return result
}

export interface EditAndConfirmInput {
  pendingId: string
  amount: number
  category: string
  recipientId: string
  occurredAt: string
  source?: string | null
  assetId?: string | null
}

// Phase 2 surface: shipped + tested in Phase 1 so the Phase 2 wiring of the
// Dashboard 「改一下」 button (IncomeSheet prefilled with pending values, submit
// routes here) becomes mechanical. Currently no UI caller; do not remove.
export async function editAndConfirmPending(
  input: EditAndConfirmInput,
): Promise<{ txId: string }> {
  const validated = validateIncomeInput({
    amount: input.amount,
    category: input.category,
    recipientId: input.recipientId,
    occurredAt: input.occurredAt,
    source: input.source ?? null,
    assetId: input.assetId ?? null,
  })

  const { group } = await getViewerGroup()
  assertRecipientInGroup(validated.recipientId, group)
  if (validated.assetId) await assertAssetInGroup(validated.assetId, group.id)

  const [pending] = await db
    .select({ id: pendingIncomeOccurrences.id })
    .from(pendingIncomeOccurrences)
    .where(and(
      eq(pendingIncomeOccurrences.id, input.pendingId),
      eq(pendingIncomeOccurrences.groupId, group.id),
      isNull(pendingIncomeOccurrences.skippedAt),
      isNull(pendingIncomeOccurrences.resolvedTxId),
    ))
    .limit(1)
  if (!pending) throw new Error('待確認進帳已被處理或找不到')

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(incomeTransactions)
      .values({
        groupId: group.id,
        recipientId: validated.recipientId,
        amount: validated.amount,
        category: validated.category,
        source: validated.source,
        assetId: validated.assetId,
        occurredAt: validated.occurredAt,
      })
      .returning({ id: incomeTransactions.id })

    const [resolved] = await tx
      .update(pendingIncomeOccurrences)
      .set({ resolvedTxId: created.id })
      .where(and(
        eq(pendingIncomeOccurrences.id, input.pendingId),
        isNull(pendingIncomeOccurrences.resolvedTxId),
      ))
      .returning({ id: pendingIncomeOccurrences.id })
    if (!resolved) throw new Error('待確認進帳已被其他裝置處理')

    return { txId: created.id }
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return result
}

export async function softDeleteRule(id: string): Promise<void> {
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recurringIncomeRules)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(recurringIncomeRules.id, id),
        eq(recurringIncomeRules.groupId, group.id),
        isNull(recurringIncomeRules.deletedAt),
      ))
      .returning({ id: recurringIncomeRules.id })
    if (!updated) throw new Error('找不到該定期規則')

    await tx
      .delete(pendingIncomeOccurrences)
      .where(and(
        eq(pendingIncomeOccurrences.ruleId, id),
        isNull(pendingIncomeOccurrences.skippedAt),
        isNull(pendingIncomeOccurrences.resolvedTxId),
      ))
  })

  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
}

export async function skipPending(pendingId: string): Promise<void> {
  const { group } = await getViewerGroup()
  const [updated] = await db
    .update(pendingIncomeOccurrences)
    .set({ skippedAt: new Date() })
    .where(and(
      eq(pendingIncomeOccurrences.id, pendingId),
      eq(pendingIncomeOccurrences.groupId, group.id),
      isNull(pendingIncomeOccurrences.skippedAt),
      isNull(pendingIncomeOccurrences.resolvedTxId),
    ))
    .returning({ id: pendingIncomeOccurrences.id })
  if (!updated) throw new Error('待確認進帳已被處理或找不到')
  revalidatePath('/dashboard')
}
