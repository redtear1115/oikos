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
    stubUserAgent(WINDOWS_UA)
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  it('renders a visible placeholder (box shown, label text-transparent) while platform resolution is pending', () => {
    // Never resolves → stays pending.
    getSession.mockReturnValue(new Promise(() => {}))
    renderCta()
    const label = screen.getByText('開始')
    const anchor = label.closest('a')!
    // The box itself is NOT hidden (#1413 verifier feedback: an invisible
    // primary CTA reads as a broken page) — only its label text is.
    expect(anchor.className).not.toContain('opacity-0')
    expect(label.className).toContain('text-transparent')
    expect(anchor).toHaveAttribute('aria-hidden', 'true')
    expect(anchor).toHaveAttribute('tabindex', '-1')
    // Pre-hydration, only a plain CSS class can block a tap — `onClick`'s
    // `preventDefault` doesn't run until React hydrates (F1).
    expect(anchor.className).toContain('pointer-events-none')
    // Still the sign-in default underneath, so layout doesn't jump once shown.
    expect(anchor.getAttribute('href')).toBe('/zh-TW/sign-in?from=landing')
  })

  it('SSR markup itself carries pointer-events-none (F1: onClick cannot run before hydration)', async () => {
    // Never resolves within this render — matches what a real page load looks
    // like before the client JS bundle has executed at all.
    getSession.mockReturnValue(new Promise(() => {}))
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
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('text-transparent')
    // Text is present for crawlers/no-JS readers, just visually transparent —
    // not `display:none` and not stripped from the markup.
    expect(html).toContain('開始')
  })

  it('removes the pending guards once platform resolution settles', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderCta()
    // Re-query inside `waitFor` rather than holding a reference from before
    // resolution: the pending render swaps a text-transparent <span> wrapper
    // for the plain string once resolved, so the earlier node detaches.
    await waitFor(() => {
      const anchor = screen.getByText('開始').closest('a')!
      expect(anchor).not.toHaveAttribute('aria-hidden')
    })
    const anchor = screen.getByText('開始').closest('a')!
    expect(anchor).not.toHaveAttribute('tabindex')
    expect(anchor.className).not.toContain('pointer-events-none')
    expect(anchor.className).not.toContain('text-transparent')
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
    expect(anchor).toHaveAttribute('href', 'https://apps.apple.com/app/id6779264784')
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
    await waitFor(() => {
      const anchor = screen.getByText('開始').closest('a')!
      expect(anchor).not.toHaveAttribute('aria-hidden')
    })
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
      expect(anchor).not.toHaveAttribute('aria-hidden')
      expect(anchor.getAttribute('href')).toBe('https://forms.gle/MriV1rL3upL4SgVt5')
    })
    expect(screen.queryByText('開始')).not.toBeInTheDocument()
  })
})
