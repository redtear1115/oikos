// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setMockUser } from './_mocks/supabase'
import { queueDbResult, resetDbMocks } from './_mocks/db'
import { describeError } from '@/lib/errors'
import type { ActionResult } from '@/lib/action-errors'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

import { setBaseCurrency } from '@/actions/currency'
import { createTrip } from '@/actions/trip'
import { editAndConfirmPending } from '@/actions/recurringExpense'

/**
 * #1223 — the regression guard the issue asked for.
 *
 * #1213 shipped 82 localized error codes by having server actions `throw` them.
 * Every unit test passed and every dev session looked right, because React only
 * strips a thrown error's message in its **production** Flight build. In
 * production the client got `1:E{"digest":"…"}` and rendered the caller's
 * generic fallback instead of the localized sentence. Nothing logged, nothing
 * warned — the feature was simply absent for every real user.
 *
 * Nothing in the suite ran that production encoder, so nothing could see it.
 * This file does: it takes what the real actions hand back and pushes it
 * through `react-server-dom-webpack-server.edge.production.js` and
 * `…-client.edge.production.js` — the same two modules a Vercel deployment
 * loads — before asking `describeError` for the en / ja sentence.
 *
 * What it looks like when this file goes red: `expectedFailure()` rejects,
 * because the action threw instead of returning, or the round-tripped code
 * comes back as `undefined` and the locale assertions fall through to
 * `FALLBACK`. Either way, the sentence the user was supposed to read is gone —
 * which is precisely the shape of the original bug.
 */

const require_ = createRequire(join(process.cwd(), 'package.json'))
const FlightClient = require_(
  'next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.edge.production.js',
) as {
  createFromReadableStream: (
    stream: ReadableStream<Uint8Array>,
    options: { serverConsumerManifest: unknown },
  ) => Promise<unknown>
}

type Directive =
  | { kind: 'value'; value: unknown }
  | { kind: 'throw'; message: string }

const FALLBACK = 'fallback'
const OFFLINE = 'offline'

/** Serialize with the production Flight encoder (separate process, see helper). */
function encodeProduction(directives: Directive[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--conditions=react-server', join(process.cwd(), 'tests/_helpers/rsc-production-wire.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => { out += c })
    child.stderr.on('data', (c) => { err += c })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`encoder exited ${code}: ${err}`))
      try { resolve(JSON.parse(out)) } catch (e) { reject(new Error(`bad encoder output: ${out}\n${err}\n${e}`)) }
    })
    child.stdin.end(JSON.stringify(directives))
  })
}

/**
 * Decode with the production Flight client. Note the `await` inside: what
 * `createFromReadableStream` hands back is React's own Chunk thenable, not a
 * Promise — calling `.then()` on it returns `undefined` rather than chaining.
 */
async function decodeProduction(payload: string): Promise<unknown> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload))
      controller.close()
    },
  })
  return await FlightClient.createFromReadableStream(stream, {
    serverConsumerManifest: { moduleMap: {}, moduleLoading: null, serverModuleMap: null },
  })
}

/** Assert the action returned a failure (did not throw) and hand back the value. */
async function expectedFailure(promise: Promise<ActionResult<unknown>>) {
  const result = await promise
  expect(result.ok, `action threw or succeeded instead of returning { ok: false } — ` +
    `a thrown code does not survive the production Flight encoder`).toBe(false)
  return result as { ok: false; code: string; params?: Record<string, string> }
}

const GROUP = {
  id: 'grp-1',
  memberA: 'user-a',
  memberB: 'user-b',
  name: '我們家',
  baseCurrency: 'twd',
  currentEpochStartedAt: new Date('2026-01-01T00:00:00Z'),
  defaultSplitRatioA: null,
}

beforeEach(() => {
  resetDbMocks()
  setMockUser({ id: 'user-a', email: 'a@example.com' })
})

describe('the production Flight wire (#1223 root cause)', () => {
  let returned: unknown
  let thrown: unknown

  beforeAll(async () => {
    const [valuePayload, throwPayload] = await encodeProduction([
      { kind: 'value', value: { ok: false, code: 'base_currency_locked' } },
      { kind: 'throw', message: 'base_currency_locked' },
    ])
    returned = await decodeProduction(valuePayload)
    try {
      await decodeProduction(throwPayload)
      thrown = new Error('expected the thrown model to reject, but it resolved')
    } catch (e) {
      thrown = e
    }
  })

  it('keeps a RETURNED failure intact, code and all', () => {
    expect(returned).toEqual({ ok: false, code: 'base_currency_locked' })
    expect(describeError(returned, FALLBACK, OFFLINE, en.errors.actions))
      .toBe(en.errors.actions.base_currency_locked)
  })

  it('reduces a THROWN code to a digest — which is why throwing cannot work', () => {
    expect(thrown).toBeInstanceOf(Error)
    // The message React substitutes in production. The code is simply gone.
    expect((thrown as Error).message).not.toContain('base_currency_locked')
    expect((thrown as Error & { digest?: string }).digest).toBe('test-digest')
    expect(describeError(thrown, FALLBACK, OFFLINE, en.errors.actions)).toBe(FALLBACK)
  })
})

