'use server'

import { db } from '@/lib/db/client'
import { groupEpochs, groupInvites, oikosGroups, profiles } from '@/lib/db/schema'
import {
  classifyGroupClaimMiss,
  classifyUnclaimableInvite,
  generateToken,
  getInviteUrl,
  INVITE_TTL_MS,
  validateInviteAcceptance,
  type InviteAcceptError,
} from '@/lib/invite'
import { requireViewer, requireViewerGroup } from '@/lib/auth/viewer'
import { captureServer } from '@/lib/analytics/server'
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { action } from '@/lib/action-errors'

export type InvitePreview =
  | { ok: true; groupName: string; inviterName: string; hasSoloLedger: boolean; groupId: string }
  | { ok: false; error: InviteAcceptError; partnerName?: string }

/**
 * Mint an invite link, valid for {@link INVITE_TTL_MS} (24 h), for the
 * viewer's own ledger.
 *
 * #1031 — we do NOT accept a `groupId` arg: the group is resolved from the
 * viewer, so a caller-supplied id is structurally unrepresentable. Same
 * convention as `toggleGuardianBeta` (actions/group.ts). The previous shape
 * `createInvite(groupId)` gated on `requireViewer()` only, which let anyone
 * signed in mint an invite for *any* group id — and a group id is not a
 * secret to an ex-partner (it ships in every dashboard RSC payload), so an
 * ex-partner could re-invite themselves into the ledger they had left once it
 * was back to solo. Resolving the group here, rather than validating an
 * argument, is deliberate: a shared `requireGroupMember(groupId)` guard would
 * keep inviting future callers to pass an id and trust the guard.
 *
 * #1288 — one open invite per group. Minting supersedes (revokes) every
 * earlier open invite of the group, so a link sent earlier stops working as
 * soon as a newer one exists. This is not a user-facing "revoke": nothing in
 * the UI says so, and the changelog must call it "superseded".
 */
export const createInvite = action(async (): Promise<string> => {
  const { user, group } = await requireViewerGroup()

  const token = generateToken()
  // DB clock, like `created_at` and the claim in acceptInvite: the expiry is
  // exactly `created_at + TTL`, whatever the app server's clock says.
  const expiresAt = sql`now() + make_interval(secs => ${INVITE_TTL_MS / 1000})`

  let superseded: number
  try {
    superseded = await db.transaction(async (tx) => {
      // Lock the group row first so two mints racing each other serialise:
      // the second waits, then supersedes the first one's invite. Without the
      // lock nothing errors — two links are simply left live, and once the
      // one-open-invite unique index exists the loser fails with 23505.
      //
      // Lock order: group row, then invite rows. acceptInvite takes them in
      // the same order; see the note there.
      const [locked] = await tx
        .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
        .from(oikosGroups)
        .where(eq(oikosGroups.id, group.id))
        .for('update')

      // Server-side solo guard. An invite into a full ledger can never be
      // accepted and the UI only offers "invite" while solo; re-checked under
      // the lock so a partner who joined a moment ago is seen.
      if (!locked) throw new Error('group_not_found')
      if (locked.memberB !== null) throw new Error('group_full')
      if (locked.memberA !== user.id) throw new Error('inviter_not_member')

      // Expired-but-unrevoked rows are stamped too, on purpose: they are dead
      // anyway, and it keeps "open" meaning "not accepted, not revoked".
      const revoked = await tx
        .update(groupInvites)
        .set({ revokedAt: sql`now()` })
        .where(and(
          eq(groupInvites.groupId, group.id),
          isNull(groupInvites.acceptedAt),
          isNull(groupInvites.revokedAt),
        ))
        .returning({ id: groupInvites.id })

      await tx.insert(groupInvites).values({
        groupId: group.id,
        invitedBy: user.id,
        token,
        expiresAt,
      })

      return revoked.length
    })
  } catch (e) {
    // 23505 can only mean the one-open-invite invariant was broken some other
    // way (a token collision is ruled out by 256 random bits). Return it as an
    // expected failure instead of a raw driver error; the client shows its
    // generic message.
    if (pgErrorCode(e) === '23505') throw new Error('invite_conflict')
    throw e
  }

  // #1288 — how often a live link is replaced by a newer one. Never carries
  // the token.
  if (superseded > 0) {
    await captureServer(user.id, 'invite_superseded', { group_id: group.id, count: superseded })
  }

  // Invite-funnel denominator (#734): an invite was sent. The matching
  // numerator is `partner_joined` when the invitee accepts.
  await captureServer(user.id, 'invite_created', { group_id: group.id })

  return getInviteUrl(token)
})

