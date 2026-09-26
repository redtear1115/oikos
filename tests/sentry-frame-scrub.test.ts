// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { DrizzleQueryError } from 'drizzle-orm'
import * as Sentry from '@sentry/node'
import type { Breadcrumb, Event, EventHint, Log, StackFrame } from '@sentry/nextjs'
import { scrubSentryBreadcrumb, scrubSentryEvent, scrubSentryLog } from '@/lib/observability/sentryScrub'
import { startSentryHarness, type SentryHarness } from './_helpers/sentryHarness'

/**
 * #1451 — two scrub gaps found by fuzzing during #1447's verification.
 *
 * 1. The SDK's node stack parser turns ANY stack line containing `at ` into a
 *    frame. `err.stack` starts with the whole message, so a Drizzle error
 *    whose `params:` line holds a value with ` at ` in it — or a 22P02
 *    message whose quoted input continues on a new line — gets a "frame"
 *    whose filename / module / function is the bound values, ciphertext
 *    included. Nothing errors; the Sentry stack trace just has an odd frame.
 * 2. JSON inside a JSON string escapes its quotes as `\\\"`. Over 256 KiB the
 *    text is never parsed, so those markers were only seen as plain text and
 *    the rules (written for `"` and `\"`) missed them.
 *
 * The secrets below are assembled at runtime: contextLines copies source
 * lines of this file into every frame, so a literal would show up in the
 * envelope and make the test meaningless.
 */

const TAIL = ['ZQ', '1451', 'TAIL'].join('')
const CIPHERTEXT = ['v1', 'k1', 'f1451c1f3e27', '0f00ba4', '5ec12e7c1a55'].join(':')
const NL_TAIL = ['NL', '1451', 'SECRET'].join('')
const SECRETS = [TAIL, CIPHERTEXT, NL_TAIL]
const SQL_TEXT = 'insert into "InvoiceCredentials" ("id", "barcode", "verification_code_encrypted") values ($1, $2, $3)'
/** A barcode with ` at ` in it; the ciphertext comes after it in the params. */
const AT_BARCODE = `/AB at ${TAIL}`
/** A 22P02 input: its second line reads like a frame. */
const NL_INPUT = `/x\nfoo at ${NL_TAIL}`

function uniqueViolation(): DrizzleQueryError {
  const params = ['8f4b0c1e-0000-4000-8000-000000001451', AT_BARCODE, CIPHERTEXT]
  const pg = new postgres.PostgresError({
    severity: 'ERROR', code: '23505',
    message: 'duplicate key value violates unique constraint "invoice_credentials_uniq"',
    detail: `Key (barcode)=(${AT_BARCODE}) already exists.`,
  } as never)
  return new DrizzleQueryError(SQL_TEXT, params, pg)
}

function invalidInput(): DrizzleQueryError {
  const params = [NL_INPUT, '/Q1451', CIPHERTEXT]
  const pg = new postgres.PostgresError({
    severity: 'ERROR', code: '22P02', message: `invalid input syntax for type uuid: "${NL_INPUT}"`,
  } as never)
  return new DrizzleQueryError(SQL_TEXT, params, pg)
}

/** The frames the SDK parses from the call-stack part of `err.stack` alone. */
function realFrames(err: Error): string[] {
  const stack = err.stack ?? ''
  const at = stack.indexOf(err.message)
  expect(at).toBeGreaterThanOrEqual(0)
  const callStack = stack.slice(at + err.message.length)
  return Sentry.defaultStackParser(callStack).map(frameKey)
}

function sortedJson(lists: string[][]): string[] {
  return lists.map((l) => JSON.stringify(l)).sort()
}

function frameKey(f: StackFrame): string {
  return `${f.function} ${f.filename}:${f.lineno}:${f.colno}`
}

type EventJson = { exception?: { values?: Array<{ type?: string; stacktrace?: { frames?: StackFrame[] } }> } }

