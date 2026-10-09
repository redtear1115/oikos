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
  /** Closed-test Google Group URL; defaults to {@link ANDROID_TEST_GROUP_URL}.
   *  Injectable so the empty-URL fallback can be tested for real. */
  testGroupUrl?: string
}

// #1413 — region-neutral: Apple redirects `/app/id...` to the visitor's own
// storefront, so don't hard-code a locale segment into it (carried over from
// the #1333 note this replaces).
// #1555 — App Store Connect campaign parameters (pt = our provider token,
// public by design; ct = campaign name; mt=8 = App Store). Without them every
// download that starts from the landing CTA is counted under 「網頁推薦」 with
// no campaign, so ASC's 宣傳活動 report can't tell whether the landing drives
// installs. Failure looks like: the landing → App Store share stays an
// unexplained 0 in ASC while PostHog shows CTA clicks. ASC only shows a
// campaign once ≥5 distinct Apple accounts installed through it.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6779264784?pt=128976951&ct=landing&mt=8'

// #1648 — Android closed testing is self-serve through a Google Group. Play's
// tester list contains the group, so joining the group is what grants
// testing rights; nobody copies addresses between a form and Play Console.
// The group's member list is visible to managers only. The /android-beta
// privacy line says exactly that (the group owner, us, can see the tester's
// Google account email) and nothing more; if the group's "who can view
// members" setting ever widens, that sentence becomes false with no error.
//
// Join flow: ANDROID_BETA_PATH explains it → ANDROID_TEST_GROUP_URL (step 1)
// → ANDROID_TEST_OPTIN_URL (step 2, Play's opt-in page, which only works once
// the group is on the tester list).
//
// If the group URL is ever emptied, `resolveVisitorPlatform` falls back to
// 'sign_in' for Android visitors, the dashboard card hides, and the page shows
// no step buttons, so nothing ever points at a dead link. Failure of that
// guard looks like: an Android visitor taps the CTA and lands on a page whose
// only action goes nowhere.
export const ANDROID_TEST_GROUP_URL = 'https://groups.google.com/g/futari-android-testers'
export const ANDROID_TEST_OPTIN_URL = 'https://play.google.com/apps/testing/dev.southernlight.futari'
/** Public page (no locale prefix); always build the href with `localizedHref`. */
export const ANDROID_BETA_PATH = '/android-beta'

/**
 * Which primary-CTA variant a visitor should see. Precedence:
 *
 *   1. signed in                              → dashboard
 *   2. Capacitor shell / installed PWA         → sign_in (never app_store —
 *      Apple Guideline 3.1.1: no "download the app" link from inside the app)
 *   3. iPhone / iPad browser                   → app_store
 *   4. Android browser                         → android_beta (or sign_in if
 *      the group URL above is still empty)
 *   5. everything else (desktop, etc.)         → sign_in
 */
export function resolveVisitorPlatform({
  userAgent,
  maxTouchPoints,
  isCapacitor,
  isStandalone,
  hasSession,
  testGroupUrl = ANDROID_TEST_GROUP_URL,
}: ResolveVisitorPlatformInput): VisitorPlatformTarget {
  if (hasSession) return 'dashboard'
  if (isCapacitor || isStandalone) return 'sign_in'

  const ua = userAgent.toLowerCase()
  // iPadOS 13+ reports as Macintosh in the UA string; touch points disambiguate
  // it from a real Mac (same heuristic as `lib/install-guide.ts#getPlatform`).
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1)
  if (isIos) return 'app_store'

  if (/android/.test(ua)) {
    return testGroupUrl ? 'android_beta' : 'sign_in'
  }

  return 'sign_in'
}
