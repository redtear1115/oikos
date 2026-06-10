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

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace },
    })
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
      expect(replace).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('does NOT redirect when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<SignedInRedirect />)
    await Promise.resolve()
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()
  })
})
