'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'

/**
 * Pin the viewer to a historical epoch for the rest of the browser session.
 * The cookie has no `expires`, so it's a session cookie — closes when the
 * browser closes (matches the "per-session ritual" UX intent).
 *
 * We don't validate `epochId` here: the read-side helper
 * `getActiveEpochWindow` rejects ids that don't belong to the viewer's
 * group, so a malformed or hostile value just falls back to the current
 * chapter.
 */
export async function enterPastEpoch(epochId: string): Promise<void> {
  const jar = await cookies()
  jar.set(PAST_EPOCH_COOKIE, epochId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  // Trigger a re-render of the navigation surfaces that read the cookie.
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/aibutsu')
  revalidatePath('/settings')
}

export async function exitPastEpoch(): Promise<void> {
  const jar = await cookies()
  jar.delete(PAST_EPOCH_COOKIE)
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/aibutsu')
  revalidatePath('/settings')
}

/**
 * Server-side helper for layouts/pages to read the current pin without
 * pulling in `cookies()` everywhere.
 */
export async function getPinnedEpochId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(PAST_EPOCH_COOKIE)?.value ?? null
}