function events(envelopes: string[]): EventJson[] {
  const out: EventJson[] = []
  for (const env of envelopes) {
    const lines = env.split('\n')
    for (let i = 1; i < lines.length; i += 2) {
      if (lines[i].includes('"type":"event"')) out.push(JSON.parse(lines[i + 1]))
    }
  }
  return out
}

let harness: SentryHarness
const realConsoleError = console.error
const realConsoleWarn = console.warn
beforeAll(() => {
  console.error = () => {}
  console.warn = () => {}
  harness = startSentryHarness({
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.contextLinesIntegration()],
  })
})
afterAll(async () => {
  await harness.close()
  console.error = realConsoleError
  console.warn = realConsoleWarn
})

async function drainFresh(): Promise<string[]> {
  const envelopes = [...(await harness.drain())]
  harness.envelopes.length = 0
  return envelopes
}

describe('#1451 (1): a stack line from the message never becomes a frame', () => {
  it('control: the SDK parser really makes a frame out of the params line', () => {
    const e = uniqueViolation()
    const frames = Sentry.defaultStackParser(e.stack ?? '')
    expect(frames.some((f) => `${f.filename}${f.module}`.includes(CIPHERTEXT))).toBe(true)
    const nl = invalidInput().cause as Error
    expect(Sentry.defaultStackParser(nl.stack ?? '').some((f) => String(f.filename).includes(NL_TAIL))).toBe(true)
  })

  it('captureException(e), captureRequestError(fresh e), captureException(e.cause): no value in any frame', async () => {
    const { captureRequestError } = await import('@sentry/nextjs')
    await drainFresh()
    const made: Error[] = []
    for (const make of [uniqueViolation, invalidInput]) {
      const a = make()
      Sentry.captureException(a)
      const b = make()
      captureRequestError(b, { path: '/api/x', method: 'POST', headers: {} }, {
        routerKind: 'App Router', routePath: '/api/x', routeType: 'route',
      })
      const c = make()
      Sentry.captureException(c.cause)
      made.push(a, b, c.cause as Error)
    }
    const envelopes = await drainFresh()
    const all = envelopes.join('\n')
    const evs = events(envelopes)

    // Not vacuous: six error events, each with frames.
    expect(evs).toHaveLength(6)
    expect(SECRETS.filter((s) => all.includes(s))).toEqual([])

    // The real frames all survive — exactly the call stack, nothing added,
    // nothing lost — and this test file is among them.
    // linkedErrors adds the cause as a second exception value; each keeps
    // its own real frames. Events may arrive in any order, so compare the
    // multiset of per-event frame lists.
    const expected = made.map((e) => {
      const cause = (e as Error & { cause?: unknown }).cause
      return JSON.stringify(sortedJson([realFrames(e), ...(cause instanceof Error ? [realFrames(cause)] : [])]))
    }).sort()
    const got = evs.map((ev) =>
      JSON.stringify(sortedJson((ev.exception?.values ?? []).map((v) => (v.stacktrace?.frames ?? []).map(frameKey))))).sort()
    expect(got).toEqual(expected)
    for (const ev of evs) {
      for (const v of ev.exception?.values ?? []) {
        const frames = v.stacktrace?.frames ?? []
        expect(frames.length).toBeGreaterThan(2)
        expect(frames.some((f) => String(f.filename).endsWith('tests/sentry-frame-scrub.test.ts'))).toBe(true)
      }
    }
  })

  it('frames the SDK normally produces pass untouched', () => {
    const frames: StackFrame[] = [
      { filename: '/var/task/.next/server/app/api/x/route.js', module: 'route', function: 'POST', lineno: 1, colno: 2, in_app: true },
      { filename: 'app:///_next/server/chunks/ssr/[root-of-the-server]__0c2f._.js', function: 'Object.<anonymous>', lineno: 3, colno: 4 },
      { filename: 'webpack-internal:///(rsc)/./app/(dashboard)/page.tsx', function: 'Page', lineno: 5, colno: 6 },
      { filename: 'node:internal/process/task_queues', module: 'task_queues', function: 'process.processTicksAndRejections', lineno: 95, colno: 5 },
      { filename: '/var/task/node_modules/drizzle-orm/pg-core/session.cjs', module: 'drizzle-orm.pg-core:session', function: 'PostgresJsPreparedQuery.queryWithCache', lineno: 41, colno: 15 },
      { filename: 'C:\\app\\server.js', function: 'Foo.bar [as baz]', lineno: 7, colno: 8 },
      { filename: '<anonymous>', function: 'new Promise' },
      { filename: 'index 0', function: 'async Promise.all' },
      { filename: 'evalmachine.<anonymous>', function: '?', lineno: 1, colno: 1 },
      { filename: 'file:///srv/app/lib/x.mjs', function: 'module evaluation', lineno: 9, colno: 1 },
    ]
    const message = 'Failed query: select 1\nparams: a,b'
    const event = scrubSentryEvent(
      { exception: { values: [{ type: 'Error', value: message, stacktrace: { frames } }] } },
      { originalException: Object.assign(new Error(message), { cause: new Error('dup') }) } as EventHint,
    )
    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual(frames)
  })

  it('frames that do not look like a code location are dropped', () => {
    const bad: StackFrame[] = [
      { filename: `CD,${CIPHERTEXT}`, module: `CD,${CIPHERTEXT}`, function: '?' },
      { filename: TAIL, function: '?' },
      { filename: '/AB', function: '?' }, // a path, but no line number
      { filename: 'v1:k1', function: '?', lineno: 123, colno: 456 }, // line number, not a path
      { filename: '/ok/file.js', function: `x,${TAIL}`, lineno: 1, colno: 1 },
      { filename: '/ok/file.js', function: '?', lineno: 1, colno: 1, abs_path: `/a,${TAIL}` },
      { filename: '/x/y.js', module: 'params: a,b', function: '?', lineno: 1, colno: 1 },
      { filename: '/x/Key (barcode)=(z).js', function: '?', lineno: 1, colno: 1 },
      { filename: '    -----' },
    ]
    const keep: StackFrame = { filename: '/srv/app/route.js', function: 'GET', lineno: 10, colno: 3 }
    const event = scrubSentryEvent({ exception: { values: [{ type: 'Error', value: 'x', stacktrace: { frames: [...bad, keep] } }] } })
    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([keep])
  })

  it('a value shaped exactly like a frame is dropped when the message shows it came from there', () => {
    // `x at /a/b.js:1:2` parses to a perfectly plausible frame; only the
    // message can tell it apart.
    const value = `x at /srv/${TAIL}.js:12:34`
    const message = `Failed query: insert into t values ($1)\nparams: ${value}`
    const err = new Error(message)
    const frames = Sentry.defaultStackParser(err.stack ?? '')
    expect(frames.some((f) => String(f.filename).includes(TAIL))).toBe(true) // control
    for (const hint of [
      { originalException: err },
      { originalException: new Error('wrapper', { cause: err }) },
      undefined, // no hint: the (full) exception value is checked
    ] as Array<EventHint | undefined>) {
      const event = scrubSentryEvent({ exception: { values: [{ type: 'Error', value: message, stacktrace: { frames } }] } }, hint)
      expect(JSON.stringify(event)).not.toContain(TAIL)
      expect(event.exception?.values?.[0].stacktrace?.frames?.map(frameKey)).toEqual(realFrames(err))
    }
  })

  it('a function name taken from the message is dropped', () => {
    const message = `bad\nfoo at ${TAIL} (<anonymous>)`
    const frames = Sentry.defaultStackParser(`Error: ${message}`)
    expect(frames.some((f) => f.function === TAIL)).toBe(true) // control
    const event = scrubSentryEvent(
      { exception: { values: [{ type: 'Error', value: 'bad', stacktrace: { frames } }] } },
      { originalException: new Error(message) },
    )
    expect(JSON.stringify(event)).not.toContain(TAIL)
  })

  it('messages over the budget: frames cannot be vouched for, so none are sent', () => {
    const message = `x at ${TAIL}\n${'A'.repeat(1_100_000)}`
    const frames = Sentry.defaultStackParser(`Error: ${message}\n    at f (/srv/a.js:1:1)`)
    const event = scrubSentryEvent(
      { exception: { values: [{ type: 'Error', value: 'x', stacktrace: { frames } }] } },
      { originalException: new Error(message) },
    )
    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([])
    expect(JSON.stringify(event)).not.toContain(TAIL)
  })

  it('frame scrubbing stays within the time budget', () => {
    const lines = Array.from({ length: 20_000 }, (_, i) => `v${i} at /srv/f${i}.js:${i + 1}:1,${'z'.repeat(30)}`).join('\n')
    const message = `Failed query: select 1\nparams: ${lines}`.slice(0, 1_000_000)
    const err = new Error(message)
    const frames = Sentry.defaultStackParser(err.stack ?? '')
    const event = { exception: { values: [{ type: 'Error', value: message.slice(0, 250), stacktrace: { frames } }] } }
    const start = performance.now()
    const out = scrubSentryEvent(event, { originalException: err })
    const ms = performance.now() - start
    expect(ms).toBeLessThan(50)
    // The SDK stops at 50 frames, so here every parsed frame came from the
    // message (a control) and every one must go.
    expect(frames.length).toBe(50)
    expect(frames.every((f) => String(f.filename).startsWith('/srv/f'))).toBe(true)
    expect(out.exception?.values?.[0].stacktrace?.frames).toEqual([])
  })
})

