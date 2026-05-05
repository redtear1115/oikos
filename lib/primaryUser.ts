/**
 * Map a car's primary user setting to (paidBy, splitType) for auto-created
 * CashTransactions (purchase + fuel events).
 *
 * Solo: always all_mine. 共用 (NULL): half + viewer. Otherwise: all_mine pointing
 * to whoever is the primary user.
 *
 * Solo check MUST come first — a NULL primaryUserId on a solo group should
 * yield all_mine (not half), since there's no partner to split with.
 */

import type { SplitType } from '@/lib/balance'

export function deriveTxnFromPrimaryUser(
  primaryUserId: string | null,
  viewer: { id: string },
  partner: { id: string } | null,
): { paidBy: string; splitType: SplitType } {
  if (partner === null) return { paidBy: viewer.id, splitType: 'all_mine' }
  if (primaryUserId === null) return { paidBy: viewer.id, splitType: 'half' }
  if (primaryUserId === partner.id) return { paidBy: partner.id, splitType: 'all_mine' }
  return { paidBy: viewer.id, splitType: 'all_mine' }
}
