import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { oikosGroups } from '@/lib/db/schema'

export type ViewerGroup = typeof oikosGroups.$inferSelect

/**
 * Server-action gate that only needs the viewer (no group resolution).
 * Re-validates the JWT against Supabase Auth on every call so state-changing
 * actions can trust the result.
 *
 * Throws `Unauthorized` — string is stable and asserted by tests.
 */
export async function requireViewer(): Promise<{ user: User }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { user }
}

/**
 * Server-action gate. Re-validates the JWT against Supabase Auth (mutation
 * boundary) and resolves the viewer's active group in one go.
 *
 * Throws `Unauthorized` / `找不到家計簿` — error strings are stable and asserted
 * by tests.
 */
export async function requireViewerGroup(): Promise<{ user: User; group: ViewerGroup }> {
  const { user } = await requireViewer()
  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')
  return { user, group }
}

/**
 * Server-page / layout gate that only needs the viewer (no group lookup).
 * Uses the cached session and redirects to /sign-in on miss.
 */
export async function requireViewerOrRedirect(): Promise<{ user: User }> {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  return { user }
}

/**
 * Server-page / layout gate. Uses the cached session (no Auth round-trip)
 * since middleware already enforced the trust boundary, and redirects on
 * missing user / group instead of throwing.
 *
 * Do NOT use in server actions — those mutate state and must call
 * `requireViewerGroup()` to re-validate the JWT.
 */
export async function requireViewerGroupOrRedirect(): Promise<{ user: User; group: ViewerGroup }> {
  const { user } = await requireViewerOrRedirect()
  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')
  return { user, group }
}
