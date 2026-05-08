'use client'

import { createClient } from '@/lib/supabase/client'

export function SignInButton({ label }: { label: string }) {
  const handleSignIn = async () => {
    const next = new URLSearchParams(window.location.search).get('next') ?? '/dashboard'
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="w-full h-12 rounded-xl border-0 text-white text-sm font-semibold cursor-pointer flex items-center justify-center gap-2"
      style={{ background: 'var(--ink)' }}
    >
      {label}
    </button>
  )
}
