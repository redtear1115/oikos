'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { localizedHomePath } from '@/lib/i18n/server-redirect'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales-meta'
import { aliasServer, captureServer } from '@/lib/analytics/server'
import { entrySourceFromParam, migrateSourceFromParam, isFirstAuth } from '@/lib/analytics/attribution'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Land on the warm landing surface, not /sign-in. Preserve the user's
  // locale on the path so the redirected page keeps speaking their language.
  // Client (LogoutButton) also has a window.location.replace('/') safety net
  // because useTransition + server-action redirect previously swallowed the
  // navigation, leaving users visually stuck on /settings.
  redirect(await localizedHomePath())
}

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
export async function recordNativeAuthConversion(opts: {
  from?: string | null
  anonId?: string | null
}): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const userId = user.id
    const entrySource = entrySourceFromParam(opts.from)
    const migrateSource = migrateSourceFromParam(opts.from)
    const cookieStore = await cookies()
    const localeValue = cookieStore.get(LOCALE_COOKIE)?.value
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE

    if (opts.anonId) await aliasServer(userId, opts.anonId)

    const createdAt = user.created_at ? new Date(user.created_at) : new Date(0)
    const firstAuth = isFirstAuth(createdAt, new Date())

    await captureServer(
      userId,
      firstAuth ? 'signed_up' : 'signed_in',
      { entry_source: entrySource, ...(migrateSource ? { migrate_source: migrateSource } : {}), locale },
      firstAuth ? { entry_source: entrySource } : undefined,
    )
  } catch {
    // Attribution must never break sign-in.
  }
}
