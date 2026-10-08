'use server'

import { db } from '@/lib/db/client'
import { groupEpochs, groupInvites, oikosGroups, profiles, pushTokens, trips } from '@/lib/db/schema'
import {
  classifyGroupClaimMiss,
  classifyUnclaimableInvite,
  generateToken,
  getInviteUrl,
  hashToken,
  INVITE_TTL_MS,
  isWellFormedInviteToken,
  validateInviteAcceptance,
  type InviteAcceptError,
} from '@/lib/invite'
import { requireViewer, requireViewerGroup } from '@/lib/auth/viewer'
import { captureServer, isUserFirstNonDeletedRecord } from '@/lib/analytics/server'
import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { boundarySql, lockForEpochClose } from '@/lib/db/queries/epoch'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { hasActiveTrip } from '@/lib/db/queries/trips'
import { foldTripIntoLedger } from '@/lib/trip/endTripInTx'
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
        // #1288 I3c — only the hash is stored. The token itself exists only
        // in the URL returned below.
        tokenHash: hashToken(token),
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

export interface RevokeOpenInvitesResult {
  /** Live (not yet expired) links this call made unusable. 0 or 1 since 0076. */
  revoked: number
  /**
   * The partner joined before this call got the group lock. Nothing was
   * revoked, and the caller must not report the revoke as done.
   */
  partnerJoined: boolean
}

/**
 * #1546 — make the viewer's open invite link unusable, from settings.
 *
 * Zero parameters on purpose (#1031): the group is resolved from the viewer,
 * never passed in. Same lock order and same UPDATE as createInvite's
 * supersede, so the two serialise against each other and against acceptInvite:
 *
 * - group row FOR UPDATE first, then the invite rows. Touching the invite
 *   rows first would invert acceptInvite's order; failure looks like a 40P01
 *   deadlock surfacing as a generic error on one side.
 * - only `revoked_at` is set. No DELETE and no `expires_at` change: either
 *   would turn the invitee's message from `revoked` into
 *   `invalid_or_expired` / `expired`, and a DELETE drops the audit row.
 *   acceptInvite's atomic claim (`revoked_at IS NULL` under the same group
 *   lock) is what actually makes the link dead.
 *
 * Membership is re-checked under the lock: the active group resolved above
 * can be stale (a leave in another tab), so a viewer who is no longer
 * member_a of that solo ledger gets `inviter_not_member` and touches nothing.
 */
export const revokeOpenInvites = action(async (): Promise<RevokeOpenInvitesResult> => {
  const { user, group } = await requireViewerGroup()

  const result = await db.transaction(async (tx): Promise<RevokeOpenInvitesResult> => {
    const [locked] = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, group.id))
      .for('update')

    if (!locked) throw new Error('group_not_found')
    if (locked.memberA !== user.id && locked.memberB !== user.id) throw new Error('inviter_not_member')
    // An accept won the race (or the ledger is a duo): its invite is
    // accepted, not open, and there is nothing to retire. Reported as such so
    // the UI never says "revoked" when the partner is already in.
    if (locked.memberB !== null) return { revoked: 0, partnerJoined: true }

    // Expired-but-unrevoked rows are stamped too, as createInvite does, but
    // only rows that were still usable count as "revoked".
    const rows = await tx
      .update(groupInvites)
      .set({ revokedAt: sql`now()` })
      .where(and(
        eq(groupInvites.groupId, group.id),
        isNull(groupInvites.acceptedAt),
        isNull(groupInvites.revokedAt),
      ))
      .returning({ live: sql<boolean>`${groupInvites.expiresAt} > now()` })

    return { revoked: rows.filter((r) => r.live).length, partnerJoined: false }
  })

  // #1546 — how often people kill a live link by hand. Group id and count
  // only: never the token, its hash or the invite id.
  if (result.revoked > 0) {
    await captureServer(user.id, 'invite_revoked', { group_id: group.id, count: result.revoked })
  }

  return result
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
 * #1288 I3c — the invite a token names: by hash only. The plaintext fallback
 * of I3b is gone; it was dropped only after every row had a hash (gate G1).
 * A row without a hash can no longer be found, and its link reads "invalid or
 * expired". Callers check {@link isWellFormedInviteToken} first.
 */
