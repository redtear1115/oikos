import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

// #1540 — the sign-in page trusts the session cookie (`getSession()`) and
// sends the browser to /dashboard; the proxy verifies it and, if Supabase says
// no, sends it back. When the proxy can't clear the cookie (Supabase outage,
// 429, timeouts) that repeats forever: the page flickers between /sign-in and
// /dashboard with no error. The hook now auto-redirects at most once per
// REDIRECT_LOOP_WINDOW_MS; the next attempt shows the form instead.

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))
vi.mock('@/lib/install-guide', () => ({ isStandalone: () => false }))

import { SignedInRedirect } from '@/app/[locale]/sign-in/SignedInRedirect'
import { LandingStandaloneRedirect } from '@/app/[locale]/_landing/LandingStandaloneRedirect'
import {
  REDIRECT_AT_KEY,
  REDIRECT_LOOP_WINDOW_MS,
} from '@/app/[locale]/sign-in/useSignedInRedirect'

const SESSION_COOKIE = 'sb-abcdefgh-auth-token'
const LIVE_SESSION = { data: { session: { user: { id: 'u1' } } } }

describe('sign-in auto-redirect loop breaker (#1540)', () => {
  const w = window as unknown as Record<string, unknown>
  const replace = vi.fn()
  const originalLocation = window.location
  const ORIGIN = originalLocation.origin

  /** One visit to the sign-in page: mount, let getSession settle. */
  async function visitSignIn() {
    cleanup()
    const redirectsBefore = replace.mock.calls.length
    const checksBefore = getSession.mock.calls.length
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    await waitFor(() => expect(getSession.mock.calls.length).toBe(checksBefore + 1))
    // Settled: either it redirected (curtain stays up) or the curtain lifted.
    await waitFor(() => {
      expect(
        replace.mock.calls.length > redirectsBefore || screen.queryByRole('status') === null,
      ).toBe(true)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    document.cookie = `${SESSION_COOKIE}=base64-eyJ4IjoxfQ; path=/`
    getSession.mockResolvedValue(LIVE_SESSION)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: ORIGIN, search: '', replace },
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete w.Capacitor
    cleanup()
    document.cookie = `${SESSION_COOKIE}=; Max-Age=0; path=/`
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('redirects on the first visit and records when', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await visitSignIn()
    expect(replace).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/dashboard`)
    expect(sessionStorage.getItem(REDIRECT_AT_KEY)).toBe('1000000')
  })

  it('bounced back within the window → no second redirect, the form is shown', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await visitSignIn()
    expect(replace).toHaveBeenCalledOnce()

    // The proxy rejected the session but could not clear the cookie: the
    // browser is back on /sign-in a moment later, getSession still says yes.
    now.mockReturnValue(1_000_000 + REDIRECT_LOOP_WINDOW_MS - 1)
    await visitSignIn()

    expect(replace).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('redirects again once the window has passed', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await visitSignIn()
    now.mockReturnValue(1_000_000 + REDIRECT_LOOP_WINDOW_MS)
    await visitSignIn()
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it('a session that is gone records nothing and blocks nothing later', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await visitSignIn()
    expect(sessionStorage.getItem(REDIRECT_AT_KEY)).toBeNull()

    getSession.mockResolvedValue(LIVE_SESSION)
    await visitSignIn()
    expect(replace).toHaveBeenCalledOnce()
  })

  it('sessionStorage that throws does not break the redirect', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    await visitSignIn()
    expect(replace).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/dashboard`)
  })

  it('the installed-app landing shares the breaker', async () => {
    w.Capacitor = { getPlatform: () => 'ios' }
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" checkingLabel="正在帶你進去" />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))

    now.mockReturnValue(1_000_000 + 1_000)
    cleanup()
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" checkingLabel="正在帶你進去" />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(replace).toHaveBeenCalledOnce()
  })
})
