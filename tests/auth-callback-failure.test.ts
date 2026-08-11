import { describe, it, expect, vi, beforeEach } from 'vitest'

// Failure branches of /auth/callback used to redirect silently (#973): no
// analytics, no Sentry, and /sign-in never read the ?error it was handed. These
// tests pin the new signals AND guard the success path — a mistake here breaks
// every sign-in, so the happy path is asserted alongside the failures.

interface ExchangeResult {
  error: { name: string; status?: number } | null
  data: { user: { id: string; created_at?: string; user_metadata?: Record<string, unknown> } | null }
}

// vi.mock factories are hoisted above module-scope consts, so the spies have to
// be created inside vi.hoisted() to exist by the time the factories run.
const h = vi.hoisted(() => {
  const state: { exchange: unknown } = { exchange: { error: null, data: { user: null } } }
  return {
    state,
    exchangeCodeForSession: vi.fn(async (_code: string) => state.exchange),
    captureServer: vi.fn(async () => {}),
    aliasServer: vi.fn(async () => {}),
    captureException: vi.fn(),
  }
})

const state = h.state as { exchange: ExchangeResult }
const { captureServer, captureException } = h

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { exchangeCodeForSession: h.exchangeCodeForSession } })),
}))

vi.mock('@/lib/analytics/server', () => ({
  captureServer: h.captureServer,
  aliasServer: h.aliasServer,
}))

vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))

vi.mock('@/lib/i18n/server-redirect', () => ({
  localizedSignInPath: vi.fn(async (suffix: string) => `/sign-in${suffix}`),
}))

vi.mock('@/lib/db/client', () => ({
  db: { update: () => ({ set: () => ({ where: async () => {} }) }) },
}))

import { GET } from '@/app/auth/callback/route'

const ORIGIN = 'https://futari.southern-light.dev'
const call = (query: string) => GET(new Request(`${ORIGIN}/auth/callback${query}`))

/** The properties object handed to the Nth captureServer call. */
const propsOf = (n = 0) => captureServer.mock.calls[n]?.[2] as Record<string, unknown> | undefined
const eventOf = (n = 0) => captureServer.mock.calls[n]?.[1] as string | undefined
const idOf = (n = 0) => captureServer.mock.calls[n]?.[0] as string | undefined

beforeEach(() => {
  vi.clearAllMocks()
  state.exchange = { error: null, data: { user: null } }
})

describe('/auth/callback — missing code', () => {
  it('records sign_in_failed and still redirects to sign-in', async () => {
    const res = await call('')

    expect(eventOf()).toBe('sign_in_failed')
    expect(propsOf()).toMatchObject({ reason: 'missing_code' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sign-in?error=auth_failed')
  })

  it('attributes the failure to the pre-auth anonymous id when present', async () => {
    await call('?aid=anon-123')

    expect(idOf()).toBe('anon-123')
    expect(propsOf()).toMatchObject({ had_anon_id: true })
  })

  it('still counts the failure when no anonymous id survived the OAuth hop', async () => {
    await call('')

    expect(idOf()).toBe('anon:auth-callback-failure')
    expect(propsOf()).toMatchObject({ had_anon_id: false })
  })

  it("forwards the provider's own error params instead of discarding them", async () => {
    await call('?error=access_denied&error_description=user+denied')

    expect(propsOf()).toMatchObject({
      reason: 'missing_code',
      oauth_error: 'access_denied',
      oauth_error_description: 'user denied',
    })
  })
})

describe('/auth/callback — exchange failure', () => {
  beforeEach(() => {
    state.exchange = { error: { name: 'AuthApiError', status: 401 }, data: { user: null } }
  })

  it('records sign_in_failed with the classification and redirects to sign-in', async () => {
    const res = await call('?code=abc123')

    expect(eventOf()).toBe('sign_in_failed')
    expect(propsOf()).toMatchObject({ reason: 'exchange_error', error_name: 'AuthApiError' })
    expect(res.headers.get('location')).toContain('/sign-in?error=auth_failed')
  })

  it('reports to Sentry', async () => {
    await call('?code=abc123')

    expect(captureException).toHaveBeenCalledOnce()
  })

  it('never leaks the one-time auth code into the Sentry payload', async () => {
    await call('?code=super-secret-code')

    const serialized = JSON.stringify(captureException.mock.calls)
    expect(serialized).not.toContain('super-secret-code')
  })
})

describe('/auth/callback — success path is untouched', () => {
  beforeEach(() => {
    state.exchange = {
      error: null,
      data: { user: { id: 'user-1', created_at: new Date(0).toISOString() } },
    }
  })

  it('redirects to next and fires the conversion event, not a failure', async () => {
    const res = await call('?code=abc123&next=/dashboard')

    expect(eventOf()).toBe('signed_in')
    expect(idOf()).toBe('user-1')
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('refuses an off-site next target', async () => {
    const res = await call('?code=abc123&next=//evil.example.com')

    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })
})
