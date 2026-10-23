/**
 * #991 — minimum shell version.
 *
 * Futari ships as a Next.js web app wrapped in a thin Capacitor shell whose
 * `server.url` points at prod. The web layer therefore always updates itself,
 * but the shell (and the native plugin capabilities baked into it) freezes at
 * whatever the user installed. The day the web layer needs a plugin an old
 * shell doesn't have, we need a way to say so.
 *
 * This module is the pure, testable half: the thresholds plus the version
 * comparison. Reading the actual shell version needs `@capacitor/app`, which
 * must never reach the web bundle's critical path — that lives in
 * `app/(dashboard)/_components/ShellUpdateNotice.tsx` behind a dynamic import.
 */

/** Capacitor platforms we publish a shell for. `Capacitor.getPlatform()` also
 *  returns `'web'`, which is deliberately not a member — web has no shell. */
export type ShellPlatform = 'ios' | 'android'

/**
 * Per-platform minimum shell version, compared against `App.getInfo().version`.
 *
 * **Thresholds are per-platform on purpose.** The two stores carry different
 * version strings for the same release: iOS `MARKETING_VERSION` tracks the web
 * semver on every submission (1.5.5 as of writing), while Android
 * `versionName` is only moved when we actually want users to see a new number
 * and otherwise lags (1.5.1 as of writing, see `android/app/build.gradle`).
 * One shared threshold would either nag every Android user or be useless on
 * iOS. When raising a threshold, read the value off the platform's own build
 * config — never off the web `package.json` version.
 *
 * Both values start *below* the shipped shells so the mechanism is live but
 * silent; raising them is an operational decision, made once PostHog shows the
 * installed-version distribution (`shell_version_seen`).
 */
export const MIN_SHELL_VERSION: Record<ShellPlatform, string> = {
  ios: '1.5.0',
  android: '1.5.0',
}

/**
 * #968 — the first Android shell that carries Firebase (`google-services.json`),
 * and therefore the first one where `PushNotifications.register()` is safe.
 *
 * Older Android shells (Play 1.7.3, versionCode 105015) already bundle
 * `@capacitor/push-notifications` and `@capacitor/app`, but without
 * `google-services.json` calling `register()` crashes the app. So plugin
 * presence (`Capacitor.isPluginAvailable`) proves nothing; the shell's
 * `versionName`, read through `App.getInfo().version`, is the only capability
 * signal we have. `lib/pushNotifications.ts` compares against this value and
 * fails CLOSED (unparseable / unreadable → no registration), unlike
 * {@link isShellOutdated} below, which fails open and must not be used here.
 *
 * This value MUST equal the `versionName` of the first Firebase-enabled Android
 * build. `docs/app-store-submission-runbook.md` §E and the `ship-native` skill
 * hold the same value (they refuse to upload an AAB whose versionName is below
 * it); change all three together.
 *
 * Failure looks like:
 * - too low → every old Android shell crashes the moment the dashboard opens,
 *   on every open, with nothing in Sentry (the process dies before reporting);
 * - too high → new shells silently never register: no permission prompt, no
 *   PushTokens row, no error, and Android users simply never get reminders.
 */
export const FCM_MIN_ANDROID_SHELL = '1.9.0'

/** Narrow an arbitrary `Capacitor.getPlatform()` string to a shell platform. */
export function isShellPlatform(platform: string): platform is ShellPlatform {
  return platform === 'ios' || platform === 'android'
}

/**
 * Split a version string into its numeric segments, or `null` when it isn't a
 * version at all. Pre-release / build metadata (`1.5.0-beta.2`, `1.5.0+42`) is
 * dropped before parsing: we only gate on the release number, and a beta build
 * of 1.5.0 has the same plugin surface as 1.5.0.
 */
function parseVersion(input: string): number[] | null {
  const core = input.trim().split(/[-+]/, 1)[0]
  if (!core) return null
  const parts = core.split('.')
  const numbers: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    numbers.push(Number(part))
  }
  return numbers.length > 0 ? numbers : null
}

/**
 * Compare two dotted version strings. Returns `-1` / `0` / `1` in the usual
 * sense, or `null` when either side is unparseable.
 *
 * Segment counts may differ — missing segments count as zero, so `1.5` and
 * `1.5.0` are equal and `1.5` sorts below `1.5.1`.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null

  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l < r) return -1
    if (l > r) return 1
  }
  return 0
}

/**
 * True when the running shell is older than its platform's threshold.
 *
 * Fails open: an unparseable or missing version returns `false`. A nag we
 * can't justify is worse than a missed one — the shell is the user's installed
 * app, and we only get to interrupt them when we're sure.
 */
export function isShellOutdated(platform: ShellPlatform, version: string): boolean {
  return compareVersions(version, MIN_SHELL_VERSION[platform]) === -1
}
