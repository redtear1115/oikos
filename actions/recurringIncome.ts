'use server'

/**
 * Recurring income rules — paired with `actions/recurringExpense.ts`. The two
 * files are structurally parallel (createRule / editRule / deleteRule / list /
 * confirm), differing only in table / validator / field names (income vs
 * expense, recipientId vs paidBy, no splitType, etc.).
 *
 * Keep them in sync: any signature, validation, or DB-write change here should
 * be mirrored on the expense side (and vice versa). A future factoring may
 * collapse the shared shell — see #512 item 8.
 */

import { db } from '@/lib/db/client'
import {
  assets,
  incomeTransactions,
  recurringIncomeRules,
  pendingIncomeOccurrences,
} from '@/lib/db/schema'
import {
  validateRecurringIncomeRuleInput,
  validateIncomeInput,
  type RecurringIncomeRuleInput,
} from '@/lib/validators'
import { firstAnchorFromStart, snapToFuture } from '@/lib/recurring'
import { previousDay } from '@/lib/local-date'
import {
  assertMemberInGroup,
  assertAssetInGroup,
} from '@/lib/recurringActionHelpers'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { getViewerWriteContext } from '@/lib/actionContext'
import {
  revalidateAfterRecurringIncomeRuleMutation,
  revalidateAfterIncomeMutation,
} from '@/lib/revalidate'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { captureServer } from '@/lib/analytics/server'
import { action, actionError } from '@/lib/action-errors'

function assertRecipientInGroup(
  recipientId: string,
  group: { memberA: string; memberB: string | null },
) {
  assertMemberInGroup(recipientId, group, 'recipient_not_in_group')
}

export const createRule = action(async (input: RecurringIncomeRuleInput): Promise<{ id: string }> => {
  const v = validateRecurringIncomeRuleInput(input)
  const { user, group } = await requireViewerGroup()
  assertRecipientInGroup(v.recipientId, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  // Snap the anchor forward so a back-dated `startsOn` cannot leave the rule
  // showing a "next run" date already in the past (#1244).
  //
  // **Creating includes today; editing and resuming do not — on purpose.**
  // Creating "the Nth" on the Nth counts this month, and how `startsOn` was
  // filled must not change that; editing must not, because
  // `sheet.editEffectHint` is on screen promising 改動從下一期開始套用. The
  // `previousDay` cutoff is what makes today the earliest period `snapToFuture`
  // will settle on. Full reasoning in the matching comment in
  // `actions/recurringExpense.ts` — read it before making the branches agree.
  const today = new Date().toISOString().slice(0, 10)
  const firstAnchor = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)
  const nextOccurrenceAt = firstAnchor >= today
    ? firstAnchor
    : snapToFuture(firstAnchor, v.intervalMonths, v.dayOfMonth, previousDay(today))

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

  revalidateAfterRecurringIncomeRuleMutation()

  // Feature-adoption signal (#816).
  await captureServer(user.id, 'recurring_rule_created', {
    kind: 'income',
    frequency: v.intervalMonths,
  })

  return { id: created.id }
})

export interface UpdateRuleInput extends RecurringIncomeRuleInput {
  id: string
}

export const updateRule = action(async (input: UpdateRuleInput): Promise<{ id: string }> => {
  const v = validateRecurringIncomeRuleInput(input)
  const { group } = await requireViewerGroup()
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
  if (!existing) throw actionError('recurring_rule_not_found')

  // `>` and not `>=`, unlike `createRule` (#1244): `sheet.editEffectHint` is on
  // screen while the user saves, promising the change applies from the *next*
  // period. Today stays out. See the comment in `createRule` above.
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

  revalidateAfterRecurringIncomeRuleMutation()
  return { id: updated.id }
})

export const pauseRule = action(async (id: string): Promise<void> => {
  const { group } = await requireViewerGroup()
  const [updated] = await db
    .update(recurringIncomeRules)
    .set({ pausedAt: new Date() })
    .where(and(
      eq(recurringIncomeRules.id, id),
      eq(recurringIncomeRules.groupId, group.id),
      isNull(recurringIncomeRules.deletedAt),
    ))
    .returning({ id: recurringIncomeRules.id })
  if (!updated) throw actionError('recurring_rule_not_found')
  revalidateAfterRecurringIncomeRuleMutation()
})

export const resumeRule = action(async (id: string): Promise<void> => {
  const { group } = await requireViewerGroup()
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
  if (!rule) throw actionError('recurring_rule_not_found')

  const today = new Date().toISOString().slice(0, 10)
  const snapped = rule.nextOccurrenceAt > today
    ? rule.nextOccurrenceAt
    : snapToFuture(rule.nextOccurrenceAt, rule.intervalMonths, rule.dayOfMonth, today)

  await db
    .update(recurringIncomeRules)
    .set({ pausedAt: null, nextOccurrenceAt: snapped })
    .where(eq(recurringIncomeRules.id, id))
    .returning({ id: recurringIncomeRules.id })

  revalidateAfterRecurringIncomeRuleMutation()
})

export const confirmPending = action(async (pendingId: string): Promise<{ txId: string }> => {
  const { group } = await getViewerWriteContext()

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
      assetGroupId: assets.groupId,
    })
    .from(pendingIncomeOccurrences)
    .innerJoin(recurringIncomeRules, eq(recurringIncomeRules.id, pendingIncomeOccurrences.ruleId))
    .leftJoin(assets, eq(assets.id, recurringIncomeRules.assetId))
    .where(and(
      eq(pendingIncomeOccurrences.id, pendingId),
      eq(pendingIncomeOccurrences.groupId, group.id),
      isNull(pendingIncomeOccurrences.skippedAt),
      isNull(pendingIncomeOccurrences.resolvedTxId),
    ))
    .limit(1)
  if (!row) throw actionError('pending_income_not_found')

  // Mirror of the expense side: the rule's recipient and asset are copied onto
  // the new record, so both must still belong to this group.
  assertRecipientInGroup(row.recipientId, group)
  if (row.assetId !== null && row.assetGroupId !== group.id) {
    throw actionError('linked_asset_not_in_group')
  }

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
    if (!resolved) throw actionError('pending_income_handled_elsewhere')

    return { txId: created.id }
  })

  revalidateAfterIncomeMutation()
  return result
})

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
export const editAndConfirmPending = action(async (
  input: EditAndConfirmInput,
): Promise<{ txId: string }> => {
  const validated = validateIncomeInput({
    amount: input.amount,
    category: input.category,
    recipientId: input.recipientId,
    occurredAt: input.occurredAt,
    source: input.source ?? null,
    assetId: input.assetId ?? null,
  })

  const { group } = await getViewerWriteContext()
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
  if (!pending) throw actionError('pending_income_not_found')

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
    if (!resolved) throw actionError('pending_income_handled_elsewhere')

    return { txId: created.id }
  })

  revalidateAfterIncomeMutation()
  return result
})

export const softDeleteRule = action(async (id: string): Promise<void> => {
  const { group } = await requireViewerGroup()

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
    if (!updated) throw actionError('recurring_rule_not_found')

    await tx
      .delete(pendingIncomeOccurrences)
      .where(and(
        eq(pendingIncomeOccurrences.ruleId, id),
        isNull(pendingIncomeOccurrences.skippedAt),
        isNull(pendingIncomeOccurrences.resolvedTxId),
      ))
  })

  revalidateAfterRecurringIncomeRuleMutation()
})

export const skipPending = action(async (pendingId: string): Promise<void> => {
  const { group } = await requireViewerGroup()
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
  if (!updated) throw actionError('pending_income_not_found')
  revalidatePath('/dashboard')
})
