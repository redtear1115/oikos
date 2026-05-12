'use server'

import { db } from '@/lib/db/client'
import {
  assets,
  carDetails,
  groupBalance,
  groupEpochs,
  groupInvites,
  houseDetails,
  insuranceDetails,
  invoiceCredentials,
  monthlyReviewMessages,
  oikosGroups,
  profiles,
  settlements,
} from '@/lib/db/schema'
import { recalcGroupBalance, getGroupBalance } from '@/lib/db/queries/balance'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  revalidateSettings,
  revalidateAfterMembershipChange,
} from '@/lib/revalidate'
import { revalidatePath } from 'next/cache'

const SWAP_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function getViewerAndDuoGroup() {
  const { user, group } = await requireViewerGroup()
  if (group.memberB === null) throw new Error('solo_group')
  return { user, group: { ...group, memberB: group.memberB as string } }
}

/**
 * Member A or B proposes a role swap. The other party must confirm.
 *
 * This exists because member_a is schema-pinned (NOT NULL) on OikosGroups.
 * For member_a to "leave", they must first swap into the member_b slot, then
 * call leaveGroup. We model the swap as a two-step proposal so the partner
 * gets a chance to confirm.
 */
export async function proposeSwap(): Promise<{ ok: true }> {
  const { user, group } = await getViewerAndDuoGroup()

  if (group.pendingSwapProposedBy !== null) {
    throw new Error('swap_already_pending')
  }

  const expiresAt = new Date(Date.now() + SWAP_TTL_MS)

  await db
    .update(oikosGroups)
    .set({
      pendingSwapProposedBy: user.id,
      pendingSwapExpiresAt: expiresAt,
    })
    .where(and(
      eq(oikosGroups.id, group.id),
      isNull(oikosGroups.pendingSwapProposedBy),
    ))

  revalidateSettings()
  return { ok: true }
}

/**
 * Either member can cancel a pending swap proposal.
 * Proposer cancels = retract. Other party cancels = reject.
 * Same DB write either way; UX layer can distinguish via who's logged in.
 */
export async function cancelSwap(): Promise<{ ok: true }> {
  const { group } = await getViewerAndDuoGroup()

  if (group.pendingSwapProposedBy === null) {
    throw new Error('no_pending_swap')
  }

  await db
    .update(oikosGroups)
    .set({
      pendingSwapProposedBy: null,
      pendingSwapExpiresAt: null,
    })
    .where(eq(oikosGroups.id, group.id))

  revalidateSettings()
  return { ok: true }
}

/**
 * The non-proposer member confirms the swap. Atomically:
 *   1. Swap member_a / member_b columns on OikosGroups
 *   2. Flip default_split_ratio_a → 100 - default_split_ratio_a (if set)
 *   3. Flip split_ratio_a on weighted CashTransactions / RecurringExpenseRules /
 *      PendingExpenseOccurrences (their semantics are "member_a's share")
 *   4. Clear the pending swap fields
 *   5. Recalc GroupBalance (balance is signed from member_a's POV)
 *
 * Epoch is NOT bumped — it's the same two-person relationship, just relabelled.
 */
