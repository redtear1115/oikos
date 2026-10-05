/**
 * A participant row's claim status as the admin sees it (#1558), derived on
 * the server from columns that never go to the client.
 *
 *   profile_id set                         → bound     (signs in to get back)
 *   claim token set, no profile            → claimed   (cookie only; releasable)
 *   claimed_at set, no token, no profile   → claimed   (a deleted account's
 *                                            anonymised slot — 0082; NOT
 *                                            releasable, the server refuses
 *                                            with outing_slot_bound)
 *   none of the above                      → unclaimed
 *
 * `releasable` mirrors releaseOutingSlot's own rule (profile_id IS NULL AND
 * claim_token_hash IS NOT NULL). Showing 釋放 on the tombstone looks harmless
 * but fails: the confirm goes through, the server says outing_slot_bound.
 */
export type ParticipantClaim = 'unclaimed' | 'claimed' | 'bound'

export function participantClaim(p: {
  profileId: string | null
  claimedAt: Date | null
  hasClaimToken: boolean
}): { claim: ParticipantClaim; releasable: boolean } {
  if (p.profileId !== null) return { claim: 'bound', releasable: false }
  if (p.hasClaimToken) return { claim: 'claimed', releasable: true }
  if (p.claimedAt !== null) return { claim: 'claimed', releasable: false }
  return { claim: 'unclaimed', releasable: false }
}
