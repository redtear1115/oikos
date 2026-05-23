'use client'

import { createClient } from '@/lib/supabase/client'
import { track, getAnonId } from '@/lib/analytics/track'
import { buildAuthCallbackUrl, entrySourceFromParam } from '@/lib/analytics/attribution'

export function SignInButton({ label }: { label: string }) {
  const handleSignIn = async () => {
    const search = new URLSearchParams(window.location.search)
    const next = search.get('next') ?? '/dashboard'
    const from = search.get('from')

    // Last anonymous client event before the OAuth round-trip; same distinct_id
    // as the pre-auth landing/migrate events in this SPA session.
    track('sign_in_started', { entry_source: entrySourceFromParam(from) })

    const redirectTo = buildAuthCallbackUrl(window.location.origin, {
      next,
      from,
      anonId: getAnonId(),
    })

    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="w-full h-12 rounded-xl border-0 text-sm font-semibold cursor-pointer flex items-center justify-center gap-2"
      style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
    >
      {label}
    </button>
  )
}
