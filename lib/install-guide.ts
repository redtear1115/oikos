/**
 * Platform detection for the PWA install guide.
 *
 * The install gesture is platform-specific:
 * - iOS Safari: Share sheet → Add to Home Screen (no programmatic API)
 * - iOS Chrome / Firefox / etc: cannot install — must redirect user to Safari
 * - Android Chrome / Edge / Samsung Internet: beforeinstallprompt OR menu → Install
 * - Desktop Chrome / Edge: install icon in URL bar
 *
 * `display-mode: standalone` is the canonical "already installed" check.
 * iOS additionally exposes `navigator.standalone` for legacy reasons.
 */

export type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop' | 'unknown'

/** True when the page is running as an installed PWA (not a browser tab). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS-specific legacy flag — predates display-mode media queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navStandalone = (window.navigator as any).standalone
  return navStandalone === true
}

/**
 * Identify which install instructions to show. Heuristic from User-Agent.
 * Falls back to 'unknown' when we can't tell — caller shows generic copy.
 */
export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()

  const isIos = /iphone|ipad|ipod/.test(ua) || (
    // iPadOS 13+ reports as Macintosh; check touch points to disambiguate.
    /macintosh/.test(ua) && navigator.maxTouchPoints > 1
  )

  if (isIos) {
    // iOS Safari: 'safari' present AND no Chrome / Firefox / Edge variant.
    // Chrome on iOS = 'crios', Firefox = 'fxios', Edge = 'edgios'.
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua)
    return isSafari ? 'ios-safari' : 'ios-other'
  }

  if (/android/.test(ua)) return 'android'

  // Desktop: not iOS, not Android, no mobile signals.
  if (!/mobile|tablet/.test(ua)) return 'desktop'

  return 'unknown'
}
