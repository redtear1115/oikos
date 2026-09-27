// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import postgres from 'postgres'
import { DrizzleQueryError } from 'drizzle-orm'
import { loadEnvLocal } from '../outing/_setup'
import { startSentryHarness, type SentryHarness } from '../../tests/_helpers/sentryHarness'

// ─── Real driver errors through a real Sentry client (#1289 F5) ─────────────
//
// LOCAL THROWAWAY DATABASE ONLY (skips unless DATABASE_URL is localhost; see
// invoiceRetention0069.test.ts for how to build one). Needs 0069 applied: the
// 23514 case is its CHECK.
//
// Four real postgres.js errors — 23505 (unique), 23514 (check: "Failing row
// contains" the whole row), 23503 (foreign key: "Key (…)=(…)"), 22P02 (the
// rejected input quoted in the message and in `where`).
//
// Two layers (#1453):
// 1. At the source: the same four failures thrown through `db` are already
//    clean — no `params:`, no `.params`, no `detail`, nothing under
//    `inspect(showHidden)`. Remove `installDbErrorSanitizer()` from
//    lib/db/client.ts and this turns red.
// 2. The Sentry hooks, on RAW errors: since `lib/db/client` is imported here
//    (for seeding and for layer 1), drizzle's prototype is wrapped for this
//    whole file, so a raw error cannot come out of `db`. It is built by hand
//    instead, exactly as Drizzle builds it: the statement from `.toSQL()`,
//    run on a separate raw postgres.js client (`.unsafe`), the driver error
//    wrapped in `new DrizzleQueryError(sql, params, cause)`. Each is passed
//    to console.error(err), console.error('…', err) and
//    Sentry.captureException(err); no bound value may appear in any envelope
//    the client would send. (tests/db-error-guards.test.ts keeps this file
//    building them by hand.)
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
  let raw: ReturnType<typeof postgres>
  const realConsoleError = console.error
  const realConsoleWarn = console.warn
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
    raw = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    // The SDK wraps whatever console.error is at init; keep the values out of
    // the test output.
    console.error = () => {}
    console.warn = () => {}
    harness = startSentryHarness()
  })

  afterAll(async () => {
    await harness?.close()
    console.error = realConsoleError
    console.warn = realConsoleWarn
    await raw?.end()
    const { db } = await import('@/lib/db/client')
    const { profiles, oikosGroups, invoiceCredentials } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    if (made.group) {
      await db.delete(invoiceCredentials).where(eq(invoiceCredentials.groupId, made.group))
      await db.delete(oikosGroups).where(eq(oikosGroups.id, made.group))
    }
    if (made.profile) await db.delete(profiles).where(eq(profiles.id, made.profile))
  })

  /**
   * The raw error Drizzle would have thrown for `query`, without going
   * through the (wrapped) drizzle prototype: same statement, same
   * parameters, same wrapper.
   */
  async function rawFail(query: { toSQL(): { sql: string; params: unknown[] } }): Promise<Error & { cause: Error & { code?: string } }> {
    const { sql, params } = query.toSQL()
    return Promise.resolve(raw.unsafe(sql, params as never[])).then(
      () => { throw new Error('expected the query to fail') },
      (e: unknown) => new DrizzleQueryError(sql, params, e as Error) as Error & { cause: Error & { code?: string } },
    )
  }

  function surfaces(e: unknown): string {
    let json = ''
    try { json = JSON.stringify(e) ?? '' } catch { json = '<unserializable>' }
    const chain: string[] = []
    for (let cur: unknown = e, d = 0; cur && d < 5; cur = (cur as { cause?: unknown }).cause, d++) {
      chain.push(String((cur as Error).message), String((cur as Error).stack))
    }
    return [inspect(e, { showHidden: true, depth: 8 }), json, ...chain].join('\n')
  }

  // #1453 — layer 1. Runs first: it also inserts the row the 23505 cases
  // collide with.
  it('errors thrown through db are clean at the source (no params, no detail, nothing hidden)', async () => {
    const { db } = await import('@/lib/db/client')
    const { invoiceCredentials } = await import('@/lib/db/schema')
    const row = (over: Partial<typeof invoiceCredentials.$inferInsert> = {}) => ({
      groupId: made.group, userId: made.profile, barcode: BARCODE, verificationCodeEncrypted: CIPHERTEXT, ...over,
    })
    const fail = (p: PromiseLike<unknown>) =>
      Promise.resolve(p).then(() => { throw new Error('expected the query to fail') }, (e: unknown) => e as Error & { cause: Error & Record<string, unknown> })

    await db.insert(invoiceCredentials).values(row())
    const queries = [
      db.insert(invoiceCredentials).values(row()),
      db.insert(invoiceCredentials).values(row({ barcode: '/OTHER01', deletedAt: new Date() })),
      db.insert(invoiceCredentials).values(row({ groupId: randomUUID() })),
      db.insert(invoiceCredentials).values(row({ groupId: BAD_UUID })),
    ]
    // Control: the same statements, raw, carry the values.
    const raws = []
    for (const q of queries) raws.push(await rawFail(q))
    expect(raws.map((e) => e.cause.code)).toEqual(['23505', '23514', '23503', '22P02'])
    for (const e of raws) expect(SECRETS.some((s) => surfaces(e).includes(s))).toBe(true)

    const clean = []
    for (const q of queries) clean.push(await fail(q))
    expect(clean.map((e) => e.cause.code)).toEqual(['23505', '23514', '23503', '22P02'])
    expect(clean[0].cause.constraint_name).toBe('invoice_credentials_uniq')
    for (const e of clean) {
      expect(e.message).toMatch(/^Failed query: insert into /)
      expect(e.message).not.toContain('params:')
      expect('params' in e).toBe(false)
      expect(e.cause.detail).toBeUndefined()
      expect(e.cause.where).toBeUndefined()
      expect(SECRETS.filter((s) => surfaces(e).includes(s))).toEqual([])
    }
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
    // The colliding row was inserted by the source test above.
    const errors = [
      await rawFail(db.insert(invoiceCredentials).values(row())),                                  // 23505
      await rawFail(db.insert(invoiceCredentials).values(row({ barcode: '/OTHER01', deletedAt: new Date() }))), // 23514
      await rawFail(db.insert(invoiceCredentials).values(row({ groupId: randomUUID() }))),         // 23503
      await rawFail(db.insert(invoiceCredentials).values(row({ groupId: BAD_UUID }))),             // 22P02
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
    const e = await rawFail(db.insert(invoiceCredentials).values(row))

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
      const e = await rawFail(db.insert(invoiceCredentials).values({
        groupId, userId: made.profile, barcode: '/Q1439', verificationCodeEncrypted: 'v1:k1:q',
      }))
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

  // #1439 round 3: when the text is cut (32 KiB head, or > 256 KiB pre-cut)
  // the quote found in it may be the input's own — the real closing quote was
  // cut off. The input is masked to the end of the head instead.
  it('a long 22P02 input with an inner quote leaks nothing through any hook', async () => {
    const { db } = await import('@/lib/db/client')
    const { invoiceCredentials } = await import('@/lib/db/schema')
    const { sanitizeDbError } = await import('@/lib/db/sanitizeError')
    const Sentry = await import('@sentry/node')
    const SECRET = 'ZSECRET1439Z'
    const values = [
      `x"${SECRET}${'A'.repeat(40_000)}`,
      `x"${SECRET}${'A'.repeat(100_000)}`,
      `${'A'.repeat(20_000)}"${SECRET}${'A'.repeat(40_000)}`,
      `x\n"${SECRET}${'A'.repeat(40_000)}`,
      `x"${SECRET}${'😀'.repeat(20_000)}`,
    ]

    await harness.drain()
    harness.envelopes.length = 0
    const sanitized: string[] = []
    for (const groupId of values) {
      const e = await rawFail(db.insert(invoiceCredentials).values({
        groupId, userId: made.profile, barcode: '/Q1439', verificationCodeEncrypted: 'v1:k1:q',
      }))
      const cause = e.cause as Error & { code?: string }
      // Control: the real 22P02 quotes the whole input.
      expect(cause.code).toBe('22P02')
      expect(cause.message).toBe(`invalid input syntax for type uuid: "${groupId}"`)

      console.error(e)
      console.error('x', e)
      console.error(cause)
      console.warn('x', cause)
      console.error(cause.message)
      Sentry.captureException(e)
      Sentry.captureException(cause)
      Sentry.captureMessage(cause.message)
      const clean = sanitizeDbError(e) as Error & { cause: Error }
      sanitized.push(clean.message, clean.stack ?? '', clean.cause.message, clean.cause.stack ?? '')
    }
    const all = (await harness.drain()).join('\n')

    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all).toContain('invalid input syntax for type uuid')
    expect(all).not.toContain(SECRET)
    expect(sanitized.join('\n')).not.toContain(SECRET)
  })
})
