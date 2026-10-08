'use server'

import { db } from '@/lib/db/client'
import { pushTokens } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireViewer } from '@/lib/auth/viewer'
import { action } from '@/lib/action-errors'

// APNs device tokens are 64 hex chars today; leave room for a longer format
// without accepting arbitrary payloads.
const MAX_TOKEN_LENGTH = 512

/**
 * #1605 (F11) — sign-out removes THIS device's push registration.
 *
 * Without it a shared or handed-down phone keeps receiving the signed-out
 * person's ledger pushes: the PushTokens row outlives the session. Failure
 * looks like: no error; the next person to pick up the phone (or the same
 * person, signed out) still gets 「有待確認的定期收支」.
 *
 * Deletes only the caller's own row for this token (`user_id` comes from the
 * re-validated session, never from the client), so another person who signed
 * in on the same device keeps theirs, and the caller's other devices keep
 * theirs. Runs through the server's Drizzle role on purpose: `authenticated`
 * has no DELETE on PushTokens (0080) and this adds none.
 *
 * Best-effort by contract: LogoutButton calls it with a short timeout and
 * swallows any failure, so sign-out never waits on or fails because of it.
 */
export const unregisterThisDevice = action(async (token: string): Promise<void> => {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return
  const { user } = await requireViewer()
  await db
    .delete(pushTokens)
    .where(and(
      eq(pushTokens.userId, user.id),
      eq(pushTokens.platform, 'apns'),
      eq(pushTokens.token, token),
    ))
})
