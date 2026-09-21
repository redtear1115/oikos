import { describeError } from './errors'
import { parseActionError, type ActionErrorMessages } from './action-errors'
import type { Translations } from './i18n/locales/zh-TW'

/**
 * Map a membership server-action error (proposeSwap / cancelSwap / confirmSwap /
 * leaveGroup) to a user-facing localized string. Error codes are the literal
 * codes raised by `actions/membership.ts`; anything else flows through
 * `describeError` (network detection + shared action codes + generic fallback).
 *
 * `e` may be the returned `ActionFailure`, the `ActionError` `unwrapAction`
 * re-threw, or any other caught value — `parseActionError` reads the code out
 * of all three (#1223). Switching on `e.message` here used to work only because
 * the codes were thrown; production never delivered that message.
 */
export function describeMembershipError(
  e: unknown,
  t: Translations['settings']['dangerZone']['errors'],
  offlineMessage: string,
  actionErrors: ActionErrorMessages,
): string {
  const code = parseActionError(e)?.code
  if (code) {
    switch (code) {
      case 'swap_already_pending': return t.swapAlreadyPending
      case 'no_pending_swap':       return t.noPendingSwap
      case 'swap_expired':          return t.swapExpired
      case 'cannot_confirm_own_proposal': return t.cannotConfirmOwnProposal
      case 'not_a_member':          return t.notAMember
      case 'only_member_b_can_leave': return t.onlyMemberBCanLeave
      case 'only_member_a_can_remove': return t.onlyMemberACanRemove
      case 'balance_not_zero':      return t.balanceNotZero
      case 'solo_group':            return t.soloGroup
      case 'active_trip':           return t.activeTrip
      case 'active_outing':         return t.activeOuting
    }
  }
  return describeError(e, t.fallback, offlineMessage, actionErrors)
}