/** The Postgres SQLSTATE of a driver error, whether or not Drizzle wrapped it. */
function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e
  for (let depth = 0; cur && depth < 3; depth++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string') return code
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

/**
 * Validate an invite token without committing membership.
 * Used for the bilateral trust confirmation step on the invitee side: we want
 * to surface "is this invite still good?" + the inviter's name *before* the
 * invitee clicks the confirm CTA.
 */
export const previewInvite = action(async (token: string): Promise<InvitePreview> => {
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
    // #1288 — makes dead links that people still open visible: a superseded
    // link reads `revoked`, one that ran out reads `expired`. The code only —
    // never the token, which is a live credential until it dies.
    await captureServer(user.id, 'invite_preview_failed', { code: result.error })
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
    // #1415 — lets the client pair `invite_link_opened` with the server-side
    // `invite_created` / `partner_joined` events on the same business key.
    // This row is already loaded for the preview above; no extra query.
    groupId: group.id,
  }
})

export const acceptInvite = action(async (token: string): Promise<string> => {
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

  await db.transaction(async (tx) => {
    // #1288 — lock order. Take the group row before the invite row, the same
    // order as createInvite (group FOR UPDATE, then supersede the invites).
    // Claiming the invite first and updating the group second is the opposite
    // order: a mint and an accept on the same solo group could each hold one
    // lock and wait for the other, Postgres aborts one with 40P01 (deadlock),
    // and the loser only sees the generic error. With one order, whichever
    // takes the group row first finishes; the other then sees its result:
    // a later mint reads `group_full`, a later accept finds the invite
    // superseded (`revoked`). The locked row itself is not used — the guarded
    // UPDATE below still re-checks the group.
    await tx
      .select({ id: oikosGroups.id })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, invite.groupId))
      .for('update')

    // #1288 — the claim. It runs right after the group lock and it
    // is atomic: one conditional UPDATE that only matches while the invite is
    // still unaccepted, unrevoked and unexpired by the DB clock. The checks
    // above ran on a row read earlier; a revoke (supersede, partner removal,
    // leave) or an expiry landing in between used to be ignored, and the
    // accept went through with nothing erroring. A concurrent second accept
    // blocks on the row lock, then matches zero rows. Every later throw in
    // this callback rolls the claim back.
    const claimed = await tx
      .update(groupInvites)
      .set({ acceptedAt: sql`now()` })
      .where(and(
        eq(groupInvites.id, invite.id),
        isNull(groupInvites.acceptedAt),
        isNull(groupInvites.revokedAt),
        gt(groupInvites.expiresAt, sql`now()`),
      ))
      .returning({ acceptedAt: groupInvites.acceptedAt })

    if (claimed.length === 0) {
      const [current] = await tx
        .select({
          acceptedAt: groupInvites.acceptedAt,
          revokedAt: groupInvites.revokedAt,
          expiredByDbClock: sql<boolean>`${groupInvites.expiresAt} <= now()`,
        })
        .from(groupInvites)
        .where(eq(groupInvites.id, invite.id))
        .limit(1)
      throw new Error(classifyUnclaimableInvite(current ?? null))
    }

    // One instant for the whole join: the epoch boundaries below use the
    // moment the invite was stamped accepted.
    const now = claimed[0].acceptedAt ?? new Date()

    // Bump the epoch as the partner joins — relevant for groups that were
    // solo after a prior leave so the new relationship's timeline / stats
    // start fresh once PR 3 layers epoch filtering on top.
    //
    // #1288 — `member_a = invited_by` re-checks #1031's "issuer is still a
    // member" in the same statement that seats member_b.
    const updated = await tx
      .update(oikosGroups)
      .set({ memberB: user.id, currentEpochStartedAt: now })
      .where(and(
        eq(oikosGroups.id, invite.groupId),
        isNull(oikosGroups.memberB),
        eq(oikosGroups.memberA, invite.invitedBy),
      ))
      .returning()

    if (updated.length === 0) {
      const [current] = await tx
        .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
        .from(oikosGroups)
        .where(eq(oikosGroups.id, invite.groupId))
        .limit(1)
      throw new Error(classifyGroupClaimMiss(current ?? null, invite.invitedBy))
    }
    const [updatedGroup] = updated

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
})
