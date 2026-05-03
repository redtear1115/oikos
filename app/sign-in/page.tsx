'use client'

import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
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
    <main
      className="flex min-h-screen flex-col items-center justify-between px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex-1" />

      <div className="flex flex-col items-center text-center gap-3">
        <div
          className="text-[44px] leading-none tracking-[-1px]"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          Futari
        </div>
        <div className="text-sm tracking-[3px]" style={{ color: 'var(--ink-2)' }}>
          ふたり
        </div>
        <p
          className="mt-6 text-base leading-relaxed"
          style={{ color: 'var(--ink-2)', maxWidth: 280 }}
        >
          兩個人的日子，<br />可以一起記下來。
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-4 mt-12">
        <button
          onClick={handleSignIn}
          className="w-full h-12 rounded-xl border-0 text-white text-sm font-semibold cursor-pointer flex items-center justify-center gap-2"
          style={{ background: 'var(--ink)' }}
        >
          以 Google 帳號繼續
        </button>
        <p className="text-xs text-center" style={{ color: 'var(--ink-3)' }}>
          繼續即表示您同意我們的{' '}
          <a href="/terms" className="underline">服務條款</a>
          {' '}與{' '}
          <a href="/privacy" className="underline">隱私權政策</a>
        </p>
      </div>

      <div className="flex-1" />
    </main>
  )
}