describe('#1451 (1): fuzz — a secret in the message never reaches a frame, real frames always stay', () => {
  let seed = 1451
  const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const SECRET = ['QX', '1451', 'FUZZ'].join('')
  const PIECES = [
    ' at ', 'at ', '\n', '\n    at ', ' (', ')', ',', ':1:2', ':12:', '/', '/srv/', '.js', 'node:', 'app:///', 'file:///',
    '<anonymous>', 'index 0', 'native', '%51', '%', 'async ', 'new ', 'Key (', 'params: ', ' ', 'x', '"', '\\', 'C:\\',
    '(error: ', 'data:', '----', 'Error: ', '😀', '\t',
  ] as const
  const OPENERS = ['Failed query: select 1\nparams: ', 'invalid input syntax for type uuid: "', 'boom: ', '']
  function hostile(): string {
    let s = pick(OPENERS)
    const n = 1 + Math.floor(r() * 12)
    const at = Math.floor(r() * (n + 1))
    for (let i = 0; i < n; i++) {
      if (i === at) s += SECRET
      s += pick(PIECES)
    }
    if (at === n) s += SECRET
    return s + pick(['', ')', ':3:4', '.js:1:1)', ',tail'])
  }
  // A real call stack to append; its frames must survive every case.
  function callStack(): string {
    const e = new Error('m')
    return (e.stack ?? '').slice((e.stack ?? '').indexOf('\n'))
  }
  const REAL = callStack()
  const REAL_KEYS = Sentry.defaultStackParser(REAL).map(frameKey)

  it('2000 messages through the SDK parser and the event hook (top-level and as a cause)', () => {
    expect(REAL_KEYS.length).toBeGreaterThan(2)
    const leaks: string[] = []
    const lost: string[] = []
    for (let i = 0; i < 2_000; i++) {
      const message = hostile()
      const name = pick(['Error', 'PostgresError', 'Oops'])
      const frames = Sentry.defaultStackParser(`${name}: ${message}${REAL}`)
      const inner = { type: name, value: message.slice(0, pick([250, 1_000_000])), stacktrace: { frames } }
      const asCause = r() < 0.5
      const original = asCause
        ? Object.assign(new Error('wrapper'), { cause: Object.assign(new Error(message), { name }) })
        : Object.assign(new Error(message), { name })
      const values = asCause
        ? [inner, { type: 'Error', value: 'wrapper', stacktrace: { frames: Sentry.defaultStackParser(`Error: wrapper${REAL}`) } }]
        : [inner]
      const event: Event = { exception: { values } }
      const out = scrubSentryEvent(event, { originalException: original })
      const outFrames = out.exception?.values?.[0].stacktrace?.frames ?? []
      if (JSON.stringify(outFrames).includes(SECRET) || JSON.stringify(outFrames).includes(SECRET.slice(0, 5))) leaks.push(JSON.stringify(message))
      const keys = outFrames.map(frameKey)
      if (REAL_KEYS.some((k) => !keys.includes(k))) lost.push(JSON.stringify(message))
    }
    expect(leaks).toEqual([])
    expect(lost).toEqual([])
  }, 60_000)
})

