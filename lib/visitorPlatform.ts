/**
 * Pure resolver for the landing page's device-dependent primary CTA (#1413).
 *
 * Platform can only be known client-side: one prod deployment serves the web
 * site plus both Capacitor native shells (`server.url` points every shell at
 * the same remote page — see CLAUDE.md 三平台架構), so there is no build-time
 * flag and no SSR signal to branch on. Every input here comes from something
 * only readable in the browser at render time; callers collect them (see
 * `lib/useVisitorPlatformTarget.ts`) and this function stays a plain,
 * synchronous, fully-testable mapping from those inputs to a CTA variant.
 */

export type VisitorPlatformTarget = 'dashboard' | 'sign_in' | 'app_store' | 'android_beta'

export interface ResolveVisitorPlatformInput {
  /** `navigator.userAgent`. */
  userAgent: string
  /** `navigator.maxTouchPoints` — disambiguates iPadOS from a real Mac (below). */
  maxTouchPoints: number
  /** Running inside a Capacitor native shell (iOS or Android WebView). */
  isCapacitor: boolean
  /** Running as an installed PWA (`display-mode: standalone`), see `lib/install-guide.ts`. */
  isStandalone: boolean
  /** A local Supabase session already exists. */
  hasSession: boolean
}

// #1413 — region-neutral: Apple redirects `/app/id...` to the visitor's own
// storefront, so don't hard-code a locale segment into it (carried over from
// the #1333 note this replaces).
export const APP_STORE_URL = 'https://apps.apple.com/app/id6779264784'

// #1413 — Android closed-testing signup (Google Form). Ray copies replies into
// the Play Console closed-testing list on a schedule and deletes them from the
// form afterward — the email address never enters our DB and isn't kept in the
// form long-term either (see issue #1413 comment).
//
// MUST be filled in with the real form URL before merge. Left empty,
// `resolveVisitorPlatform` below falls back to 'sign_in' for Android visitors
// instead of ever pointing the CTA at a dead link.
export const ANDROID_BETA_FORM_URL = ''

/**
 * Which primary-CTA variant a visitor should see. Precedence:
 *
 *   1. signed in                              → dashboard
 *   2. Capacitor shell / installed PWA         → sign_in (never app_store —
 *      Apple Guideline 3.1.1: no "download the app" link from inside the app)
 *   3. iPhone / iPad browser                   → app_store
 *   4. Android browser                         → android_beta (or sign_in if
 *      the form URL above is still empty)
 *   5. everything else (desktop, etc.)         → sign_in
 */
export function resolveVisitorPlatform({
  userAgent,
  maxTouchPoints,
  isCapacitor,
  isStandalone,
  hasSession,
}: ResolveVisitorPlatformInput): VisitorPlatformTarget {
  if (hasSession) return 'dashboard'
  if (isCapacitor || isStandalone) return 'sign_in'

  const ua = userAgent.toLowerCase()
  // iPadOS 13+ reports as Macintosh in the UA string; touch points disambiguate
  // it from a real Mac (same heuristic as `lib/install-guide.ts#getPlatform`).
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1)
  if (isIos) return 'app_store'

  if (/android/.test(ua)) {
    return ANDROID_BETA_FORM_URL ? 'android_beta' : 'sign_in'
  }

  return 'sign_in'
}
