import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

const isStandalone = vi.fn()
vi.mock('@/lib/install-guide', () => ({
  isStandalone: () => isStandalone(),
}))

import { LandingStandaloneRedirect } from '@/app/[locale]/_landing/LandingStandaloneRedirect'

// #949 — signed-in users opening the *installed* app (PWA standalone or
// Capacitor native) should skip the public landing and go to /dashboard, while
// browser-tab visitors must still see the landing (SEO / #920 design).
describe('LandingStandaloneRedirect (#949)', () => {
  const replace = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    isStandalone.mockReturnValue(false)
    delete (window as unknown as Record<string, unknown>).Capacitor
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
    delete (window as unknown as Record<string, unknown>).Capacitor
  })

  it('redirects to the dashboard when installed (standalone) AND a session exists', async () => {
    isStandalone.mockReturnValue(true)
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" />)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('redirects when running inside the Capacitor native shell (Android / iOS app)', async () => {
    ;(window as unknown as Record<string, unknown>).Capacitor = {}
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" />)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('does NOT redirect in a plain browser tab even when signed in (keeps public landing)', async () => {
    isStandalone.mockReturnValue(false)
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" />)
    await Promise.resolve()
    await Promise.resolve()
    expect(getSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does NOT redirect when installed but there is no session', async () => {
    isStandalone.mockReturnValue(true)
    getSession.mockResolvedValue({ data: { session: null } })
    render(<LandingStandaloneRedirect dashboardHref="/dashboard" />)
    await Promise.resolve()
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()
  })
})
