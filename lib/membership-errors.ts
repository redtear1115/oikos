import { describeError } from './errors'
import type { Translations } from './i18n/locales/zh-TW'

/**
 * Map a membership server-action error (proposeSwap / cancelSwap / confirmSwap /
 * leaveGroup) to a user-facing localized string. Error codes are the literal
 * strings thrown by `actions/membership.ts`; anything else flows through
 * `describeError` (network detection + generic fallback).
 */
export function describeMembershipError(
  e: unknown,
  t: Translations['settings']['dangerZone']['errors'],
  offlineMessage: string,
): string {
  if (e instanceof Error) {
    switch (e.message) {
      case 'swap_already_pending': return t.swapAlreadyPending
      case 'no_pending_swap':       return t.noPendingSwap
      case 'swap_expired':          return t.swapExpired
      case 'cannot_confirm_own_proposal': return t.cannotConfirmOwnProposal
      case 'not_a_member':          return t.notAMember
      case 'only_member_b_can_leave': return t.onlyMemberBCanLeave
      case 'balance_not_zero':      return t.balanceNotZero
      case 'solo_group':            return t.soloGroup
    }
  }
  return describeError(e, t.fallback, offlineMessage)
}
