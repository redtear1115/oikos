import { isFormerMember, type MemberLinkScope } from '@/lib/insuranceMemberLink'

/**
 * #1589 — a car names its 主要使用人 by profile id (`CarDetails.primary_user_id`,
 * NULL = 共用). removePartner and account deletion leave that id in place, so
 * after the ex leaves, the car still points at them.
 *
 * Failure looks like nothing: no error. The car page payload and the
 * `getFuelLogById` response carry the ex-partner's profile id to the stayer
 * (and to a new partner who joins later), and the edit sheet sends that id
 * back on save.
 *
 * Resolved at read time (no data change), on the server, with the same
 * allowed set as insurance (#1579, {@link MemberLinkScope}): a stored id
 * outside the set is "former" — the id is dropped (`primaryUserId: null`) and
 * `primaryUserIsFormer` is set. Note that `primaryUserId: null` alone means
 * 共用; consumers must read the flag before treating null as shared.
 *
 * Writing back: the edit sheet sends `primaryUserId: undefined` while the
 * person is still unresolved, and `editCar` then leaves the stored column
 * untouched (keep-stored). It never writes NULL (that would silently turn the
 * car into 共用) and never needs the old id.
 */
export interface CarPrimaryUserView {
  /** A current member, or null (= 共用, or former when the flag is set). */
  primaryUserId: string | null
  /** The stored primary user left the ledger; the id was dropped. */
  primaryUserIsFormer: boolean
}

export function resolveCarPrimaryUser(
  storedPrimaryUserId: string | null,
  scope: MemberLinkScope,
): CarPrimaryUserView {
  if (isFormerMember(storedPrimaryUserId, scope)) {
    return { primaryUserId: null, primaryUserIsFormer: true }
  }
  return { primaryUserId: storedPrimaryUserId, primaryUserIsFormer: false }
}
