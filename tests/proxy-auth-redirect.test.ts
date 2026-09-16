// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// #1275: proxy 行為層的測試（tests/proxy-locale.test.ts 只守 pure helper）。
// 守三件事：
// 1. 未登入導轉 /sign-in 時，`next` 只帶 pathname、只帶給已知 protected 頁，
//    而且不會偽造出 `from` 等其他參數。
// 2. 未知的 `/<locale>/...` 不打 getUser()、也不改語系 cookie。
// 3. 既有行為不變：public 頁仍同步 cookie、已登入仍放行。

const h = vi.hoisted(() => ({
  getUser: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({
    data: { user: null },
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: h.getUser } })),
}))

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