describe('real actions, round-tripped through the production wire', () => {
  /** Run the action, push its result over the wire, localize what comes back. */
  async function roundTrip(promise: Promise<ActionResult<unknown>>) {
    const failure = await expectedFailure(promise)
    const [payload] = await encodeProduction([{ kind: 'value', value: failure }])
    return decodeProduction(payload)
  }

  it('setBaseCurrency › base_currency_locked reaches en / ja as a sentence', async () => {
    queueDbResult([GROUP])          // requireViewerGroup → getActiveGroupForUser
    queueDbResult([{ n: 1 }])       // currentEpochHasRecords → cash count
    queueDbResult([{ n: 0 }])       // → income count
    queueDbResult([{ n: 0 }])       // → settlement count

    const wire = await roundTrip(setBaseCurrency({ currency: 'jpy' }))

    expect(wire).toEqual({ ok: false, code: 'base_currency_locked' })
    expect(describeError(wire, FALLBACK, OFFLINE, en.errors.actions))
      .toBe(en.errors.actions.base_currency_locked)
    expect(describeError(wire, FALLBACK, OFFLINE, ja.errors.actions))
      .toBe(ja.errors.actions.base_currency_locked)
    // en must not be the zh-TW master string — that is what proves a lookup ran.
    expect(describeError(wire, FALLBACK, OFFLINE, en.errors.actions))
      .not.toBe(zhTW.errors.actions.base_currency_locked)
  })

  it('createTrip › trip_end_before_start reaches en / ja as a sentence', async () => {
    queueDbResult([GROUP])          // requireViewerGroup

    const wire = await roundTrip(createTrip({
      name: '沖繩',
      startDate: '2026-05-01',
      endDate: '2026-04-01',
    }))

    expect(wire).toEqual({ ok: false, code: 'trip_end_before_start' })
    expect(describeError(wire, FALLBACK, OFFLINE, en.errors.actions))
      .toBe(en.errors.actions.trip_end_before_start)
    expect(describeError(wire, FALLBACK, OFFLINE, ja.errors.actions))
      .toBe(ja.errors.actions.trip_end_before_start)
  })

  it('editAndConfirmPending › the race code survives, so AddSheet can branch on it', async () => {
    queueDbResult([GROUP])          // requireViewerGroup
    queueDbResult([])               // pending lookup finds nothing — partner got there first

    const wire = await roundTrip(editAndConfirmPending({
      pendingId: 'pend-x',
      overrides: { amount: 30000 },
    }))

    expect(wire).toEqual({ ok: false, code: 'pending_expense_not_found' })
    // AddSheet / IncomeSheet branch with isActionError on exactly this value:
    // close the sheet + toast, instead of showing an inline error.
    expect(describeError(wire, FALLBACK, OFFLINE, ja.errors.actions))
      .toBe(ja.errors.actions.pending_expense_not_found)
  })

  it('carries params across the wire', async () => {
    const [payload] = await encodeProduction([
      { kind: 'value', value: { ok: false, code: 'import_row_invalid_amount', params: { row: '3' } } },
    ])
    const wire = await decodeProduction(payload)
    expect(describeError(wire, FALLBACK, OFFLINE, en.errors.actions)).toBe('Row 3: invalid amount')
  })
})

/**
 * Structural guards. The wire only stays honest while every export of
 * `actions/` goes through `action(...)` and every call site unwraps or inspects
 * what it gets back.
 *
 * Failure looks like: a list of `file:line` entries. The second one is the
 * dangerous case — `tsc` cannot see a dropped `Promise<ActionResult<void>>`,
 * so the sheet closes, nothing was written, and no error is shown.
 */
describe('actions/ shape', () => {
  const dir = join(process.cwd(), 'actions')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

  it('exports every action through action(...)', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(join(dir, file), 'utf8').split('\n').forEach((line, i) => {
        if (/^export async function /.test(line)) offenders.push(`${file}:${i + 1}`)
        if (/^export const \w+ = async /.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })

  /**
   * `await someAction(…)` whose result is dropped compiles fine — `tsc` has no
   * `must_use`. For a void action that means the failure is thrown away and the
   * UI reports success. Each call site therefore either goes through
   * `unwrapAction` or is listed below with why it deliberately does not.
   */
  it('awaits no action without unwrapping or an explicit exemption', () => {
    const exempt = new Set([
      // Signs out and redirects; a failed sign-out falls through to the hard
      // `window.location.replace` safety net in the same handler.
      'app/(dashboard)/settings/_components/LogoutButton.tsx:signOut',
      // Best-effort: the banner reappears on the next load if this fails.
      'app/(dashboard)/settings/_components/DeleteAccountButton.tsx:requestAccountDeletion',
      'app/(dashboard)/_components/AccountDeletionBanner.tsx:cancelAccountDeletion',
      // Reads the result directly instead: picks `isFirstTransaction` off the
      // success branch and hands the whole `ActionResult` to `useSheetMutation`,
      // which is what lets the pending-race branch see the code.
      'app/(dashboard)/dashboard/_components/AddSheet.tsx:createTransaction',
    ])
    const names = new Set<string>()
    for (const file of files) {
      for (const m of readFileSync(join(dir, file), 'utf8').matchAll(
        /^export const (\w+) = action\(/gm,
      )) names.add(m[1])
    }
    const pattern = new RegExp(
      String.raw`(?<![.\w$])await\s+(?:[\w$]+\.)?(${[...names].join('|')})\(`,
      'g',
    )

    const offenders: string[] = []
    for (const root of ['app', 'components', 'lib']) {
      const base = join(process.cwd(), root)
      for (const entry of readdirSync(base, { recursive: true, encoding: 'utf8' })) {
        if (!/\.tsx?$/.test(entry)) continue
        const rel = `${root}/${entry}`
        readFileSync(join(base, entry), 'utf8').split('\n').forEach((line, i) => {
          if (line.includes('unwrapAction')) return
          for (const m of line.matchAll(pattern)) {
            if (exempt.has(`${rel}:${m[1]}`)) continue
            offenders.push(`${rel}:${i + 1} — ${m[1]}`)
          }
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
