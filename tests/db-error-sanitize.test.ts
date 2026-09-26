import { describe, it, expect } from 'vitest'
import { inspect } from 'node:util'
import postgres from 'postgres'
import { DrizzleQueryError } from 'drizzle-orm'
import { runAction } from '@/lib/action-errors'
import { sanitizeDbError } from '@/lib/db/sanitizeError'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from '@/lib/observability/sentryScrub'
import type { Breadcrumb, ErrorEvent, Log } from '@sentry/nextjs'

/**
 * #1289 F5 — a failed query must not carry its bound values (or Postgres'
 * row detail) into Vercel logs or Sentry.
 *
 * The error is built the way the drivers build it: postgres.js's
 * `PostgresError` with `query` / `parameters` / `args` attached as
 * non-configurable properties (connection.js), wrapped by Drizzle's
 * `DrizzleQueryError` (message `Failed query: …\nparams: …`, `.params`).
 *
 * Two layers, each tested on its own:
 *   1. runAction's sanitiser, at the source (covers Vercel's log line);
 *   2. the Sentry hooks, on the raw text (covers every non-action path).
 */

const BARCODE = '/ABC1234'
const CIPHERTEXT = 'v1:k1:00112233445566778899aabb:ccddeeff00112233445566778899aabb:deadbeefcafe'
const DESCRIPTION = '週末去宜蘭的民宿訂金'
const SECRETS = [BARCODE, CIPHERTEXT, DESCRIPTION]
const SQL_TEXT = 'insert into "InvoiceCredentials" ("id", "group_id", "user_id", "barcode", "verification_code_encrypted") values ($1, $2, $3, $4, $5)'

function driverError(): DrizzleQueryError {
  const params = ['8f4b0c1e-0000-4000-8000-000000000001', 'grp-1', 'user-a', BARCODE, CIPHERTEXT, DESCRIPTION]
  const pg = new postgres.PostgresError({
    message: 'duplicate key value violates unique constraint "invoice_credentials_uniq"',
    severity: 'ERROR',
    code: '23505',
    detail: `Key (group_id, user_id, barcode)=(grp-1, user-a, ${BARCODE}) already exists.`,
    schema_name: 'public',
    table_name: 'InvoiceCredentials',
    constraint_name: 'invoice_credentials_uniq',
  } as never)
  // What postgres.js does to every query error (src/connection.js).
  Object.defineProperties(pg, {
    query: { value: SQL_TEXT, enumerable: false },
    parameters: { value: params, enumerable: false },
    args: { value: params, enumerable: false },
  })
  return new DrizzleQueryError(SQL_TEXT, params, pg)
}

function leaks(value: unknown): string[] {
  const text = typeof value === 'string'
    ? value
    : `${JSON.stringify(value)}\n${inspect(value, { depth: 8, showHidden: true })}`
  return SECRETS.filter((s) => text.includes(s))
}

