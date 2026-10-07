import { db } from '@/lib/db/client'
import { groupInvites } from '@/lib/db/schema'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'

/**
 * #1546 — whether the group has an invite link someone could still accept:
 * not accepted, not revoked, not expired (DB clock, like acceptInvite's claim).
 *
 * Read-only and advisory: it only decides whether settings offers "make the
 * link unusable". The revoke itself re-checks everything under the group lock,
 * so a stale answer here shows a button that reports "no live link", never a
 * link that stays usable. Served by the `GroupInvites_one_open_per_group`
 * partial unique index.
 */
export async function hasOpenInvite(groupId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groupInvites.id })
    .from(groupInvites)
    .where(and(
      eq(groupInvites.groupId, groupId),
      isNull(groupInvites.acceptedAt),
      isNull(groupInvites.revokedAt),
      gt(groupInvites.expiresAt, sql`now()`),
    ))
    .limit(1)
  return !!row
}
