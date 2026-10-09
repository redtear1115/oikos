import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock('@/lib/i18n/client', () => ({
  useTranslations: () => ({ testerFeedback: { title: 'Feedback', hint: 'Hint' } }),
}))

import { TesterFeedbackRow } from '@/app/(dashboard)/settings/_components/TesterFeedbackRow'

const PLAY = 'https://play.google.com/store/apps/details?id=dev.southernlight.futari'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function setNative(platform: 'android' | 'ios' | null) {
  if (platform === null) delete (window as { Capacitor?: unknown }).Capacitor
  else (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => platform }
}
function stubMedia(standalone: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone'), media: q }))
}

beforeEach(() => {
  setUA(DESKTOP_UA)
  stubMedia(false)
})
afterEach(() => {
  cleanup()
  setNative(null)
  vi.unstubAllGlobals()
  track.mockClear()
})

describe('TesterFeedbackRow (#1648)', () => {
  it('renders the exact Play listing link inside the Android shell, and tracks the tap', () => {
    setNative('android')
    render(<TesterFeedbackRow />)
    const a = screen.getByText('Feedback').closest('a')!
    expect(a.getAttribute('href')).toBe(PLAY)
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    fireEvent.click(a)
    expect(track.mock.calls).toEqual([['tester_feedback_clicked']])
  })

  it('is hidden in the iOS shell', () => {
    setNative('ios')
    const { container } = render(<TesterFeedbackRow />)
    expect(container.innerHTML).toBe('')
  })

  it('is hidden in an Android browser', () => {
    setUA(ANDROID_UA)
    const { container } = render(<TesterFeedbackRow />)
    expect(container.innerHTML).toBe('')
  })

  it('is hidden in an installed Android PWA', () => {
    setUA(ANDROID_UA)
    stubMedia(true)
    const { container } = render(<TesterFeedbackRow />)
    expect(container.innerHTML).toBe('')
  })

  it('is hidden on desktop', () => {
    const { container } = render(<TesterFeedbackRow />)
    expect(container.innerHTML).toBe('')
  })
})
