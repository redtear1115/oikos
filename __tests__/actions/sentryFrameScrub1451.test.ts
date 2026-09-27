// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import * as Sentry from '@sentry/node'
import type { StackFrame } from '@sentry/nextjs'
import { startSentryHarness, type SentryHarness } from '../../tests/_helpers/sentryHarness'

// ─── Real driver errors: no bound value in a stack frame (#1451) ─────────────
//
// LOCAL THROWAWAY DATABASE ONLY. Skips unless DATABASE_URL is localhost. Does
// not read .env.local and needs no migration: it creates (and drops) its own
// table. Any plain Postgres works, e.g.
//
//   docker run -d --name pg-1451 -e POSTGRES_PASSWORD=pw -p 127.0.0.1:55770:5432 postgres:17
//   DATABASE_URL=postgres://postgres:pw@localhost:55770/postgres \
//     npx vitest run __tests__/actions/sentryFrameScrub1451.test.ts
//
// The SDK's node stack parser makes a frame out of any stack line that
// contains `at `, and `err.stack` starts with the whole message. A barcode
// with ` at ` in it turns Drizzle's `params:` line into a frame whose
// filename is the rest of the params — the ciphertext included; a 22P02
// input with a newline does the same from the Postgres message. Errors thrown
// through `db` are cleaned at the database layer (#1453), so this is about a
// driver error that reaches Sentry some other way: this file never imports
// `lib/db/client` (enforced by tests/db-error-guards.test.ts), its own drizzle
// instance throws raw errors, and only the event hook stands in the way.
//
// The secrets are assembled at runtime: contextLines copies source lines of
// this file into the frames, so a literal would leak by itself.
// ──────────────────────────────────────────────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const TABLE = 'sentry_frame_1451'
const credentials = pgTable(TABLE, {
  id: uuid('id').primaryKey(),
  groupId: uuid('group_id').notNull(),
  barcode: text('barcode').notNull().unique(),
  secret: text('secret').notNull(),
})

const TAIL = ['ZQ', '1451', 'LIVE'].join('')
const CIPHERTEXT = ['v1', 'k1', 'l1451c1f3e27', '0f00ba4', '5ec12e7c1a55'].join(':')
const NL_TAIL = ['NL', '1451', 'LIVE'].join('')
const SECRETS = [TAIL, CIPHERTEXT, NL_TAIL]
const AT_BARCODE = `/AB at ${TAIL}`
const NL_INPUT = `/x\nfoo at ${NL_TAIL}`

function frameKey(f: StackFrame): string {
  return `${f.function} ${f.filename}:${f.lineno}:${f.colno}`
}

/** The frames the SDK parses from the call-stack part of `err.stack` alone. */
function realFrames(err: Error): string[] {
  const stack = err.stack ?? ''
  const at = stack.indexOf(err.message)
  expect(at).toBeGreaterThanOrEqual(0)
  return Sentry.defaultStackParser(stack.slice(at + err.message.length)).map(frameKey)
}

function eventFrameLists(envelopes: string[]): string[] {
  const out: string[] = []
  for (const env of envelopes) {
    const lines = env.split('\n')
    for (let i = 1; i < lines.length; i += 2) {
      if (!lines[i].includes('"type":"event"')) continue
      const ev = JSON.parse(lines[i + 1]) as { exception?: { values?: Array<{ stacktrace?: { frames?: StackFrame[] } }> } }
      const lists = (ev.exception?.values ?? []).map((v) => JSON.stringify((v.stacktrace?.frames ?? []).map(frameKey))).sort()
      out.push(JSON.stringify(lists))
    }
  }
  return out.sort()
}

describe.skipIf(!isLocalDb)('#1451 real driver errors: no bound value in any frame — local throwaway DB', () => {
  let harness: SentryHarness
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle>
  const realConsoleError = console.error
  const realConsoleWarn = console.warn

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    db = drizzle(client)
    await client.unsafe(`drop table if exists ${TABLE}`)
    await client.unsafe(`create table ${TABLE} (id uuid primary key, group_id uuid not null, barcode text not null unique, secret text not null)`)
    console.error = () => {}
    console.warn = () => {}
    harness = startSentryHarness({
      integrations: [Sentry.linkedErrorsIntegration(), Sentry.contextLinesIntegration()],
    })
  })

  afterAll(async () => {
    await harness?.close()
    console.error = realConsoleError
    console.warn = realConsoleWarn
    await client?.unsafe(`drop table if exists ${TABLE}`)
    await client?.end()
  })

  const fail = (p: PromiseLike<unknown>) =>
    Promise.resolve(p).then(() => { throw new Error('expected the query to fail') }, (e: unknown) => e as Error & { cause: Error & { code?: string } })

  const row = (over: Record<string, string> = {}) => ({
    id: randomUUID(), groupId: randomUUID(), barcode: AT_BARCODE, secret: CIPHERTEXT, ...over,
  })

  async function uniqueViolation() {
    return fail(db.insert(credentials).values(row()))
  }
  async function invalidInput() {
    return fail(db.insert(credentials).values(row({ groupId: NL_INPUT, barcode: '/Q1451' })))
  }

  it('captureException(e), captureRequestError(fresh e), captureException(e.cause) leak nothing; real frames stay', async () => {
    const { captureRequestError } = await import('@sentry/nextjs')
    await db.insert(credentials).values(row())

    await harness.drain()
    harness.envelopes.length = 0
    const captured: Error[] = []
    for (const make of [uniqueViolation, invalidInput]) {
      const a = await make()
      const b = await make()
      const c = await make()
      // Control: the real driver errors, and the SDK parser really makes a
      // frame out of the values.
      expect(['23505', '22P02']).toContain(a.cause.code)
      expect(a.message).toContain(CIPHERTEXT)
      const parsed = [...Sentry.defaultStackParser(a.stack ?? ''), ...Sentry.defaultStackParser(a.cause.stack ?? '')]
      expect(parsed.some((f) => SECRETS.some((s) => `${f.filename} ${f.module} ${f.function}`.includes(s)))).toBe(true)

      Sentry.captureException(a)
      captureRequestError(b, { path: '/api/x', method: 'POST', headers: {} }, {
        routerKind: 'App Router', routePath: '/api/x', routeType: 'route',
      })
      Sentry.captureException(c.cause)
      captured.push(a, b, c.cause)
    }
    const envelopes = [...(await harness.drain())]
    const all = envelopes.join('\n')

    expect(all).toContain('"type":"event"')
    expect(all).toContain('Failed query: insert into')
    expect(SECRETS.filter((s) => all.includes(s))).toEqual([])

    // Every event carries exactly the real call stack of each error in it —
    // nothing added, nothing lost.
    const expected = captured.map((e) => {
      const cause = (e as Error & { cause?: unknown }).cause
      const lists = [realFrames(e), ...(cause instanceof Error ? [realFrames(cause)] : [])].map((l) => JSON.stringify(l)).sort()
      return JSON.stringify(lists)
    }).sort()
    expect(eventFrameLists(envelopes)).toEqual(expected)
    // …and those stacks are real: driver code, and this file's own frames.
    expect(all).toContain('node_modules/drizzle-orm/')
    expect(all).toContain('node_modules/postgres/')
    expect(all).toContain('__tests__/actions/sentryFrameScrub1451.test.ts')
  })
})
