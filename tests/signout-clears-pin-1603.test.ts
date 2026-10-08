import { describe, it, expect, vi, beforeEach } from 'vitest'

// #1603 — signOut clears the past-times pin. The pin is a browser-session
// cookie, not tied to the account: left behind, it outlives the sign-out and
// the next account to sign in on this browser starts out pinned. Combined
// with the old resolver (which accepted a former member's pin) it was half of
// the /sign-in ↔ /dashboard loop with no way out.

const h = vi.hoisted(() => {
  const jar = new Map<string, string>()
  return {
    jar,
    signOut: vi.fn(async () => ({ error: null })),
    redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: h.signOut } })),
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
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { signOut } = await import('@/actions/auth')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')

beforeEach(() => {
  h.jar.clear()
  vi.clearAllMocks()
})

describe('signOut (#1603)', () => {
  it('deletes the past-epoch pin cookie, then redirects home', async () => {
    h.jar.set(PAST_EPOCH_COOKIE, 'ep-old-chapter')
    h.jar.set('other_cookie', 'kept')

    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT /')

    expect(h.signOut).toHaveBeenCalledOnce()
    expect(h.jar.has(PAST_EPOCH_COOKIE)).toBe(false)
    expect(h.jar.get('other_cookie')).toBe('kept')
  })

  it('is harmless when no pin is set', async () => {
    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT /')
    expect(h.jar.has(PAST_EPOCH_COOKIE)).toBe(false)
  })
})
