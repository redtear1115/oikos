import { PostHog } from 'posthog-node'
import * as Sentry from '@sentry/nextjs'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { cashTransactions } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { IS_PROD_DEPLOY } from '@/lib/deployEnv'

// Either the top-level db client or a PgTransaction handed back from
// `db.transaction(async (tx) => ...)`. Both expose the .select() API used
// below; using Parameters<...> keeps this drift-proof if drizzle bumps.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// Mirror the client gate (app/providers.tsx) without importing the 'use client'
// module into server code. NEXT_PUBLIC_* vars are available server-side too.
// Gated on the deployment, not on NODE_ENV — a local `next build && next start`
// is also NODE_ENV=production and used to write straight into the prod project
// (#1116, see lib/deployEnv.ts).
const SERVER_ANALYTICS_ENABLED = IS_PROD_DEPLOY && !!process.env.NEXT_PUBLIC_POSTHOG_KEY

let client: PostHog | null = null

/**
 * Report a swallowed analytics failure without ever throwing. These paths used
 * to be fully silent (`catch {}`), which is why a two-week ingestion or config
 * problem would leave no trace anywhere (#973). Analytics still must not break
 * the caller, so the report itself is best-effort too.
 */
function reportSilently(error: unknown, op: string): void {
  try {
    Sentry.captureException(error, { tags: { area: 'analytics', op } })
  } catch {
    // Reporting the failure must not become a new failure.
  }
}

function getClient(): PostHog | null {
  if (!SERVER_ANALYTICS_ENABLED) return null
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Serverless: send each event immediately, then flush() before the
      // function freezes. No background batching to lose.
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return client
}

/**
 * Server-side capture keyed on a stable distinctId (the auth user id). Never
 * throws — analytics must not break a write path. `setOnce` writes person
 * properties that won't overwrite an existing value (e.g. first-touch source).
 */
export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  setOnce?: Record<string, unknown>,
): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    ph.capture({
      distinctId,
      event,
      properties: { ...properties, ...(setOnce ? { $set_once: setOnce } : {}) },
    })
    await ph.flush()
  } catch (e) {
    // Swallow for the caller, but no longer swallow it entirely — report to
    // Sentry so a broken ingestion path is visible instead of silent (#973).
    reportSilently(e, `capture:${event}`)
  }
}

/**
 * Whether the just-inserted CashTransaction makes `userId` an active payer for
 * the first time in `groupId`. Counts non-deleted rows where `paidBy = userId`;
 * caller fires `first_record_created` iff the result is true.
 *
 * Semantic matches actions/transaction.ts:122-126: activation = "the viewer
 * logged their own purchase". Pass `viewer.id` (not the row's `paidBy`); if
 * the viewer marked the partner as payer, this returns false — partner-as-
 * payer first does not activate the viewer (#891).
 *
 * Call inside the same DB transaction, AFTER the insert. Fire the event
 * outside the transaction so a slow network call doesn't extend tx duration.
 */
export async function isUserFirstNonDeletedRecord(
  tx: DbOrTx,
  userId: string,
  groupId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      eq(cashTransactions.paidBy, userId),
      isNull(cashTransactions.deletedAt),
    ))
  return (row?.count ?? 0) === 1
}

/** Merge an anonymous distinct_id into the identified user. Never throws. */
export async function aliasServer(distinctId: string, anonId: string): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    ph.alias({ distinctId, alias: anonId })
    await ph.flush()
  } catch (e) {
    reportSilently(e, 'alias')
  }
}
