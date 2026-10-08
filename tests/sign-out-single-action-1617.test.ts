/**
 * #1617 — sign-out is ONE server action again; the push-row delete rides
 * inside it and can't hold it up.
 *
 * Before: LogoutButton awaited `unregisterThisDevice` (a server action) under a
 * 2 s client-side race, then called `signOut`. Next.js runs server actions one
 * at a time, so when the timer won, `signOut` still queued behind the delete.
 * Now `signOut(token?)` does the delete itself, races the whole best-effort
 * block (session lookup + delete) against a ≤2 s timer, swallows a timeout or
 * a throw, and then ALWAYS clears the session, the pin cookie, and redirects.
 *
 * Failure looks like (if the race or swallow regresses): tapping 登出 hangs on
 * a slow network / stalled database, or does nothing when the delete errors —
 * and with a stalled database the person stays signed in, because
 * `supabase.auth.signOut()` never runs (lib/db/client.ts has no statement
 * timeout). The row-level half (T1 gone, T2 and another person's T1 kept)
 * runs against dev in __tests__/actions/pushTokens1605.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => {
  const jar = new Map<string, string>()
  return {
    jar,
    getUser: vi.fn(async () => ({ data: { user: { id: 'session-user' } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    redirect: vi.fn((to: string) => {
      throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${to};307;` })
    }),
    deleteFrom: vi.fn(),
    where: vi.fn(async (_cond: unknown) => {}),
    captureException: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: h.getUser, signOut: h.signOut } })),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (k: string) => (h.jar.has(k) ? { value: h.jar.get(k) } : undefined),
    set: (k: string, v: string) => { h.jar.set(k, v) },
    delete: (k: string) => { h.jar.delete(k) },
  })),
}))
vi.mock('next/navigation', () => ({ redirect: h.redirect }))
vi.mock('@/lib/i18n/server-redirect', () => ({ localizedHomePath: vi.fn(async () => '/') }))
vi.mock('@/lib/analytics/server', () => ({ captureServer: vi.fn(), aliasServer: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }))
vi.mock('@/lib/db/client', () => ({
  db: {
    delete: (table: unknown) => {
      h.deleteFrom(table)
      return { where: h.where }
    },
  },
}))
// Make the WHERE clause inspectable: which columns, which values.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (col: { name: string }, value: unknown) => ({ eq: [col.name, value] }),
  and: (...conds: unknown[]) => ({ and: conds }),
}))

const { signOut } = await import('@/actions/auth')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')
const { pushTokens } = await import('@/lib/db/schema')

const BOUND_MS = 2000

/** Settles to the thrown error (NEXT_REDIRECT) or 'resolved', never rejects. */
function settle(p: Promise<unknown>) {
  return p.then(() => 'resolved' as const, (e: unknown) => e)
}

function expectSignedOutAndRedirected(outcome: unknown) {
  expect(outcome).toBeInstanceOf(Error)
  expect((outcome as { digest?: string }).digest).toBe('NEXT_REDIRECT;replace;/;307;')
  expect(h.signOut).toHaveBeenCalledOnce()
  expect(h.jar.has(PAST_EPOCH_COOKIE)).toBe(false)
  expect(h.redirect).toHaveBeenCalledOnce()
}