export async function confirmSwap(): Promise<{ ok: true }> {
  const { user, group } = await getViewerAndDuoGroup()

  if (group.pendingSwapProposedBy === null) {
    throw new Error('no_pending_swap')
  }
  if (group.pendingSwapExpiresAt && group.pendingSwapExpiresAt < new Date()) {
    throw new Error('swap_expired')
  }
  if (group.pendingSwapProposedBy === user.id) {
    throw new Error('cannot_confirm_own_proposal')
  }
  if (user.id !== group.memberA && user.id !== group.memberB) {
    throw new Error('not_a_member')
  }

  await db.transaction(async (tx) => {
    // 1. Swap members
    await tx
      .update(oikosGroups)
      .set({
        memberA: group.memberB,
        memberB: group.memberA,
        pendingSwapProposedBy: null,
        pendingSwapExpiresAt: null,
      })
      .where(eq(oikosGroups.id, group.id))

    // 2. Flip group-default split ratio
    if (group.defaultSplitRatioA !== null) {
      await tx
        .update(oikosGroups)
        .set({ defaultSplitRatioA: 100 - group.defaultSplitRatioA })
        .where(eq(oikosGroups.id, group.id))
    }

    // 3a. Flip CashTransactions.split_ratio_a (weighted rows only; column is
    // nullable so the IS NOT NULL guard avoids touching non-weighted txs)
    await tx.execute(sql`
      UPDATE "CashTransactions"
      SET split_ratio_a = 100 - split_ratio_a
      WHERE group_id = ${group.id} AND split_ratio_a IS NOT NULL
    `)

    // 3b. RecurringExpenseRules.split_ratio_a
    await tx.execute(sql`
      UPDATE "RecurringExpenseRules"
      SET split_ratio_a = 100 - split_ratio_a
      WHERE group_id = ${group.id} AND split_ratio_a IS NOT NULL
    `)

    // 3c. PendingExpenseOccurrences.proposed_split_ratio_a
    await tx.execute(sql`
      UPDATE "PendingExpenseOccurrences"
      SET proposed_split_ratio_a = 100 - proposed_split_ratio_a
      WHERE group_id = ${group.id} AND proposed_split_ratio_a IS NOT NULL
    `)

    // 4. Balance is signed from member_a POV — recompute after swap
    await recalcGroupBalance(group.id, tx)
  })

  revalidateSettings()
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Member B leaves the group, taking their personal data into a fresh solo
 * group. Member A stays in the original group, which becomes solo.
 *
 * Pre-conditions:
 *   - Caller must be member_b (member_a must swap first via proposeSwap +
 *     confirmSwap; swap-then-leave is a deliberate two-action flow)
 *   - Group must have both members (memberB IS NOT NULL)
 *   - GroupBalance.balance MUST be 0 (settle first via a final Settlement)
 *
 * Partition rules:
 *   - CashTransactions / Settlements: by paid_by
 *   - IncomeTransactions: by recipient_id
 *   - RecurringExpenseRules: by paid_by (split_type → all_mine, split_ratio_a → NULL)
 *   - RecurringIncomeRules: by recipient_id
 *   - Pending occurrences: cascade with their rules
 *   - Assets: House by owner, Car by primary_user_id, Insurance by insured_user_id
 *     (Child / Pet / Plant have no owner field → stay in original group)
 *   - FuelLogs: follow car via asset_id (no group_id column)
 *   - InvoiceCredentials: by user_id; Snapshots / Runs stay (group records)
 *   - MonthlyReviewMessages: by member_id; Snapshots stay (group analytics)
 *   - Transactions / rules whose asset_id points to a staying asset: set NULL
 *     to preserve same-group invariant
 *   - GroupInvites with no acceptedAt: revoke
 *   - current_epoch_started_at: bumped on both groups (new chapters)
 *
 * Irreversible.
 */
export async function leaveGroup(): Promise<{ groupId: string }> {
  const { user, group } = await requireViewerGroup()

  if (group.memberB === null) throw new Error('solo_group')
  if (user.id !== group.memberB) throw new Error('only_member_b_can_leave')

  const balance = await getGroupBalance(group.id)
  if (balance !== 0) throw new Error('balance_not_zero')

  const leaver = user.id
  const oldGroupId = group.id

  // Fetch leaver's display name BEFORE the transaction so we can name the new
  // solo group sensibly. Falls back to "我的家計簿" if profile is somehow gone.
  const [leaverProfile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, leaver))
    .limit(1)
  const newGroupName = leaverProfile?.displayName
    ? `${leaverProfile.displayName} 的家計簿`
    : '我的家計簿'

  // Determine which assets follow the leaver. We do this up-front so we can
  // also figure out which asset_id references on moving txs/rules must be
  // nulled out (those pointing to staying assets).
  const movingHouseRows = await db
    .select({ assetId: houseDetails.assetId })
    .from(houseDetails)
    .innerJoin(assets, eq(assets.id, houseDetails.assetId))
    .where(and(
      eq(assets.groupId, oldGroupId),
      eq(houseDetails.owner, leaver),
    ))
  const movingCarRows = await db
    .select({ assetId: carDetails.assetId })
    .from(carDetails)
    .innerJoin(assets, eq(assets.id, carDetails.assetId))
    .where(and(
      eq(assets.groupId, oldGroupId),
      eq(carDetails.primaryUserId, leaver),
    ))
  const movingInsuranceRows = await db
    .select({ assetId: insuranceDetails.assetId })
    .from(insuranceDetails)
    .innerJoin(assets, eq(assets.id, insuranceDetails.assetId))
    .where(and(
      eq(assets.groupId, oldGroupId),
      eq(insuranceDetails.insuredUserId, leaver),
    ))

  const movingAssetIds = [
    ...movingHouseRows.map((r) => r.assetId),
    ...movingCarRows.map((r) => r.assetId),
    ...movingInsuranceRows.map((r) => r.assetId),
  ]

  // Empty array would interpolate as `ANY(()::uuid[])` (invalid SQL), so
  // short-circuit to NULL when nothing is moving with the leaver.
  const assetIdCase = movingAssetIds.length > 0
    ? sql`CASE WHEN asset_id = ANY(${movingAssetIds}::uuid[]) THEN asset_id ELSE NULL END`
    : sql`NULL`

  const now = new Date()
  const newGroupId = await db.transaction(async (tx) => {
    // 1. Create the leaver's new solo group + balance row
    const [newGroup] = await tx
      .insert(oikosGroups)
      .values({
        name: newGroupName,
        memberA: leaver,
        memberB: null,
        currentEpochStartedAt: now,
      })
      .returning({ id: oikosGroups.id })

    await tx.insert(groupBalance).values({
      groupId: newGroup.id,
      balance: 0,
      version: 0,
    })

    // Open the leaver's fresh solo epoch on the new group (no prior open row
    // exists since the group itself is brand-new).
    await tx.insert(groupEpochs).values({
      groupId: newGroup.id,
      startedAt: now,
      memberAId: leaver,
      memberBId: null,
    })

    // 2. Move assets owned by the leaver
    if (movingAssetIds.length > 0) {
      await tx
        .update(assets)
        .set({ groupId: newGroup.id })
        .where(inArray(assets.id, movingAssetIds))
    }

    // 3. Move CashTransactions where paid_by = leaver. asset_id stays put if
    // it points to a moving asset; otherwise it's nulled to preserve the
    // application invariant that a tx's group_id matches its asset's group_id.
    // Uses CASE so each row's asset_id is decided in one pass.
    await tx.execute(sql`
      UPDATE "CashTransactions"
      SET group_id = ${newGroup.id},
          asset_id = ${assetIdCase}
      WHERE group_id = ${oldGroupId} AND paid_by = ${leaver}
    `)

    // 4. Move IncomeTransactions where recipient_id = leaver
    await tx.execute(sql`
      UPDATE "IncomeTransactions"
      SET group_id = ${newGroup.id},
          asset_id = ${assetIdCase}
      WHERE group_id = ${oldGroupId} AND recipient_id = ${leaver}
    `)

    // 5. Move Settlements where paid_by = leaver. Settlements have no asset_id.
    await tx
      .update(settlements)
      .set({ groupId: newGroup.id })
      .where(and(
        eq(settlements.groupId, oldGroupId),
        eq(settlements.paidBy, leaver),
      ))

    // 6. Move RecurringExpenseRules where paid_by = leaver, converting
    // split_type → 'all_mine' and clearing split_ratio_a (solo semantics).
    await tx.execute(sql`
      UPDATE "RecurringExpenseRules"
      SET group_id = ${newGroup.id},
          split_type = 'all_mine',
          split_ratio_a = NULL,
          asset_id = ${assetIdCase}
      WHERE group_id = ${oldGroupId} AND paid_by = ${leaver}
    `)

    // 7. Move PendingExpenseOccurrences for the leaver's rules. Rules now
    // live in newGroupId; their group_id was just updated, so pending rows
    // referencing those rules must follow. Use a subquery: occurrences
    // whose rule_id now belongs to newGroup.
    await tx.execute(sql`
      UPDATE "PendingExpenseOccurrences"
      SET group_id = ${newGroup.id},
          proposed_paid_by = ${leaver},
          proposed_split_type = 'all_mine',
          proposed_split_ratio_a = NULL
      WHERE group_id = ${oldGroupId}
        AND rule_id IN (
          SELECT id FROM "RecurringExpenseRules" WHERE group_id = ${newGroup.id}
        )
    `)

    // 8. Move RecurringIncomeRules where recipient_id = leaver
    await tx.execute(sql`
      UPDATE "RecurringIncomeRules"
      SET group_id = ${newGroup.id},
          asset_id = ${assetIdCase}
      WHERE group_id = ${oldGroupId} AND recipient_id = ${leaver}
    `)

    // 9. Move PendingIncomeOccurrences for leaver's rules
    await tx.execute(sql`
      UPDATE "PendingIncomeOccurrences"
      SET group_id = ${newGroup.id}
      WHERE group_id = ${oldGroupId}
        AND rule_id IN (
          SELECT id FROM "RecurringIncomeRules" WHERE group_id = ${newGroup.id}
        )
    `)

    // 10. Move InvoiceCredentials where user_id = leaver. Snapshots and Runs
    // stay (group共同記錄, per design).
    await tx
      .update(invoiceCredentials)
      .set({ groupId: newGroup.id })
      .where(and(
        eq(invoiceCredentials.groupId, oldGroupId),
        eq(invoiceCredentials.userId, leaver),
      ))

    // 11. Move MonthlyReviewMessages where member_id = leaver
    await tx
      .update(monthlyReviewMessages)
      .set({ groupId: newGroup.id })
      .where(and(
        eq(monthlyReviewMessages.groupId, oldGroupId),
        eq(monthlyReviewMessages.memberId, leaver),
      ))

    // 12. Revoke any unaccepted GroupInvites on the old group
    await tx
      .update(groupInvites)
      .set({ revokedAt: now })
      .where(and(
        eq(groupInvites.groupId, oldGroupId),
        isNull(groupInvites.acceptedAt),
        isNull(groupInvites.revokedAt),
      ))

    // 13. Clear member_b on the old group (becomes solo), bump epoch, and
    // clear any leftover pending-swap fields (defensive — should be null
    // already, but a stale proposal at the moment of leave would otherwise
    // strand the now-solo group with garbage state).
    await tx
      .update(oikosGroups)
      .set({
        memberB: null,
        pendingSwapProposedBy: null,
        pendingSwapExpiresAt: null,
        currentEpochStartedAt: now,
      })
      .where(eq(oikosGroups.id, oldGroupId))

    // 13a. Close the duo chapter on the old group and open the stayer's
    // solo chapter. Same `now` so the past-times list shows a clean handoff.
    await tx
      .update(groupEpochs)
      .set({ endedAt: now })
      .where(and(eq(groupEpochs.groupId, oldGroupId), isNull(groupEpochs.endedAt)))

    await tx.insert(groupEpochs).values({
      groupId: oldGroupId,
      startedAt: now,
      memberAId: group.memberA,
      memberBId: null,
    })

    // 14. Recalc both balances. Both should resolve to 0 (the new group is
    // brand-new; the old group is now solo so the short-circuit applies).
    await recalcGroupBalance(oldGroupId, tx)
    await recalcGroupBalance(newGroup.id, tx)

    return newGroup.id
  })

  revalidateAfterMembershipChange()
  return { groupId: newGroupId }
}
