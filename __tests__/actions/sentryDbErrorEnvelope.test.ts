// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { loadEnvLocal } from '../outing/_setup'
import { startSentryHarness, type SentryHarness } from '../../tests/_helpers/sentryHarness'

// ─── Real driver errors through a real Sentry client (#1289 F5) ─────────────
//
// LOCAL THROWAWAY DATABASE ONLY (skips unless DATABASE_URL is localhost; see
// invoiceRetention0069.test.ts for how to build one). Needs 0069 applied: the
// 23514 case is its CHECK.
//
// Four real postgres.js errors, wrapped by Drizzle exactly as an action would
// see them — 23505 (unique), 23514 (check: "Failing row contains" the whole
// row), 23503 (foreign key: "Key (…)=(…)"), 22P02 (the rejected input quoted
// in the message and in `where`) — each passed raw to console.error(err),
// console.error('…', err) and Sentry.captureException(err). No bound value
// may appear in any envelope the client would send.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const BARCODE = '/SEC1289'
const CIPHERTEXT = 'v1:k1:5ec12e7c1a55:0f00ba4:c1f3e27ex7'
const BAD_UUID = 'SECRET-NOT-A-UUID-1289'
const SECRETS = [BARCODE, CIPHERTEXT, BAD_UUID]

describe.skipIf(!isLocalDb)('real driver errors through a real Sentry client — local throwaway DB', () => {
  let harness: SentryHarness
  const realConsoleError = console.error
  const made = { profile: '', group: '' }

  beforeAll(async () => {
    const { db } = await import('@/lib/db/client')
    const { profiles, oikosGroups } = await import('@/lib/db/schema')
    made.profile = randomUUID()
    await db.insert(profiles).values({ id: made.profile, displayName: 'TEST_1289_SENTRY' })
    const [g] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1289_SENTRY', memberA: made.profile, memberB: null })
      .returning({ id: oikosGroups.id })
    made.group = g.id
    // The SDK wraps whatever console.error is at init; keep the values out of
    // the test output.
    console.error = () => {}
    harness = startSentryHarness()
  })

  afterAll(async () => {
    await harness?.close()
    console.error = realConsoleError
    const { db } = await import('@/lib/db/client')
    const { profiles, oikosGroups, invoiceCredentials } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    if (made.group) {
      await db.delete(invoiceCredentials).where(eq(invoiceCredentials.groupId, made.group))
      await db.delete(oikosGroups).where(eq(oikosGroups.id, made.group))
    }
    if (made.profile) await db.delete(profiles).where(eq(profiles.id, made.profile))
  })

  it('console.error(err), console.error("…", err) and captureException leak no bound value', async () => {
    const { db } = await import('@/lib/db/client')
    const { invoiceCredentials } = await import('@/lib/db/schema')
    const Sentry = await import('@sentry/node')

    const row = (over: Partial<typeof invoiceCredentials.$inferInsert> = {}) => ({
      groupId: made.group,
      userId: made.profile,
      barcode: BARCODE,
      verificationCodeEncrypted: CIPHERTEXT,
      ...over,
    })
    const fail = (p: PromiseLike<unknown>) =>
      Promise.resolve(p).then(() => { throw new Error('expected the query to fail') }, (e: unknown) => e as Error)

    await db.insert(invoiceCredentials).values(row())
    const errors = [
      await fail(db.insert(invoiceCredentials).values(row())),                                  // 23505
      await fail(db.insert(invoiceCredentials).values(row({ barcode: '/OTHER01', deletedAt: new Date() }))), // 23514
      await fail(db.insert(invoiceCredentials).values(row({ groupId: randomUUID() }))),         // 23503
      await fail(db.insert(invoiceCredentials).values(row({ groupId: BAD_UUID }))),             // 22P02
    ]

    // Control: these are the real driver errors, carrying the values.
    expect(errors.map((e) => (e.cause as { code?: string }).code)).toEqual(['23505', '23514', '23503', '22P02'])
    for (const e of errors) expect(e.message).toContain(CIPHERTEXT)

    for (const e of errors) {
      console.error(e)
      console.error('failed:', e)
      Sentry.captureException(e)
    }
    const all = (await harness.drain()).join('\n')

    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all.match(/Failed query: insert into/g)?.length ?? 0).toBeGreaterThanOrEqual(8)
    expect(SECRETS.filter((s) => all.includes(s))).toEqual([])
  })
})
