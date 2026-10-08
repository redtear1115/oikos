import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => track(...a) }))

vi.mock('@/lib/i18n/client', () => ({
  useTranslations: () => ({
    androidBetaInvite: { heading: 'H', body: 'B', cta: 'Join' },
    postLeave: { dismissAria: 'Dismiss' },
  }),
}))

const FORM = 'https://forms.gle/example'
const formUrl = { value: FORM }
vi.mock('@/lib/visitorPlatform', () => ({
  get ANDROID_BETA_FORM_URL() {
    return formUrl.value
  },
}))

import { AndroidBetaInviteCard } from '@/app/(dashboard)/dashboard/_components/AndroidBetaInviteCard'

const KEY = 'futari_android_beta_invite_dismissed'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function setNative(platform: 'android' | 'ios' | null) {
  if (platform === null) delete (window as { Capacitor?: unknown }).Capacitor
  else {
    ;(window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
    }
  }
}

beforeEach(() => {
  track.mockClear()
  formUrl.value = FORM
  window.localStorage.clear()
  setUA(ANDROID_UA)
  // jsdom has no matchMedia; a plain browser tab is "not standalone".
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setNative(null)
  vi.restoreAllMocks()
})

describe('AndroidBetaInviteCard (#1553)', () => {
  it('renders for an Android browser and fires shown once', () => {
    render(<AndroidBetaInviteCard />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(track.mock.calls).toEqual([['android_beta_invite_shown']])
  })

  it('renders in an Android PWA (standalone, no Capacitor)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone'), media: q }))
    render(<AndroidBetaInviteCard />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it.each([
    ['iOS', IOS_UA],
    ['desktop', DESKTOP_UA],
  ])('does not render on %s', (_n, ua) => {
    setUA(ua)
    const { container } = render(<AndroidBetaInviteCard />)
    expect(container.innerHTML).toBe('')
    expect(track).not.toHaveBeenCalled()
  })

  it('does not render inside the Capacitor Android shell', () => {
    setNative('android')
    const { container } = render(<AndroidBetaInviteCard />)
    expect(container.innerHTML).toBe('')
    expect(track).not.toHaveBeenCalled()
  })

  it('does not render when the form URL is empty', () => {
    formUrl.value = ''
    const { container } = render(<AndroidBetaInviteCard />)
    expect(container.innerHTML).toBe('')
  })

  it('does not render once dismissed before', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = render(<AndroidBetaInviteCard />)
    expect(container.innerHTML).toBe('')
    expect(track).not.toHaveBeenCalled()
  })

  it('dismiss hides the card, persists, and fires dismissed', () => {
    render(<AndroidBetaInviteCard />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByRole('status')).toBeNull()
    expect(window.localStorage.getItem(KEY)).toBe('1')
    expect(track.mock.calls).toEqual([['android_beta_invite_shown'], ['android_beta_invite_dismissed']])
  })

  it('CTA links to the form in a new tab, then retires the card', () => {
    render(<AndroidBetaInviteCard />)
    const a = screen.getByText('Join').closest('a')!
    expect(a.getAttribute('href')).toBe(FORM)
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    fireEvent.click(a)
    expect(screen.queryByRole('status')).toBeNull()
    expect(window.localStorage.getItem(KEY)).toBe('1')
    expect(track.mock.calls).toEqual([['android_beta_invite_shown'], ['android_beta_invite_clicked']])
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<AndroidBetaInviteCard />)
    expect(screen.getByRole('status')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
