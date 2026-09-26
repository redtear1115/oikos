// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { DrizzleQueryError } from 'drizzle-orm'
import type { Breadcrumb, Log } from '@sentry/nextjs'
import {
  _URL_IN_TEXT_RE_FOR_TESTS,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from '@/lib/observability/sentryScrub'
import { startSentryHarness, type SentryHarness } from './_helpers/sentryHarness'

/**
 * #1439 — two edges of the #1289 scrubber, found in #1430's round-2 review.
 *
 * 1. A bound value that itself contains a real newline followed by `    at `
 *    (a nickname, a note — anything a user types) looked like the first stack
 *    frame to the old escaped-`\nparams:` regex, so the scrub stopped there
 *    and every later value — here a verification-code ciphertext — stayed in
 *    the Sentry log body. Nothing errored.
 * 2. Console arguments were JSON-stringified and fed to a URL regex that
 *    backtracks quadratically on long runs of scheme characters: a 50k-char
 *    alphanumeric object took ~1.3 s per `console.error`. Nothing errored
 *    either; the request just got slow.
 */

const NICKNAME = 'Mimi\n    at home (sofa.js:1:1)'
const CIPHERTEXT = 'v1:k1:1439c1f3e27e:0f00ba4:5ec12e7c1a55'
const BARCODE = '/SEC1439'
const SECRETS = [CIPHERTEXT, BARCODE]
const SQL_TEXT = 'insert into "InvoiceCredentials" ("id", "note", "barcode", "verification_code_encrypted") values ($1, $2, $3, $4)'

function nicknameError(): DrizzleQueryError {
  const params = ['8f4b0c1e-0000-4000-8000-000000001439', NICKNAME, BARCODE, CIPHERTEXT]
  const pg = new postgres.PostgresError({
    severity: 'ERROR',
    code: '23505',
    message: 'duplicate key value violates unique constraint "invoice_credentials_uniq"',
    detail: `Key (barcode)=(${BARCODE}) already exists.`,
  } as never)
  Object.defineProperties(pg, {
    query: { value: SQL_TEXT, enumerable: false },
    parameters: { value: params, enumerable: false },
    args: { value: params, enumerable: false },
  })
  return new DrizzleQueryError(SQL_TEXT, params, pg)
}

function leaked(text: string): string[] {
  return SECRETS.filter((s) => text.includes(s))
}

describe('#1439 (1): a bound value containing "\\n    at " does not end the scrub early', () => {
  let harness: SentryHarness
  const realConsoleError = console.error
  beforeAll(() => {
    console.error = () => {}
    harness = startSentryHarness()
  })
  afterAll(async () => {
    await harness.close()
    console.error = realConsoleError
  })

  it('control: the error message really carries the fake frame before the ciphertext', () => {
    const e = nicknameError()
    expect(e.message).toContain(`${NICKNAME},${BARCODE},${CIPHERTEXT}`)
  })

  it('console.error(err) / console.error("…", err) / captureException leak no later param', async () => {
    const Sentry = await import('@sentry/node')
    console.error(nicknameError())
    console.error('failed:', nicknameError())
    Sentry.captureException(nicknameError())
    const all = (await harness.drain()).join('\n')

    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all.match(/Failed query: insert into/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(leaked(all)).toEqual([])
  })

  it('the JSON log body keeps the SQL and the real stack frames', () => {
    const e = nicknameError()
    // What consoleLoggingIntegration hands beforeSendLog in a Node process.
    const message = JSON.stringify({ message: e.message, name: e.name, stack: e.stack })
    const out = scrubSentryLog({ level: 'error', message } as Log)
    expect(leaked(out.message as string)).toEqual([])
    const body = JSON.parse(out.message as string) as { message: string; stack: string }
    expect(body.message).toBe(`Failed query: ${SQL_TEXT}\nparams: [Filtered]`)
    expect(body.stack.startsWith(`${e.name}: Failed query: ${SQL_TEXT}\nparams: [Filtered]\n    at `)).toBe(true)
    // A real frame from this file survives; the fake one is gone.
    expect(body.stack).toContain('sentry-scrub-edges.test.ts')
    expect(body.stack).not.toContain('sofa.js')
  })

  it('a stack that does not start with its message is cut, not trusted', () => {
    const e = nicknameError()
    const message = JSON.stringify({ message: 'changed later', stack: e.stack })
    const out = scrubSentryLog({ level: 'error', message } as Log)
    expect(leaked(out.message as string)).toEqual([])
  })

  it('a short message that also appears inside the values does not split the stack there', () => {
    const e = nicknameError()
    // `message` is not the stack's header; it occurs only inside the params.
    const message = JSON.stringify({ message: 'Mimi', stack: e.stack })
    const out = scrubSentryLog({ level: 'error', message } as Log)
    expect(leaked(out.message as string)).toEqual([])
    const crumb = scrubSentryBreadcrumb({ category: 'console', data: { arguments: [{ message: 'Mimi', stack: e.stack }] } })
    expect(leaked(JSON.stringify(crumb))).toEqual([])
  })

  it('a JSON body the parser cannot read still loses everything after params', () => {
    const e = nicknameError()
    // Truncated mid-string: no structure to lean on.
    const message = JSON.stringify({ message: e.message, stack: e.stack }).slice(0, -30)
    const out = scrubSentryLog({ level: 'error', message } as Log)
    expect(leaked(out.message as string)).toEqual([])
  })

  it('breadcrumb arguments: the raw object form is scrubbed too', () => {
    const e = nicknameError()
    const crumb: Breadcrumb = {
      category: 'console',
      data: { arguments: ['failed', { error: { message: e.message, stack: e.stack } }, e] },
    }
    const out = scrubSentryBreadcrumb(crumb)
    expect(leaked(JSON.stringify(out))).toEqual([])
    expect((out.data!.arguments as unknown[])[0]).toBe('failed')
  })
})

describe('#1439 (2): large inputs scrub in bounded time', () => {
  // Generous: the fixed scrubber takes a few ms; the old one took ~1.3 s on
  // the 50k object and several seconds on the 100k string.
  const BUDGET_MS = 50

  function time(fn: () => unknown): number {
    const start = performance.now()
    fn()
    return performance.now() - start
  }

  const alnum = (n: number) => 'a1'.repeat(Math.ceil(n / 2)).slice(0, n)

  const cases: Array<[string, () => unknown]> = [
    ['50k alphanumeric object as a breadcrumb argument', () =>
      scrubSentryBreadcrumb({ category: 'console', data: { arguments: [{ blob: alnum(50_000) }] } })],
    ['200k alphanumeric object as a breadcrumb argument', () =>
      scrubSentryBreadcrumb({ category: 'console', data: { arguments: [{ blob: alnum(200_000) }] } })],
    ['100k plain string as a log message', () =>
      scrubSentryLog({ level: 'error', message: alnum(100_000) } as Log)],
    ['200k plain string as a log message', () =>
      scrubSentryLog({ level: 'error', message: alnum(200_000) } as Log)],
    ['200k string as a log parameter', () =>
      scrubSentryLog({ level: 'error', message: 'x', attributes: { 'sentry.message.parameter.0': alnum(200_000) } } as Log)],
    ['200k exception value', () =>
      scrubSentryEvent({ exception: { values: [{ type: 'Error', value: alnum(200_000) }] } })],
    // Under the length cap, so only the linear URL regex keeps these fast.
    ['30k alphanumeric log message (under the cap)', () =>
      scrubSentryLog({ level: 'error', message: alnum(30_000) } as Log)],
    ['200k transaction name (URL scrub only, no cap)', () =>
      scrubSentryEvent({ type: 'transaction', transaction: alnum(200_000) })],
    ['wide object (20k keys)', () => {
      const wide: Record<string, string> = {}
      for (let i = 0; i < 20_000; i++) wide[`k${i}`] = `v${i}`
      return scrubSentryBreadcrumb({ category: 'console', data: { arguments: [wide] } })
    }],
    ['30k of repeated "Key (" / "invalid input" / "params" under the cap', () =>
      scrubSentryLog({
        level: 'error',
        message: 'Key (a'.repeat(1_000) + 'invalid input syntax for x: "'.repeat(300) + '"params":1,'.repeat(1_000),
      } as Log)],
    ['30k of path-like text under the cap', () =>
      scrubSentryLog({ level: 'error', message: ' /a'.repeat(10_000) } as Log)],
  ]

  it.each(cases)('%s', (_label, fn) => {
    fn() // warm up the regexes / JIT
    expect(time(fn)).toBeLessThan(BUDGET_MS)
  })

  it('an over-long value is replaced by a marker, not passed through', () => {
    const secretTail = `${alnum(100_000)} ${CIPHERTEXT}`
    const log = scrubSentryLog({ level: 'error', message: secretTail } as Log)
    expect(log.message).toBe('[Filtered: too long]')
    const crumb = scrubSentryBreadcrumb({ category: 'console', data: { arguments: [{ blob: secretTail }] } })
    expect(JSON.stringify(crumb)).not.toContain(CIPHERTEXT)
  })

  it('a URL still gets scrubbed after a long run of scheme characters', () => {
    const text = `${alnum(20_000)} https://futari.example/invite/SECRETTOKEN1439?x=1`
    const out = scrubSentryLog({ level: 'error', message: text } as Log)
    expect(out.message).not.toContain('SECRETTOKEN1439')
    expect(out.message).toContain('https://futari.example/invite/:token')
  })
})

describe('#1439 (2): the linear URL pattern finds exactly what the old one found', () => {
  // The pre-#1439 pattern, verbatim (quadratic on long scheme-character runs).
  const MASKED = '<masked>'
  const URL_CHAR = `(?:[^\\s"'<>\`]|${MASKED})`
  const OLD = new RegExp(`([a-z][a-z0-9+.-]*:\\/\\/${URL_CHAR}+)|(^|[\\s("'=])(\\/${URL_CHAR}*)`, 'gi')
  const tagOld = (v: string) =>
    v.replace(OLD, (_m, abs?: string, lead?: string, path?: string) => (abs ? `[A:${abs}]` : `${lead}[P:${path}]`))
  const tagNew = (v: string) =>
    v.replace(
      new RegExp(_URL_IN_TEXT_RE_FOR_TESTS.source, _URL_IN_TEXT_RE_FOR_TESTS.flags),
      (_m, lead?: string, path?: string, absLead?: string, absDigits?: string, abs?: string) =>
        abs ? `${absLead}${absDigits}[A:${abs}]` : `${lead}[P:${path}]`,
    )

  it('same matches on 20k random short strings', () => {
    const P = ['a', 'Z', '1', '+', '.', '-', ':', '/', '//', '://', 'http', 'https://x', '?', '#', ' ', '(', '"', "'",
      '=', '<', '>', '`', MASKED, '\n', 'invite/', 'é', '_']
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const mismatches: string[] = []
    for (let i = 0; i < 20_000; i++) {
      let s = ''
      const n = 1 + Math.floor(rand() * 20)
      for (let j = 0; j < n; j++) s += P[Math.floor(rand() * P.length)]
      if (tagOld(s) !== tagNew(s)) mismatches.push(s)
    }
    expect(mismatches).toEqual([])
  })

  it('a leading "/" is still read as a path, not as the lead before a scheme', () => {
    expect(tagNew('/https://x?y')).toBe(tagOld('/https://x?y'))
    expect(tagNew('/https://x?y')).toBe('[P:/https://x?y]')
  })
})

describe('#1439: fuzz — DB-error-shaped strings never make a hook throw', () => {
  // Deterministic PRNG so a failure reproduces.
  let seed = 1439
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

  const PIECES = [
    'Failed query: select 1', '\nparams: ', '\\nparams: ', '\n    at ', '\\n    at ', 'Key (a, b)=(', 'Failing row contains (',
    'invalid input syntax for type uuid: "', '\\"', '"', '{', '}', '[', ']', '"params":', '"detail":', '"where":', ',',
    ':', 'https://', 'http://x', '/invite/', '?next=', '#', '<masked>', '[Filtered]', ' ', '\n', '\\', 'a1', '日本',
    ' ', '\ud83d', CIPHERTEXT, '%s', '{"message":"', '","stack":"', '"}', 'null', '1e9', '-', '.', '+',
  ] as const

  function fuzzString(): string {
    let s = ''
    const n = 1 + Math.floor(rand() * 40)
    for (let i = 0; i < n; i++) s += pick(PIECES)
    return s
  }

  it('400 random inputs through every text-bearing hook field', () => {
    for (let i = 0; i < 400; i++) {
      const s = fuzzString()
      const obj = rand() < 0.5 ? { message: s, stack: `${s}\n    at x` } : [s, { detail: s, nested: { params: [s] } }]
      expect(() => {
        const log = scrubSentryLog({
          level: 'error',
          message: rand() < 0.5 ? s : `${s} ${JSON.stringify(obj)}`,
          attributes: { 'sentry.message.parameter.0': obj, 'sentry.message.template': s },
        } as Log)
        expect(typeof log.message).toBe('string')
        const crumb = scrubSentryBreadcrumb({ category: 'console', message: s, data: { arguments: [s, obj] } })
        expect(crumb).toBeTypeOf('object')
        const event = scrubSentryEvent({
          message: s,
          logentry: { message: s, params: [s, obj] },
          exception: { values: [{ type: 'Error', value: s }] },
        })
        // Hooks never return the "scrub failed" fallback on these inputs.
        expect(event.message).not.toBe('Sentry scrub failed; event reduced')
        expect(log.message).not.toBe('Sentry scrub failed; log reduced')
      }).not.toThrow()
    }
  })
})
