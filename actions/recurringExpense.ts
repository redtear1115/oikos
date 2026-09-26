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
import { previousDay } from '@/lib/local-date'
import {
  assertMemberInGroup,
  assertAssetInGroup,
} from '@/lib/recurringActionHelpers'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { getViewerWriteContext } from '@/lib/actionContext'
import {
  revalidateAfterRecurringExpenseRuleMutation,
  revalidateAfterTransactionMutation,
} from '@/lib/revalidate'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { captureServer, isUserFirstNonDeletedRecord } from '@/lib/analytics/server'
import { action, actionError } from '@/lib/action-errors'

function assertPaidByInGroup(
  paidById: string,
  group: { memberA: string; memberB: string | null },
) {
  assertMemberInGroup(paidById, group, 'payer_not_in_group')
}

export const createRule = action(async (input: RecurringExpenseRuleInput): Promise<{ id: string }> => {
  const v = validateRecurringExpenseRuleInput(input)
  const { user, group } = await requireViewerGroup()
  assertPaidByInGroup(v.paidBy, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  // Snap the anchor forward so a back-dated `startsOn` cannot leave the rule
  // showing a "next run" date that has already been and gone (#1244).
  // `firstAnchorFromStart` only aligns the anchor to `dayOfMonth`; with a
  // back-dated start that anchor is itself in the past.
  //
  // **Creating includes today; editing and resuming do not. The asymmetry is
  // the decision, not a typo — do not "fix" it into agreement.** The two
  // answer different questions:
  //
  //  - Creating, the user has just said "the Nth of every month". When today
  //    *is* the Nth they mean this month, so today's anchor is kept and
  //    tonight's cron materialises it. And **how they filled `startsOn` must
  //    not change that answer**: `startsOn` says which period the series is
  //    counted from, not when the first card shows up. Back-dating a rule to
  //    last November and starting it today are the same intent once the
  //    series lands on today, so they get the same first period.
  //  - Editing, `sheet.editEffectHint` is on screen while they save, and it
  //    promises 改動從下一期開始套用 / 已經出現的待確認卡片…維持原樣. Pulling
  //    today in would break a promise the user is reading as they act.
  //
  // Mechanically: `snapToFuture` walks while `curr <= cutoff`, so passing the
  // day *before* today makes today the earliest period it will settle on —
  // both for the anchor-is-today case and for a back-dated series that lands
  // on today. `snapToFuture` itself is left alone; it is shared with
  // `updateRule` / `resumeRule`, whose semantics do not change.
  //
  // `today` stays UTC-derived (as in `updateRule` / `resumeRule`) because the
  // question it answers is "will tonight's cron pick this up", and the cron
  // compares against Postgres `CURRENT_DATE`, also UTC. Whether both should
  // move to Asia/Taipei is #1262, not this change.
  const today = new Date().toISOString().slice(0, 10)
  const firstAnchor = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)
  const nextOccurrenceAt = firstAnchor >= today
    ? firstAnchor
    : snapToFuture(firstAnchor, v.intervalMonths, v.dayOfMonth, previousDay(today))

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
})

export interface UpdateRuleInput extends RecurringExpenseRuleInput {
  id: string
}

export const updateRule = action(async (input: UpdateRuleInput): Promise<{ id: string }> => {
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
  if (!existing) throw actionError('recurring_rule_not_found')

  // `>` and not `>=`, unlike `createRule` (#1244): `sheet.editEffectHint` is on
  // screen while the user saves, promising the change applies from the *next*
  // period. Today stays out. See the long comment in `createRule` above.
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
})

export const pauseRule = action(async (id: string): Promise<void> => {
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
  if (!updated) throw actionError('recurring_rule_not_found')
  revalidateAfterRecurringExpenseRuleMutation()
})

export const resumeRule = action(async (id: string): Promise<void> => {
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
  if (!rule) throw actionError('recurring_rule_not_found')

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
})

export const softDeleteRule = action(async (id: string): Promise<void> => {
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
    if (!updated) throw actionError('recurring_rule_not_found')

    await tx
      .delete(pendingExpenseOccurrences)
      .where(and(
        eq(pendingExpenseOccurrences.ruleId, id),
        isNull(pendingExpenseOccurrences.skippedAt),
        isNull(pendingExpenseOccurrences.resolvedTxId),
      ))
  })

  revalidateAfterRecurringExpenseRuleMutation()
})

export const confirmPending = action(async (pendingId: string): Promise<{ txId: string }> => {
  const { user, group } = await getViewerWriteContext()

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
  if (!row) throw actionError('pending_expense_not_found')

  // Race guard: snapshot's paidBy may have left the group between cron generation
  // and confirmation. Surfacing this as a race message lets the UI prompt the user
  // to re-pick a payer via 「改一下」 instead of inserting an orphan.
  if (row.proposedPaidBy !== group.memberA && row.proposedPaidBy !== group.memberB) {
    throw actionError('pending_expense_partner_handled')
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cashTransactions)
      .values({
        groupId: row.groupId,
        paidBy: row.proposedPaidBy,
        amount: row.proposedAmount,
        splitType: row.proposedSplitType,
        // #1243 — carry the snapshotted weighted ratio onto the record. A
        // 'weighted' CashTransaction with split_ratio_a NULL is read three
        // different ways and none of them errors: 50/50 by lib/balance.ts,
        // all-payer's by CompactRow, and dropped from the SUM entirely by
        // recalcGroupBalance.
        splitRatioA: row.proposedSplitRatioA,
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
    if (!resolved) throw actionError('pending_expense_handled_elsewhere')

    await recalcGroupBalance(group.id, tx)
    const firstRecord = await isUserFirstNonDeletedRecord(tx, user.id, group.id)
    return { txId: created.id, firstRecord }
  })

  revalidateAfterTransactionMutation({ assetId: row.assetId })
  // Milestone signal (#891, not the activation metric — see #1127): cron-confirmed occurrence may be viewer's first record.
  if (result.firstRecord) {
    await captureServer(user.id, 'first_record_created', { via: 'recurring_confirm' })
  }
  return { txId: result.txId }
})

export interface EditAndConfirmInput {
  pendingId: string
  overrides: ConfirmPendingExpenseOverrides
}

// Phase 2 surface: shipped + tested in PR #2 so the PR #5 wiring of the AddSheet
// 「改一下」 path (AddSheet prefilled with pending values, submit routes here) is
// mechanical. Currently no UI caller; do not remove. Each override field is
// independent — undefined keeps the snapshot value, defined replaces it.
export const editAndConfirmPending = action(async (
  input: EditAndConfirmInput,
): Promise<{ txId: string }> => {
  const overrides = validateConfirmPendingExpenseInput(input.overrides)
  const { user, group } = await getViewerWriteContext()

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
  if (!row) throw actionError('pending_expense_not_found')

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
    if (!resolved) throw actionError('pending_expense_handled_elsewhere')

    await recalcGroupBalance(group.id, tx)
    const firstRecord = await isUserFirstNonDeletedRecord(tx, user.id, group.id)
    return { txId: created.id, firstRecord }
  })

  revalidateAfterTransactionMutation({ assetId: finalAssetId })
  // Milestone signal (#891, not the activation metric — see #1127): edited-and-confirmed occurrence may be viewer's first record.
  if (result.firstRecord) {
    await captureServer(user.id, 'first_record_created', { via: 'recurring_confirm' })
  }
  return { txId: result.txId }
})

export const skipPending = action(async (pendingId: string): Promise<void> => {
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
  if (!updated) throw actionError('pending_expense_not_found')
  revalidatePath('/dashboard')
})
