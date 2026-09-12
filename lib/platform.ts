/**
 * #1002 — the observability platform dimension.
 *
 * Futari ships one JS bundle to three surfaces (browser, installed PWA,
 * Capacitor shell) and until now neither PostHog nor Sentry could tell them
 * apart. The User-Agent can't either: an iOS WKWebView is reported as "Mobile
 * Safari", so 43% of our iOS traffic was filed under the wrong browser and the
 * native shell, an iOS home-screen PWA and an in-app browser all collapsed into
 * one indistinguishable bucket. The dimension has to be injected at runtime —
 * there is no SQL that recovers it afterwards.
 *
 * ## Why this doesn't replace the five existing detection sites
 *
 * `SignInButton`, `ShellUpdateNotice`, `pushNotifications`, `PushTokenRegistrar`
 * and `shellVersion#isShellPlatform` each ask a *different* question — "is there
 * a bridge at all", "which store's version threshold applies", "is this
 * specifically iOS", "narrow this string to a shell platform". This module
 * answers a fifth one, for analytics, and its five-value enum is a poor
 * control-flow primitive for any of the others. Routing the auth branch or the
 * push gate through it would trade real behavioural risk on two native-contract
 * paths (which ship without the App Store review safety net) for cosmetic
 * deduplication. So this is additive: nothing else changes.
 *
 * ## Why `window.Capacitor` and not `@capacitor/core`
 *
 * The consumers are `app/providers.tsx` and `instrumentation-client.ts` — both
 * load on *every* page including the landing and sign-in, which today pull in no
 * Capacitor code at all. Importing `@capacitor/core` here would put its runtime
 * on the marketing path's critical bundle for no gain: the native bridge injects
 * `window.Capacitor` (with `getPlatform` / `isNativePlatform` already attached)
 * at document start, before any page script runs, so reading the global is both
 * free and authoritative. `SignInButton` and `LandingStandaloneRedirect` already
 * rely on the same global for the same reason.
 *
 * Note the global also exists on the *web* whenever `@capacitor/core` is
 * imported anywhere on the page (it self-installs on import — the dashboard does
 * this via `PushTokenRegistrar`). Presence alone therefore proves nothing; we
 * call `isNativePlatform()` rather than testing for the object.
 */

import { isStandalone, getPlatform as getInstallPlatform } from '@/lib/install-guide'

/**
 * Where the running page actually lives.
 *
 * Deliberately five values, not a cross product: a desktop-installed PWA folds
 * into `'web'` because desktop is not a surface we ship or reason about, and
 * splitting it would add a bucket nobody would ever query.
 */
export type AppPlatform = 'ios_native' | 'android_native' | 'ios_pwa' | 'android_pwa' | 'web'

/** The shape the Capacitor bridge (or `@capacitor/core`) puts on `window`. */
type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

/** `'ios'` / `'android'` when running inside a native shell, else `null`. */
function nativeShellPlatform(): 'ios' | 'android' | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  // `isNativePlatform()` — not `Capacitor !== undefined`. See the module note.
  if (!cap?.isNativePlatform?.()) return null
  const platform = cap.getPlatform?.()
  return platform === 'ios' || platform === 'android' ? platform : null
}

/**
 * Detect the current surface, or `null` when there is no browser to ask.
 *
 * `null` rather than a `'web'` default on the server: SSR has no platform, and
 * guessing one would quietly stamp every server-rendered context as a browser
 * visit — exactly the kind of untrue-but-plausible data this issue exists to
 * stop producing. Both callers run client-side only, so the `null` branch is a
 * type-level guard rather than a real code path, and a caller that sees `null`
 * should register nothing instead of registering a fiction.
 */
export function detectPlatform(): AppPlatform | null {
  if (typeof window === 'undefined') return null

  // Native first: a Capacitor WebView does not report `display-mode:
  // standalone`, so the PWA check below would miss it either way, but ordering
  // it first also makes the shell immune to any future WebView that does.
  const native = nativeShellPlatform()
  if (native) return native === 'ios' ? 'ios_native' : 'android_native'

  // `isStandalone()` checks the `display-mode: standalone` media query *and*
  // the legacy `navigator.standalone` flag. Both are needed: iOS Safari only
  // gained display-mode support in 15.4, and `navigator.standalone` is the only
  // signal on anything older — while it doesn't exist at all off iOS.
  if (isStandalone()) {
    const installPlatform = getInstallPlatform()
    if (installPlatform === 'ios-safari' || installPlatform === 'ios-other') return 'ios_pwa'
    if (installPlatform === 'android') return 'android_pwa'
  }

  return 'web'
}

/** True for the two Capacitor shells. Kept as a helper so the `is_native`
 *  analytics property can't drift from the enum. */
export function isNativeApp(platform: AppPlatform): boolean {
  return platform === 'ios_native' || platform === 'android_native'
}
