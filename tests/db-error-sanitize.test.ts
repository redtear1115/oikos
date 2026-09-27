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
  scrubSentrySpan,
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

  it('#1439: a 22P02 input with a newline or an inner quote is masked whole', () => {
    for (const value of [`/x\n${DESCRIPTION}`, `x"${DESCRIPTION}`, `x"\n"${CIPHERTEXT}`]) {
      const pg = new postgres.PostgresError({
        message: `invalid input syntax for type uuid: "${value}"`,
        severity: 'ERROR',
        code: '22P02',
      } as never)
      const out = sanitizeDbError(new DrizzleQueryError(SQL_TEXT, [value], pg)) as Error & { cause: Error }
      expect(out.cause.message).toBe('invalid input syntax for type uuid: "<masked>"')
      expect(leaks(out)).toEqual([])
      expect(leaks(out.cause.stack)).toEqual([])
    }
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

// ─── #1453 security review items ─────────────────────────────────────────────

/** A postgres.js-shaped error: fields plus the hidden query decoration. */
function pgWith(fields: Record<string, string>, params: unknown[] = [DESCRIPTION, CIPHERTEXT]): Error & Record<string, unknown> {
  const pg = new postgres.PostgresError({ severity: 'ERROR', ...fields } as never)
  Object.defineProperties(pg, {
    query: { value: SQL_TEXT, enumerable: false },
    parameters: { value: params, enumerable: false },
    args: { value: params, enumerable: false },
  })
  return pg as unknown as Error & Record<string, unknown>
}

/** Class 22 messages as Postgres words them; each quotes the value. */
const DATA_EXCEPTIONS: Array<[code: string, message: string]> = [
  ['22P02', `invalid input syntax for type uuid: "${DESCRIPTION}"`],
  ['22003', `value "${DESCRIPTION}" is out of range for type integer`],
  ['22P02', `malformed array literal: "${DESCRIPTION}"`],
  ['22P02', `malformed record literal: "${DESCRIPTION}"`],
  ['22P02', `malformed range literal: "${DESCRIPTION}"`],
  ['22008', `date/time field value out of range: "${DESCRIPTION}"`],
  ['22007', `invalid value "${DESCRIPTION}" for "YYYY"`],
  ['22021', `invalid byte sequence for encoding "UTF8": ${DESCRIPTION}`],
  ['22P02', `invalid input value for enum "Kind": "x"\n${CIPHERTEXT}"`],
]

describe('#1453 sanitizeDbError — class 22, kept fields, fail-closed paths', () => {
  it.each(DATA_EXCEPTIONS)('%s "%s" is masked from the first quote, in message and stack', (code, message) => {
    const out = sanitizeDbError(new DrizzleQueryError(SQL_TEXT, [DESCRIPTION], pgWith({ code, message }))) as Error & { cause: Error & Record<string, unknown> }
    expect(out.cause.message).toBe(`${message.slice(0, message.indexOf('"') + 1)}<masked>"`)
    expect(out.cause.code).toBe(code)
    expect(leaks(out)).toEqual([])
    expect(leaks(out.cause.stack)).toEqual([])
  })

  it('a class 22 message without a quote is kept as is', () => {
    const out = sanitizeDbError(pgWith({ code: '22012', message: 'division by zero' })) as Error
    expect(out.message).toBe('division by zero')
  })

  it('keeps hint and position; drops detail, where and the hidden parameters', () => {
    const out = sanitizeDbError(pgWith({
      code: '23505', message: 'duplicate key', detail: `Key (b)=(${BARCODE})`, where: `x = '${CIPHERTEXT}'`,
      hint: 'Use ON CONFLICT.', position: '42', constraint_name: 'c_uniq',
    })) as Record<string, unknown>
    expect(out.hint).toBe('Use ON CONFLICT.')
    expect(out.position).toBe('42')
    expect(out.constraint_name).toBe('c_uniq')
    expect(out.detail).toBeUndefined()
    expect(out.where).toBeUndefined()
    expect(leaks(out)).toEqual([])
  })

  it.each(['40P01', '40001', '55P03', '57014'])('keeps detail for %s (processes and locks, not rows)', (code) => {
    const detail = 'Process 101 waits for ShareLock on transaction 7; blocked by process 202.'
    const out = sanitizeDbError(pgWith({ code, message: 'deadlock detected', detail })) as Record<string, unknown>
    expect(out.detail).toBe(detail)
  })

  it('drops detail for every other code', () => {
    for (const code of ['23505', '23514', '23503', '22P02', '42P01']) {
      const out = sanitizeDbError(pgWith({ code, message: 'x', detail: `Key (b)=(${BARCODE})` })) as Record<string, unknown>
      expect(out.detail).toBeUndefined()
    }
  })

  it('an internal failure still returns the SQLSTATE and constraint (control flow reads them)', () => {
    const cause = pgWith({ code: '23505', message: 'duplicate key', constraint_name: 'invoice_credentials_uniq', detail: `Key (b)=(${BARCODE})` })
    const top = new Error('wrapper', { cause })
    Object.defineProperty(top, 'message', { get() { throw new Error('boom') } })
    const out = sanitizeDbError(top) as Error & Record<string, unknown>
    expect(out.message).toBe('Database error (details removed)')
    expect(out.code).toBe('23505')
    expect(out.constraint_name).toBe('invoice_credentials_uniq')
    expect(leaks(out)).toEqual([])
  })

  it('a Drizzle stack that does not start with its message fails closed to the header', () => {
    const e = new DrizzleQueryError(SQL_TEXT, [DESCRIPTION], pgWith({ code: '23505', message: 'dup' }))
    e.stack = `Error: something else\n    at fake (x.js:1:1)\nparams: /x\n    at home (${CIPHERTEXT}:1:1)`
    const out = sanitizeDbError(e) as Error
    expect(out.stack).toBe(`${out.name}: Failed query: ${SQL_TEXT}`)
    expect(leaks(out)).toEqual([])
  })

  it('a params value shaped like a stack frame does not survive in the stack', () => {
    const e = new DrizzleQueryError(SQL_TEXT, [`/AB\n    at home (sofa.js:1:1)`, CIPHERTEXT], pgWith({ code: '23505', message: 'dup' }))
    const out = sanitizeDbError(e) as Error
    expect(out.stack).not.toContain('sofa.js')
    expect(leaks(out.stack)).toEqual([])
    expect(out.stack).toMatch(/\n\s+at /) // real frames stay
  })

  it('a non-Postgres driver error with hidden parameters becomes a clean copy (connection fields kept)', () => {
    // postgres.js Errors.connection + the decoration every rejected query gets.
    const conn = Object.assign(new Error('write CONNECTION_CLOSED db.local:5432'), {
      code: 'CONNECTION_CLOSED', errno: 'CONNECTION_CLOSED', address: 'db.local', port: 5432,
    })
    Object.defineProperties(conn, {
      query: { value: SQL_TEXT, enumerable: false },
      parameters: { value: [BARCODE, CIPHERTEXT], enumerable: false },
      args: { value: [BARCODE, CIPHERTEXT], enumerable: false },
    })
    expect(leaks(conn)).toEqual([BARCODE, CIPHERTEXT]) // control: inspect(showHidden) prints them
    const out = sanitizeDbError(new DrizzleQueryError(SQL_TEXT, [BARCODE, CIPHERTEXT], conn)) as Error & { cause: Error & Record<string, unknown> }
    expect(out.cause).not.toBe(conn)
    expect(out.cause.message).toBe('write CONNECTION_CLOSED db.local:5432')
    expect(out.cause.code).toBe('CONNECTION_CLOSED')
    expect(out.cause.errno).toBe('CONNECTION_CLOSED')
    expect(out.cause.address).toBe('db.local')
    expect(out.cause.port).toBe(5432)
    expect(leaks(out)).toEqual([])
    // Bare (not wrapped by Drizzle) too.
    expect(leaks(sanitizeDbError(conn))).toEqual([])
  })

  it('is idempotent (DB layer, then runAction)', () => {
    const once = sanitizeDbError(driverError()) as Error & { cause: Error }
    const message = once.message
    const stack = once.stack
    const causeMessage = once.cause.message
    const twice = sanitizeDbError(once) as Error & { cause: Error }
    expect(twice.message).toBe(message)
    expect(twice.stack).toBe(stack)
    expect(twice.cause.message).toBe(causeMessage)
  })
})

describe('#1453 Sentry hooks — class 22 rule, span status and query attributes', () => {
  it.each(DATA_EXCEPTIONS)('exception value of %s "%s": masked via the original error', (code, message) => {
    const pg = pgWith({ code, message })
    const event = { exception: { values: [{ type: 'PostgresError', value: message }] } } as unknown as ErrorEvent
    const out = scrubSentryEvent(event, { originalException: pg })
    expect(out.exception!.values![0].value).toBe(`${message.slice(0, message.indexOf('"') + 1)}<masked>"`)
    expect(leaks(out)).toEqual([])
  })

  it.each(DATA_EXCEPTIONS)('console.error(err) JSON of %s "%s": masked by its code', (code, message) => {
    // How consoleLoggingIntegration formats an Error argument in Node.
    const json = JSON.stringify({ name: 'PostgresError', code, message, stack: `PostgresError: ${message}\n    at x (/app/y.js:1:1)` })
    const out = scrubSentryLog({ level: 'error', message: json } as unknown as Log)
    expect(leaks(out)).toEqual([])
    expect(out.message).toContain('/app/y.js:1:1')
  })

  it.each(DATA_EXCEPTIONS.filter(([, m]) => !m.startsWith('invalid input value for enum')))(
    'plain text without a code, %s "%s": masked by the message shape',
    (_code, message) => {
      const out = scrubSentryBreadcrumb({ message })
      expect(leaks(out)).toEqual([])
    },
  )

  it('breadcrumb arguments: an Error carrying a class 22 code', () => {
    const pg = pgWith({ code: '22003', message: `value "${DESCRIPTION}" is out of range for type integer` })
    const out = scrubSentryBreadcrumb({ category: 'console', data: { arguments: [pg] } })
    expect(leaks(out)).toEqual([])
  })

  it('span: status of a failed postgres.js query is masked by db.response.status_code; parameter attributes dropped', () => {
    const span = {
      span_id: 'a', trace_id: 'b', start_timestamp: 1, origin: 'auto.db.postgresjs', op: 'db',
      status: `malformed array literal: "${DESCRIPTION}"`,
      description: 'insert into "InvoiceCredentials" ("barcode") values ($1)',
      data: {
        'db.response.status_code': '22P02',
        'db.query.text': 'insert into "InvoiceCredentials" ("barcode") values ($1)',
        'db.query.parameter.0': BARCODE,
        'drizzle.query.params': JSON.stringify([BARCODE, CIPHERTEXT]),
        'drizzle.query.text': 'insert into "InvoiceCredentials" ("barcode") values ($1)',
      },
    }
    const out = scrubSentrySpan(span as never)
    expect(out.status).toBe('malformed array literal: "<masked>"')
    expect(out.data).not.toHaveProperty('db.query.parameter.0')
    expect(out.data).not.toHaveProperty('drizzle.query.params')
    expect(out.data!['db.query.text']).toBe(span.data['db.query.text'])
    expect(leaks(out)).toEqual([])
  })

  it('span: a status with a class 22 wording but no code is masked by shape; plain statuses stay', () => {
    const masked = scrubSentrySpan({ span_id: 'a', trace_id: 'b', start_timestamp: 1, status: `value "${DESCRIPTION}" is out of range for type integer` } as never)
    expect(leaks(masked)).toEqual([])
    const ok = scrubSentrySpan({ span_id: 'a', trace_id: 'b', start_timestamp: 1, status: 'internal_error' } as never)
    expect(ok.status).toBe('internal_error')
  })

  it('transaction: child span statuses and the trace context status are scrubbed', () => {
    const event = {
      type: 'transaction',
      contexts: { trace: { span_id: 'a', trace_id: 'b', status: `invalid input syntax for type uuid: "${DESCRIPTION}"`, data: { 'db.response.status_code': '22P02' } } },
      spans: [{ span_id: 'c', trace_id: 'b', start_timestamp: 1, status: `date/time field value out of range: "${CIPHERTEXT}"`, data: { 'db.response.status_code': '22008', 'drizzle.query.params': `["${BARCODE}"]` } }],
    } as unknown as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(leaks(out)).toEqual([])
  })
})
