import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { PushGateProbe } from './PushGateProbe'

/**
 * #968 S4c — development-only probe for the Android FCM shell gate.
 *
 * Exists for the emulator checks in the v1.9.0 plan (E-old: a 1.7.3 shell
 * without Firebase; E-new: a 1.9.0 shell with it). How to use it:
 *
 * 1. Run `next dev` in this worktree (dev Supabase) and point the emulator
 *    shell's `server.url` at `http://10.0.2.2:3000` (local override, never
 *    committed; Android may need cleartext allowed for 10.0.2.2).
 * 2. Sign in to the dev account in the emulator. The path is NOT exempt from
 *    the proxy's auth gate: signed out, it redirects to /sign-in like any
 *    other non-public path.
 * 3. Open `/dev/push-gate` (navigate via chrome://inspect, or set
 *    `server.url` to the full URL after signing in).
 *
 * Signing in also mounts the dashboard's PushTokenRegistrar, which runs the
 * same `registerPushToken`. For a clean E-old reading (no prompt, no crash, no
 * `register` in logcat) that is the point: both paths go through the gate.
 *
 * The page uses the signed-in session — user from `getCurrentUser()`
 * (re-validated server side) and the active ledger from
 * `getActiveGroupForUser`, the same pair the dashboard layout hands the
 * registrar. Nothing comes from the query string, so the probe can only ever
 * register the viewer's own token against a ledger they belong to, and the
 * PushTokens upsert behaves exactly as in the app. It shows the gate
 * decision, the registration outcome, and whether a token arrived (prefix
 * only).
 *
 * Production guard, fail-closed: anything other than `next dev`
 * (`NODE_ENV === 'development'`) gets a 404 before any session lookup —
 * Vercel production and preview builds and `next start` are all
 * `NODE_ENV=production`. Guarded by tests/dev-push-gate-968.test.tsx. Not in
 * the sitemap (app/sitemap.ts is an explicit list).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'push gate probe (dev)',
  robots: { index: false, follow: false },
}

export default async function PushGateProbePage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  // The proxy already sent signed-out requests to /sign-in; this is the
  // belt to that brace, not a second login flow.
  const user = await getCurrentUser()
  if (!user) notFound()
  const group = await getActiveGroupForUser(user.id)

  return <PushGateProbe userId={user.id} groupId={group?.id ?? null} />
}
