'use server'

import { createClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { redirect } from 'next/navigation'
import { localizedHomePath } from '@/lib/i18n/server-redirect'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales-meta'
import { aliasServer, captureServer } from '@/lib/analytics/server'
import {
  entrySourceFromParam,
  importResumeSourceFromParam,
  isFirstAuth,
  type AuthPath,
} from '@/lib/analytics/attribution'
import { action } from '@/lib/action-errors'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'
import { db } from '@/lib/db/client'
import { pushTokens } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// APNs device tokens are 64 hex chars today; leave room for a longer format
// without accepting arbitrary payloads.
const MAX_PUSH_TOKEN_LENGTH = 512
/** How long sign-out waits for this device's push-row delete before going ahead. */
const PUSH_DELETE_TIMEOUT_MS = 2000

/**
 * #1605 (F11) — drop THIS device's push registration for the session user.
 *
 * Without it a shared or handed-down phone keeps receiving the signed-out
 * person's ledger pushes: the PushTokens row outlives the session. Failure
 * looks like: no error; the next person to pick up the phone (or the same
 * person, signed out) still gets 「有待確認的定期收支」.
 *
 * Deletes only the caller's own row for this token. `user_id` comes from the
 * re-validated server session (`auth.getUser()`, the same source
 * `requireViewer` uses), never from the client, so another person who signed
 * in on the same device keeps theirs and the caller's other devices keep
 * theirs. Runs through the server's Drizzle role on purpose: `authenticated`
 * has no DELETE on PushTokens (0080) and this adds none. No session → no-op.
 */
async function deleteThisDevicePushToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  token: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await db
    .delete(pushTokens)
    .where(and(
      eq(pushTokens.userId, user.id),
      eq(pushTokens.platform, 'apns'),
      eq(pushTokens.token, token),
    ))
}

/**
 * Signs out and redirects home. `token` (optional) is this device's stored
 * APNs token (LogoutButton reads it from lib/pushTokenStorage); when it is a
 * 1–512 character string, this device's PushTokens row is deleted first.
 *
 * #1617 — the delete lives inside this one action, not in a second action the
 * client awaits first. Next.js runs server actions one at a time per client,
 * so with two actions the client-side 2 s race was not a bound: `signOut` sat
 * in the queue until the delete finished. Here the whole best-effort block
 * (session lookup + delete) is raced against {@link PUSH_DELETE_TIMEOUT_MS},
 * and a timeout or a throw is swallowed. `lib/db/client.ts` sets no statement
 * timeout, so without the bound a stalled database would keep
 * `supabase.auth.signOut()` from ever running and leave the person signed in.
 * Failure looks like (if the race or the swallow is removed): tapping 登出
 * hangs on a slow network or stalled database, or does nothing at all when
 * the delete errors.
 *
 * Called without a token (account deletion, older shells) it behaves exactly
 * as before.
 */
export const signOut = action(async (token?: string) => {
  const supabase = await createClient()
  if (typeof token === 'string' && token.length > 0 && token.length <= MAX_PUSH_TOKEN_LENGTH) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        deleteThisDevicePushToken(supabase, token),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, PUSH_DELETE_TIMEOUT_MS) }),
      ])
    } catch (e) {
      // Best-effort; sign-out goes ahead regardless. Reported so a delete that
      // always fails doesn't vanish (the row would then outlive every session).
      try {
        Sentry.captureException(e, { tags: { area: 'auth', op: 'sign_out_push_delete' } })
      } catch {
        // Reporting the failure must not become a new failure.
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  await supabase.auth.signOut()
  // #1603 — the past-times pin is per browser session, not per account. Left
  // behind, the next person to sign in on this browser starts out pinned to
  // the previous account's chapter (the resolver ignores a pin they weren't
  // on, but a pin that does apply would drop them into a past chapter they
  // didn't choose). Cleared here, before the redirect throws.
  const jar = await cookies()
  jar.delete(PAST_EPOCH_COOKIE)
  // Land on the warm landing surface, not /sign-in. Preserve the user's
  // locale on the path so the redirected page keeps speaking their language.
  // Client (LogoutButton) also has a window.location.replace('/') safety net
  // because useTransition + server-action redirect previously swallowed the
  // navigation, leaving users visually stuck on /settings.
  redirect(await localizedHomePath())
})

/**
 * Conversion attribution for the iOS-native Apple sign-in path, which uses
 * client-side `signInWithIdToken` and therefore bypasses `app/auth/callback`.
 * Mirrors that route's PostHog alias + capture so native Apple sign-ups still
 * land in the funnel. Call AFTER the client has established the session.
 *
 * Reads the user from the server session (not a client-supplied id) so it
 * can't be spoofed. No-op if no session is visible yet. Never throws — the
 * caller's navigation must proceed regardless.
 */
// Facts of this action's only call site (SignInButton's `appleNativeSignIn`),
// not client-supplied hints — Apple's native sheet is the sole flow that lands
// here. Hardcoding them keeps the funnel axis unspoofable, same reasoning as
// reading the user from the server session below.
const NATIVE_AUTH_PATH: AuthPath = 'ios_native'
const NATIVE_AUTH_PROVIDER = 'apple'

export const recordNativeAuthConversion = action(async (opts: {
  from?: string | null
  anonId?: string | null
}): Promise<void> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const userId = user.id
    const entrySource = entrySourceFromParam(opts.from)
    const importResumeSource = importResumeSourceFromParam(opts.from)
    const cookieStore = await cookies()
    const localeValue = cookieStore.get(LOCALE_COOKIE)?.value
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE

    if (opts.anonId) await aliasServer(userId, opts.anonId)

    const createdAt = user.created_at ? new Date(user.created_at) : new Date(0)
    const firstAuth = isFirstAuth(createdAt, new Date())

    await captureServer(
      userId,
      firstAuth ? 'signed_up' : 'signed_in',
      {
        entry_source: entrySource,
        ...(importResumeSource ? { migrate_source: importResumeSource } : {}),
        locale,
        path: NATIVE_AUTH_PATH,
        provider: NATIVE_AUTH_PROVIDER,
      },
      firstAuth ? { entry_source: entrySource } : undefined,
    )
  } catch (e) {
    // Attribution must never break sign-in — but it must not vanish either.
    // This is the ONLY conversion signal for iOS-native Apple (it bypasses
    // /auth/callback entirely), so a silent failure here means a successful
    // login that never reaches the funnel (#973).
    try {
      Sentry.captureException(e, { tags: { area: 'analytics', op: 'native_auth_conversion' } })
    } catch {
      // Reporting the failure must not become a new failure.
    }
  }
})
