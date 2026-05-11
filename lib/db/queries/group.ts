import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { desc, eq, or } from 'drizzle-orm'

/**
 * The viewer's currently-active group.
 *
 * Plain `memberA OR memberB LIMIT 1` is ambiguous after the leave + re-join
 * cycle: the leaver remains `member_a` of their fresh solo group Y while
 * also becoming `member_b` of the re-joined group X. Without ordering, the
 * dashboard and server actions silently target either row.
 *
 * Ordering by `current_epoch_started_at DESC` makes the pick deterministic:
 * the most-recent epoch wins, which is always the truly active relationship
 * (leaveGroup stamps both old and new groups with the leave moment;
 * acceptInvite then stamps the rejoined group with a later moment).
 *
 * Returns `null` when the user has no group at all (fresh signup pre-
 * onboarding, or a fully archived state).
 */
export async function getActiveGroupForUser(userId: string) {
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, userId), eq(oikosGroups.memberB, userId)))
    .orderBy(desc(oikosGroups.currentEpochStartedAt))
    .limit(1)
  return group ?? null
}
