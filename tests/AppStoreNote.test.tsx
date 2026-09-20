import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, waitFor } from '@testing-library/react'
import { AppStoreNote } from '@/app/[locale]/_landing/AppStoreNote'

vi.mock('@/lib/analytics/track', () => ({
  track: vi.fn(),
}))

afterEach(() => {
  cleanup()
  delete (window as { Capacitor?: unknown }).Capacitor
})

describe('AppStoreNote iOS shell gate (#1333)', () => {
  it('does not render inside the iOS native shell', async () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }

    render(<AppStoreNote linkText="iPhone 版已在 App Store" androidNote="Android 版正在路上" />)

    await waitFor(() => {
      expect(screen.queryByText('iPhone 版已在 App Store')).not.toBeInTheDocument()
    })
  })

  it('renders on web / PWA (no Capacitor global)', () => {
    render(<AppStoreNote linkText="iPhone 版已在 App Store" androidNote="Android 版正在路上" />)

    expect(screen.getByText('iPhone 版已在 App Store')).toBeInTheDocument()
    expect(screen.getByText(/Android 版正在路上/)).toBeInTheDocument()
  })

  it('renders on the Android shell — no native app exists there to make a download link absurd', () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'android',
    }

    render(<AppStoreNote linkText="iPhone 版已在 App Store" androidNote="Android 版正在路上" />)

    expect(screen.getByText('iPhone 版已在 App Store')).toBeInTheDocument()
  })

  it('links to the region-neutral App Store URL with a safe new-tab target', () => {
    render(<AppStoreNote linkText="iPhone 版已在 App Store" androidNote="Android 版正在路上" />)

    const link = screen.getByRole('link', { name: 'iPhone 版已在 App Store' })
    expect(link).toHaveAttribute('href', 'https://apps.apple.com/app/id6779264784')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('AppStoreNote pre-hydration state (#1333)', () => {
  // The gate can only run after mount, so between paint and hydration the
  // server markup is all an iOS-shell user has. If that markup were a live
  // link, the shell would briefly show — and accept a tap on — 「下載 iPhone
  // 版」 to someone already inside the app; a plain <a> needs no JS to work.
  // Inside the shell that window is the whole remote page load, so this is
  // the state that actually matters, not the post-mount one.
  it('renders the link inert and invisible on the server', async () => {
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(
      <AppStoreNote linkText="iPhone 版已在 App Store" androidNote="Android 版正在路上" />,
    )

    // Present for crawlers and no-JS readers…
    expect(html).toContain('apps.apple.com/app/id6779264784')
    // …but not visible, not focusable, not announced.
    expect(html).toContain('opacity-0')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('tabindex="-1"')
  })
})
