import type { oikosGroups } from '@/lib/db/schema'

type GroupRow = typeof oikosGroups.$inferSelect

/**
 * Single source of truth for "can this group access the Guardian (守護) module?".
 *
 * Today: `group.guardianBetaEnabled`. Future: `hasSubscription || isBetaEnabled`.
 * Call sites (nav rendering, route guards, server actions) must use this
 * helper so the eventual paid-tier switch is a one-file change.
 */
export function canAccessGuardian(group: Pick<GroupRow, 'guardianBetaEnabled'>): boolean {
  return group.guardianBetaEnabled === true
}
