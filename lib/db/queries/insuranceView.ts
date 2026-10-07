import { getInsuranceDetails } from '@/lib/db/queries/aibutsu'
import { getEpochMembers, type EpochWindow } from '@/lib/db/queries/epoch'
import { nonMemberPinCutoff } from '@/lib/pinnedChapterScope'
import {
  memberLinkScope,
  toInsuranceDetailsView,
  type InsuranceDetailsView,
  type MemberLinkScope,
} from '@/lib/insuranceMemberLink'

/**
 * #1579 — the allowed set for member links on insurance policies, for this
 * viewer and this (group, chapter). See `lib/insuranceMemberLink.ts`.
 *
 * A viewer pinned to a closed chapter of a group they are no longer in gets
 * that chapter's members (from its GroupEpochs row), never the group's current
 * members, and no 「前伴侶」 label. If the chapter row cannot be read the set
 * is the viewer alone: every other person is dropped (fails closed).
 */
export async function loadMemberLinkScope(
  context: {
    group: { memberA: string; memberB: string | null }
    window: EpochWindow
  },
  viewerId: string,
): Promise<MemberLinkScope> {
  if (nonMemberPinCutoff(context, viewerId) === null) {
    return memberLinkScope([context.group.memberA, context.group.memberB], viewerId, true)
  }
  const chapter = context.window.epochId ? await getEpochMembers(context.window.epochId) : null
  return memberLinkScope(chapter ? [chapter.memberAId, chapter.memberBId] : [], viewerId, false)
}

/**
 * #1579 — the one read of a policy's details for a page. Returns the
 * sanitised {@link InsuranceDetailsView}: a holder / member insured outside
 * `scope` has no id or name in it. Pages must use this, not the raw
 * `getInsuranceDetails` (tests/insurance-former-member-1579 greps for that).
 */
export async function getInsuranceDetailsForViewer(
  assetId: string,
  groupId: string,
  viewerId: string,
  scope: MemberLinkScope,
): Promise<InsuranceDetailsView | null> {
  const row = await getInsuranceDetails(assetId, groupId, viewerId)
  return row ? toInsuranceDetailsView(row, scope) : null
}