describe('#1451 (2): double-escaped markers in text over 256 KiB', () => {
  const S = ['DB', '1451', 'SECRET'].join('')
  const nest = (v: unknown, levels: number): string => {
    let out = JSON.stringify(v)
    for (let i = 1; i < levels; i++) out = JSON.stringify({ log: out })
    return out
  }
  const FORMS: Array<[string, string]> = []
  for (const levels of [2, 3, 4]) {
    FORMS.push([`invalid input, ${levels} levels`, nest({ message: `invalid input syntax for type uuid: "${S}"` }, levels)])
    FORMS.push([`enum, ${levels} levels`, nest({ message: `invalid input value for enum "St": "${S}"` }, levels)])
    FORMS.push([`params key, ${levels} levels`, nest({ name: 'DrizzleQueryError', params: ['a', S] }, levels)])
    FORMS.push([`detail key, ${levels} levels`, nest({ cause: { code: '23514', detail: `row ${S}` } }, levels)])
    FORMS.push([`where key, ${levels} levels`, nest({ cause: { code: '22P02', where: `portal parameter $1 = '${S}'` } }, levels)])
  }

  it('control: the forms really carry backslash runs before the quotes', () => {
    expect(FORMS.find(([n]) => n === 'invalid input, 3 levels')?.[1]).toContain('\\\\\\"')
  })

  for (const [name, form] of FORMS) {
    it(`${name}: no hook passes the value`, () => {
      for (const text of [
        `${form} ${'A'.repeat(280_000)}`,
        `failed: ${form}${'A'.repeat(280_000)}`,
        `${'p'.repeat(20_000)} ${form} ${'B'.repeat(280_000)}`,
      ]) {
        const outs = [
          scrubSentryLog({ level: 'error', message: text } as Log).message as string,
          JSON.stringify(scrubSentryEvent({ message: text, exception: { values: [{ type: 'Error', value: text }] } })),
          JSON.stringify(scrubSentryBreadcrumb({ category: 'console', message: text, data: { arguments: [text] } } as Breadcrumb)),
        ]
        expect(outs.filter((o) => o.includes(S))).toEqual([])
      }
    })
  }

  it('a 280k JSON-in-JSON message through a real client (console and capture)', async () => {
    await drainFresh()
    for (const [, form] of FORMS) {
      const text = `${form} ${'A'.repeat(280_000)}`
      console.error(text)
      console.error('failed:', text)
      Sentry.captureException(new Error(text))
      Sentry.captureMessage(text)
    }
    const all = (await drainFresh()).join('\n')
    expect(all).toContain('"type":"log"')
    expect(all).toContain('"type":"event"')
    expect(all).not.toContain(S)
  })

  it('a long run of backslashes before a key quote scrubs in bounded time', () => {
    const text = `${'\\'.repeat(30_000)}"x": ${'\\'.repeat(30_000)}"params":[1]`
    const start = performance.now()
    scrubSentryLog({ level: 'error', message: text } as Log)
    expect(performance.now() - start).toBeLessThan(50)
  })
})
