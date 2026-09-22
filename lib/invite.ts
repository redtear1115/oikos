import { randomBytes } from 'crypto'
import type { groupInvites, oikosGroups } from '@/lib/db/schema'

/**
 * #1288 — how long a freshly minted invite link stays usable: 24 hours.
 *
 * Every copy of a link outlives its usefulness only by this long: GA, auth
 * logs, browser history, the clipboard and chat servers all keep the URL, and
 * none of those copies can be recalled. In prod every accepted invite so far
 * was accepted within 5 hours, so 24 h leaves a wide margin. A partner who
 * opens the link later sees the existing "link expired" message and the
 * inviter mints a new one; nothing in the UI promises a duration.
 *
 * The expiry is stamped with the DB clock (`now() + TTL`), the same clock
 * `created_at` and the accept-time claim use, so `expires_at - created_at` is
 * exactly this TTL. Existing rows were clamped by
 * `drizzle/0067_invite_ttl_24h_clamp.sql`.
 */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function getInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/invite/${token}`
}

type Invite = typeof groupInvites.$inferSelect
type Group = typeof oikosGroups.$inferSelect

export type InviteAcceptError =
  | 'invalid_or_expired'
  | 'already_used'
  | 'revoked'
  | 'expired'
  | 'group_not_found'
  | 'group_full'
  | 'already_member'
  | 'already_in_duo'
  | 'inviter_not_member'

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: InviteAcceptError }

export function validateInviteAcceptance(
  invite: Invite | null,
  group: Group | null,
  userId: string,
  viewerActiveGroup: Group | null = null,
  now: Date = new Date()
): AcceptResult {
  if (!invite) return { ok: false, error: 'invalid_or_expired' }
  if (invite.acceptedAt) return { ok: false, error: 'already_used' }
  // #1288 — expired is reported before revoked. Minting a new link supersedes
  // (revokes) every earlier open invite, expired ones included, so an old link
  // that simply ran out would otherwise read as "revoked". Both messages are
  // neutral; this only keeps the more truthful one in front.
  if (invite.expiresAt < now) return { ok: false, error: 'expired' }
  if (invite.revokedAt) return { ok: false, error: 'revoked' }
  if (!group) return { ok: false, error: 'group_not_found' }
  if (group.memberB !== null) return { ok: false, error: 'group_full' }
  if (group.memberA === userId || group.memberB === userId) return { ok: false, error: 'already_member' }
  // #1031 defence in depth — the minter must STILL be a member of the group
  // they invited into. Without this the validator has no notion of who issued
  // the invite, so an invite minted (or forged) by a non-member is
  // indistinguishable from a legitimate one. Closing it here kills the whole
  // class: an ex-partner's self-minted invite, and any invite whose issuer has
  // since left, are both unusable no matter how they were produced.
  //
  // Written as a membership predicate over both slots rather than
  // `!== group.memberA`: the intent is "issuer is still a member", and that
  // stays correct if the group_full check above is ever reordered or relaxed.
  // Today memberB is provably null here, so in practice it resolves to memberA
  // — which is also the only slot a lone remaining member can occupy, since
  // `leaveGroup` only lets member_b leave.
  if (invite.invitedBy !== group.memberA && invite.invitedBy !== group.memberB) {
    return { ok: false, error: 'inviter_not_member' }
  }
  // 固定兩人: can't join a new ledger while already in a duo elsewhere (#912).
  // Solo (memberB === null) is allowed — acceptInvite closes its epoch.
  if (viewerActiveGroup && viewerActiveGroup.id !== group.id && viewerActiveGroup.memberB !== null) {
    return { ok: false, error: 'already_in_duo' }
  }
  return { ok: true }
}

/**
 * #1288 — why an atomic claim found nothing to claim.
 *
 * `acceptInvite` claims the invite with one conditional UPDATE (not accepted,
 * not revoked, not expired by the DB clock). When that UPDATE touches zero
 * rows, something changed after the up-front validation passed: a second
 * accept won, a new link superseded this one, the partner was removed, or the
 * link ran out. This re-reads the row (inside the same transaction) and names
 * the specific reason; anything it cannot name falls back to
 * `invalid_or_expired`. `expiredByDbClock` must come from Postgres
 * (`expires_at <= now()`), not from the app server's clock, so the reason
 * agrees with the predicate that just refused the claim.
 *
 * Same precedence as {@link validateInviteAcceptance}: used, then expired,
 * then revoked.
 */
export function classifyUnclaimableInvite(
  row: { acceptedAt: Date | null; revokedAt: Date | null; expiredByDbClock: boolean } | null,
): InviteAcceptError {
  if (!row) return 'invalid_or_expired'
  if (row.acceptedAt) return 'already_used'
  if (row.expiredByDbClock) return 'expired'
  if (row.revokedAt) return 'revoked'
  return 'invalid_or_expired'
}

/**
 * #1288 — why the guarded group update (`member_b IS NULL AND member_a =
 * invited_by`) matched no row, given the group as re-read inside the
 * transaction. A full group wins over a changed issuer, matching the order in
 * {@link validateInviteAcceptance}.
 */
export function classifyGroupClaimMiss(
  group: { memberA: string; memberB: string | null } | null,
  invitedBy: string,
): InviteAcceptError {
  if (!group) return 'group_not_found'
  if (group.memberB !== null) return 'group_full'
  if (group.memberA !== invitedBy) return 'inviter_not_member'
  return 'group_full'
}
