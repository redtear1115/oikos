import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'

/**
 * #1486 / #1579 — an insurance policy names people by profile id: the policy
 * holder (要保人, `policy_holder_user_id`) and, when the insured is a member,
 * the insured (被保人, `insured_user_id`). Either may have left the ledger
 * since the policy was recorded. The stored id still points at them, and the
 * join to Profiles resolves their CURRENT name and avatar.
 *
 * Failure looks like nothing: no error. The card shows an ex-partner's latest
 * name and photo, the page payload carries their profile id, and the edit
 * sheet sends that id back on save, so an unchanged save fails with
 * `policyholder_not_member` / `insured_not_member`.
 *
 * Resolved at read time (no data change), on the server, before anything is
 * handed to a client component: a linked person who is not in the viewer's
 * allowed set is "former", and their id, name and avatar are dropped here.
 *
 * The allowed set (see {@link memberLinkScope}):
 *   - normally the group's current members (memberA / memberB);
 *   - for a viewer pinned to a closed chapter of a group they are no longer
 *     in (`nonMemberPinCutoff` non-null), the members of THAT chapter — the
 *     group's current members may include someone who joined after the
 *     viewer left, whose identity the viewer must not receive;
 *   - the viewer is always allowed (a leaver reading their own closed chapter
 *     sees themselves).
 *
 * `labelFormer` says whether a dropped person is known to be a former partner
 * of the viewer, i.e. whether 「前伴侶」 may be shown. It is false for the
 * pinned non-member viewer: there the dropped person may be a stranger who
 * joined later, so the field renders empty instead.
 */
export interface MemberLinkScope {
  readonly allowed: ReadonlySet<string>
  readonly labelFormer: boolean
}

export function memberLinkScope(
  members: ReadonlyArray<string | null>,
  viewerId: string,
  labelFormer: boolean,
): MemberLinkScope {
  const allowed = new Set<string>([viewerId])
  for (const m of members) if (m) allowed.add(m)
  return { allowed, labelFormer }
}

/** A stored id is "former" when it is set and not in the allowed set. */
export function isFormerMember(userId: string | null, scope: MemberLinkScope): boolean {
  return userId != null && !scope.allowed.has(userId)
}

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
  scope: MemberLinkScope,
): PolicyHolderDisplay {
  if (isFormerMember(holder.userId, scope)) {
    return { userId: null, displayName: null, avatarUrl: null, isFormer: true }
  }
  return { ...holder, isFormer: false }
}

export interface InsuredMemberFields {
  userId: string | null
  displayName: string | null
}

export interface InsuredMemberDisplay extends InsuredMemberFields {
  isFormer: boolean
}

export function resolveInsuredMember(
  insured: InsuredMemberFields,
  scope: MemberLinkScope,
): InsuredMemberDisplay {
  if (isFormerMember(insured.userId, scope)) {
    return { userId: null, displayName: null, isFormer: true }
  }
  return { ...insured, isFormer: false }
}

/**
 * The only shape of an insurance policy's details that may reach a client
 * component (#1579). `policyHolderUserId` / `insuredUserId` /
 * `insuredUserDisplayName` are null when that person is former. The three
 * required flags make the raw {@link InsuranceDetailsRow} unassignable to it,
 * so passing the unsanitised row to the detail components fails `tsc`.
 */
export type InsuranceDetailsView =
  Omit<InsuranceDetailsRow, 'policyHolderUserId' | 'insuredUserId' | 'insuredUserDisplayName'> & {
    policyHolderUserId: string | null
    insuredUserId: string | null
    insuredUserDisplayName: string | null
    /** The stored 要保人 left the ledger; the id was dropped. */
    policyHolderIsFormer: boolean
    /** The stored member 被保人 left the ledger; id and name were dropped. */
    insuredIsFormer: boolean
    /** A dropped person may be labelled 「前伴侶」 (see MemberLinkScope). */
    formerLabel: boolean
  }

export function toInsuranceDetailsView(
  row: InsuranceDetailsRow,
  scope: MemberLinkScope,
): InsuranceDetailsView {
  const holderIsFormer = isFormerMember(row.policyHolderUserId, scope)
  const insured = resolveInsuredMember(
    { userId: row.insuredUserId, displayName: row.insuredUserDisplayName },
    scope,
  )
  return {
    ...row,
    policyHolderUserId: holderIsFormer ? null : row.policyHolderUserId,
    insuredUserId: insured.userId,
    insuredUserDisplayName: insured.displayName,
    policyHolderIsFormer: holderIsFormer,
    insuredIsFormer: insured.isFormer,
    formerLabel: scope.labelFormer,
  }
}

/**
 * The name to show for 被保人: a linked child, else the member (or 「前伴侶」
 * / nothing when that member left), else the freeform text.
 */
export function insuredDisplayName(
  d: {
    insuredChildName: string | null
    insuredUserDisplayName: string | null
    insured: string | null
    insuredIsFormer?: boolean
    formerLabel?: boolean
  },
  formerLabelText: string,
): string | null {
  if (d.insuredChildName != null) return d.insuredChildName
  if (d.insuredIsFormer) return d.formerLabel ? formerLabelText : null
  return d.insuredUserDisplayName ?? d.insured
}
