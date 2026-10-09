import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const track = vi.fn()
let locale = 'zh-TW'
let groupUrl = 'https://groups.google.com/g/test'
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock('@/lib/i18n/client', () => ({
  useTranslations: () => ({ androidBeta: { outingLine: 'Android line' } }),
  useLocale: () => locale,
}))
vi.mock('@/lib/visitorPlatform', async (orig) => ({
  ...(await orig<typeof import('@/lib/visitorPlatform')>()),
  get ANDROID_TEST_GROUP_URL() {
    return groupUrl
  },
}))

import { AndroidBetaOutingLink } from '@/app/[locale]/outing/_components/AndroidBetaOutingLink'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function setNative(platform: 'android' | 'ios' | null) {
  if (platform === null) delete (window as { Capacitor?: unknown }).Capacitor
  else (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => platform }
}

beforeEach(() => {
  locale = 'zh-TW'
  groupUrl = 'https://groups.google.com/g/test'
  setUA(DESKTOP_UA)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }))
})
afterEach(() => {
  cleanup()
  setNative(null)
  vi.unstubAllGlobals()
  track.mockClear()
})

describe('AndroidBetaOutingLink (#1648)', () => {
  it('shows a localized, token-free, noreferrer link to Android browsers and tracks without properties', () => {
    setUA(ANDROID_UA)
    render(<AndroidBetaOutingLink />)
    const a = screen.getByText('Android line').closest('a')!
    expect(a.getAttribute('href')).toBe('/android-beta')
    expect(a.getAttribute('rel')).toBe('noreferrer')
    fireEvent.click(a)
    expect(track.mock.calls).toEqual([['android_beta_outing_link_clicked']])
  })

  it('uses the locale prefix for non-default locales', () => {
    setUA(ANDROID_UA)
    locale = 'en'
    render(<AndroidBetaOutingLink />)
    expect(screen.getByText('Android line').closest('a')!.getAttribute('href')).toBe('/en/android-beta')
  })

  it.each([
    ['iPhone', () => setUA(IPHONE_UA)],
    ['desktop', () => setUA(DESKTOP_UA)],
    ['Android shell', () => { setUA(ANDROID_UA); setNative('android') }],
    ['iOS shell', () => { setUA(IPHONE_UA); setNative('ios') }],
    ['empty group URL', () => { setUA(ANDROID_UA); groupUrl = '' }],
  ])('is hidden for %s', (_n, setup) => {
    setup()
    const { container } = render(<AndroidBetaOutingLink />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing before mount', async () => {
    setUA(ANDROID_UA)
    const { renderToString } = await import('react-dom/server')
    expect(renderToString(<AndroidBetaOutingLink />)).toBe('')
  })
})
