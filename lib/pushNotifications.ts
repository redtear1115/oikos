import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { storePushToken } from '@/lib/pushTokenStorage'
import { reportClientError } from '@/lib/observability/reportClientError'
import { FCM_MIN_ANDROID_SHELL, compareVersions } from '@/lib/shellVersion'

/**
 * Native contract surface (CLAUDE.md 三平台架構): this file runs in every
 * installed shell, old ones included, the moment it deploys. There is no store
 * review in front of it.
 */

/** Why the Android FCM gate said no, or the shell version it allowed. */
export type FcmShellGate =
  | { allowed: true; version: string }
  | { allowed: false; reason: 'import-failed' | 'get-info-failed' | 'unparseable' | 'below-min'; version?: string }

/**
 * #968 — may this Android shell call `PushNotifications.register()`?
 *
 * Only shells at or above {@link FCM_MIN_ANDROID_SHELL} carry
 * `google-services.json`; on an older shell `register()` crashes the app. This
 * gate FAILS CLOSED: a plugin chunk that won't load, a `getInfo()` that
 * rejects, a missing or unparseable version — all mean "no". Never throws.
 *
 * `@capacitor/app` is imported dynamically, and only from the Android branch,
 * so neither the web bundle nor the iOS path ever loads it.
 *
 * Nothing here is reported to Sentry, on purpose. A denial is the designed,
 * expected state for every Android shell older than the threshold (all of them
 * until 1.9.0 ships), on every dashboard open; a rejection from `getInfo()` is
 * the same "old or broken shell" case `ShellUpdateNotice` already swallows.
 * Reporting it would be pure noise with no action attached. The real failure
 * mode — a threshold set too high — produces no error at all, so a report here
 * would not catch it anyway; the installed-version distribution
 * (`shell_version_seen`, PostHog) and the PushTokens `fcm` row count are where
 * that shows up.
 */
export async function checkAndroidFcmGate(): Promise<FcmShellGate> {
  let appPlugin: typeof import('@capacitor/app')
  try {
    appPlugin = await import('@capacitor/app')
  } catch {
    return { allowed: false, reason: 'import-failed' }
  }

  let version: unknown
  try {
    version = (await appPlugin.App.getInfo())?.version
  } catch {
    return { allowed: false, reason: 'get-info-failed' }
  }

  if (typeof version !== 'string') return { allowed: false, reason: 'unparseable' }
  const cmp = compareVersions(version, FCM_MIN_ANDROID_SHELL)
  if (cmp === null) return { allowed: false, reason: 'unparseable', version }
  if (cmp === -1) return { allowed: false, reason: 'below-min', version }
  return { allowed: true, version }
}

/** What `registerPushToken` did. Callers in the product ignore it; the
 *  development-only probe (`app/dev/push-gate`) shows it. */
export type PushRegisterOutcome =
  | 'not-native'
  | 'unsupported-platform'
  | 'gate-denied'
  | 'permission-denied'
  | 'registering'

export async function registerPushToken(userId: string, groupId: string): Promise<PushRegisterOutcome> {
  if (!Capacitor.isNativePlatform()) return 'not-native'
  const platform = Capacitor.getPlatform()

  let pushPlatform: 'apns' | 'fcm'
  if (platform === 'ios') {
    pushPlatform = 'apns'
  } else if (platform === 'android') {
    // Must stay BEFORE requestPermissions(): an old shell must not even see
    // the permission prompt, let alone reach register().
    const gate = await checkAndroidFcmGate()
    if (!gate.allowed) return 'gate-denied'
    pushPlatform = 'fcm'
  } else {
    return 'unsupported-platform'
  }

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return 'permission-denied'

  await PushNotifications.register()

  PushNotifications.addListener('registration', async ({ value: token }) => {
    // #1605 — remembered so sign-out can remove this device's row
    // (LogoutButton → signOut action, #1617). Never throws.
    storePushToken(token)
    const supabase = createClient()
    // Since 0087 the database refuses a group_id the user is not a member of;
    // supabase-js returns that as `{ error }`, which is ignored here on purpose
    // (the registrar passes the active ledger, so it only happens on a race).
    await supabase.from('PushTokens').upsert(
      { user_id: userId, group_id: groupId, platform: pushPlatform, token },
      { onConflict: 'user_id,platform,token' }
    )
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[push] registration error', error)
    // The plugin reports this through an event, not a rejection, so the
    // registrar's catch never sees it. Message only (APNs / FCM text, no token).
    reportClientError(new Error(`push registration error: ${error?.error ?? 'unknown'}`), {
      area: 'push',
      op: 'registration_event',
    })
  })

  return 'registering'
}