describe('runAction sanitises driver errors at the source', () => {
  it('the synthetic error really does carry the values (control)', () => {
    const e = driverError()
    expect(leaks(e.message)).toEqual([BARCODE, CIPHERTEXT, DESCRIPTION])
    expect(leaks((e.cause as unknown as { detail: string }).detail)).toEqual([BARCODE])
  })

  it('re-throws with the SQL text, the SQLSTATE and the constraint, and no values', async () => {
    const thrown = await runAction(async () => { throw driverError() })
      .then(() => null, (e: unknown) => e as Error & { params?: unknown; cause?: Record<string, unknown> })

    expect(thrown).toBeInstanceOf(DrizzleQueryError)
    expect(thrown!.message).toBe(`Failed query: ${SQL_TEXT}`)
    expect(thrown!.params).toBeUndefined()
    expect(thrown!.stack).not.toContain('params:')
    expect(thrown!.cause?.code).toBe('23505')
    expect(thrown!.cause?.constraint_name).toBe('invoice_credentials_uniq')
    expect(thrown!.cause?.detail).toBeUndefined()
    expect(leaks(thrown)).toEqual([])
    expect(leaks(thrown!.stack)).toEqual([])
    expect(leaks(thrown!.cause)).toEqual([])
  })

  it('a bare PostgresError is replaced by a copy without detail / parameters', () => {
    const pg = driverError().cause as Error
    const out = sanitizeDbError(pg) as Record<string, unknown>
    expect(out).not.toBe(pg)
    expect(out.code).toBe('23505')
    expect(leaks(out)).toEqual([])
  })

  it('masks the quoted input of a 22P02 message, in message and stack', () => {
    const pg = new postgres.PostgresError({
      message: `invalid input syntax for type uuid: "${DESCRIPTION}"`,
      severity: 'ERROR',
      code: '22P02',
      where: `unnamed portal parameter $2 = '${DESCRIPTION}'`,
    } as never)
    const out = sanitizeDbError(new DrizzleQueryError(SQL_TEXT, [DESCRIPTION], pg)) as Error & { cause: Error }
    expect(out.cause.message).toBe('invalid input syntax for type uuid: "<masked>"')
    expect(leaks(out)).toEqual([])
    expect(leaks(out.cause.stack)).toEqual([])
  })

  it('leaves non-database errors alone', async () => {
    const plain = new Error('something else broke')
    await expect(runAction(async () => { throw plain })).rejects.toBe(plain)
  })

  it('still returns expected failures as values', async () => {
    await expect(runAction(async () => { throw new Error('solo_group') }))
      .resolves.toEqual({ ok: false, code: 'solo_group' })
  })
})

describe('the Sentry hooks scrub the raw text (second line)', () => {
  const raw = driverError()
  const rawDetail = (raw.cause as unknown as { detail: string }).detail
  const failingRow = `Failing row contains (8f4b, grp-1, user-a, ${BARCODE}, ${CIPHERTEXT}, null, active).`

  it('error event: exception values, message, logentry', () => {
    const event = {
      message: raw.message,
      logentry: { message: `%s: ${rawDetail}`, params: [raw.message, raw] },
      exception: {
        values: [
          { type: 'Error', value: raw.message },
          { type: 'PostgresError', value: `${raw.cause instanceof Error ? raw.cause.message : ''}\n${rawDetail}` },
          { type: 'PostgresError', value: `new row violates check constraint\n${failingRow}` },
        ],
      },
    } as unknown as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(leaks(out)).toEqual([])
    // The debuggable parts survive.
    const first = out.exception!.values![0].value!
    expect(first).toContain(SQL_TEXT)
    expect(first).toMatch(/\nparams: \[Filtered\]$/)
    expect(out.exception!.values![1].value).toContain('Key (group_id, user_id, barcode)=(<masked>)')
    expect(out.exception!.values![2].value).toContain('Failing row contains (<masked>)')
  })

  it('console breadcrumb: message and raw arguments, including the Error object', () => {
    const crumb: Breadcrumb = {
      category: 'console',
      level: 'error',
      message: raw.message,
      data: { arguments: ['action failed', raw, { detail: rawDetail }], logger: 'console' },
    }
    const out = scrubSentryBreadcrumb(crumb)
    expect(leaks(out)).toEqual([])
    expect((out.data!.arguments as unknown[])[0]).toBe('action failed')
    expect(out.data!.logger).toBe('console')
  })

  it('log: message and non-string parameters', () => {
    const log = {
      level: 'error',
      message: `Error: ${raw.message}`,
      attributes: {
        'sentry.message.template': '%s %o',
        'sentry.message.parameter.0': raw.message,
        'sentry.message.parameter.1': raw,
        'sentry.message.parameter.2': { detail: rawDetail },
        'server.address': 'localhost',
      },
    } as unknown as Log
    const out = scrubSentryLog(log)
    expect(leaks(out)).toEqual([])
    expect(out.attributes!['server.address']).toBe('localhost')
  })

  it('an unrelated "params:" mid-sentence is left alone', () => {
    const crumb = scrubSentryBreadcrumb({ message: 'bad params: expected 2' })
    expect(crumb.message).toBe('bad params: expected 2')
  })
})
