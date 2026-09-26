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

// One harness per file: the SDK instruments `console` once per process, so a
// second init would not see console calls. Silence console first — the SDK
// wraps whatever is there at init time.
let harness: SentryHarness
const realConsoleError = console.error
const realConsoleWarn = console.warn
beforeAll(() => {
  console.error = () => {}
  console.warn = () => {}
  harness = startSentryHarness()
})
afterAll(async () => {
  await harness.close()
  console.error = realConsoleError
  console.warn = realConsoleWarn
})

async function drainFresh(): Promise<string> {
  const all = (await harness.drain()).join('\n')
  harness.envelopes.length = 0
  return all
}

describe('#1439 (1): a bound value containing "\\n    at " does not end the scrub early', () => {

  it('control: the error message really carries the fake frame before the ciphertext', () => {
    const e = nicknameError()
    expect(e.message).toContain(`${NICKNAME},${BARCODE},${CIPHERTEXT}`)
  })

  it('console.error(err) / console.error("…", err) / captureException leak no later param', async () => {
    const Sentry = await import('@sentry/node')
    console.error(nicknameError())
    console.error('failed:', nicknameError())
    Sentry.captureException(nicknameError())
    const all = await drainFresh()

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

describe('#1439 round 2: a 22P02 input with a newline or an inner quote is masked whole', () => {
  // Postgres quotes the rejected input verbatim: `…: "<value>"`, newlines and
  // quotes included. Masking must run to the message's last quote, not to the
  // end of the line or the first inner quote.
  const NL_SECRET = 'L2SECRET1439'
  const Q_SECRET = 'QSECRET1439'
  const VALUES = [`/x\n${NL_SECRET}`, `x"${Q_SECRET}`, `x"\n    at y (z.js:1:1)\n"${NL_SECRET}`]
  const MARKERS = [NL_SECRET, Q_SECRET]

  function invalidInputError(value: string): DrizzleQueryError {
    const params = ['8f4b0c1e-0000-4000-8000-000000001439', value]
    const pg = new postgres.PostgresError({
      severity: 'ERROR',
      code: '22P02',
      message: `invalid input syntax for type uuid: "${value}"`,
      where: `unnamed portal parameter $2 = '${value}'`,
    } as never)
    Object.defineProperties(pg, {
      parameters: { value: params, enumerable: false },
      args: { value: params, enumerable: false },
    })
    return new DrizzleQueryError(SQL_TEXT, params, pg)
  }

  it('no marker in any envelope, through every console path and captureException', async () => {
    const Sentry = await import('@sentry/node')
    for (const value of VALUES) {
      const e = invalidInputError(value)
      expect((e.cause as Error).message).toContain(value) // control
      console.error(e)
      console.error('failed:', e)
      console.error(e.cause)
      console.error(String(e.cause))
      console.warn('failed:', e.cause)
      Sentry.captureException(e)
      Sentry.captureException(e.cause)
    }
    const all = await drainFresh()
    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all).toContain('invalid input syntax for type uuid')
    expect(MARKERS.filter((m) => all.includes(m))).toEqual([])
  })

  it('plain text masks to the end; the JSON form keeps the frames after the message', () => {
    for (const value of VALUES) {
      const e = invalidInputError(value).cause as Error
      const out = scrubSentryEvent({ exception: { values: [{ type: 'PostgresError', value: e.message }] } })
      expect(out.exception!.values![0].value).toBe('invalid input syntax for type uuid: "<masked>"')
      // A raw stack as plain text: nothing tells where the input ends, so
      // everything after the opening quote goes, frames included.
      const plain = scrubSentryLog({ level: 'error', message: e.stack! } as Log).message as string
      expect(plain).toBe(`${e.name}: invalid input syntax for type uuid: "<masked>"`)
      // The JSON form (what console.error(err) produces): the stack header is
      // swapped for the masked message, the real frames stay.
      const json = scrubSentryLog({ level: 'error', message: JSON.stringify({ message: e.message, stack: e.stack }) } as Log)
      expect(MARKERS.filter((m) => (json.message as string).includes(m))).toEqual([])
      expect(json.message).toContain('sentry-scrub-edges.test.ts')
    }
  })
})

describe('#1439 round 3: no rule trusts a terminator in text that is cut or continues', () => {
  // A value's real terminator (closing quote, end of line) may be missing
  // from the text a rule sees: the text was cut to its 32 KiB head, or the
  // value itself split the log line into several console arguments. Any
  // quote / newline found there may be the VALUE's own.
  const SECRET = 'ZSECRET1439Z'
  const HEAD = 32_768
  const OPENERS: Array<[string, string]> = [
    ['plain', 'invalid input syntax for type uuid: "x"'],
    ['escaped', 'invalid input syntax for type uuid: \\"x\\"'],
    ['enum', 'invalid input value for enum "Status": "x"'],
    ['newline+quote', 'invalid input syntax for type uuid: "x\n"'],
  ]
  const logText = (message: string) => scrubSentryLog({ level: 'error', message } as Log).message as string

  for (const [form, opener] of OPENERS) {
    it(`22P02 cut in its value (${form}): every offset, under and over 256 KiB`, () => {
      const leaks: string[] = []
      for (let k = 0; k <= 2_000; k++) {
        const prefix = 'p'.repeat(HEAD - opener.length - k)
        for (const filler of [5_000, 300_000]) {
          const out = logText(prefix + opener + SECRET + 'A'.repeat(filler))
          // Whatever part of the secret fell inside the head must not survive.
          const inHead = SECRET.slice(0, Math.max(0, k))
          if ((inHead.length >= 4 && out.includes(inHead)) || out.includes(SECRET)) leaks.push(`${form} k=${k} filler=${filler}`)
        }
      }
      expect(leaks).toEqual([])
    })
  }

  // The verifier's recheck, through a real Sentry client. The real-driver
  // version is in __tests__/actions/sentryDbErrorEnvelope.test.ts.
  it('long 22P02 inputs with an inner quote leak nothing through any hook', async () => {
    const Sentry = await import('@sentry/node')
    const values = [
      `x"${SECRET}${'A'.repeat(40_000)}`,
      `x"${SECRET}${'A'.repeat(100_000)}`,
      `x"${SECRET}${'A'.repeat(300_000)}`,
      `${'A'.repeat(20_000)}"${SECRET}${'A'.repeat(40_000)}`,
      `x\n"${SECRET}${'A'.repeat(40_000)}`,
      `x"${SECRET}${'😀'.repeat(20_000)}`,
    ]
    await drainFresh()
    for (const value of values) {
      const pg = new postgres.PostgresError({
        severity: 'ERROR', code: '22P02', message: `invalid input syntax for type uuid: "${value}"`,
      } as never)
      const e = new DrizzleQueryError(SQL_TEXT, [value], pg)
      console.error(e)
      console.error('x', e)
      console.error(e.cause)
      console.warn('x', e.cause)
      console.error((e.cause as Error).message)
      Sentry.captureException(e)
      Sentry.captureException(e.cause)
      Sentry.captureMessage((e.cause as Error).message)
    }
    const all = await drainFresh()
    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all).not.toContain(SECRET)
  })

  it('22P02 whose value splits the line into console arguments (no truncation)', () => {
    for (const value of [`x"${SECRET} {"a":1} tail`, `x" {"a":1} "${SECRET}`, `x"\n${SECRET} [1] y`]) {
      const pg = `invalid input syntax for type uuid: "${value}"`
      for (const message of [pg, `failed: ${pg}`, `${pg} {"code":"22P02"}`]) {
        expect(logText(message)).not.toContain(SECRET)
        const ev = scrubSentryEvent({ exception: { values: [{ type: 'PostgresError', value: message }] } })
        expect(JSON.stringify(ev)).not.toContain(SECRET)
        const crumb = scrubSentryBreadcrumb({ category: 'console', message, data: { arguments: [message] } })
        expect(JSON.stringify(crumb)).not.toContain(SECRET)
      }
    }
  })

  it('Key / Failing row detail whose value holds a newline or splits the line', () => {
    const details = [
      `Key (barcode)=(/a\n${SECRET}) already exists.`,
      `Key (barcode)=(/a {"x":1} ${SECRET}) already exists.`,
      `Failing row contains (1, /a\n${SECRET}, null).`,
      `Key (${'c'.repeat(300)})=(${SECRET}) already exists.`,
    ]
    for (const d of details) {
      expect(logText(`failed: ${d}`)).not.toContain(SECRET)
      const ev = scrubSentryEvent({ exception: { values: [{ type: 'PostgresError', value: `dup\n${d}` }] } })
      expect(JSON.stringify(ev)).not.toContain(SECRET)
    }
  })

  it('the same rules in a long piece cut at every offset around the value', () => {
    const openers = ['Key (barcode)=(', 'Failing row contains (', '\\nparams: ', '"params":"', '"detail":"Key (a)=(']
    const leaks: string[] = []
    for (const opener of openers) {
      for (let k = 0; k <= 400; k++) {
        // JSON-shaped openers get a JSON-escaped value (real JSON never has a
        // raw quote inside a string); the plain ones a raw quote + newline.
        const value = opener.startsWith('"') || opener.startsWith('\\') ? 'x\\"\\n)' : 'x"\n)'
        const out = logText('p'.repeat(HEAD - opener.length - k) + opener + value + SECRET + 'A'.repeat(5_000))
        if (out.includes(SECRET.slice(0, 6)) && k >= 10) leaks.push(`${opener} k=${k}`)
      }
    }
    expect(leaks).toEqual([])
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
    ['250k JSON body of repeated "Key (" / "invalid input" strings (structured path)', () =>
      scrubSentryLog({
        level: 'error',
        message: JSON.stringify({ a: 'Key (a'.repeat(20_000), b: ['invalid input syntax for x: "'.repeat(2_000)], c: 'Key (b'.repeat(15_000) }),
      } as Log)],
    ['30k of path-like text under the cap', () =>
      scrubSentryLog({ level: 'error', message: ' /a'.repeat(10_000) } as Log)],
  ]

  it.each(cases)('%s', (_label, fn) => {
    fn() // warm up the regexes / JIT
    expect(time(fn)).toBeLessThan(BUDGET_MS)
  })

  it('an over-long value is cut to its head plus a marker; the rest never passes', () => {
    const secretTail = `${alnum(100_000)} ${CIPHERTEXT}`
    const log = scrubSentryLog({ level: 'error', message: secretTail } as Log)
    expect((log.message as string).endsWith(' [Filtered: too long]')).toBe(true)
    expect((log.message as string).length).toBeLessThan(40_000)
    expect(log.message).not.toContain(CIPHERTEXT)
    const huge = scrubSentryLog({ level: 'error', message: `${alnum(300_000)} ${CIPHERTEXT}` } as Log)
    expect((huge.message as string).endsWith(' [Filtered: too long]')).toBe(true)
    expect(huge.message).not.toContain(CIPHERTEXT)
    const crumb = scrubSentryBreadcrumb({ category: 'console', data: { arguments: [{ blob: secretTail }] } })
    expect(JSON.stringify(crumb)).not.toContain(CIPHERTEXT)
  })

  it('a bulk-insert error body over the cap keeps its SQL, code and constraint (review B)', () => {
    // ~80 rows × 4 params: the message (and the stack that repeats it) is far
    // over 32 KiB, the cause with code / constraint_name comes after it.
    const params: string[] = []
    for (let i = 0; i < 320; i++) params.push(i % 4 === 3 ? `${CIPHERTEXT}-${i}-${alnum(120)}` : `${BARCODE}-${i}`)
    const sql = `insert into "InvoiceCredentials" (...) values ${params.map((_, i) => `($${i + 1})`).join(', ')}`
    const message = `Failed query: ${sql}\nparams: ${params.join(',')}`
    const body = JSON.stringify({
      message,
      name: 'Error',
      stack: `Error: ${message}\n    at insertRows (import.ts:1:1)`,
      query: sql,
      params,
      cause: { name: 'PostgresError', code: '23505', constraint_name: 'invoice_credentials_uniq', detail: `Key (barcode)=(${BARCODE}-1) already exists.` },
    })
    expect(body.length).toBeGreaterThan(32_768)
    const out = scrubSentryLog({ level: 'error', message: `failed: ${body}` } as Log).message as string
    expect(leaked(out)).toEqual([])
    expect(out).toContain('"code":"23505"')
    expect(out).toContain('"constraint_name":"invoice_credentials_uniq"')
    expect(out).toContain('insert into \\"InvoiceCredentials\\"')
    expect(out).toContain('import.ts:1:1')
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

describe('#1439 round 3: leak fuzz — a secret after any rule marker never survives', () => {
  // Hostile values (quotes, escaped quotes, newlines, fake JSON arguments,
  // fake frames, backslashes, emoji) after every rule's marker; plain, JSON,
  // cause-JSON and truncated-JSON forms; extra console arguments around it;
  // cut at random offsets of the 32 KiB head, under and over 256 KiB.
  // Deterministic. Against the round-2 scrubber this finds ~200 leaks per
  // 5000 cases; against a "trust the last quote when the piece is final"
  // variant, ~10.
  const SECRET = 'QZSECRETZQ'
  let seed = 1439
  const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const RAW_OPENERS = ['invalid input syntax for type uuid: "', 'invalid input value for enum "St": "', 'Key (a, b)=(', 'Failing row contains (', 'Failed query: select 1\nparams: ']
  const VAL = ['"', '\n', ' {"a":1} ', ' [1] ', ')', 'A', '😀', '\\', '\n    at x (y.js:1:1)', ' ', 'Key (', '"params":', '<masked>', '[Filtered]']
  function value(): string { let v = ''; const n = Math.floor(r() * 8); for (let i = 0; i < n; i++) v += pick(VAL); const at = Math.floor(r() * 3); return at === 0 ? SECRET + v : at === 1 ? v + SECRET : v + SECRET + pick(VAL) }
  function make(): string {
    const raw = pick(RAW_OPENERS)
    const v = value() + (raw.endsWith('"') ? '"' : raw.endsWith('(') ? ') tail' : '')
    const form = Math.floor(r() * 4)
    let core: string
    if (form === 0) core = raw + v // plain
    else if (form === 1) core = JSON.stringify({ message: raw + v, stack: `Error: ${raw + v}\n    at z (q.js:1:1)` }) // JSON arg
    else if (form === 2) core = JSON.stringify({ cause: { message: raw + v, detail: v, code: 'X' } })
    else core = JSON.stringify({ message: raw + v }).slice(0, -Math.floor(1 + r() * 20)) // truncated JSON
    const lead = pick(['', 'failed: ', 'x ', '{"a":1} '])
    const trail = pick(['', ' {"b":2}', ' more text', ' [3]'])
    let text = lead + core + trail
    const mode = Math.floor(r() * 4)
    if (mode === 1) { // cut near the 32 KiB head boundary
      const pad = Math.max(0, 32_768 - lead.length - Math.floor(r() * (core.length + 50)))
      text = 'p'.repeat(pad) + text + 'A'.repeat(5_000)
    } else if (mode === 2) {
      const pad = Math.max(0, 32_768 - Math.floor(r() * (core.length + 50)))
      text = 'p'.repeat(pad) + text + 'A'.repeat(300_000)
    } else if (mode === 3) text = text + ' ' + 'B'.repeat(40_000)
    return text
  }

  it('1500 cases through log, event and breadcrumb', () => {
    const leaks: string[] = []
    for (let i = 0; i < 1_500; i++) {
      const t = make()
      const outs = [
        scrubSentryLog({ level: 'error', message: t } as Log).message as string,
        JSON.stringify(scrubSentryEvent({ exception: { values: [{ type: 'E', value: t }] }, message: t })),
        JSON.stringify(scrubSentryBreadcrumb({ category: 'console', message: t, data: { arguments: [t] } })),
      ]
      if (outs.some((o) => o.includes(SECRET))) leaks.push(t.slice(Math.max(0, t.indexOf(SECRET) - 120), t.indexOf(SECRET) + 20))
    }
    expect(leaks).toEqual([])
  }, 60_000)
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
