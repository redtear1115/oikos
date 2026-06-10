'use server'

import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { requireViewer } from '@/lib/auth/viewer'
import { signOut } from '@/actions/auth'
import { captureServer } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'

/**
 * Mark the viewer's account for deletion and sign out. No preconditions
 * (no balance/swap gate) — store policy requires a barrier-free deletion
 * entry. The actual destructive work runs later in process_account_deletions()
 * (migration 0058) after a 14-day grace window; the viewer can cancel until then.
 *
 * Calls signOut() last, which redirects (throws NEXT_REDIRECT) — keep it last.
 */
export async function requestAccountDeletion(): Promise<void> {
  const { user } = await requireViewer()
  await db
    .update(profiles)
    .set({ deletionRequestedAt: new Date() })
    .where(eq(profiles.id, user.id))
  await captureServer(user.id, 'account_deletion_requested')
  await signOut()
}

/** Cancel a pending deletion (grace-period undo). Idempotent. */
export async function cancelAccountDeletion(): Promise<void> {
  const { user } = await requireViewer()
  await db
    .update(profiles)
    .set({ deletionRequestedAt: null })
    .where(eq(profiles.id, user.id))
  await captureServer(user.id, 'account_deletion_cancelled')
  revalidatePath('/dashboard')
}
