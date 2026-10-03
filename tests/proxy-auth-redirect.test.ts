// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// #1275: proxy 行為層的測試（tests/proxy-locale.test.ts 只守 pure helper）。
// 守三件事：
// 1. 未登入導轉 /sign-in 時，`next` 只帶 pathname、只帶給已知 protected 頁，
//    而且不會偽造出 `from` 等其他參數。
// 2. 未知的 `/<locale>/...` 不打 getUser()、也不改語系 cookie。
// 3. 既有行為不變：public 頁仍同步 cookie、已登入仍放行。
// #1540 另守：未登入導轉要帶上 Supabase 的 cookie 指令，且只有「明確被拒」
// 才由 proxy 自己清掉 session cookie（見檔尾 describe）。

type CookieToSet = { name: string; value: string; options: Record<string, unknown> }
type GetUserResult = { data: { user: { id: string } | null }; error?: unknown }

const h = vi.hoisted(() => ({
  getUser: vi.fn(async (): Promise<GetUserResult> => ({
    data: { user: null },
  })),
  setAll: null as null | ((cookies: CookieToSet[]) => void),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(
    (_url: string, _key: string, opts: { cookies: { setAll: (c: CookieToSet[]) => void } }) => {
      h.setAll = opts.cookies.setAll
      return { auth: { getUser: h.getUser } }
    },
  ),
}))

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js'
import { proxy } from '@/proxy'

const ORIGIN = 'https://futari.southern-light.dev'

function req(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie } : {},
  })
}

function location(res: Response): URL {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc!)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getUser.mockReset()
  h.getUser.mockResolvedValue({ data: { user: null } })
})