function inviteTokenMatches(token: string) {
  return eq(groupInvites.tokenHash, hashToken(token))
}

/**
 * Validate an invite token without committing membership.
 * Used for the bilateral trust confirmation step on the invitee side: we want
 * to surface "is this invite still good?" + the inviter's name *before* the
 * invitee clicks the confirm CTA.
 */
export const previewInvite = action(async (token: string): Promise<InvitePreview> => {
  const { user } = await requireViewer()

  // #1288 I3 — malformed input is answered like an unknown token, before
  // any query.
  if (!isWellFormedInviteToken(token)) {
    await captureServer(user.id, 'invite_preview_failed', { code: 'invalid_or_expired' })
    return { ok: false, error: 'invalid_or_expired' }
  }

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(inviteTokenMatches(token))
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

  // #1288 I3 — same guard as previewInvite, before any query.
  if (!isWellFormedInviteToken(token)) throw new Error('invalid_or_expired')

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(inviteTokenMatches(token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const viewerActiveGroup = await getActiveGroupForUser(user.id)
  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id, viewerActiveGroup)
  if (!result.ok) throw new Error(result.error)

  // The accepter's other ledgers whose open chapter is a solo one of theirs
  // (e.g. the solo ledger a leave left them with, or one a second tab just
  // created). Their chapters end with this join.
  const otherSoloGroupIds = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
    (await tx
      .select({ groupId: groupEpochs.groupId })
      .from(groupEpochs)
      .where(and(
        isNull(groupEpochs.endedAt),
        eq(groupEpochs.memberAId, user.id),
        isNull(groupEpochs.memberBId),
        ne(groupEpochs.groupId, invite.groupId),
      ))).map((r) => r.groupId.toLowerCase())

  // #1432 — set when the re-read under the locks finds a solo ledger the
  // first read missed. That ledger is not locked, and locking it now would
  // break the ascending group-id order, so the transaction rolls back and
  // runs again: the next pass finds it before the locks. createGroup
  // re-checks under the same profile lock, so it cannot add another ledger
  // for this person while a pass holds it; one retry is expected to be
  // enough, and the bound only stops a loop that should not exist.
  let soloLedgerAppeared = false
  // #1438 — set when the inviter's trip row is held by a trip writer (see the
  // NOWAIT lock below). Same recovery: roll back, run again.
  let tripRowBusy = false
  const MAX_ATTEMPTS = 3

  /** What the transaction reports for analytics once it has committed. */
  type EndedTrip = {
    defaultCurrency: string | null
    startDate: string
    endDate: string | null
    expenseCount: number
  }

  const acceptOnce = () => db.transaction(async (tx): Promise<{ endedTrips: EndedTrip[]; inviterFirstRecord: boolean }> => {
    // Read before the locks; they are locked with the invite's group below,
    // and re-read once the locks are held.
    const otherGroupIds = await otherSoloGroupIds(tx)

    // Lock order (see lockForEpochClose): every group whose chapter this join
    // ends — the invite's group and the accepter's other solo ledgers — FOR
    // NO KEY UPDATE in ascending id, then their open chapter rows, then the
    // boundary from the DB clock. Two accepts touching the same two groups
    // in opposite roles therefore queue instead of deadlocking.
    //
    // #1288 — the group row is taken before the invite row, the same order
    // as createInvite (group FOR UPDATE, then supersede the invites). With
    // one order, whichever takes the group row first finishes; the other
    // then sees its result: a later mint reads `group_full`, a later accept
    // finds the invite superseded (`revoked`).
    //
    // #1432 — the accepter's Profiles row is locked last (profileId), the
    // same row createGroup locks before it re-checks for an existing ledger.
    const lock = await lockForEpochClose(tx, [invite.groupId, ...otherGroupIds], { profileId: user.id })
    const boundary = boundarySql(lock.boundary)

    // 固定兩人: both parties' membership is re-read here, under the locks, so
    // it reflects what is committed now rather than what the validation
    // above saw.
    const pairedElsewhere = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
      .from(oikosGroups)
      .where(and(
        ne(oikosGroups.id, invite.groupId),
        isNotNull(oikosGroups.memberB),
        or(
          inArray(oikosGroups.memberA, [user.id, invite.invitedBy]),
          inArray(oikosGroups.memberB, [user.id, invite.invitedBy]),
        ),
      ))
    const isPaired = (id: string) => pairedElsewhere.some((g) => g.memberA === id || g.memberB === id)
    if (isPaired(user.id)) throw new Error('already_in_duo')
    if (isPaired(invite.invitedBy)) throw new Error('inviter_not_member')

    // #1432 — re-read the accepter's solo ledgers now that their profile row
    // is held. The read before the locks can miss a ledger whose creation
    // committed in between (createGroup in a second tab; or a leaveGroup
    // whose commit the paired check above already saw — this read starts
    // later, so it sees that leave's new solo ledger too, while a leave the
    // check did not see was refused there as `already_in_duo`). Nothing would
    // error: its chapter would stay open next to the new duo one. Start over
    // instead.
    const locked = new Set(otherGroupIds)
    if ((await otherSoloGroupIds(tx)).some((id) => !locked.has(id))) {
      soloLedgerAppeared = true
      throw new Error('acceptInvite: solo ledger appeared under the lock (#1432)')
    }

    // Of the other ledgers found before the locks, the ones that are still the
    // accepter's own solo ledger now that they are locked.
    const lockedOtherIds = otherGroupIds.filter((id) => {
      const g = lock.groups.get(id.toLowerCase())
      return g?.memberA === user.id && g.memberB === null
    })

    // An active trip in a ledger whose chapter this join ends would be left
    // in a closed chapter, where it can no longer be ended. Same fence as
    // leaveGroup's, read under the locks so a trip started while this waited
    // for them is seen.
    for (const id of lockedOtherIds) {
      const openEpoch = lock.openEpochs.get(id.toLowerCase())
      if (openEpoch && await hasActiveTrip(id, openEpoch.id, tx)) {
        throw new Error('accept_active_trip')
      }
    }

    // #1438 — the inviter's side. Their solo chapter closes below, and an
    // active trip in it would be stranded there: "end trip" answers
    // `active_trip_not_found`, new trip expenses `trip_not_found`, and its
    // spending never reaches the ledger — with nothing in any log. So the
    // accept ends it, in this transaction, as if the inviter had pressed "end
    // trip" just before inviting (decision (b) on #1438). The accepter's own
    // active trip is still refused above; that one is theirs to end.
    //
    // Lock order. Trip writers (endTrip, updateTrip, softDeleteTrip, the
    // trip-expense writes) take the trip row and then this chapter row FOR
    // SHARE. This transaction already holds the chapter row, so the trip row
    // comes second here — the reverse order — and is taken NOWAIT. Once the
    // chapter row is ours, whoever holds one of its trip rows is a writer
    // that is waiting (or about to wait) for the chapter row; waiting for it
    // would be a certain deadlock, which Postgres breaks by aborting one side
    // with 40P01 (a generic error for that user). Instead this rolls back and
    // runs again (the loop below): the writer then gets the chapter row and
    // commits in the old chapter, and the next pass sees its result — an
    // endTrip's trip is no longer active, an expense is folded in, a rename
    // is used in the summary. Taking the trip rows before the group lock
    // instead would put them ahead of lockForEpochClose's order, and the
    // account-deletion processor deletes Trips after locking the group.
    //
    // Failure looks like (if this is reordered to wait): an accept racing the
    // inviter's own trip edit fails after ~1s (deadlock_timeout) with a
    // generic error, or the edit does; nothing is written either way.
    const inviteGroupKey = invite.groupId.toLowerCase()
    const inviterEpoch = lock.openEpochs.get(inviteGroupKey)
    const inviterGroup = lock.groups.get(inviteGroupKey)
    let inviterTrips: Array<{ id: string }> = []
    if (inviterEpoch && inviterGroup) {
      try {
        inviterTrips = await tx
          .select({ id: trips.id })
          .from(trips)
          .where(and(
            eq(trips.groupId, invite.groupId),
            eq(trips.epochId, inviterEpoch.id),
            eq(trips.status, 'active'),
            isNull(trips.deletedAt),
          ))
          .orderBy(trips.id)
          .for('no key update', { noWait: true })
      } catch (e) {
        if (pgErrorCode(e) === '55P03') tripRowBusy = true
        throw e
      }
    }

    // #1288 — the claim. It runs right after the locks and it is atomic: one
    // conditional UPDATE that only matches while the invite is still
    // unaccepted, unrevoked and unexpired at the boundary (DB clock). The
    // checks above ran on a row read earlier; a revoke (supersede, partner
    // removal, leave) or an expiry landing in between used to be ignored,
    // and the accept went through with nothing erroring. A concurrent second
    // accept blocks on the row lock, then matches zero rows. Every later
    // throw in this callback rolls the claim back.
    const claimed = await tx
      .update(groupInvites)
      .set({ acceptedAt: boundary })
      .where(and(
        eq(groupInvites.id, invite.id),
        isNull(groupInvites.acceptedAt),
        isNull(groupInvites.revokedAt),
        gt(groupInvites.expiresAt, boundary),
      ))
      .returning({ id: groupInvites.id })

    if (claimed.length === 0) {
      const [current] = await tx
        .select({
          acceptedAt: groupInvites.acceptedAt,
          revokedAt: groupInvites.revokedAt,
          expiredByDbClock: sql<boolean>`${groupInvites.expiresAt} <= ${boundary}`,
        })
        .from(groupInvites)
        .where(eq(groupInvites.id, invite.id))
        .limit(1)
      throw new Error(classifyUnclaimableInvite(current ?? null))
    }

    // #1438 — end the inviter's active trips (locked above) and fold them
    // into the solo chapter that is about to close. Before the group row is
    // re-seated: the summaries split with the solo chapter's members (the
    // locked group row — member_b is still NULL), and the balance is
    // recalculated for that chapter (structurally 0 while solo).
    //
    // One instant for every write: the boundary minus 1µs. It is the last
    // instant of the closing chapter (epochs are [started_at, ended_at) and
    // ended_at is the boundary), so `created_at` of the summary rows is in
    // that chapter by construction — not by comparing two clock reads, and
    // not by the column default (`now()`, this transaction's start, which
    // would also land before the boundary but only because of when it was
    // read). Microseconds are Postgres' resolution, so nothing fits between.
    //
    // End date: the one the trip was planned with, unless that is after the
    // accept day — then the accept day (UTC, as the end-trip sheet's default
    // computes "today"). Never before the start date.
    const endedTrips: EndedTrip[] = []
    let inviterFirstRecord = false
    if (inviterTrips.length > 0 && inviterGroup) {
      const endedAt = sql`(${boundary} - interval '1 microsecond')`
      const endDay = sql`((${endedAt}) AT TIME ZONE 'UTC')::date`
      const ended = await tx
        .update(trips)
        .set({
          status: 'ended',
          endedAt,
          endDate: sql`GREATEST(${trips.startDate}, LEAST(COALESCE(${trips.endDate}, ${endDay}), ${endDay}))`,
        })
        .where(and(
          inArray(trips.id, inviterTrips.map((t) => t.id)),
          eq(trips.status, 'active'),
        ))
        .returning()
      let summaryCount = 0
      for (const trip of ended) {
        const folded = await foldTripIntoLedger(tx, {
          trip: { id: trip.id, name: trip.name, groupId: invite.groupId },
          members: { memberA: inviterGroup.memberA, memberB: inviterGroup.memberB },
          transactedAt: endedAt,
          createdAt: endedAt,
        })
        summaryCount += folded.summaryCount
        endedTrips.push({
          defaultCurrency: trip.defaultCurrency,
          startDate: trip.startDate,
          endDate: trip.endDate,
          expenseCount: folded.expenseCount,
        })
      }
      if (summaryCount > 0) {
        inviterFirstRecord = await isUserFirstNonDeletedRecord(tx, invite.invitedBy, invite.groupId)
      }
    }

    // Bump the epoch as the partner joins — relevant for groups that were
    // solo after a prior leave so the new relationship's timeline / stats
    // start fresh once PR 3 layers epoch filtering on top.
    //
    // #1288 — `member_a = invited_by` re-checks #1031's "issuer is still a
    // member" in the same statement that seats member_b.
    const updated = await tx
      .update(oikosGroups)
      .set({ memberB: user.id, currentEpochStartedAt: boundary })
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
      .set({ endedAt: boundary })
      .where(and(eq(groupEpochs.groupId, invite.groupId), isNull(groupEpochs.endedAt)))

    // Close the accepter's leftover solo chapters elsewhere — only on the
    // groups locked above. Scenario: accepter previously leaveGroup'd into a
    // personal solo group Y, then accepted this invite. Y's chapter ends at
    // the moment they re-join — preserves the invariant 「a user has at most
    // one open epoch」. Scoped to solo (member_a only, no member_b) so we
    // never close a duo group's epoch — that case shouldn't happen via the
    // documented flow, but the guard makes the operation impossible to misuse.
    if (lockedOtherIds.length > 0) {
      await tx
        .update(groupEpochs)
        .set({ endedAt: boundary })
        .where(and(
          inArray(groupEpochs.groupId, lockedOtherIds),
          isNull(groupEpochs.endedAt),
          eq(groupEpochs.memberAId, user.id),
          isNull(groupEpochs.memberBId),
        ))

      // Retire the accepter's own open links on those ledgers, as
      // leaveGroup / removePartner do for the ledger whose chapter they end.
      await tx
        .update(groupInvites)
        .set({ revokedAt: boundary })
        .where(and(
          inArray(groupInvites.groupId, lockedOtherIds),
          isNull(groupInvites.acceptedAt),
          isNull(groupInvites.revokedAt),
        ))

      // #1605 — the joiner's push tokens move with them to the ledger they
      // just joined: pushes for the solo ledger whose chapter this join ends
      // would otherwise keep arriving, and the joined ledger's would not.
      await tx
        .update(pushTokens)
        .set({ groupId: invite.groupId })
        .where(and(inArray(pushTokens.groupId, lockedOtherIds), eq(pushTokens.userId, user.id)))
    }

    // Open the new duo epoch — member_a stays as is, member_b is the joiner.
    await tx.insert(groupEpochs).values({
      groupId: invite.groupId,
      startedAt: boundary,
      memberAId: updatedGroup.memberA,
      memberBId: user.id,
    })

    return { endedTrips, inviterFirstRecord }
  })

  let outcome: Awaited<ReturnType<typeof acceptOnce>>
  for (let attempt = 1; ; attempt++) {
    soloLedgerAppeared = false
    tripRowBusy = false
    try {
      outcome = await acceptOnce()
      break
    } catch (e) {
      if (!soloLedgerAppeared && !tripRowBusy) throw e
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(soloLedgerAppeared
          ? 'acceptInvite: a new solo ledger kept appearing under the lock (#1432)'
          : 'acceptInvite: the inviter\'s trip kept being written during the accept (#1438)')
      }
    }
  }

  // #1438 — the same events endTrip sends, keyed on the inviter (the trip is
  // theirs), with `ended_by` telling the two apart. No trip names, amounts or
  // ids — the same properties endTrip sends, plus that one.
  if (outcome.inviterFirstRecord) {
    await captureServer(invite.invitedBy, 'first_record_created', { via: 'trip_summary' })
  }
  for (const t of outcome.endedTrips) {
    const startMs = new Date(t.startDate).getTime()
    const endMs = new Date(t.endDate ?? t.startDate).getTime()
    await captureServer(invite.invitedBy, 'trip_ended', {
      default_currency: t.defaultCurrency,
      expense_count: t.expenseCount,
      duration_days: Math.max(0, Math.round((endMs - startMs) / 86_400_000)),
      ended_by: 'invite_accept',
    })
  }

  // Invite-funnel conversion (#734): the invitee (member_b) joined. Keyed on
  // the joiner; `inviter_id` lets the two sides be correlated in analysis.
  await captureServer(user.id, 'partner_joined', {
    group_id: invite.groupId,
    inviter_id: invite.invitedBy,
  })

  return invite.groupId
})
