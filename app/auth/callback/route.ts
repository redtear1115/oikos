import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { cookies } from 'next/headers'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales-meta'
import { aliasServer, captureServer } from '@/lib/analytics/server'
import {
  entrySourceFromParam,
  importResumeSourceFromParam,
  isFirstAuth,
  type AuthPath,
} from '@/lib/analytics/attribution'

/**
 * Record a failed sign-in so the funnel can tell "tried and failed" apart from
 * "never tried". Both failure branches used to redirect silently, which is why
 * a two-week outage on one platform left no signal at all (#972 / #973).
 *
 * `aid` is the pre-auth anonymous distinct_id that SignInButton carries through
 * the OAuth hop; using it keeps the failure attached to the same person as the
 * `sign_in_started` that preceded it. Without it we still emit the event under a
 * shared bucket id so the count survives — `had_anon_id` marks which is which,
 * since person-level maths on the bucket is meaningless.
 */
const FAILURE_BUCKET_ID = 'anon:auth-callback-failure'

/** Every sign-in reaching this route came through the web OAuth redirect. */
const AUTH_PATH: AuthPath = 'web_oauth'

/**
 * Which OAuth provider the session belongs to, when Supabase tells us. Read from
 * `app_metadata.provider`, which is the provider the account was created with —
 * for an account with several linked identities it can name a different one than
 * this sign-in used. Futari never offers identity linking, so in practice the two
 * agree; treat the property as "the account's provider", not a per-attempt fact.
 * Omitted entirely when absent rather than guessed.
 */
function providerOf(user: { app_metadata?: Record<string, unknown> } | null): string | undefined {
  const provider = user?.app_metadata?.provider
  return typeof provider === 'string' && provider ? provider : undefined
}

async function recordAuthFailure(
  aid: string | null,
  reason: 'missing_code' | 'exchange_error',
  detail?: Record<string, unknown>,
): Promise<void> {
  await captureServer(aid ?? FAILURE_BUCKET_ID, 'sign_in_failed', {
    reason,
    had_anon_id: !!aid,
    ...detail,
  })
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'
  // Funnel attribution carried through the OAuth redirect by SignInButton.
  const from = searchParams.get('from')
  const aid = searchParams.get('aid')

  // Keep the user on their picked locale even when OAuth fails — without an
  // explicit prefix the response 302s to /sign-in, proxy then resets
  // their lang cookie to DEFAULT_LOCALE.
  const signInOnError = await localizedSignInPath('?error=auth_failed')

  if (!code) {
    // No code means the provider bounced us without one. When the user declined
    // consent (or the provider itself errored) it forwards its own reason in
    // `error` / `error_description` — previously discarded. These are provider
    // status strings, not user data, so they're safe to record.
    await recordAuthFailure(aid, 'missing_code', {
      oauth_error: searchParams.get('error'),
      oauth_error_description: searchParams.get('error_description'),
    })
    return NextResponse.redirect(new URL(signInOnError, origin))
  }

  const supabase = await createClient()
  const { error, data } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // Never pass the raw error through — it can carry the auth code. Only the
    // classification fields go to Sentry and PostHog.
    await recordAuthFailure(aid, 'exchange_error', {
      error_name: error.name,
      error_status: error.status,
    })
    Sentry.captureException(
      new Error(`exchangeCodeForSession failed: ${error.name}`),
      { tags: { area: 'auth', op: 'exchange_code' }, extra: { status: error.status } },
    )
    return NextResponse.redirect(new URL(signInOnError, origin))
  }

  // Best-effort: refresh the avatar URL from Google's user_metadata. Google's avatar
  // URLs (lh3.googleusercontent.com/...) rotate periodically and the handle_new_user
  // trigger only writes once at signup. Re-syncing on every sign-in keeps it fresh.
  const newAvatarUrl = (data.user?.user_metadata?.avatar_url as string | undefined) ?? null
  if (data.user && newAvatarUrl) {
    try {
      await db.update(profiles).set({ avatarUrl: newAvatarUrl }).where(eq(profiles.id, data.user.id))
    } catch {
      // Avatar refresh failure should never block sign-in — swallow.
    }
  }

  // Conversion attribution (#734). Bridges the OAuth boundary that memory
  // persistence would otherwise break: alias the pre-auth anonymous events onto
  // this user, then record the conversion with its entry source. All no-ops
  // outside production, and never throws — the redirect always proceeds.
  if (data.user) {
    const userId = data.user.id
    const entrySource = entrySourceFromParam(from)
    const importResumeSource = importResumeSourceFromParam(from)
    const cookieStore = await cookies()
    const localeValue = cookieStore.get(LOCALE_COOKIE)?.value
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE

    if (aid) await aliasServer(userId, aid)

    const createdAt = data.user.created_at ? new Date(data.user.created_at) : new Date(0)
    const firstAuth = isFirstAuth(createdAt, new Date())

    const provider = providerOf(data.user)

    await captureServer(
      userId,
      firstAuth ? 'signed_up' : 'signed_in',
      {
        entry_source: entrySource,
        ...(importResumeSource ? { migrate_source: importResumeSource } : {}),
        locale,
        path: AUTH_PATH,
        ...(provider ? { provider } : {}),
      },
      firstAuth ? { entry_source: entrySource } : undefined,
    )
  }

  return NextResponse.redirect(`${origin}${next}`)
}