describe('proxy — signed-out redirect carries next (#1275)', () => {
  it('/records?fAmtMin=5 → /sign-in?next=%2Frecords (pathname only, no from)', async () => {
    const res = await proxy(req('/records?fAmtMin=5'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/sign-in?next=%2Frecords`)
    const url = location(res)
    expect(url.searchParams.get('next')).toBe('/records')
    expect(res.headers.get('location')).not.toContain('fAmtMin')
    expect(url.searchParams.has('from')).toBe(false)
    expect(url.searchParams.has('fAmtMin')).toBe(false)
  })

  it('keeps the cookie locale prefix on the sign-in target', async () => {
    const res = await proxy(req('/records?fAmtMin=5', 'lang=ja'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/ja/sign-in?next=%2Frecords`)
  })

  it('a query-string lookalike in the path cannot forge extra params', async () => {
    const res = await proxy(req('/records/x%26from%3Devil'))

    const url = location(res)
    expect(url.searchParams.get('next')).toBe('/records/x%26from%3Devil')
    expect(url.searchParams.has('from')).toBe(false)
    expect([...url.searchParams.keys()]).toEqual(['next'])
  })

  it('nested protected path keeps its full pathname', async () => {
    const res = await proxy(req('/settings/account'))

    expect(location(res).searchParams.get('next')).toBe('/settings/account')
  })

  it('unknown path /foo → 307 to sign-in without next', async () => {
    const res = await proxy(req('/foo'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/sign-in`)
  })

  it('/api/export/transactions → no next', async () => {
    const res = await proxy(req('/api/export/transactions'))

    expect(res.status).toBe(307)
    expect(location(res).searchParams.has('next')).toBe(false)
  })

  it('protocol-relative-looking path //dashboard stays gated and gets no next', async () => {
    const res = await proxy(req('/%2Fdashboard'))

    expect(res.status).toBe(307)
    expect(location(res).searchParams.has('next')).toBe(false)
  })
})

describe('proxy — unknown locale-prefixed path (#1275)', () => {
  it('/zh-TW/foo passes through without getUser and without a locale Set-Cookie', async () => {
    const res = await proxy(req('/zh-TW/foo', 'lang=en'))

    expect(h.getUser).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.cookies.get('lang')).toBeUndefined()
    expect(res.headers.get('set-cookie') ?? '').not.toContain('lang=')
  })

  it('/en/api/export/transactions is not an API call — skipped, never rewritten', async () => {
    const res = await proxy(req('/en/api/export/transactions'))

    expect(h.getUser).not.toHaveBeenCalled()
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })
})

describe('proxy — existing behaviour unchanged', () => {
  it('/en/sign-in still syncs the locale cookie', async () => {
    const res = await proxy(req('/en/sign-in', 'lang=ja'))

    expect(h.getUser).not.toHaveBeenCalled()
    expect(res.cookies.get('lang')?.value).toBe('en')
  })

  it('/sign-in still rewrites to the default locale and sets the cookie', async () => {
    const res = await proxy(req('/sign-in'))

    expect(res.headers.get('x-middleware-rewrite')).toBe(`${ORIGIN}/zh-TW/sign-in`)
    expect(res.cookies.get('lang')?.value).toBe('zh-TW')
  })

  it('/dashboard with a user passes through', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await proxy(req('/dashboard'))

    expect(h.getUser).toHaveBeenCalledOnce()
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('/dashboard without a user → /sign-in?next=%2Fdashboard', async () => {
    const res = await proxy(req('/dashboard'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/sign-in?next=%2Fdashboard`)
  })
})

describe('proxy — the sign-out redirect carries the cookie clean-up (#1540)', () => {
  // A session cookie of this project (chunked), the PKCE verifier of an OAuth
  // attempt in flight, and a cookie that merely looks similar.
  const REF = 'abcdefgh'
  const KEY = `sb-${REF}-auth-token`
  const COOKIES = [
    `${KEY}.0=base64-aaa`,
    `${KEY}.1=bbb`,
    `${KEY}-code-verifier=ver`,
    'sb-otherref-auth-token=zzz',
    'lang=zh-TW',
  ].join('; ')

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${REF}.supabase.co`)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** name → the Set-Cookie line the redirect sends for it. */
  function setCookies(res: Response): Map<string, string> {
    return new Map(res.headers.getSetCookie().map((line) => [line.split('=')[0], line]))
  }
  function expired(res: Response): string[] {
    return [...setCookies(res)]
      .filter(([, line]) => /Max-Age=0/i.test(line))
      .map(([name]) => name)
      .sort()
  }

  it('copies the cookie removals Supabase made onto the redirect', async () => {
    h.getUser.mockImplementation(async () => {
      h.setAll!([{ name: KEY, value: '', options: { path: '/', sameSite: 'lax', maxAge: 0 } }])
      return { data: { user: null }, error: null }
    })
    const res = await proxy(req('/dashboard', `${KEY}=base64-aaa`))

    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([KEY])
  })

  it('copies a refreshed session onto the redirect too', async () => {
    h.getUser.mockImplementation(async () => {
      h.setAll!([{ name: KEY, value: 'base64-new', options: { path: '/', maxAge: 34560000 } }])
      return { data: { user: null }, error: new AuthRetryableFetchError('down', 503) }
    })
    const res = await proxy(req('/dashboard', `${KEY}=base64-old`))

    expect(res.cookies.get(KEY)?.value).toBe('base64-new')
    expect(expired(res)).toEqual([])
  })

  it.each([
    ['session missing / not found', () => new AuthSessionMissingError()],
    ['bad_jwt', () => new AuthApiError('invalid JWT', 403, 'bad_jwt')],
    ['user_not_found', () => new AuthApiError('gone', 403, 'user_not_found')],
    ['session_expired', () => new AuthApiError('expired', 403, 'session_expired')],
    ['user_banned', () => new AuthApiError('banned', 403, 'user_banned')],
  ])('definitive rejection (%s) → proxy expires every session chunk, never the verifier', async (_label, make) => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: make() })
    const res = await proxy(req('/dashboard', COOKIES))

    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([`${KEY}.0`, `${KEY}.1`])
    const line = setCookies(res).get(`${KEY}.0`)!
    expect(line).toMatch(/Path=\//)
    expect(line).toMatch(/SameSite=lax/i)
    expect(setCookies(res).has(`${KEY}-code-verifier`)).toBe(false)
    expect(setCookies(res).has('sb-otherref-auth-token')).toBe(false)
  })

  it('expires the chunks auth-js just wrote as well as the ones the browser sent', async () => {
    h.getUser.mockImplementation(async () => {
      h.setAll!([
        { name: `${KEY}.0`, value: '', options: { path: '/', maxAge: 0 } },
        { name: `${KEY}.1`, value: '', options: { path: '/', maxAge: 0 } },
        { name: KEY, value: 'base64-new', options: { path: '/', maxAge: 34560000 } },
      ])
      return { data: { user: null }, error: new AuthApiError('invalid JWT', 403, 'bad_jwt') }
    })
    const res = await proxy(req('/dashboard', COOKIES))

    expect(expired(res)).toEqual([KEY, `${KEY}.0`, `${KEY}.1`])
  })

  it.each([
    ['network / 503 (retryable)', () => new AuthRetryableFetchError('fetch failed', 0)],
    ['codeless 401 (Invalid API key)', () => new AuthApiError('Invalid API key', 401, undefined)],
    ['codeless 403', () => new AuthApiError('forbidden', 403, undefined)],
    ['429', () => new AuthApiError('rate limited', 429, 'over_request_rate_limit')],
    ['500 JSON', () => new AuthApiError('boom', 500, 'unexpected_failure')],
    ['500 HTML (AuthUnknownError)', () => new AuthUnknownError('not json', new Error('x'))],
    ['refresh_token_already_used', () => new AuthApiError('used', 400, 'refresh_token_already_used')],
    ['no error at all', () => null],
    ['a lookalike that is not an AuthError', () => ({ name: 'AuthApiError', code: 'bad_jwt' })],
  ])('not a definitive rejection (%s) → the proxy expires nothing itself', async (_label, make) => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: make() })
    const res = await proxy(req('/dashboard', COOKIES))

    expect(res.status).toBe(307)
    expect(expired(res)).toEqual([])
  })

  it('a signed-in request is untouched', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await proxy(req('/dashboard', COOKIES))

    expect(res.headers.get('location')).toBeNull()
    expect(expired(res)).toEqual([])
  })
})
