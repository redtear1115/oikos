import { describe, it, expect, vi, beforeEach } from 'vitest'

// iOS-native Apple sign-in uses signInWithIdToken and never touches
// /auth/callback, so `recordNativeAuthConversion` is the only place its
// conversion reaches PostHog. Until #998 the event it fired was byte-identical
// to the web one, which is why a week of `signed_in` could not be split by
// platform at all. These tests pin the distinguishing axis.

const h = vi.hoisted(() => {
  const state: { user: unknown } = { user: null }
  return {
    state,
    getUser: vi.fn(async () => ({ data: { user: state.user } })),
    captureServer: vi.fn(
      async (
        _distinctId: string,
        _event: string,
        _properties?: Record<string, unknown>,
        _setOnce?: Record<string, unknown>,
      ) => {},
    ),
    aliasServer: vi.fn(async (_distinctId: string, _anonId: string) => {}),
    captureException: vi.fn(),
  }
})

const state = h.state as { user: { id: string; created_at?: string } | null }
const { captureServer, aliasServer } = h

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: h.getUser } })),
}))

vi.mock('@/lib/analytics/server', () => ({
  captureServer: h.captureServer,
  aliasServer: h.aliasServer,
}))

vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/lib/i18n/server-redirect', () => ({
  localizedHomePath: vi.fn(async () => '/'),
}))

import { recordNativeAuthConversion } from '@/actions/auth'

const propsOf = (n = 0) => captureServer.mock.calls[n]?.[2] as Record<string, unknown> | undefined
const eventOf = (n = 0) => captureServer.mock.calls[n]?.[1] as string | undefined
const idOf = (n = 0) => captureServer.mock.calls[n]?.[0] as string | undefined

beforeEach(() => {
  vi.clearAllMocks()
  // created_at at the epoch keeps every case a returning sign-in, not a signup.
  state.user = { id: 'user-1', created_at: new Date(0).toISOString() }
})

describe('recordNativeAuthConversion', () => {
  it('fires signed_in against the server-session user', async () => {
    await recordNativeAuthConversion({ from: null, anonId: null })

    expect(eventOf()).toBe('signed_in')
    expect(idOf()).toBe('user-1')
  })

  it('marks the conversion as the iOS-native Apple path', async () => {
    await recordNativeAuthConversion({ from: null, anonId: null })

    expect(propsOf()).toMatchObject({ path: 'ios_native', provider: 'apple' })
  })

  it('keeps the same entry-source attribution the web callback records', async () => {
    await recordNativeAuthConversion({ from: 'honeydue', anonId: 'anon-9' })

    expect(propsOf()).toMatchObject({
      entry_source: 'migrate_honeydue',
      migrate_source: 'honeydue',
    })
    expect(aliasServer).toHaveBeenCalledWith('user-1', 'anon-9')
  })

  it('stays silent when no session is visible yet', async () => {
    state.user = null

    await recordNativeAuthConversion({ from: null, anonId: null })

    expect(captureServer).not.toHaveBeenCalled()
  })
})
