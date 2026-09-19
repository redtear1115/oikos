import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

// jsdom has no real matchMedia; LandingStandaloneRedirect's isStandalone()
// check (lib/install-guide.ts) needs it to exist at all.
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}))

import { Landing } from '@/app/[locale]/_landing/Landing'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

const renderLanding = () =>
  render(
    <Landing
      t={zhTW.landing}
      signInHref="/zh-TW/sign-in"
      dashboardHref="/dashboard"
      checkingLabel={zhTW.signIn.signingIn}
      useCaseHrefs={{
        cohabitation: '/zh-TW/use-case/cohabitation',
        newlyweds: '/zh-TW/use-case/newlyweds',
        petOwners: '/zh-TW/use-case/pet-owners',
        hub: '/zh-TW/use-case',
      }}
      migrateHrefs={{
        honeydue: '/zh-TW/migrate/honeydue',
        spendee: '/zh-TW/migrate/spendee',
        cwmoney: '/zh-TW/migrate/cwmoney',
        hub: '/zh-TW/migrate',
      }}
      legalLinks={{
        termsHref: '/zh-TW/terms',
        termsLabel: '服務條款',
        privacyHref: '/zh-TW/privacy',
        privacyLabel: '隱私權政策',
      }}
    />,
  )

describe('Landing — ctaHint copy + mobile sign-in entry (#1277)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockReturnValue(new Promise(() => {})) // never resolves — stay logged-out
  })

  it('no longer promises registration-free trial in ctaHint', () => {
    renderLanding()
    expect(screen.getByText(zhTW.landing.ctaHint)).toBeInTheDocument()
    expect(screen.queryByText(/不需註冊/)).not.toBeInTheDocument()
  })

  it('renders a mobile-only "already have an account" link below the hint, hidden at md', () => {
    renderLanding()
    const links = screen.getAllByText(zhTW.landing.alreadyHaveAccount)
    // One is the desktop `hidden md:inline-flex` link in the CTA row; the new
    // one is the mobile-only entry below the ctaHint paragraph.
    expect(links).toHaveLength(2)

    const mobileLink = links.find((el) => el.closest('a')!.className.includes('min-h-11'))!
    expect(mobileLink).toBeDefined()
    const anchor = mobileLink.closest('a')!
    expect(anchor.parentElement!.className).toContain('md:hidden')
    expect(anchor.getAttribute('href')).toBe('/zh-TW/sign-in?from=landing')
  })

  it('gives the mobile link a >=44px touch target', () => {
    renderLanding()
    const links = screen.getAllByText(zhTW.landing.alreadyHaveAccount)
    const mobileAnchor = links.map((el) => el.closest('a')!).find((a) => a.className.includes('min-h-11'))!
    expect(mobileAnchor.className).toContain('min-h-11')
  })
})
