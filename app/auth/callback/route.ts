import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  // Keep the user on their picked locale even when OAuth fails — without an
  // explicit prefix the response 302s to /sign-in, middleware then resets
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

  return NextResponse.redirect(`${origin}${next}`)
}
