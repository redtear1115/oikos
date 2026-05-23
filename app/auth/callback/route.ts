import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales-meta'
import { aliasServer, captureServer } from '@/lib/analytics/server'
import { entrySourceFromParam, migrateSourceFromParam, isFirstAuth } from '@/lib/analytics/attribution'

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
    return NextResponse.redirect(new URL(signInOnError, origin))
  }

  const supabase = await createClient()
  const { error, data } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
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
    const migrateSource = migrateSourceFromParam(from)
    const cookieStore = await cookies()
    const localeValue = cookieStore.get(LOCALE_COOKIE)?.value
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE

    if (aid) await aliasServer(userId, aid)

    const createdAt = data.user.created_at ? new Date(data.user.created_at) : new Date(0)
    const firstAuth = isFirstAuth(createdAt, new Date())

    await captureServer(
      userId,
      firstAuth ? 'signed_up' : 'signed_in',
      { entry_source: entrySource, ...(migrateSource ? { migrate_source: migrateSource } : {}), locale },
      firstAuth ? { entry_source: entrySource } : undefined,
    )
  }

  return NextResponse.redirect(`${origin}${next}`)
}
