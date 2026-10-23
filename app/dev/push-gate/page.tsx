import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PushGateProbe } from './PushGateProbe'

/**
 * #968 S4c — development-only probe for the Android FCM shell gate.
 *
 * Exists for the emulator checks in the v1.9.0 plan (E-old: a 1.7.3 shell
 * without Firebase; E-new: a 1.9.0 shell with it), so they can run without
 * signing in to the emulator. Point the shell's `server.url` (local, never
 * committed) at `http://10.0.2.2:3000/dev/push-gate`, or navigate there from
 * chrome://inspect. The page calls the real `registerPushToken` and shows what
 * it did: gate decision, outcome, and whether a token arrived (prefix only).
 * Without a session the PushTokens upsert is refused by RLS, which is fine:
 * the gate and the native calls are what is being checked.
 *
 * Production guard, fail-closed: anything other than `next dev`
 * (`NODE_ENV === 'development'`) gets a 404 before the probe is rendered —
 * Vercel production and preview builds and `next start` are all
 * `NODE_ENV=production`. `proxy.ts` lets this exact path skip the auth gate
 * only under the same development condition; in production it stays behind
 * the sign-in redirect like any other unknown path. Guarded by
 * tests/dev-push-gate-968.test.tsx. Not in the sitemap (app/sitemap.ts is an
 * explicit list).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'push gate probe (dev)',
  robots: { index: false, follow: false },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

function uuidParam(value: string | string[] | undefined): string {
  return typeof value === 'string' && UUID.test(value) ? value : PLACEHOLDER_ID
}

export default async function PushGateProbePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()

  const params = await searchParams
  return <PushGateProbe userId={uuidParam(params.userId)} groupId={uuidParam(params.groupId)} />
}
