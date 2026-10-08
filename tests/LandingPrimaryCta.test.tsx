import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession } }),
}))

// jsdom has no real matchMedia; `isStandalone()` (lib/install-guide.ts) needs
// it to exist at all.
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}))

import { LandingPrimaryCta } from '@/app/[locale]/_landing/LandingPrimaryCta'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function stubUserAgent(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua)
}

const renderCta = () =>
  render(
    <LandingPrimaryCta
      signInHref="/zh-TW/sign-in"
      dashboardHref="/dashboard"
      ctaLocation="hero"
      appStoreLabel="在 App Store 下載"
      androidBetaLabel="報名 Android 測試版"
    >
      開始
    </LandingPrimaryCta>,
  )

describe('LandingPrimaryCta (#920 Phase 1 client CTA hydration, extended by #1413)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // #1520 — the Supabase SDK is only loaded when the device holds a session
    // cookie; these tests are about a device that does.
    document.cookie = 'sb-test-auth-token=abc; path=/'
    stubUserAgent(WINDOWS_UA)
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  afterEach(() => {
    document.cookie = 'sb-test-auth-token=; Max-Age=0; path=/'
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  it('renders the labelled, clickable sign-in default while platform resolution is pending (#1521)', () => {
    // Never resolves → stays pending.
    getSession.mockReturnValue(new Promise(() => {}))
    renderCta()
    const anchor = screen.getByText('開始').closest('a')!
    expect(anchor.getAttribute('href')).toBe('/zh-TW/sign-in?from=landing')
    expect(anchor).not.toHaveAttribute('aria-hidden')
    expect(anchor).not.toHaveAttribute('tabindex')
    expect(anchor.className).not.toContain('pointer-events-none')
    expect(anchor.className).not.toContain('opacity-0')
    expect(screen.getByText('開始').className).not.toContain('text-transparent')
  })

  it('SSR markup is a real, focusable, visibly labelled sign-in link (#1521: works with JS off)', async () => {
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(
      <LandingPrimaryCta
        signInHref="/zh-TW/sign-in"
        dashboardHref="/dashboard"
        ctaLocation="hero"
        appStoreLabel="在 App Store 下載"
        androidBetaLabel="報名 Android 測試版"
      >
        開始
      </LandingPrimaryCta>,
    )
    expect(html).toContain('href="/zh-TW/sign-in?from=landing"')
    expect(html).toContain('開始')
    expect(html).not.toContain('pointer-events-none')
    expect(html).not.toContain('aria-hidden')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('text-transparent')
    // SSR must never contain an off-site destination: the App Store link only
    // exists after the client has resolved the platform (Apple 3.1.1).
    expect(html).not.toContain('apps.apple.com')
  })

  it('keeps the same sign-in href and label after resolving on desktop (no swap)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderCta()
    const before = screen.getByText('開始').closest('a')!
    await waitFor(() => expect(getSession).toHaveBeenCalled())
    await Promise.resolve()
    const after = screen.getByText('開始').closest('a')!
    expect(after).toBe(before)
    expect(after.getAttribute('href')).toBe('/zh-TW/sign-in?from=landing')
  })

  it('swaps to /dashboard after hydration when a session exists, on any platform', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    stubUserAgent(IPHONE_UA)
    renderCta()
    await waitFor(() => {
      expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe('/dashboard')
    })
  })

  it('stays on sign-in when no session exists on desktop (logged-out viewer)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderCta()
    await waitFor(() => {
      const anchor = screen.getByText('開始').closest('a')!
      expect(anchor).not.toHaveAttribute('aria-hidden')
    })
    expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=landing',
    )
  })

  it('links to the App Store for an iPhone browser visitor', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubUserAgent(IPHONE_UA)
    renderCta()
    const link = await screen.findByText('在 App Store 下載')
    const anchor = link.closest('a')!
    expect(anchor).toHaveAttribute('href', 'https://apps.apple.com/app/id6779264784?pt=128976951&ct=landing&mt=8')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('never shows the App Store link inside the iOS native shell (Apple 3.1.1)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubUserAgent(IPHONE_UA)
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }
    renderCta()
    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(screen.queryByText('在 App Store 下載')).not.toBeInTheDocument()
    expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=landing',
    )
  })

  it('links to the Android beta signup form for an Android browser visitor', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    stubUserAgent(ANDROID_UA)
    renderCta()
    await waitFor(() => {
      const anchor = screen.getByText('報名 Android 測試版').closest('a')!
      expect(anchor.getAttribute('href')).toBe('https://forms.gle/MriV1rL3upL4SgVt5')
    })
    expect(screen.queryByText('開始')).not.toBeInTheDocument()
  })
})

describe('LandingPrimaryCta without a session cookie (#1520)', () => {
  it('resolves to the sign-in CTA without loading the Supabase client', async () => {
    delete (window as { Capacitor?: unknown }).Capacitor
    stubUserAgent(WINDOWS_UA)
    getSession.mockClear()
    renderCta()
    expect(screen.getByText('開始').closest('a')).toHaveAttribute('href', '/zh-TW/sign-in?from=landing')
    expect(getSession).not.toHaveBeenCalled()
  })
})
