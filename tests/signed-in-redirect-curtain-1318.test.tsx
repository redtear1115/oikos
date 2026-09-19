import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

// #1318 — a signed-in user cold-starting the app saw the sign-in form for the
// 3–5 s `getSession()` spent refreshing an expired token, and could tap Google
// into the middle of the auto-redirect. With a session cookie on the device the
// waiting curtain now covers the page until the check settles.

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

// jsdom has no matchMedia; the landing only cares about installed-or-not.
vi.mock('@/lib/install-guide', () => ({ isStandalone: () => false }))

import { hasStoredSessionCookie } from '@/lib/auth/storedSession'
import { SignedInRedirect } from '@/app/[locale]/sign-in/SignedInRedirect'
import { LandingStandaloneRedirect } from '@/app/[locale]/_landing/LandingStandaloneRedirect'
import { SESSION_CHECK_TIMEOUT_MS } from '@/app/[locale]/sign-in/useSignedInRedirect'

const SESSION_COOKIE = 'sb-abcdefgh-auth-token.0'
const VERIFIER_COOKIE = 'sb-abcdefgh-auth-token-code-verifier'

function setCookie(name: string, value = 'base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0') {
  document.cookie = `${name}=${value}; path=/`
}
function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

describe('hasStoredSessionCookie (#1318)', () => {
  it('matches the plain and chunked session cookie', () => {
    expect(hasStoredSessionCookie('sb-ref-auth-token=base64-x')).toBe(true)
    expect(hasStoredSessionCookie('lang=zh-TW; sb-ref-auth-token.0=base64-x; sb-ref-auth-token.1=y')).toBe(true)
  })

  it('ignores the PKCE verifier, empty values and other cookies', () => {
    expect(hasStoredSessionCookie('sb-ref-auth-token-code-verifier=abc')).toBe(false)
    expect(hasStoredSessionCookie('sb-ref-auth-token=; lang=en')).toBe(false)
    expect(hasStoredSessionCookie('lang=ja')).toBe(false)
    expect(hasStoredSessionCookie('')).toBe(false)
  })
})

describe('SignedInRedirect curtain (#1318)', () => {
  const replace = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    clearCookies()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: originalLocation.origin, search: '', replace },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    clearCookies()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('shows no curtain for a device without a session cookie', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    expect(screen.queryByRole('status')).toBeNull()
    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not treat an OAuth attempt in flight (verifier only) as a session', () => {
    setCookie(VERIFIER_COOKIE, 'abc')
    getSession.mockReturnValue(new Promise(() => {}))
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('covers the page while a stored session is refreshed, and keeps it up through the redirect', async () => {
    setCookie(SESSION_COOKIE)
    let resolve!: (v: unknown) => void
    getSession.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)

    expect(screen.getByRole('status')).toHaveTextContent('正在帶你進去')
    await act(async () => resolve({ data: { session: { user: { id: 'u1' } } } }))
    expect(replace).toHaveBeenCalledWith(`${originalLocation.origin}/dashboard`)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('lifts the curtain when the stored session turns out to be dead', async () => {
    setCookie(SESSION_COOKIE)
    getSession.mockResolvedValue({ data: { session: null } })
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(replace).not.toHaveBeenCalled()
  })

  it('lifts the curtain when getSession rejects', async () => {
    setCookie(SESSION_COOKIE)
    getSession.mockRejectedValue(new Error('network'))
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('never leaves anyone behind the curtain: it lifts after the timeout', async () => {
    vi.useFakeTimers()
    setCookie(SESSION_COOKIE)
    getSession.mockReturnValue(new Promise(() => {}))
    render(<SignedInRedirect checkingLabel="正在帶你進去" />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS - 100) })
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('LandingStandaloneRedirect curtain (#1318)', () => {
  const w = window as unknown as Record<string, unknown>
  const replace = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    clearCookies()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace },
    })
  })
  afterEach(() => {
    delete w.Capacitor
    clearCookies()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('stays out of a plain browser tab even with a session cookie', () => {
    setCookie(SESSION_COOKIE)
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" checkingLabel="正在帶你進去" />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(getSession).not.toHaveBeenCalled()
  })

  it('covers the landing in the native shell until the session is confirmed', async () => {
    w.Capacitor = { getPlatform: () => 'ios' }
    setCookie(SESSION_COOKIE)
    let resolve!: (v: unknown) => void
    getSession.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" checkingLabel="正在帶你進去" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => resolve({ data: { session: { user: { id: 'u1' } } } }))
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })
})