beforeEach(() => {
  h.jar.clear()
  vi.clearAllMocks()
  h.getUser.mockImplementation(async () => ({ data: { user: { id: 'session-user' } }, error: null }))
  h.where.mockImplementation(async () => {})
  h.jar.set(PAST_EPOCH_COOKIE, 'ep-old-chapter')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('signOut(token) deletes this device\'s row first (#1617)', () => {
  it('with a session, deletes only the session user\'s apns row for that token, then signs out', async () => {
    const order: string[] = []
    h.where.mockImplementation(async () => { order.push('delete') })
    h.signOut.mockImplementation(async () => { order.push('auth.signOut'); return { error: null } })

    expectSignedOutAndRedirected(await settle(signOut('T1')))

    expect(h.deleteFrom).toHaveBeenCalledWith(pushTokens)
    expect(h.where).toHaveBeenCalledOnce()
    expect(h.where.mock.calls[0][0]).toEqual({
      and: [
        { eq: ['user_id', 'session-user'] },
        { eq: ['platform', 'apns'] },
        { eq: ['token', 'T1'] },
      ],
    })
    // The delete runs while the session still exists.
    expect(order).toEqual(['delete', 'auth.signOut'])
  })

  it('without a session, skips the delete and still signs out', async () => {
    h.getUser.mockImplementation(async () => ({ data: { user: null }, error: null }) as never)
    expectSignedOutAndRedirected(await settle(signOut('T1')))
    expect(h.where).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['over 512 characters', 'x'.repeat(513)],
    ['not a string', 42 as unknown as string],
  ])('skips the delete for a token that is %s', async (_label, token) => {
    expectSignedOutAndRedirected(await settle(signOut(token)))
    expect(h.getUser).not.toHaveBeenCalled()
    expect(h.where).not.toHaveBeenCalled()
  })

  it('accepts a token of exactly 512 characters', async () => {
    expectSignedOutAndRedirected(await settle(signOut('y'.repeat(512))))
    expect(h.where).toHaveBeenCalledOnce()
  })

  it('a throwing delete still signs out and redirects (and is reported)', async () => {
    h.where.mockImplementation(async () => { throw new Error('connection reset') })
    expectSignedOutAndRedirected(await settle(signOut('T1')))
    expect(h.captureException).toHaveBeenCalledOnce()
  })

  it('a throwing session lookup still signs out and redirects', async () => {
    h.getUser.mockImplementation(async () => { throw new Error('auth down') })
    expectSignedOutAndRedirected(await settle(signOut('T1')))
    expect(h.where).not.toHaveBeenCalled()
  })
})

describe('the best-effort block is bounded at 2 s (fake timers)', () => {
  it.each([
    ['the delete never resolves', () => { h.where.mockImplementation(() => new Promise<void>(() => {})) }],
    ['getUser never resolves', () => { h.getUser.mockImplementation(() => new Promise<never>(() => {})) }],
  ])('%s: nothing happens before the bound, everything happens at it', async (_label, arrange) => {
    vi.useFakeTimers()
    arrange()

    const outcome = settle(signOut('T1'))
    let settled = false
    void outcome.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(BOUND_MS - 1)
    expect(settled).toBe(false)
    expect(h.signOut).not.toHaveBeenCalled()
    expect(h.jar.has(PAST_EPOCH_COOKIE)).toBe(true)
    expect(h.redirect).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expectSignedOutAndRedirected(await outcome)
    expect(h.captureException).not.toHaveBeenCalled()
    // The timer is cleared, nothing left pending from this call.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a fast delete does not wait for the timer and leaves no timer behind', async () => {
    vi.useFakeTimers()
    expectSignedOutAndRedirected(await settle(signOut('T1')))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('signOut() without a token behaves exactly as before', () => {
  it('never looks up the session or deletes; clears the pin and redirects', async () => {
    h.jar.set('other_cookie', 'kept')
    expectSignedOutAndRedirected(await settle(signOut()))
    expect(h.getUser).not.toHaveBeenCalled()
    expect(h.where).not.toHaveBeenCalled()
    expect(h.jar.get('other_cookie')).toBe('kept')
  })
})

describe('the removed two-action path stays removed', () => {
  const exists = (rel: string) => {
    try { readFileSync(join(process.cwd(), rel)); return true } catch { return false }
  }
  it('lib/signOutThisDevice.ts and actions/push.ts are gone', () => {
    expect(exists('lib/signOutThisDevice.ts')).toBe(false)
    expect(exists('actions/push.ts')).toBe(false)
  })
})
