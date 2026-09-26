// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { DrizzleQueryError } from 'drizzle-orm'
import { startSentryHarness, type SentryHarness } from './_helpers/sentryHarness'

/**
 * #1289 F5 / verifier F1 — what actually leaves the process when a raw
 * database error is logged or captured, through a real Sentry client.
 *
 * In a Node process `consoleLoggingIntegration` formats `console.error(err)`
 * as `JSON.stringify(normalize(err))`: the `\nparams:` tail arrives with an
 * escaped newline, and the values also sit in `"params":[…]` and in the
 * cause's `"detail"`. A scrub that only understands the plain-text form lets
 * all of that through. The same errors built from a live database run in
 * `__tests__/actions/sentryDbErrorEnvelope.test.ts` (local throwaway DB).
 */

const BARCODE = '/SEC1289'
const CIPHERTEXT = 'v1:k1:5ec12e7c1a55:0f00ba4:c1f3e27ex7'
const BAD_UUID = 'SECRET-NOT-A-UUID-1289'
const SECRETS = [BARCODE, CIPHERTEXT, BAD_UUID]
const SQL_TEXT = 'insert into "InvoiceCredentials" ("id", "group_id", "barcode", "verification_code_encrypted") values ($1, $2, $3, $4)'

function pgError(fields: Record<string, string>) {
  const params = ['8f4b0c1e-0000-4000-8000-000000000001', BAD_UUID, BARCODE, CIPHERTEXT]
  const pg = new postgres.PostgresError({ severity: 'ERROR', ...fields } as never)
  Object.defineProperties(pg, {
    query: { value: SQL_TEXT, enumerable: false },
    parameters: { value: params, enumerable: false },
    args: { value: params, enumerable: false },
  })
  return new DrizzleQueryError(SQL_TEXT, params, pg)
}

const ERRORS: Array<[string, () => Error]> = [
  ['23505', () => pgError({
    code: '23505', message: 'duplicate key value violates unique constraint "invoice_credentials_uniq"',
    detail: `Key (group_id, user_id, barcode)=(g, u, ${BARCODE}) already exists.`, constraint_name: 'invoice_credentials_uniq',
  })],
  ['23514', () => pgError({
    code: '23514', message: 'new row for relation "InvoiceCredentials" violates check constraint "invoice_credentials_secret_iff_live"',
    detail: `Failing row contains (8f4b, g, u, ${BARCODE}, ${CIPHERTEXT}, null, active, null, 2026-09-27).`,
  })],
  ['23503', () => pgError({
    code: '23503', message: 'insert or update on table "InvoiceCredentials" violates foreign key constraint',
    detail: `Key (barcode)=(${BARCODE}) is not present in table "X".`,
  })],
  ['22P02', () => pgError({
    code: '22P02', message: `invalid input syntax for type uuid: "${BAD_UUID}"`,
    where: `unnamed portal parameter $2 = '${BAD_UUID}'`,
  })],
]

let harness: SentryHarness

// The SDK wraps whatever console.error is at init time; make that a no-op so
// the synthetic values don't land in the test output.
const realConsoleError = console.error
beforeAll(() => {
  console.error = () => {}
  harness = startSentryHarness()
})
afterAll(async () => {
  await harness.close()
  console.error = realConsoleError
})

describe('raw database errors through a real Sentry client', () => {
  it('the synthetic errors carry the values (control)', () => {
    for (const [, make] of ERRORS) {
      const e = make()
      expect(e.message).toContain(BARCODE)
      expect(e.message).toContain(CIPHERTEXT)
    }
  })

  it('console.error(err), console.error("…", err) and captureException leak no value', async () => {
    const Sentry = await import('@sentry/node')
    for (const [code, make] of ERRORS) {
      console.error(make())
      console.error(`failed (${code}):`, make())
      Sentry.captureException(make())
    }
    const envelopes = await harness.drain()
    const all = envelopes.join('\n')

    // Not vacuous: the log items and the error events really went out.
    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all.match(/Failed query: insert into/g)?.length ?? 0).toBeGreaterThanOrEqual(12)
    expect(all).toContain('23514')

    expect(SECRETS.filter((s) => all.includes(s))).toEqual([])
  })
})
