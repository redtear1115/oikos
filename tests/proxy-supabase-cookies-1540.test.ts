// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// #1540 — the proxy against the REAL @supabase/ssr + auth-js, with only the
// network stubbed. tests/proxy-auth-redirect.test.ts pins the proxy's own
// rule; this file pins what actually reaches the browser for each answer
// Supabase can give, including the cookie writes auth-js makes by itself.
//
// The bug: on a protected path with a dead session the proxy returned a NEW
// redirect response and dropped every cookie auth-js had written. The browser
// kept the dead cookie, /sign-in's getSession() said "signed in", sent it to
// /dashboard, the proxy sent it back — forever, with no error.

import { proxy } from '@/proxy'

const REF = 'abcdefgh'
const SUPABASE_URL = `https://${REF}.supabase.co`
const KEY = `sb-${REF}-auth-token`
const VERIFIER = `${KEY}-code-verifier`
const ORIGIN = 'https://futari.southern-light.dev'
const NOW_S = Math.floor(Date.now() / 1000)

type Session = {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: Record<string, unknown>
}

function session(over: Partial<Session> = {}): Session {
  return {
    access_token: 'x.y.z',
    refresh_token: 'r-old',
    expires_at: NOW_S + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated' },
    ...over,
  }
}

const encode = (s: unknown) => `base64-${Buffer.from(JSON.stringify(s)).toString('base64url')}`

/** The session cookie split like @supabase/ssr does past 3180 chars. */
function chunked(s: Session): string[] {
  const value = encode(s)
  const out: string[] = []
  for (let i = 0, n = 0; i < value.length; i += 3000, n++) {
    out.push(`${KEY}.${n}=${value.slice(i, i + 3000)}`)
  }
  return out
}

function req(path: string, cookies: string[]) {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: cookies.join('; ') } })
}

const API = { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: API })
const html = (status: number) =>
  new Response('<html>oops</html>', { status, headers: { 'content-type': 'text/html' } })

type Route = (url: URL) => Response | Promise<Response>
let onUser: Route
let onRefresh: Route
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.pathname === '/auth/v1/user') return onUser(url)
  if (url.pathname === '/auth/v1/token') return onRefresh(url)
  throw new Error(`unexpected fetch ${url}`)
})

const calledUser = () => fetchMock.mock.calls.some(([u]) => String(u).includes('/auth/v1/user'))

/** name → its Set-Cookie line. */
function setCookies(res: Response): Map<string, string> {
  return new Map(res.headers.getSetCookie().map((line) => [line.split('=')[0], line]))
}
function expired(res: Response): string[] {
  return [...setCookies(res)]
    .filter(([, line]) => /Max-Age=0/i.test(line))
    .map(([name]) => name)
    .sort()
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockClear()
  onUser = () => { throw new Error('no /user route') }
  onRefresh = () => { throw new Error('no /token route') }
  // auth-js logs network failures to console.error; keep the run quiet.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Runs the proxy with fake timers so auth-js's refresh back-off (200 ms,
 * 400 ms, … up to ~30 s) on retryable failures doesn't stall the test.
 */
async function run(path: string, cookies: string[]): ReturnType<typeof proxy> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.now() })
  const pending = proxy(req(path, cookies))
  await vi.runAllTimersAsync()
  return pending
}

