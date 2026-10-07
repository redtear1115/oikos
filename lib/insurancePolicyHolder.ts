/**
 * #1486 — the policy holder (要保人) of a policy may have left the ledger
 * since the policy was recorded. `InsuranceDetails.policy_holder_user_id` still
 * points at them, and the join to Profiles resolves their CURRENT name and
 * avatar. Failure looks like nothing: no error, the card just shows an
 * ex-partner's latest name and photo.
 *
 * Resolved at read time (no data change): anyone who is not a current member
 * of the ledger is a "former partner" — identity is dropped here, server-side,
 * so it never reaches the client payload. The viewer is always shown as
 * themselves (a leaver reading their own closed chapter is not "former").
 */
export interface PolicyHolderFields {
  userId: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface PolicyHolderDisplay extends PolicyHolderFields {
  isFormer: boolean
}

export function resolvePolicyHolder(
  holder: PolicyHolderFields,
  group: { memberA: string; memberB: string | null },
  viewerId: string,
): PolicyHolderDisplay {
  const { userId } = holder
  const isFormer =
    userId !== null &&
    userId !== viewerId &&
    userId !== group.memberA &&
    userId !== group.memberB
  if (isFormer) return { userId: null, displayName: null, avatarUrl: null, isFormer: true }
  return { ...holder, isFormer: false }
}
