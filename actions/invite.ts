'use server'

import { db } from '@/lib/db/client'
import { groupEpochs, groupInvites, oikosGroups, profiles } from '@/lib/db/schema'
import {
  generateToken,
  getInviteUrl,
  validateInviteAcceptance,
  type InviteAcceptError,
} from '@/lib/invite'
import { requireViewer } from '@/lib/auth/viewer'
import { captureServer } from '@/lib/analytics/server'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'

export type InvitePreview =
  | { ok: true; groupName: string; inviterName: string; hasSoloLedger: boolean }
  | { ok: false; error: InviteAcceptError; partnerName?: string }

export async function createInvite(groupId: string): Promise<string> {
  const { user } = await requireViewer()

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(groupInvites).values({
    groupId,
    invitedBy: user.id,
    token,
    expiresAt,
  })

  // Invite-funnel denominator (#734): an invite was sent. The matching
  // numerator is `partner_joined` when the invitee accepts.
  await captureServer(user.id, 'invite_created', { group_id: groupId })

  return getInviteUrl(token)
}

/**
 * Validate an invite token without committing membership.
 * Used for the bilateral trust confirmation step on the invitee side: we want
 * to surface "is this invite still good?" + the inviter's name *before* the
 * invitee clicks the confirm CTA.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const { user } = await requireViewer()

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const viewerActiveGroup = await getActiveGroupForUser(user.id)
  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id, viewerActiveGroup)
  if (!result.ok) {
    if (result.error === 'already_in_duo' && viewerActiveGroup) {
      const partnerId =
        viewerActiveGroup.memberA === user.id ? viewerActiveGroup.memberB : viewerActiveGroup.memberA
      const [partner] = partnerId
        ? await db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, partnerId)).limit(1)
        : []
      return { ok: false, error: result.error, partnerName: partner?.displayName ?? '' }
    }
    return { ok: false, error: result.error }
  }

  const [inviter] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, invite.invitedBy))
    .limit(1)

  // Solo ledger elsewhere → it becomes a past chapter on accept; surface a
  // gentle notice (#912). Duo is already rejected above.
  const hasSoloLedger =
    !!viewerActiveGroup && viewerActiveGroup.id !== group.id && viewerActiveGroup.memberB === null

  return {
    ok: true,
    groupName: group.name,
    inviterName: inviter?.displayName ?? '',
    hasSoloLedger,
  }
}

export async function acceptInvite(token: string): Promise<string> {
  const { user } = await requireViewer()

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const viewerActiveGroup = await getActiveGroupForUser(user.id)
  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id, viewerActiveGroup)
  if (!result.ok) throw new Error(result.error)

  const now = new Date()
  await db.transaction(async (tx) => {
    // Bump the epoch as the partner joins — relevant for groups that were
    // solo after a prior leave so the new relationship's timeline / stats
    // start fresh once PR 3 layers epoch filtering on top.
    const updated = await tx
      .update(oikosGroups)
      .set({ memberB: user.id, currentEpochStartedAt: now })
      .where(and(eq(oikosGroups.id, invite.groupId), isNull(oikosGroups.memberB)))
      .returning()

    if (updated.length === 0) throw new Error('group_full')
    const [updatedGroup] = updated

    await tx
      .update(groupInvites)
      .set({ acceptedAt: now })
      .where(and(eq(groupInvites.token, token), isNull(groupInvites.acceptedAt)))

    // Close the prior open epoch row on this group (if any — backfilled rows
    // exist for groups created before 0030, and prior chapters were created
    // by acceptInvite/leaveGroup hooks).
    await tx
      .update(groupEpochs)
      .set({ endedAt: now })
      .where(and(eq(groupEpochs.groupId, invite.groupId), isNull(groupEpochs.endedAt)))

    // Close any leftover open epoch elsewhere where the accepter is the sole
    // member. Scenario: accepter previously leaveGroup'd into a personal solo
    // group Y, then accepted this invite. Y's chapter ends at the moment they
    // re-join — preserves the invariant 「a user has at most one open epoch」.
    // Scoped to solo (member_a only, no member_b) so we never close a duo
    // group's epoch — that case shouldn't happen via the documented flow, but
    // the guard makes the operation impossible to misuse.
    await tx
      .update(groupEpochs)
      .set({ endedAt: now })
      .where(and(
        isNull(groupEpochs.endedAt),
        eq(groupEpochs.memberAId, user.id),
        isNull(groupEpochs.memberBId),
        ne(groupEpochs.groupId, invite.groupId),
      ))

    // Open the new duo epoch — member_a stays as is, member_b is the joiner.
    await tx.insert(groupEpochs).values({
      groupId: invite.groupId,
      startedAt: now,
      memberAId: updatedGroup.memberA,
      memberBId: user.id,
    })
  })

  // Invite-funnel conversion (#734): the invitee (member_b) joined. Keyed on
  // the joiner; `inviter_id` lets the two sides be correlated in analysis.
  await captureServer(user.id, 'partner_joined', {
    group_id: invite.groupId,
    inviter_id: invite.invitedBy,
  })

  return invite.groupId
}
