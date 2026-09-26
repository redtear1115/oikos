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

  // #1439: a bound value containing a real newline + "    at " (anything a
  // user types) used to look like the first stack frame to the escaped-text
  // regex, which then stopped — the later params (the ciphertext) stayed in
  // the log body. `barcode` comes before `verification_code_encrypted` in the
  // bound params.
  it('a value containing "\\n    at " does not let the later ciphertext through', async () => {
    const { db } = await import('@/lib/db/client')
    const { invoiceCredentials } = await import('@/lib/db/schema')
    const Sentry = await import('@sentry/node')
    const FAKE_FRAME_BARCODE = '/NL1439\n    at home (sofa.js:1:1)'
    const CIPHERTEXT_1439 = 'v1:k1:1439c1f3e27e:0f00ba4:5ec12e7c1a55'
    const row = { groupId: made.group, userId: made.profile, barcode: FAKE_FRAME_BARCODE, verificationCodeEncrypted: CIPHERTEXT_1439 }

    await db.insert(invoiceCredentials).values(row)
    const e = await Promise.resolve(db.insert(invoiceCredentials).values(row))
      .then(() => { throw new Error('expected the query to fail') }, (err: unknown) => err as Error)

    // Control: the real 23505, with the fake frame before the ciphertext.
    expect((e.cause as { code?: string }).code).toBe('23505')
    expect(e.message).toContain(`${FAKE_FRAME_BARCODE},${CIPHERTEXT_1439}`)

    await harness.drain()
    harness.envelopes.length = 0
    console.error(e)
    console.error('failed:', e)
    Sentry.captureException(e)
    const all = (await harness.drain()).join('\n')

    expect(all).toContain('"type":"log"')
    expect(all.match(/Failed query: insert into/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(all).not.toContain(CIPHERTEXT_1439)
    expect(all).not.toContain('/NL1439')
  })

  // #1439 round 2: Postgres quotes a rejected input verbatim — newlines and
  // inner quotes included. The mask must run to the message's last quote.
  it('a 22P02 input with a newline or an inner quote leaks nothing (console, capture, sanitizer)', async () => {
    const { db } = await import('@/lib/db/client')
    const { invoiceCredentials } = await import('@/lib/db/schema')
    const { sanitizeDbError } = await import('@/lib/db/sanitizeError')
    const Sentry = await import('@sentry/node')
    const MARKERS = ['L2SECRET1439', 'QSECRET1439']
    const values = ['/x\nL2SECRET1439', 'x"QSECRET1439']

    await harness.drain()
    harness.envelopes.length = 0
    const sanitized: string[] = []
    for (const groupId of values) {
      const e = await Promise.resolve(db.insert(invoiceCredentials).values({
        groupId, userId: made.profile, barcode: '/Q1439', verificationCodeEncrypted: 'v1:k1:q',
      })).then(() => { throw new Error('expected the query to fail') }, (err: unknown) => err as Error)
      // Control: the real 22P02, quoting the whole input.
      expect((e.cause as { code?: string }).code).toBe('22P02')
      expect((e.cause as Error).message).toBe(`invalid input syntax for type uuid: "${groupId}"`)

      console.error(e)
      console.error('failed:', e)
      console.error(e.cause)
      console.warn('failed:', e.cause)
      Sentry.captureException(e)
      Sentry.captureException(e.cause)
      const clean = sanitizeDbError(e) as Error & { cause: Error }
      sanitized.push(clean.message, clean.stack ?? '', clean.cause.message, clean.cause.stack ?? '')
    }
    const all = (await harness.drain()).join('\n')

    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all).toContain('invalid input syntax for type uuid')
    expect(MARKERS.filter((m) => all.includes(m))).toEqual([])
    expect(MARKERS.filter((m) => sanitized.join('\n').includes(m))).toEqual([])
  })
})
