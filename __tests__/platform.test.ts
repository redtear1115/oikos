import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectPlatform, isNativeApp } from '@/lib/platform'

/** Safari on an iPhone. */
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
/** The same device inside a WKWebView — note the missing `Safari/` suffix,
 *  which is exactly why the UA can't be trusted to separate these two. */
const IOS_WEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

/** jsdom's `matchMedia` always answers `false`; make it answer for real. */
function setDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: standalone && query.includes('display-mode: standalone'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )
}

/** The legacy iOS-only flag. `undefined` = not iOS Safari (or not installed). */
function setNavigatorStandalone(value: boolean | undefined) {
  Object.defineProperty(window.navigator, 'standalone', { value, configurable: true })
}

/** Install a Capacitor bridge global the way the native shell does. */
function setCapacitor(platform: 'ios' | 'android' | 'web' | null) {
  if (platform === null) {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'Capacitor')
    return
  }
  Object.defineProperty(window, 'Capacitor', {
    value: {
      getPlatform: () => platform,
      isNativePlatform: () => platform !== 'web',
    },
    configurable: true,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setCapacitor(null)
  setNavigatorStandalone(undefined)
})

describe('detectPlatform — native shell', () => {
  it('reports ios_native inside the iOS Capacitor shell', () => {
    setCapacitor('ios')
    setUserAgent(IOS_WEBVIEW_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('ios_native')
  })

  it('reports android_native inside the Android Capacitor shell', () => {
    setCapacitor('android')
    setUserAgent(ANDROID_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('android_native')
  })

  it('ignores a Capacitor global that reports web — @capacitor/core installs one on import', () => {
    // The dashboard imports @capacitor/core (PushTokenRegistrar), so the global
    // exists in a plain browser too. Presence must not be read as "native".
    setCapacitor('web')
    setUserAgent(DESKTOP_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('web')
  })

  it('falls back to web when the bridge claims native but names no known platform', () => {
    Object.defineProperty(window, 'Capacitor', {
      value: { getPlatform: () => 'electron', isNativePlatform: () => true },
      configurable: true,
    })
    setUserAgent(DESKTOP_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('web')
  })
})

describe('detectPlatform — installed PWA', () => {
  it('reports ios_pwa from the legacy navigator.standalone flag alone', () => {
    // iOS Safari before 15.4 has no display-mode support; this flag is the only
    // signal there is, so dropping it would misfile every older iOS install.
    setUserAgent(IOS_UA)
    setDisplayMode(false)
    setNavigatorStandalone(true)
    expect(detectPlatform()).toBe('ios_pwa')
  })

  it('reports ios_pwa from display-mode on modern iOS', () => {
    setUserAgent(IOS_UA)
    setDisplayMode(true)
    setNavigatorStandalone(undefined)
    expect(detectPlatform()).toBe('ios_pwa')
  })

  it('reports android_pwa for an installed Android PWA', () => {
    setUserAgent(ANDROID_UA)
    setDisplayMode(true)
    expect(detectPlatform()).toBe('android_pwa')
  })

  it('folds a desktop-installed PWA into web', () => {
    setUserAgent(DESKTOP_UA)
    setDisplayMode(true)
    expect(detectPlatform()).toBe('web')
  })
})

describe('detectPlatform — browser', () => {
  it('reports web for mobile Safari in a tab', () => {
    setUserAgent(IOS_UA)
    setDisplayMode(false)
    setNavigatorStandalone(false)
    expect(detectPlatform()).toBe('web')
  })

  it('reports web for Android Chrome in a tab', () => {
    setUserAgent(ANDROID_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('web')
  })

  it('reports web on the desktop', () => {
    setUserAgent(DESKTOP_UA)
    setDisplayMode(false)
    expect(detectPlatform()).toBe('web')
  })
})

describe('detectPlatform — server', () => {
  it('returns null rather than guessing web', () => {
    // The whole point of #1002 is stopping plausible-but-untrue platform data;
    // an SSR pass has no platform, so it reports none.
    const realWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    try {
      expect(detectPlatform()).toBeNull()
    } finally {
      vi.stubGlobal('window', realWindow)
    }
  })
})

describe('isNativeApp', () => {
  it('is true for exactly the two shells', () => {
    expect(isNativeApp('ios_native')).toBe(true)
    expect(isNativeApp('android_native')).toBe(true)
    expect(isNativeApp('ios_pwa')).toBe(false)
    expect(isNativeApp('android_pwa')).toBe(false)
    expect(isNativeApp('web')).toBe(false)
  })
})