describe('access token still valid → /user decides (#1540)', () => {
  const cookies = [...chunked(session({ user: { id: '0', pad: 'p'.repeat(4000) } })), `${VERIFIER}=ver`]

  it('fixture really is chunked', () => {
    expect(cookies.filter((c) => c.startsWith(`${KEY}.`)).length).toBeGreaterThan(1)
  })

  it('403 session_not_found → session chunks expired; verifier removal passed through (auth-js default)', async () => {
    onUser = () => json(403, { code: 'session_not_found', message: 'Session not found' })
    const res = await run('/dashboard', cookies)

    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([`${KEY}.0`, `${KEY}.1`, VERIFIER].sort())
  })

  it('403 bad_jwt → session chunks expired by the proxy, verifier kept', async () => {
    onUser = () => json(403, { code: 'bad_jwt', message: 'invalid JWT' })
    const res = await run('/dashboard', cookies)

    expect(calledUser()).toBe(true)
    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([`${KEY}.0`, `${KEY}.1`])
    expect(setCookies(res).has(VERIFIER)).toBe(false)
  })

  it('403 bad_jwt reported as legacy error_code → same', async () => {
    onUser = () =>
      new Response(JSON.stringify({ error_code: 'bad_jwt', msg: 'invalid JWT' }), { status: 403 })
    const res = await run('/dashboard', [`${KEY}=${encode(session())}`])

    expect(expired(res)).toEqual([KEY])
  })

  it.each([
    ['503', () => json(503, { message: 'unavailable' })],
    ['network failure', () => { throw new TypeError('fetch failed') }],
    ['500 JSON', () => json(500, { code: 'unexpected_failure', message: 'boom' })],
    ['500 HTML', () => html(500)],
    ['401 Invalid API key (no code)', () => json(401, { message: 'Invalid API key' })],
    ['429', () => json(429, { code: 'over_request_rate_limit', message: 'slow down' })],
  ])('%s → redirect, nothing expired', async (_label, route) => {
    onUser = route as Route
    const res = await run('/dashboard', cookies)

    expect(calledUser()).toBe(true)
    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([])
  })
})

describe('access token expired → refresh first (#1540)', () => {
  const cookies = [`${KEY}=${encode(session({ expires_at: NOW_S - 60 }))}`, `${VERIFIER}=ver`]

  // auth-js removes the session itself when a refresh fails non-retryably
  // (GoTrueClient _callRefreshToken). The browser client does the same, so the
  // server now matches it — user-approved Supabase default (#1540 plan rev 2).
  it.each([
    ['400 refresh_token_already_used', () => json(400, { code: 'refresh_token_already_used', message: 'used' })],
    ['401 Invalid API key (no code)', () => json(401, { message: 'Invalid API key' })],
    ['429', () => json(429, { code: 'over_request_rate_limit', message: 'slow down' })],
    ['500 JSON', () => json(500, { code: 'unexpected_failure', message: 'boom' })],
    ['500 HTML', () => html(500)],
  ])('%s → auth-js removal reaches the browser', async (_label, route) => {
    onRefresh = route as Route
    const res = await run('/dashboard', cookies)

    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([KEY, VERIFIER].sort())
    expect(calledUser()).toBe(false)
  })

  it.each([
    ['503', () => json(503, { message: 'unavailable' })],
    ['network failure', () => { throw new TypeError('fetch failed') }],
  ])('%s → retried, then redirect with nothing removed', async (_label, route) => {
    onRefresh = route as Route
    const res = await run('/dashboard', cookies)

    expect(res.status).toBe(307)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(expired(res)).toEqual([])
  })

  it('refresh OK, then /user 503 → redirect carries the NEW tokens and no stale chunks', async () => {
    const big = [...chunked(session({ expires_at: NOW_S - 60, user: { id: '0', pad: 'p'.repeat(4000) } }))]
    const fresh = session({ access_token: 'n.e.w', refresh_token: 'r-new' })
    onRefresh = () => json(200, fresh)
    onUser = () => json(503, { message: 'unavailable' })
    const res = await run('/dashboard', big)

    expect(res.status).toBe(307)
    const set = setCookies(res)
    const written = res.cookies.get(KEY)?.value
    expect(written).toMatch(/^base64-/)
    expect(JSON.parse(Buffer.from(written!.slice(7), 'base64url').toString())).toMatchObject({
      access_token: 'n.e.w',
      refresh_token: 'r-new',
    })
    expect(expired(res)).toEqual([`${KEY}.0`, `${KEY}.1`])
    expect(set.get(KEY)).not.toMatch(/Max-Age=0/i)
  })
})

describe('signed in → passes through (#1540 regression guard)', () => {
  it('200 /user → no redirect, no cookie removal', async () => {
    onUser = () => json(200, { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated' })
    const res = await run('/dashboard', [`${KEY}=${encode(session())}`])

    expect(res.headers.get('location')).toBeNull()
    expect(expired(res)).toEqual([])
  })
})
