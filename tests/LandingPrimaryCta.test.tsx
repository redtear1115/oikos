import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

import { LandingPrimaryCta } from '@/app/[locale]/_landing/LandingPrimaryCta'

const renderCta = () =>
  render(
    <LandingPrimaryCta
      signInHref="/zh-TW/sign-in"
      dashboardHref="/dashboard"
      ctaLocation="hero"
    >
      開始
    </LandingPrimaryCta>,
  )

describe('LandingPrimaryCta (#920 Phase 1 client CTA hydration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sign-in href at SSR / before session resolves', () => {
    // Never resolves → stays on the logged-out default.
    getSession.mockReturnValue(new Promise(() => {}))
    renderCta()
    // LandingCtaLink appends ?from=landing to sign-in hrefs.
    expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=landing',
    )
  })

  it('swaps to /dashboard after hydration when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    renderCta()
    await waitFor(() => {
      expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe('/dashboard')
    })
  })

  it('stays on sign-in when no session exists (logged-out viewer)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderCta()
    // Give the resolved promise a tick; href must remain the sign-in variant.
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=landing',
    )
  })
})
