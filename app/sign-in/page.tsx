'use client'

import { getSupabaseClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const handleSignIn = async () => {
    const next = new URLSearchParams(window.location.search).get('next') ?? '/dashboard'
    const supabase = getSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Oikos</h1>
        <p className="text-sm text-gray-500">家庭記帳與資產管理</p>
        <button
          onClick={handleSignIn}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          以 Google 帳號登入
        </button>
      </div>
    </main>
  )
}
