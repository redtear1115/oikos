import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

import { SignedInRedirect } from '@/app/[locale]/sign-in/SignedInRedirect'

describe('SignedInRedirect (#920 Phase 1 sign-in client redirect)', () => {
  const replace = vi.fn()
  const originalLocation = window.location
  const ORIGIN = originalLocation.origin

  function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: ORIGIN, search, replace },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setSearch('')
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('redirects to /dashboard when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<SignedInRedirect />)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`${ORIGIN}/dashboard`)
    })
  })

  // #1275: the proxy now sends signed-out visitors to /sign-in?next=<path>.
  it('honours a same-origin ?next=', async () => {
    setSearch('?next=%2Frecords')
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<SignedInRedirect />)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`${ORIGIN}/records`)
    })
  })

  it.each(['//evil.com', '/%5Cevil.com', 'https://evil.com', '@evil.com', '/%09/evil.com'])(
    'falls back to /dashboard for untrusted next=%s',
    async (raw) => {
      setSearch(`?next=${encodeURIComponent(decodeURIComponent(raw))}`)
      getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
      render(<SignedInRedirect />)
      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(`${ORIGIN}/dashboard`)
      })
    },
  )

  it('does NOT redirect when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<SignedInRedirect />)
    await Promise.resolve()
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()
  })
})
